/**
 * Regressao de seguranca do PaymentsService (A04-PAY-01 + A04-PAY-02).
 *
 * - A04-PAY-01 (auto-confirm / refeicao gratis): confirmPayment iniciado
 *   pelo cliente NAO pode gravar status 'confirmed'/paid_at sem a flag de
 *   mock (PAYMENTS_ALLOW_CLIENT_CONFIRM). Deve mover pra
 *   'awaiting_settlement' — que a home/continuation nao tratam como pago.
 * - A04-PAY-02 (short-pay): requestPayment 'individual' com allocation
 *   abaixo do saldo devido deve ser rejeitado (nao cobrar 1 centavo por
 *   uma conta de R$ 200).
 *
 * Fakes: TenantConnectionProvider roteado por substring de SQL + Redis em
 * memoria (mesmo padrao de continuation.service.test.ts).
 */

import { PaymentsService } from './payments.service';
import { BillingService } from '../billing/billing.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const SESSION = '11111111-1111-4111-8111-111111111111';
const OTHER_SESSION = '99999999-9999-4999-8999-999999999999';
const VISIT = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = '44444444-4444-4444-8444-444444444444';
const PAYMENT_ID = '33333333-3333-4333-8333-333333333333';

interface PaymentRow {
  id: string;
  status: string;
  table_session_id: string;
  expires_at: string | null;
  paid_at?: string | null;
}

function fakeTenantConn(opts: {
  outstandingCents: number;
  payment?: PaymentRow;
  onUpdate?: (sql: string, params: unknown[]) => void;
}): TenantConnectionProvider {
  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    if (sql.includes('SELECT service_fee_pct FROM settings')) {
      return [{ service_fee_pct: '0' }]; // taxa zero: short-pay testado sem ruído de fee
    }
    // Feature promoções (2026-07-05): sem promoção ativa → sem desconto.
    if (sql.includes('FROM promotions')) return [];
    // 'custom' agora é table-canônico: computeSplit rateia a conta da MESA
    // sobre os participantes aprovados e valida a soma das allocations. O
    // fake devolve UMA participante (CUSTOMER) dona da conta inteira da mesa,
    // então a "parte" canônica dela = outstandingCents. Short-pay = mandar
    // allocation abaixo desse total.
    if (sql.includes('FROM session_participants')) {
      return [{ customer_id: CUSTOMER }];
    }
    if (sql.includes('FROM order_items oi')) {
      return [{ subtotal_cents: opts.outstandingCents, customer_id: CUSTOMER }];
    }
    if (sql.startsWith('SELECT COALESCE(SUM(total_cents)')) {
      // pg devolve SUM() como STRING (NUMERIC) — imitar o driver real.
      return [{ total: String(opts.outstandingCents) }];
    }
    if (sql.startsWith('SELECT COALESCE(SUM(amount_cents)')) {
      return [{ paid: '0' }]; // nada liquidado ainda (P1-A)
    }
    if (sql.includes('FROM payments WHERE id = $1') && sql.includes('SELECT')) {
      return opts.payment ? [opts.payment] : [];
    }
    if (sql.includes("status = 'pending'")) {
      return []; // sem pendente duplicado
    }
    if (sql.startsWith('INSERT INTO payments')) {
      return [
        {
          id: PAYMENT_ID,
          status: 'pending',
          amount_cents: params[2],
          method: params[3],
          pix_qr_code: params[4],
          pix_copy_paste: params[5],
          expires_at: null,
          split_mode: params[7],
          split_allocations: params[8],
          created_at: '2026-07-02T00:00:00Z',
        },
      ];
    }
    if (sql.startsWith('UPDATE payments')) {
      opts.onUpdate?.(sql, params);
      return [];
    }
    throw new Error(`fakeTenantConn: SQL nao roteado:\n${sql}`);
  };
  return { query } as unknown as TenantConnectionProvider;
}

function fakeRedis(): RedisService {
  return {
    setNX: async () => true,
    del: async () => 1,
    get: async () => null,
  } as unknown as RedisService;
}

describe('PaymentsService security (A04-PAY-01 / A04-PAY-02)', () => {
  const OLD_ENV = process.env.PAYMENTS_ALLOW_CLIENT_CONFIRM;
  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.PAYMENTS_ALLOW_CLIENT_CONFIRM;
    else process.env.PAYMENTS_ALLOW_CLIENT_CONFIRM = OLD_ENV;
  });

  describe('A04-PAY-01: auto-confirm pelo cliente nao marca como pago', () => {
    it('confirmPayment move pra awaiting_settlement (nunca paid_at) sem a flag', async () => {
      delete process.env.PAYMENTS_ALLOW_CLIENT_CONFIRM;
      const updates: { sql: string }[] = [];
      const conn = fakeTenantConn({
        outstandingCents: 20000,
        payment: {
          id: PAYMENT_ID,
          status: 'pending',
          table_session_id: SESSION,
          expires_at: null,
        },
        onUpdate: (sql) => updates.push({ sql }),
      });
      const svc = new PaymentsService(conn, fakeRedis(), new BillingService(conn));

      const res = await svc.confirmPayment(PAYMENT_ID, SESSION, 'txid-forjado');

      expect(res.status).toBe('awaiting_settlement');
      // Nao pode existir UPDATE que grave paid_at ou status 'confirmed'.
      const paidUpdate = updates.find(
        (u) => u.sql.includes('paid_at') || u.sql.includes("'confirmed'"),
      );
      expect(paidUpdate).toBeUndefined();
      expect(updates.some((u) => u.sql.includes("'awaiting_settlement'"))).toBe(true);
    });

    it('com a flag ligada (mock/dev) ainda marca confirmed', async () => {
      process.env.PAYMENTS_ALLOW_CLIENT_CONFIRM = 'true';
      const updates: { sql: string }[] = [];
      const conn = fakeTenantConn({
        outstandingCents: 20000,
        payment: {
          id: PAYMENT_ID,
          status: 'pending',
          table_session_id: SESSION,
          expires_at: null,
        },
        onUpdate: (sql) => updates.push({ sql }),
      });
      const svc = new PaymentsService(conn, fakeRedis(), new BillingService(conn));

      const res = await svc.confirmPayment(PAYMENT_ID, SESSION, 'txid');
      expect(res.status).toBe('confirmed');
      expect(updates.some((u) => u.sql.includes('paid_at'))).toBe(true);
    });

    it('ownership: sessao diferente nao encontra o pagamento (404)', async () => {
      delete process.env.PAYMENTS_ALLOW_CLIENT_CONFIRM;
      const conn = fakeTenantConn({
        outstandingCents: 20000,
        payment: {
          id: PAYMENT_ID,
          status: 'pending',
          table_session_id: SESSION,
          expires_at: null,
        },
      });
      const svc = new PaymentsService(conn, fakeRedis(), new BillingService(conn));
      await expect(svc.confirmPayment(PAYMENT_ID, OTHER_SESSION)).rejects.toThrow(
        /nao encontrado/i,
      );
    });
  });

  describe('A04-PAY-02: short-pay bloqueado no split customizado (table-canônico)', () => {
    // custom agora é table-canônico: a conta da mesa (20000, taxa 0) tem UMA
    // participante (CUSTOMER), então a "parte" canônica dela = 20000. A soma
    // das allocations DEVE bater com o total da mesa — é o que barra o
    // short-pay: mandar menos que o total deixa a mesa a descoberto.
    it('rejeita soma das allocations abaixo do total da mesa (1 centavo por R$ 200)', async () => {
      const conn = fakeTenantConn({ outstandingCents: 20000 });
      const svc = new PaymentsService(conn, fakeRedis(), new BillingService(conn));

      await expect(
        svc.requestPayment(SESSION, VISIT, 'individual', 'pix', {
          callerCustomerId: CUSTOMER,
          splitMode: 'custom',
          allocations: [{ customerId: CUSTOMER, amountCents: 1 }],
        }),
      ).rejects.toThrow(/Soma das aloca/i);
    });

    it('aceita allocation cuja soma bate com o total da mesa', async () => {
      const conn = fakeTenantConn({ outstandingCents: 20000 });
      const svc = new PaymentsService(conn, fakeRedis(), new BillingService(conn));

      const res = await svc.requestPayment(SESSION, VISIT, 'individual', 'pix', {
        callerCustomerId: CUSTOMER,
        splitMode: 'custom',
        allocations: [{ customerId: CUSTOMER, amountCents: 20000 }],
      });
      expect(res.amountCents).toBe(20000);
    });

    it('rejeita soma das allocations acima do total da mesa', async () => {
      const conn = fakeTenantConn({ outstandingCents: 20000 });
      const svc = new PaymentsService(conn, fakeRedis(), new BillingService(conn));

      await expect(
        svc.requestPayment(SESSION, VISIT, 'individual', 'pix', {
          callerCustomerId: CUSTOMER,
          splitMode: 'custom',
          allocations: [{ customerId: CUSTOMER, amountCents: 999999 }],
        }),
      ).rejects.toThrow(/Soma das aloca/i);
    });
  });
});

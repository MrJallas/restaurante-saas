/**
 * P1s da auditoria 2026-07-03 (cluster de dinheiro):
 *
 * 1. TAXA SÓ NO FRONTEND — o backend cobrava SUM(total_cents) sem ler
 *    `settings.service_fee_pct` (migration 050): cliente via R$110 na tela
 *    e o Pix saía R$100. Agora requestPayment cobra subtotal + taxa via
 *    BillingService (fonte única).
 * 2. "PAGAR MINHA PARTE" SEMPRE FALHAVA — o FE posta `individual` sem
 *    visitId (400 no service) e o matcher casava allocation por visitId
 *    quando as allocations são chaveadas por customerId (nunca casava).
 *    Agora o caller é resolvido pelo cookie de recognition (customerId),
 *    a comanda (visit) é derivada server-side e o matcher casa por
 *    customerId.
 */

import { PaymentsService } from './payments.service';
import { BillingService } from '../billing/billing.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const SESSION = '11111111-1111-4111-8111-111111111111';
const CUSTOMER = '44444444-4444-4444-8444-444444444444';
const VISIT = '22222222-2222-4222-8222-222222222222';
const PAYMENT_ID = '33333333-3333-4333-8333-333333333333';

function fakePaymentsDb(opts: {
  serviceFeePct?: string;
  individualSubtotal?: number;
  tableSubtotal?: number;
  visitForCustomer?: Record<string, string>;
  /** Itens da conta da MESA p/ o rateio canônico do split custom. */
  tableItems?: Array<{ subtotal_cents: number; customer_id: string | null }>;
  participants?: string[];
}) {
  const inserts: Array<{ params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('SELECT service_fee_pct FROM settings')) {
      return [{ service_fee_pct: opts.serviceFeePct ?? '10.00' }];
    }
    if (s.includes('FROM session_participants')) {
      return (opts.participants ?? []).map((cid) => ({ customer_id: cid }));
    }
    if (s.includes('FROM order_items oi')) {
      return opts.tableItems ?? [];
    }
    if (s.startsWith('SELECT COALESCE(SUM(amount_cents)')) return [{ paid: '0' }];
    if (s.startsWith('SELECT COALESCE(SUM(total_cents)')) {
      // pg devolve SUM() como STRING (NUMERIC) — o fake imita o driver real;
      // foi exatamente essa coerção que o E2E pegou ('790' + 79 = '79079').
      if (s.includes(`billing_mode = 'individual'`)) {
        return [{ total: String(opts.individualSubtotal ?? 0) }];
      }
      return [{ total: String(opts.tableSubtotal ?? 0) }];
    }
    if (s.startsWith('SELECT id FROM visits')) {
      const customerId = params[1] as string;
      const visit = opts.visitForCustomer?.[customerId];
      return visit ? [{ id: visit }] : [];
    }
    if (s.includes('FROM payments') && s.includes(`status = 'pending'`)) {
      return [];
    }
    if (s.startsWith('INSERT INTO payments')) {
      inserts.push({ params });
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
          created_at: '2026-07-04T00:00:00Z',
        },
      ];
    }
    throw new Error(`fake payments: SQL não roteado: ${s}`);
  };
  return { inserts, conn: { query } as unknown as TenantConnectionProvider };
}

function fakeRedis(): RedisService {
  return {
    setNX: async () => true,
    del: async () => 1,
    get: async () => null,
  } as unknown as RedisService;
}

function makeService(opts: Parameters<typeof fakePaymentsDb>[0]) {
  const db = fakePaymentsDb(opts);
  const service = new PaymentsService(db.conn, fakeRedis(), new BillingService(db.conn));
  return { service, db };
}

describe('requestPayment — taxa de serviço server-side', () => {
  it('mesa: cobra subtotal + taxa das settings (R$100 → R$110)', async () => {
    const { service } = makeService({ tableSubtotal: 10_000, serviceFeePct: '10.00' });
    const res = await service.requestPayment(SESSION, null, 'table', 'pix', {});
    expect(res.amountCents).toBe(11_000);
    expect(res.subtotalCents).toBe(10_000);
    expect(res.serviceFeeCents).toBe(1_000);
    expect(res.serviceFeePct).toBe(10);
  });

  it('mesa: taxa configurada 12.50 é respeitada', async () => {
    const { service } = makeService({ tableSubtotal: 8_000, serviceFeePct: '12.50' });
    const res = await service.requestPayment(SESSION, null, 'table', 'pix', {});
    expect(res.amountCents).toBe(9_000);
  });

  it('individual com visitId explícito também cobra com taxa', async () => {
    const { service } = makeService({ individualSubtotal: 5_000 });
    const res = await service.requestPayment(SESSION, VISIT, 'individual', 'pix', {});
    expect(res.amountCents).toBe(5_500);
  });
});

describe('requestPayment — "pagar minha parte" via reconhecimento', () => {
  it('deriva a comanda do cliente reconhecido quando o body não traz visitId', async () => {
    const { service, db } = makeService({
      individualSubtotal: 5_000,
      visitForCustomer: { [CUSTOMER]: VISIT },
    });
    const res = await service.requestPayment(SESSION, null, 'individual', 'pix', {
      callerCustomerId: CUSTOMER,
    });
    expect(res.amountCents).toBe(5_500);
    // o INSERT grava a visita derivada, não NULL
    expect(db.inserts[0].params[1]).toBe(VISIT);
  });

  // custom é table-canônico: a conta da mesa (5000 + taxa 10% = 5500) com
  // UMA participante (CUSTOMER) dona da conta inteira → parte dela = 5500.
  // A soma das allocations tem que bater com o total da mesa COM taxa.
  const soloTableOpts = {
    tableItems: [{ subtotal_cents: 5_000, customer_id: CUSTOMER }],
    participants: [CUSTOMER],
    visitForCustomer: { [CUSTOMER]: VISIT },
  };

  it('allocation é casada por customerId (short-pay do próprio caller rejeitado)', async () => {
    const { service } = makeService(soloTableOpts);
    await expect(
      service.requestPayment(SESSION, null, 'individual', 'pix', {
        callerCustomerId: CUSTOMER,
        splitMode: 'custom',
        allocations: [{ customerId: CUSTOMER, amountCents: 5_200 }], // < 5.500 total da mesa
      }),
    ).rejects.toThrow(/Soma das aloca/i);
  });

  it('allocation sem a taxa embutida é short-pay (subtotal seco não basta)', async () => {
    const { service } = makeService(soloTableOpts);
    await expect(
      service.requestPayment(SESSION, null, 'individual', 'pix', {
        callerCustomerId: CUSTOMER,
        splitMode: 'custom',
        allocations: [{ customerId: CUSTOMER, amountCents: 5_000 }],
      }),
    ).rejects.toThrow(/Soma das aloca/i);
  });

  it('allocation cuja soma bate com o total da mesa (com taxa) é aceita e cobrada', async () => {
    const { service } = makeService(soloTableOpts);
    const res = await service.requestPayment(SESSION, null, 'individual', 'pix', {
      callerCustomerId: CUSTOMER,
      splitMode: 'custom',
      allocations: [{ customerId: CUSTOMER, amountCents: 5_500 }],
    });
    expect(res.amountCents).toBe(5_500);
  });

  it('individual sem reconhecimento e sem visitId → erro claro de identificação', async () => {
    const { service } = makeService({ individualSubtotal: 5_000 });
    await expect(service.requestPayment(SESSION, null, 'individual', 'pix', {})).rejects.toThrow(
      /identificar sua comanda/i,
    );
  });
});

/**
 * Decisão Caleb 2026-07-04 (madrugada): "o rateio da mesa VALE" — dividir
 * conta deixa de ser preview solto no FE e vira cálculo CANÔNICO no
 * backend: computeSplit rateia a conta da MESA (billing_mode='table',
 * consistente com getBill/payment da 1A) COM a taxa de serviço, sobre os
 * participantes APROVADOS da sessão (derivados server-side, nunca do
 * body); e "pagar minha parte" só aceita exatamente a parte canônica.
 * Regra de arredondamento: equal = floor + resto pro primeiro (padrão já
 * existente); by_item = cada um paga a taxa sobre a própria parte.
 */

import { PaymentsService } from './payments.service';
import { BillingService } from '../billing/billing.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const SESSION = '11111111-1111-4111-8111-111111111111';
const ANA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const BETO = 'bbbbbbbb-0000-4000-8000-00000000000b';
const CARLA = 'cccccccc-0000-4000-8000-00000000000c';
const PAYMENT_ID = '33333333-3333-4333-8333-333333333333';

function fakeSplitDb(opts: {
  serviceFeePct?: string;
  /** Itens da conta da MESA (billing_mode='table'). */
  tableItems?: Array<{ subtotal_cents: number; customer_id: string | null }>;
  participants?: string[];
  individualSubtotal?: number;
  visitForCustomer?: Record<string, string>;
}) {
  const inserts: Array<{ params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('SELECT service_fee_pct FROM settings')) {
      return [{ service_fee_pct: opts.serviceFeePct ?? '10.00' }];
    }
    if (s.includes('FROM order_items oi')) {
      // O SQL canônico DEVE filtrar a conta da mesa — o fake devolve os
      // itens de mesa apenas quando o filtro existe (como o PG faria).
      if (!s.includes(`billing_mode = 'table'`)) {
        throw new Error('computeSplit sem filtro de conta da mesa (billing_mode)');
      }
      return opts.tableItems ?? [];
    }
    if (s.includes('FROM session_participants')) {
      return (opts.participants ?? []).map((cid) => ({ customer_id: cid }));
    }
    if (s.startsWith('SELECT COALESCE(SUM(total_cents)')) {
      return [{ total: String(opts.individualSubtotal ?? 0) }];
    }
    if (s.startsWith('SELECT id FROM visits')) {
      const visit = opts.visitForCustomer?.[params[1] as string];
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
    throw new Error(`fake split: SQL não roteado: ${s}`);
  };
  return { inserts, conn: { query } as unknown as TenantConnectionProvider };
}

function fakeRedis(): RedisService {
  return { setNX: async () => true, del: async () => 1, get: async () => null } as never;
}

function makeService(opts: Parameters<typeof fakeSplitDb>[0]) {
  const db = fakeSplitDb(opts);
  return {
    service: new PaymentsService(db.conn, fakeRedis(), new BillingService(db.conn)),
    db,
  };
}

describe('computeSplit — rateio canônico da conta da MESA com taxa', () => {
  it('equal: total com taxa dividido igual (floor + resto pro primeiro), participantes do servidor', async () => {
    const { service } = makeService({
      serviceFeePct: '10.00',
      // mesa: 100,00 → taxa 10,00 → total 110,00
      tableItems: [
        { subtotal_cents: 6_000, customer_id: ANA },
        { subtotal_cents: 4_000, customer_id: null },
      ],
      participants: [ANA, BETO, CARLA],
    });
    const res = await service.computeSplit(SESSION, 'equal', []);
    expect(res.subtotalCents).toBe(10_000);
    expect(res.serviceFeeCents).toBe(1_000);
    expect(res.totalCents).toBe(11_000);
    // 11000/3 = 3666 (floor) + resto 2 pro primeiro
    expect(res.allocations).toEqual([
      { customerId: ANA, amountCents: 3_668 },
      { customerId: BETO, amountCents: 3_666 },
      { customerId: CARLA, amountCents: 3_666 },
    ]);
  });

  it('by_item: itens próprios + share dos compartilhados, taxa sobre a própria parte', async () => {
    const { service } = makeService({
      serviceFeePct: '10.00',
      tableItems: [
        { subtotal_cents: 6_000, customer_id: ANA }, // só da Ana
        { subtotal_cents: 3_000, customer_id: null }, // compartilhado
      ],
      participants: [ANA, BETO],
    });
    const res = await service.computeSplit(SESSION, 'by_item', []);
    // Ana: 6000 + 1500 = 7500 → +10% = 8250 · Beto: 1500 → +10% = 1650
    expect(res.allocations).toEqual([
      { customerId: ANA, amountCents: 8_250 },
      { customerId: BETO, amountCents: 1_650 },
    ]);
  });

  it('sem participantes aprovados → erro claro (nunca divide pelo body)', async () => {
    const { service } = makeService({
      tableItems: [{ subtotal_cents: 1000, customer_id: null }],
      participants: [],
    });
    await expect(service.computeSplit(SESSION, 'equal', ['forjado'])).rejects.toThrow(
      /participante/i,
    );
  });
});

describe('requestPayment — "pagar minha parte" cobra a parte canônica do rateio', () => {
  const baseOpts = {
    serviceFeePct: '10.00',
    tableItems: [
      { subtotal_cents: 6_000, customer_id: ANA },
      { subtotal_cents: 4_000, customer_id: null },
    ],
    participants: [ANA, BETO, CARLA],
    visitForCustomer: { [ANA]: '22222222-2222-4222-8222-222222222222' },
  };

  it('equal: allocation com a parte exata do caller é aceita e cobrada', async () => {
    const { service } = makeService(baseOpts);
    const res = await service.requestPayment(SESSION, null, 'individual', 'pix', {
      callerCustomerId: ANA,
      splitMode: 'equal',
      allocations: [{ customerId: ANA, amountCents: 3_668 }],
    });
    expect(res.amountCents).toBe(3_668);
  });

  it('allocation diferente da parte canônica → 400 com o valor certo na mensagem', async () => {
    const { service } = makeService(baseOpts);
    await expect(
      service.requestPayment(SESSION, null, 'individual', 'pix', {
        callerCustomerId: ANA,
        splitMode: 'equal',
        allocations: [{ customerId: ANA, amountCents: 3_000 }],
      }),
    ).rejects.toThrow(/3668/);
  });

  it('sem splitMode continua cobrando a comanda individual (fluxo antigo intacto)', async () => {
    const { service } = makeService({ ...baseOpts, individualSubtotal: 5_000 });
    const res = await service.requestPayment(SESSION, null, 'individual', 'pix', {
      callerCustomerId: ANA,
    });
    expect(res.amountCents).toBe(5_500);
  });
});

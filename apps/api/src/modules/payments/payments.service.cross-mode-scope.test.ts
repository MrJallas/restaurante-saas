/**
 * Re-scan de verificação 2026-07-04 (cluster de dinheiro, follow-up do P1-A/P1-X):
 *
 * BUG 1 — CROSS-MODE SCOPE CONTAMINATION no sumSettled.
 *   O já-pago é subtraído do devido pra não re-cobrar (P1-A). Mas o escopo
 *   "já pago" precisa bater EXATAMENTE com o escopo "total devido" de cada
 *   modo. Um pagamento da COMANDA INDIVIDUAL (billing_mode='individual',
 *   visit_id=X, split_mode NULL) e um pagamento da PARTE DO RATEIO da MESA
 *   (billing_mode='table', visit_id=X, split_mode não-nulo) compartilham o
 *   MESMO visit_id. `sumSettled(session, X)` sem discriminar split_mode
 *   somava os dois → o pagamento de um modo abatia o devido do OUTRO modo
 *   = UNDERCHARGE (cobra a menos). Cada modo só pode subtrair o que foi pago
 *   NO SEU escopo.
 *
 * BUG 2 — CHECK TAUTOLÓGICO no ramo custom.
 *   No custom, computeSplit devolvia as MESMAS allocations que o cliente
 *   mandou (customAllocations verbatim), então `mine` (canônico) e `sent`
 *   (enviado) eram o MESMO objeto → `sent.amountCents !== mine.amountCents`
 *   era sempre falso: nunca barrava nada. A comparação tem que validar o
 *   valor ENVIADO pelo cliente contra o valor CANÔNICO calculado
 *   server-side, rejeitando divergência (e um caller com parte <= 0 que se
 *   esconde enquanto joga a conta nos outros).
 */

import { PaymentsService } from './payments.service';
import { BillingService } from '../billing/billing.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const SESSION = '11111111-1111-4111-8111-111111111111';
const ANA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const BETO = 'bbbbbbbb-0000-4000-8000-00000000000b';
const CARLA = 'cccccccc-0000-4000-8000-00000000000c';
const VISIT = '22222222-2222-4222-8222-222222222222';

/**
 * DB fake que registra QUAL escopo de sumSettled foi consultado. Devolve
 * valores distintos por escopo (mesa/comanda/rateio) pra provar que cada
 * modo lê só o seu.
 */
function fakeDb(opts: {
  serviceFeePct?: string;
  tableSubtotal?: number;
  individualSubtotal?: number;
  tableItems?: Array<{ subtotal_cents: number; customer_id: string | null }>;
  participants?: string[];
  visitForCustomer?: Record<string, string>;
  /** já-pago no escopo da MESA (visit_id NULL) */
  settledForTable?: number;
  /** já-pago na COMANDA individual (visit_id=X, split_mode NULL) */
  settledForIndividual?: number;
  /** já-pago na PARTE DO RATEIO (visit_id=X, split_mode não-nulo) */
  settledForSplit?: number;
}) {
  const inserts: Array<{ params: unknown[] }> = [];
  const sumSettledSqls: string[] = [];
  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('SELECT service_fee_pct FROM settings')) {
      return [{ service_fee_pct: opts.serviceFeePct ?? '10.00' }];
    }
    // Feature promoções (2026-07-05): sem promoção ativa → sem desconto.
    if (s.includes('FROM promotions')) return [];
    if (s.includes('FROM session_participants')) {
      return (opts.participants ?? []).map((cid) => ({ customer_id: cid }));
    }
    if (s.includes('FROM order_items oi')) {
      return opts.tableItems ?? [];
    }
    if (s.startsWith('SELECT COALESCE(SUM(total_cents)')) {
      return s.includes(`billing_mode = 'individual'`)
        ? [{ total: String(opts.individualSubtotal ?? 0) }]
        : [{ total: String(opts.tableSubtotal ?? 0) }];
    }
    if (s.startsWith('SELECT COALESCE(SUM(amount_cents)')) {
      sumSettledSqls.push(s);
      // Escopo MESA: visit_id IS NULL
      if (s.includes('visit_id IS NULL')) return [{ paid: String(opts.settledForTable ?? 0) }];
      // Escopo RATEIO: visit_id = X E split_mode NÃO nulo
      if (s.includes('split_mode IS NOT NULL')) {
        return [{ paid: String(opts.settledForSplit ?? 0) }];
      }
      // Escopo COMANDA individual: visit_id = X E split_mode nulo
      if (s.includes('split_mode IS NULL')) {
        return [{ paid: String(opts.settledForIndividual ?? 0) }];
      }
      // Filtro NÃO discrimina split_mode → contamina os modos. Sinaliza o bug
      // devolvendo a SOMA dos dois escopos de visita (o que o código antigo
      // fazia implicitamente ao somar tudo do visit_id).
      return [
        { paid: String((opts.settledForIndividual ?? 0) + (opts.settledForSplit ?? 0)) },
      ];
    }
    if (s.startsWith('SELECT id FROM visits')) {
      const v = opts.visitForCustomer?.[params[1] as string];
      return v ? [{ id: v }] : [];
    }
    if (s.includes('FROM payments') && s.includes(`status = 'pending'`)) return [];
    if (s.startsWith('INSERT INTO payments')) {
      inserts.push({ params });
      return [
        {
          id: 'pay-1',
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
    throw new Error(`fake cross-mode: SQL não roteado: ${s.slice(0, 100)}`);
  };
  return { inserts, sumSettledSqls, conn: { query } as unknown as TenantConnectionProvider };
}

function fakeRedis(): RedisService {
  return { setNX: async () => true, del: async () => 1, get: async () => null } as never;
}

function make(opts: Parameters<typeof fakeDb>[0]) {
  const db = fakeDb(opts);
  return { service: new PaymentsService(db.conn, fakeRedis(), new BillingService(db.conn)), db };
}

describe('BUG 1 — cross-mode scope contamination (sumSettled por modo)', () => {
  it('individual: pagamento do RATEIO (split) NÃO abate a comanda individual', async () => {
    // Comanda individual: 8000 + 10% = 8800 devido. Nada pago NA COMANDA.
    // Mas 8800 já foram pagos no RATEIO da mesa (mesmo visit_id, split_mode≠null).
    // O rateio NÃO pode zerar a comanda individual — são dívidas distintas.
    const { service, db } = make({
      individualSubtotal: 8_000,
      settledForIndividual: 0,
      settledForSplit: 8_800,
      visitForCustomer: { [ANA]: VISIT },
    });
    const res = await service.requestPayment(SESSION, null, 'individual', 'pix', {
      callerCustomerId: ANA,
    });
    // Cobra a comanda individual CHEIA (8800) — o pagamento do rateio é de outro escopo.
    expect(res.amountCents).toBe(8_800);
    // e o INSERT vai como comanda individual (split_mode NULL)
    expect(db.inserts[0].params[7]).toBeNull();
  });

  it('split: pagamento da COMANDA individual NÃO abate a parte do rateio da mesa', async () => {
    // Mesa: Ana 6000 + compartilhado 4000 = 10000, +10% = 11000. 3 participantes.
    // Parte canônica da Ana no equal = 3668. Nada pago no RATEIO.
    // Mas 3668 já foram pagos na COMANDA individual (mesmo visit_id, split_mode NULL).
    // A comanda individual NÃO pode zerar a parte do rateio.
    const { service, db } = make({
      serviceFeePct: '10.00',
      tableItems: [
        { subtotal_cents: 6_000, customer_id: ANA },
        { subtotal_cents: 4_000, customer_id: null },
      ],
      participants: [ANA, BETO, CARLA],
      settledForIndividual: 3_668,
      settledForSplit: 0,
      visitForCustomer: { [ANA]: VISIT },
    });
    const res = await service.requestPayment(SESSION, null, 'individual', 'pix', {
      callerCustomerId: ANA,
      splitMode: 'equal',
      allocations: [{ customerId: ANA, amountCents: 3_668 }],
    });
    // Cobra a parte do rateio CHEIA (3668) — o pagamento da comanda é de outro escopo.
    expect(res.amountCents).toBe(3_668);
    // o INSERT vai como rateio (split_mode = 'equal')
    expect(db.inserts[0].params[7]).toBe('equal');
  });

  it('split: pagamento PARCIAL anterior DO PRÓPRIO rateio abate corretamente', async () => {
    // Mesma mesa; Ana já pagou 1668 da parte do rateio dela (split_mode≠null).
    // Devido do rateio = 3668 - 1668 = 2000. Comanda individual não interfere.
    const { service } = make({
      serviceFeePct: '10.00',
      tableItems: [
        { subtotal_cents: 6_000, customer_id: ANA },
        { subtotal_cents: 4_000, customer_id: null },
      ],
      participants: [ANA, BETO, CARLA],
      settledForIndividual: 5_000, // ruído de outro escopo — não pode influenciar
      settledForSplit: 1_668,
      visitForCustomer: { [ANA]: VISIT },
    });
    const res = await service.requestPayment(SESSION, null, 'individual', 'pix', {
      callerCustomerId: ANA,
      splitMode: 'equal',
      allocations: [{ customerId: ANA, amountCents: 3_668 }],
    });
    expect(res.amountCents).toBe(2_000);
  });

  it('mesa: escopo table (visit_id NULL) não é contaminado por pagamentos de visita', async () => {
    // Conta da mesa 10000 + 10% = 11000. Nada pago no escopo MESA.
    // Ruído: pagamentos em escopos de visita (individual/rateio) não podem abater.
    const { service, db } = make({
      tableSubtotal: 10_000,
      settledForTable: 0,
      settledForIndividual: 5_000,
      settledForSplit: 4_000,
    });
    await service.requestPayment(SESSION, null, 'table', 'pix');
    expect(db.inserts[0].params[2]).toBe(11_000);
  });
});

describe('BUG 2 — comparação canônica real no custom (não tautológica)', () => {
  // Mesa: Ana 6000 + compartilhado 4000 = 10000, +10% = 11000. 3 participantes.
  const baseOpts = {
    serviceFeePct: '10.00',
    tableItems: [
      { subtotal_cents: 6_000, customer_id: ANA },
      { subtotal_cents: 4_000, customer_id: null },
    ],
    participants: [ANA, BETO, CARLA],
    visitForCustomer: { [ANA]: VISIT },
  };

  it('custom: caller que se aloca 0 (empurrando a conta pros outros) é rejeitado por VALIDAÇÃO', async () => {
    // Soma bate com 11000, mas a Ana se cobra 0 e joga 5500+5500 nos outros.
    // O check `sent !== mine` era tautológico (mesmo objeto) → não barrava.
    // A allocation do caller tem que ser > 0: ninguém paga a conta da mesa
    // se cobrando 0. Deve BARRAR com mensagem de validação da parte (não o
    // genérico "nada pendente", que só mascararia o buraco).
    const { service } = make(baseOpts);
    await expect(
      service.requestPayment(SESSION, null, 'individual', 'pix', {
        callerCustomerId: ANA,
        splitMode: 'custom',
        allocations: [
          { customerId: ANA, amountCents: 0 },
          { customerId: BETO, amountCents: 5_500 },
          { customerId: CARLA, amountCents: 5_500 },
        ],
      }),
    ).rejects.toThrow(/sua parte|parte na divis/i);
  });

  it('custom: comparação usa o valor ENVIADO contra o CANÔNICO (não é o mesmo objeto)', async () => {
    // Prova anti-tautologia: se o service comparasse a allocation consigo
    // mesma (mesmo array de options.allocations), nunca detectaria nada.
    // Aqui o caller manda uma parte NEGATIVA (crédito falso) mas ajusta os
    // outros pra soma continuar batendo em 11000. O guard tem que rejeitar
    // uma parte inválida do caller — não pode aceitar valor negativo/zero.
    const { service } = make(baseOpts);
    await expect(
      service.requestPayment(SESSION, null, 'individual', 'pix', {
        callerCustomerId: ANA,
        splitMode: 'custom',
        allocations: [
          { customerId: ANA, amountCents: -1_000 },
          { customerId: BETO, amountCents: 6_000 },
          { customerId: CARLA, amountCents: 6_000 },
        ],
      }),
    ).rejects.toThrow(/sua parte|parte na divis/i);
  });

  it('custom: allocation cuja soma bate e a parte do caller é > 0 é aceita e cobra a parte dele', async () => {
    const { service } = make(baseOpts);
    const res = await service.requestPayment(SESSION, null, 'individual', 'pix', {
      callerCustomerId: ANA,
      splitMode: 'custom',
      allocations: [
        { customerId: ANA, amountCents: 7_000 },
        { customerId: BETO, amountCents: 2_000 },
        { customerId: CARLA, amountCents: 2_000 },
      ],
    });
    expect(res.amountCents).toBe(7_000);
  });
});

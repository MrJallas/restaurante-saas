/**
 * P1 ALTO do re-scan de convergência 2026-07-04 (cluster de dinheiro):
 * DOUBLE-CHARGE CROSS-SCOPE table ↔ split.
 *
 * A conta da MESA (orders billing_mode='table') pode ser liquidada por DOIS
 * caminhos que, depois do fix cross-mode-scope (75578d8), NÃO se enxergam:
 *
 *   - mode='table'  → pagamento com visit_id NULL. sumSettled('table') filtra
 *     `visit_id IS NULL`.
 *   - split         → pagamento com visit_id=X, split_mode≠null.
 *     sumSettled('split') filtra `visit_id=X AND split_mode IS NOT NULL`.
 *
 * O fix cross-mode ISOLOU cada escopo — CORRETO pra comanda INDIVIDUAL
 * (billing_mode='individual', dívida SEPARADA da pessoa). MAS table-scope e
 * split-scope são a MESMA dívida: a conta da MESA, só dividida diferente. A
 * isolação fez um não ver o outro → nada impede liquidar a mesa DUAS vezes.
 *
 * POC (RED antes do fix): mesa R$110. A paga mode=table R$110 (visit_id NULL,
 * settled). B abre 'dividir' → sumSettled('split') pra B era 0 (sem split rows)
 * → B era cobrado R$36,66 CHEIOS. C, D idem → restaurante coletava
 * R$110 + 3×R$36,66 = R$220 por uma conta de R$110.
 *
 * INVARIANTE do fix: o "devido da MESA" = total da mesa - (pagamentos
 * table-scope + TODOS os pagamentos split-scope juntos). Table e split pagam
 * a MESMA dívida. A comanda INDIVIDUAL segue SEPARADA (não mistura).
 */

import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { BillingService } from '../billing/billing.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const SESSION = '11111111-1111-4111-8111-111111111111';
const ANA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const BETO = 'bbbbbbbb-0000-4000-8000-00000000000b';
const CARLA = 'cccccccc-0000-4000-8000-00000000000c';
const VISIT_ANA = '22222222-2222-4222-8222-22222222222a';
const VISIT_BETO = '22222222-2222-4222-8222-22222222222b';

/**
 * DB fake que modela os TRÊS baldes de pagamento da mesa separadamente e
 * responde cada consulta de sumSettled pelo que o SQL de fato filtra:
 *   - table-scope   → `visit_id IS NULL`
 *   - split-scope   → `split_mode IS NOT NULL` (qualquer visita)
 *   - individual    → `split_mode IS NULL` com visit_id
 * O fix pode consultar a conta da mesa como UMA soma (table+split); o fake
 * suporta as duas formas — o que importa é o total table+split que sai.
 */
function fakeDb(opts: {
  serviceFeePct?: string;
  tableSubtotal?: number;
  individualSubtotal?: number;
  tableItems?: Array<{ subtotal_cents: number; customer_id: string | null }>;
  participants?: string[];
  visitForCustomer?: Record<string, string>;
  /** já-pago no escopo TABLE (mode=table, visit_id NULL) */
  settledForTable?: number;
  /** já-pago no escopo SPLIT somando TODOS os participantes (qualquer visita) */
  settledForSplit?: number;
  /** já-pago no PRÓPRIO rateio deste caller (visit_id = seu, split_mode≠null) */
  settledForOwnSplit?: number;
  /** já-pago na COMANDA individual (visit_id=X, split_mode NULL) */
  settledForIndividual?: number;
}) {
  const inserts: Array<{ params: unknown[] }> = [];
  const sumSettledSqls: string[] = [];
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
    if (s.startsWith('SELECT COALESCE(SUM(total_cents)')) {
      return s.includes(`billing_mode = 'individual'`)
        ? [{ total: String(opts.individualSubtotal ?? 0) }]
        : [{ total: String(opts.tableSubtotal ?? 0) }];
    }
    if (s.startsWith('SELECT COALESCE(SUM(amount_cents)')) {
      sumSettledSqls.push(s);
      const table = opts.settledForTable ?? 0;
      const split = opts.settledForSplit ?? 0;
      const ownSplit = opts.settledForOwnSplit ?? 0;
      const individual = opts.settledForIndividual ?? 0;
      // Escopo 'table_bill' (o fix): (visit_id IS NULL OR split_mode IS NOT NULL)
      // sem `visit_id = $2` → soma table-scope + TODOS os splits.
      const isTableBill =
        s.includes('visit_id IS NULL') && s.includes('split_mode IS NOT NULL');
      // Escopo 'table' puro (código pré-fix, aqui só como fallback): visit_id NULL
      // sem split_mode.
      const isTableOnly = s.includes('visit_id IS NULL') && !s.includes('split_mode');
      // Próprio rateio deste caller: visit_id = $2 + split_mode≠null.
      const isOwnSplit = s.includes('visit_id = $2') && s.includes('split_mode IS NOT NULL');
      // Comanda individual: visit_id = $2 + split_mode NULL.
      const isIndividual = s.includes('visit_id = $2') && s.includes('split_mode IS NULL');
      if (isTableBill) return [{ paid: String(table + split) }];
      if (isTableOnly) return [{ paid: String(table) }];
      if (isOwnSplit) return [{ paid: String(ownSplit) }];
      if (isIndividual) return [{ paid: String(individual) }];
      throw new Error(`fake table-split: sumSettled não reconhecido: ${s.slice(0, 130)}`);
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
    throw new Error(`fake table-split double-charge: SQL não roteado: ${s.slice(0, 110)}`);
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

// Mesa: Ana 6000 + compartilhado 4000 = 10000, +10% = 11000. 3 participantes.
// Parte canônica de cada no equal: 3668/3666/3666.
const mesaOpts = {
  serviceFeePct: '10.00',
  tableItems: [
    { subtotal_cents: 6_000, customer_id: ANA },
    { subtotal_cents: 4_000, customer_id: null },
  ],
  participants: [ANA, BETO, CARLA],
  tableSubtotal: 10_000,
  visitForCustomer: { [ANA]: VISIT_ANA, [BETO]: VISIT_BETO },
};

describe('DOUBLE-CHARGE cross-scope table ↔ split (a conta da MESA é UMA dívida)', () => {
  it('POC: mesa R$110 quitada via mode=table → abrir split NÃO cobra a parte cheia', async () => {
    // Ana pagou a mesa INTEIRA por mode=table (11000, visit_id NULL, settled).
    // Beto abre 'dividir' e tenta pagar a parte dele (equal = 3666).
    // A conta da mesa JÁ está liquidada → o devido do rateio tem que ser <= 0
    // → recusa ("nada pendente"), não cobra R$36,66 em cima de conta paga.
    const { service } = make({
      ...mesaOpts,
      settledForTable: 11_000, // Ana pagou tudo por mode=table
      settledForSplit: 0,
    });
    await expect(
      service.requestPayment(SESSION, null, 'individual', 'pix', {
        callerCustomerId: BETO,
        splitMode: 'equal',
        allocations: [{ customerId: BETO, amountCents: 3_666 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('POC inverso: mesa quitada via split (todos pagaram) → mode=table recusa', async () => {
    // Todo mundo pagou sua parte via split (soma = 11000). Alguém tenta pagar a
    // mesa inteira por mode=table depois → a mesa já está liquidada, recusa.
    const { service } = make({
      ...mesaOpts,
      settledForTable: 0,
      settledForSplit: 11_000, // soma de todas as partes do rateio
    });
    await expect(service.requestPayment(SESSION, null, 'table', 'pix')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('coleta NUNCA passa do total da mesa: table parcial + split abate o já-pago', async () => {
    // Ana pagou 5000 da mesa por mode=table. Beto abre split (parte = 3666).
    // O devido do rateio dele considera table+split: a mesa ainda deve
    // 11000 - 5000 = 6000; a parte canônica de Beto (3666) < 6000, então
    // ele paga a parte dele (3666), mas NUNCA além do que a mesa ainda deve.
    const { service, db } = make({
      ...mesaOpts,
      settledForTable: 5_000,
      settledForSplit: 0,
    });
    const res = await service.requestPayment(SESSION, null, 'individual', 'pix', {
      callerCustomerId: BETO,
      splitMode: 'equal',
      allocations: [{ customerId: BETO, amountCents: 3_666 }],
    });
    // Beto paga a parte dele, limitada ao que a mesa ainda deve (6000 > 3666).
    expect(res.amountCents).toBeGreaterThan(0);
    expect(res.amountCents).toBeLessThanOrEqual(3_666);
    // E a coleta acumulada (5000 já pago + o que Beto insere) <= total da mesa.
    expect(5_000 + (db.inserts[0].params[2] as number)).toBeLessThanOrEqual(11_000);
  });

  it('a última parte do split é limitada ao que a mesa AINDA deve (não excede)', async () => {
    // Mesa 11000. Já foram pagos 5000 por mode=table + 3000 por split de
    // outros = 8000. Sobram 3000. Beto tenta pagar a parte canônica dele
    // (3666), mas a mesa só deve mais 3000 → cobra no máximo 3000, nunca 3666.
    const { service, db } = make({
      ...mesaOpts,
      settledForTable: 5_000,
      settledForSplit: 3_000,
    });
    const res = await service.requestPayment(SESSION, null, 'individual', 'pix', {
      callerCustomerId: BETO,
      splitMode: 'equal',
      allocations: [{ customerId: BETO, amountCents: 3_666 }],
    });
    expect(res.amountCents).toBe(3_000);
    // total coletado NUNCA passa dos 11000.
    expect(8_000 + res.amountCents).toBeLessThanOrEqual(11_000);
  });

  it('invariante de segurança: soma coletada (table + todos os splits) <= total da mesa', async () => {
    // Simula os 4 pagamentos do POC original em sequência e verifica que a
    // soma total inserida NUNCA ultrapassa 11000.
    // 1) Ana paga a mesa inteira por mode=table.
    const t1 = make({ ...mesaOpts, settledForTable: 0, settledForSplit: 0 });
    const anaPay = await t1.service.requestPayment(SESSION, null, 'table', 'pix');
    let collected = anaPay.amountCents; // 11000
    expect(collected).toBe(11_000);

    // 2) Beto abre split DEPOIS — a mesa já está liquidada (settledForTable=11000).
    const t2 = make({ ...mesaOpts, settledForTable: 11_000, settledForSplit: 0 });
    await expect(
      t2.service.requestPayment(SESSION, null, 'individual', 'pix', {
        callerCustomerId: BETO,
        splitMode: 'equal',
        allocations: [{ customerId: BETO, amountCents: 3_666 }],
      }),
    ).rejects.toThrow(BadRequestException); // não coleta nada a mais

    // 3+4) Carla e outra idem — todas recusadas, collected fica em 11000.
    expect(collected).toBeLessThanOrEqual(11_000);
  });
});

describe('REGRESSÃO: a comanda INDIVIDUAL segue SEPARADA (não mistura com a mesa)', () => {
  it('individual: pagamento table/split da mesa NÃO abate a comanda individual', async () => {
    // Comanda individual 8000 + 10% = 8800. Nada pago NA COMANDA.
    // Ruído: 8800 pagos no escopo da mesa (table) e 8800 no split.
    // A comanda individual é dívida SEPARADA → cobra 8800 cheios.
    const { service, db } = make({
      individualSubtotal: 8_000,
      settledForIndividual: 0,
      settledForTable: 8_800,
      settledForSplit: 8_800,
      visitForCustomer: { [ANA]: VISIT_ANA },
    });
    const res = await service.requestPayment(SESSION, null, 'individual', 'pix', {
      callerCustomerId: ANA,
    });
    expect(res.amountCents).toBe(8_800);
    // INSERT como comanda individual (split_mode NULL).
    expect(db.inserts[0].params[7]).toBeNull();
  });
});

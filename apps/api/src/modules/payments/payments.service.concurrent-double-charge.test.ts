/**
 * P1 ALTO do re-scan de convergência #3 (2026-07-04) — DOUBLE-CHARGE
 * CONCORRENTE da conta da MESA (TOCTOU).
 *
 * O fix cross-scope sequencial (587a6e2) capa a cobrança em
 * `tableRemaining = split.totalCents - sumSettled('table_bill')` (e o análogo
 * pro mode=table). Isso fecha o double-charge SEQUENCIAL. Mas dois buracos de
 * CONCORRÊNCIA ficavam abertos:
 *
 *   1. `sumSettled('table_bill')` só conta pagamentos JÁ liquidados
 *      (confirmed/paid/awaiting_settlement). Um pagamento recém-criado entra
 *      como 'pending' e NÃO reservava saldo — então o 2º request lia o mesmo
 *      tableRemaining do 1º e re-inseria por cima.
 *   2. O lock SETNX era keyed por visit: `payment_lock:<session>:<visitId|table>`.
 *      mode=table pegava ':table'; cada split payer pegava ':<seu visitId>'
 *      (distinto por cliente). Então mode=table vs split, e dois splits de
 *      visitas distintas, pegavam CHAVES DIFERENTES → NÃO serializavam.
 *
 * REPRO (este arquivo, RED antes do fix): mesa R$110. R$60 já pago via
 * mode=table (remaining 5000). Beto + Carla (visitIds DISTINTOS) pagam a parte
 * canônica CONCORRENTE, cada um racing um mode=table. Sem o lock compartilhado
 * + reserva de pending, ambos liam tableRemaining=5000 e cada um inseria a
 * parte cheia → coleta 6000 + 3666 + 3666 = 13332 > 11000.
 *
 * INVARIANTE do fix (o que este teste trava): a conta da MESA liquida por UM
 * caminho ATÔMICO. A soma de TODOS os INSERTs table-bill-scoped (mode=table +
 * TODOS os splits) NUNCA passa do total da mesa, mesmo sob concorrência real.
 *   (a) lock compartilhado `payment_lock:<session>:tablebill` envolvendo
 *       sumSettled+clamp+INSERT → serializa mode=table e TODOS os splits.
 *   (b) tableRemaining conta os pending NÃO-expirados table-bill-scoped também.
 *
 * A comanda INDIVIDUAL (mode=individual SEM splitMode) segue isolada, com lock
 * per-visit — dívida separada, testada nos outros specs.
 */

import { PaymentsService } from './payments.service';
import { BillingService } from '../billing/billing.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const SESSION = '11111111-1111-4111-8111-111111111111';
const ANA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const BETO = 'bbbbbbbb-0000-4000-8000-00000000000b';
const CARLA = 'cccccccc-0000-4000-8000-00000000000c';
const VISIT_BETO = '22222222-2222-4222-8222-22222222222b';
const VISIT_CARLA = '22222222-2222-4222-8222-22222222222c';

/**
 * Uma "linha" da tabela payments no store compartilhado. Só o que o cálculo de
 * saldo enxerga: escopo (visit_id/split_mode), status, valor e expiração.
 */
interface PayRow {
  amount_cents: number;
  status: 'pending' | 'awaiting_settlement' | 'confirmed' | 'expired';
  visit_id: string | null;
  split_mode: string | null;
  expires_at: number | null; // epoch ms; null = nunca expira
}

/**
 * SETNX REAL, keyed por string — modela o lock do Redis. Map compartilhado
 * entre os requests concorrentes, então o lock ':tablebill' de fato serializa.
 * A serialização vem de: quem perde o SETNX recebe `false` → o service lança
 * "Pagamento sendo processado" (não coleta nada). É a serialização de verdade.
 */
function sharedRedis(): RedisService {
  const store = new Map<string, string>();
  return {
    setNX: async (k: string, v: string) => {
      if (store.has(k)) return false;
      store.set(k, v);
      return true;
    },
    get: async (k: string) => store.get(k) ?? null,
    del: async (k: string) => {
      store.delete(k);
    },
  } as unknown as RedisService;
}

/**
 * DB fake com store de payments COMPARTILHADO. sumSettled e sumPendingTableBill
 * são calculados a partir do store (não são estáticos injetados) — é isso que
 * exercita a reserva de pending de verdade. Um `gate` opcional força os READS
 * de saldo a acontecerem ANTES de qualquer INSERT (interleaving TOCTOU), pra
 * provar o RED sem o fix; com o fix (lock compartilhado), o 2º request nem
 * chega a ler porque perde o SETNX.
 */
function sharedDb(opts: {
  serviceFeePct?: string;
  tableSubtotal?: number;
  tableItems?: Array<{ subtotal_cents: number; customer_id: string | null }>;
  participants?: string[];
  visitForCustomer?: Record<string, string>;
  seed?: PayRow[];
  /** Barreira: resolve quando N leituras de saldo chegaram (força interleaving). */
  gate?: { arrive: () => Promise<void> };
}) {
  const payments: PayRow[] = [...(opts.seed ?? [])];
  const SETTLED = new Set(['confirmed', 'paid', 'awaiting_settlement']);

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
        ? [{ total: '0' }]
        : [{ total: String(opts.tableSubtotal ?? 0) }];
    }
    // sumPendingTableBill: 'pending' NÃO-expirado, table-bill-scoped.
    if (s.startsWith('SELECT COALESCE(SUM(amount_cents)') && s.includes(`status = 'pending'`)) {
      const now = Date.now();
      const pending = payments
        .filter(
          (p) =>
            p.status === 'pending' &&
            (p.visit_id === null || p.split_mode !== null) &&
            (p.expires_at === null || p.expires_at > now),
        )
        .reduce((sum, p) => sum + p.amount_cents, 0);
      return [{ pending: String(pending) }];
    }
    // sumSettled: soma por escopo, calculada do store compartilhado.
    if (s.startsWith('SELECT COALESCE(SUM(amount_cents)')) {
      const isTableBill =
        s.includes('visit_id IS NULL') && s.includes('split_mode IS NOT NULL');
      // Gate SÓ na leitura decisiva do saldo table-bill (uma por request):
      // é aqui que o TOCTOU acontece — todos leem tableRemaining stale antes de
      // qualquer INSERT quando os locks não serializam.
      if (opts.gate && isTableBill) await opts.gate.arrive();
      const isOwnSplit = s.includes('visit_id = $2') && s.includes('split_mode IS NOT NULL');
      const isIndividual = s.includes('visit_id = $2') && s.includes('split_mode IS NULL');
      const visitArg = params[1] as string | undefined;
      const paid = payments
        .filter((p) => {
          if (!SETTLED.has(p.status)) return false;
          if (isTableBill) return p.visit_id === null || p.split_mode !== null;
          if (isOwnSplit) return p.visit_id === visitArg && p.split_mode !== null;
          if (isIndividual) return p.visit_id === visitArg && p.split_mode === null;
          // 'table' puro (visit_id NULL, sem split_mode no clause)
          return p.visit_id === null;
        })
        .reduce((sum, p) => sum + p.amount_cents, 0);
      return [{ paid: String(paid) }];
    }
    if (s.startsWith('SELECT id FROM visits')) {
      const v = opts.visitForCustomer?.[params[1] as string];
      return v ? [{ id: v }] : [];
    }
    // Dedup de pending por escopo (SELECT id, expires_at ... status='pending').
    // Devolve o expires_at REAL (ISO) pra que o lazy-expiry do código
    // transicione um pending vencido pra 'expired' em vez de barrar o retry.
    if (
      s.startsWith('SELECT id, expires_at FROM payments') &&
      s.includes(`status = 'pending'`)
    ) {
      const visitArg = (params[1] as string | undefined) ?? null;
      const wantsVisit = s.includes('visit_id = $2');
      return payments
        .map((p, idx) => ({ p, idx }))
        .filter(
          ({ p }) =>
            p.status === 'pending' && (wantsVisit ? p.visit_id === visitArg : p.visit_id === null),
        )
        .map(({ p, idx }) => ({
          id: `existing-${idx}`,
          expires_at: p.expires_at === null ? null : new Date(p.expires_at).toISOString(),
        }));
    }
    // Lazy-expiry: UPDATE ... SET status='expired' WHERE id=$1 (id='existing-N').
    // Tira a row do bucket 'pending' sem virar 'settled' — libera o retry.
    if (s.startsWith(`UPDATE payments SET status = 'expired'`)) {
      const id = params[0] as string;
      const idx = Number(id.replace('existing-', ''));
      if (payments[idx]) payments[idx].status = 'expired';
      return [];
    }
    if (s.startsWith('INSERT INTO payments')) {
      const row: PayRow = {
        amount_cents: params[2] as number,
        status: 'pending',
        visit_id: (params[1] as string | null) ?? null,
        split_mode: (params[7] as string | null) ?? null,
        expires_at: null, // seed controla expiração; novos nunca expiram no teste
      };
      payments.push(row);
      return [
        {
          id: `pay-${payments.length}`,
          status: 'pending',
          amount_cents: row.amount_cents,
          method: params[3],
          pix_qr_code: params[4],
          pix_copy_paste: params[5],
          expires_at: null,
          split_mode: row.split_mode,
          split_allocations: params[8],
          created_at: '2026-07-04T00:00:00Z',
        },
      ];
    }
    throw new Error(`sharedDb: SQL não roteado: ${s.slice(0, 110)}`);
  };

  return { payments, conn: { query } as unknown as TenantConnectionProvider };
}

/**
 * Barreira de interleaving TOCTOU que NÃO trava. Segura CADA leitura decisiva
 * de saldo até N chegadas OU até um timeout curto — o que vier primeiro:
 *
 *   - SEM fix (locks per-visit distintos): os N requests concorrentes TODOS
 *     alcançam a leitura de saldo → a barreira abre em N chegadas, então todos
 *     leem o MESMO tableRemaining stale ANTES de qualquer INSERT (o TOCTOU) →
 *     todos inserem → soma > total. RED.
 *   - COM fix (lock ':tablebill' compartilhado): só 1 request alcança a leitura
 *     (os outros perdem o SETNX e lançam antes de ler). A barreira nunca vê N
 *     chegadas, mas o timeout a libera → o único leitor prossegue serializado.
 *     GREEN, sem deadlock.
 *
 * `arrive` é chamado UMA vez por request (na 1ª leitura de saldo table-bill).
 */
function makeGate(n: number) {
  let arrived = 0;
  let released = false;
  let release!: () => void;
  const opened = new Promise<void>((r) => {
    release = () => {
      if (!released) {
        released = true;
        r();
      }
    };
  });
  // Fallback anti-deadlock: se N chegadas nunca acontecerem (serialização
  // real), libera após um tempo curto. Alto o suficiente pra os requests
  // concorrentes do caso RED todos chegarem antes.
  setTimeout(() => release(), 100);
  return {
    arrive: async () => {
      arrived += 1;
      if (arrived >= n) release();
      await opened;
    },
  };
}

// Mesa: Ana 6000 + compartilhado 4000 = 10000, +10% = 11000. 3 participantes.
// Parte canônica no equal: 3668/3666/3666.
const mesaBase = {
  serviceFeePct: '10.00',
  tableSubtotal: 10_000,
  tableItems: [
    { subtotal_cents: 6_000, customer_id: ANA },
    { subtotal_cents: 4_000, customer_id: null },
  ],
  participants: [ANA, BETO, CARLA],
  visitForCustomer: { [BETO]: VISIT_BETO, [CARLA]: VISIT_CARLA },
};

function svcWith(db: ReturnType<typeof sharedDb>) {
  return new PaymentsService(db.conn, sharedRedis(), new BillingService(db.conn));
}

describe('DOUBLE-CHARGE CONCORRENTE da conta da mesa (TOCTOU) — soma dos INSERTs <= total', () => {
  it('dois split payers (visitIds distintos) racing um mode=table NUNCA coletam > total da mesa', async () => {
    // 6000 já pago via mode=table (visit_id NULL, awaiting_settlement).
    // Remaining = 11000 - 6000 = 5000.
    const db = sharedDb({
      ...mesaBase,
      seed: [
        {
          amount_cents: 6_000,
          status: 'awaiting_settlement',
          visit_id: null,
          split_mode: null,
          expires_at: null,
        },
      ],
      // Gate de 3: os 3 requests concorrentes têm que fazer seus READs de saldo
      // antes de qualquer INSERT liberar — o interleaving TOCTOU clássico.
      gate: makeGate(3),
    });
    const svc = svcWith(db);

    // Beto e Carla pagam a parte canônica (equal) CONCORRENTE; um 3º cliente
    // corre um mode=table pela conta inteira ao mesmo tempo.
    const results = await Promise.allSettled([
      svc.requestPayment(SESSION, null, 'individual', 'pix', {
        callerCustomerId: BETO,
        splitMode: 'equal',
        allocations: [{ customerId: BETO, amountCents: 3_666 }],
      }),
      svc.requestPayment(SESSION, null, 'individual', 'pix', {
        callerCustomerId: CARLA,
        splitMode: 'equal',
        allocations: [{ customerId: CARLA, amountCents: 3_666 }],
      }),
      svc.requestPayment(SESSION, null, 'table', 'pix'),
    ]);

    // INVARIANTE: seed (6000) + soma de TODOS os INSERTs table-bill <= 11000.
    const insertedTableBill = db.payments
      .filter((p) => p.status === 'pending' && (p.visit_id === null || p.split_mode !== null))
      .reduce((sum, p) => sum + p.amount_cents, 0);
    const collected = 6_000 + insertedTableBill;
    expect(collected).toBeLessThanOrEqual(11_000);

    // Sanidade: pelo menos um pagamento foi aceito (o fix não trava tudo).
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
  });

  it('dois splits concorrentes com saldo APERTADO (remaining < 2 partes) nunca furam o teto', async () => {
    // Mesa 11000. 5000 já pago via mode=table (remaining = 6000). Beto e Carla
    // correm suas partes canônicas (3666 cada) CONCORRENTE. 3666+3666 = 7332 >
    // 6000: sem reserva de pending, ambos leem remaining=6000 e cada um insere
    // min(3666, 6000)=3666 → coleta 5000+7332 = 12332 > 11000. Com o fix
    // (serializa + reserva pending), o 2º vê remaining já abatido do pending do
    // 1º → soma total nunca passa de 11000. É o RED-catcher forte deste bug.
    const db = sharedDb({
      ...mesaBase,
      seed: [
        {
          amount_cents: 5_000,
          status: 'awaiting_settlement',
          visit_id: null,
          split_mode: null,
          expires_at: null,
        },
      ],
      gate: makeGate(2),
    });
    const svc = svcWith(db);

    await Promise.allSettled([
      svc.requestPayment(SESSION, null, 'individual', 'pix', {
        callerCustomerId: BETO,
        splitMode: 'equal',
        allocations: [{ customerId: BETO, amountCents: 3_666 }],
      }),
      svc.requestPayment(SESSION, null, 'individual', 'pix', {
        callerCustomerId: CARLA,
        splitMode: 'equal',
        allocations: [{ customerId: CARLA, amountCents: 3_666 }],
      }),
    ]);

    const insertedTableBill = db.payments
      .filter((p) => p.status === 'pending' && (p.visit_id === null || p.split_mode !== null))
      .reduce((sum, p) => sum + p.amount_cents, 0);
    expect(5_000 + insertedTableBill).toBeLessThanOrEqual(11_000);
  });

  it('mode=table racing um split com saldo apertado nunca fura o teto (cross-scope)', async () => {
    // Mesa 11000. 8000 já pago via split de outros (remaining = 3000). Um cliente
    // corre mode=table (pela conta cheia = 3000 restante) enquanto Beto corre a
    // parte dele (3666). Sem serializar table↔split, ambos leem remaining=3000 e
    // inserem 3000 + 3000 = 6000 por cima dos 8000 → 14000 > 11000. Com o lock
    // ':tablebill' compartilhado, os dois serializam e a soma fecha em 11000.
    const db = sharedDb({
      ...mesaBase,
      seed: [
        {
          amount_cents: 8_000,
          status: 'awaiting_settlement',
          visit_id: VISIT_CARLA,
          split_mode: 'equal',
          expires_at: null,
        },
      ],
      gate: makeGate(2),
    });
    const svc = svcWith(db);

    await Promise.allSettled([
      svc.requestPayment(SESSION, null, 'table', 'pix'),
      svc.requestPayment(SESSION, null, 'individual', 'pix', {
        callerCustomerId: BETO,
        splitMode: 'equal',
        allocations: [{ customerId: BETO, amountCents: 3_666 }],
      }),
    ]);

    const insertedTableBill = db.payments
      .filter((p) => p.status === 'pending' && (p.visit_id === null || p.split_mode !== null))
      .reduce((sum, p) => sum + p.amount_cents, 0);
    expect(8_000 + insertedTableBill).toBeLessThanOrEqual(11_000);
  });
});

describe('REGRESSÃO: pending EXPIRADO não reserva pra sempre', () => {
  it('pending table-bill EXPIRADO NÃO conta como saldo em voo (libera o retry)', async () => {
    // Mesa 11000. Existe um pending de 11000 table-scope MAS já expirado
    // (expires_at no passado). O TTL de 10min o descarta — ele NÃO deve
    // reservar saldo. Um mode=table novo cobra a mesa cheia (11000), não 0.
    const db = sharedDb({
      ...mesaBase,
      seed: [
        {
          amount_cents: 11_000,
          status: 'pending',
          visit_id: null,
          split_mode: null,
          expires_at: Date.now() - 60_000, // expirado há 1 min
        },
      ],
    });
    const svc = svcWith(db);
    const res = await svc.requestPayment(SESSION, null, 'table', 'pix');
    // Pending expirado não reservou → cobra a mesa cheia.
    expect(res.amountCents).toBe(11_000);
  });

  it('pending table-bill NÃO-expirado reserva o saldo (2º request não re-cobra)', async () => {
    // Mesa 11000. Existe um pending de 11000 table-scope AINDA válido. Um
    // mode=table novo tem que ver remaining 0 → recusa ("nada pendente").
    const db = sharedDb({
      ...mesaBase,
      seed: [
        {
          amount_cents: 11_000,
          status: 'pending',
          visit_id: null,
          split_mode: null,
          expires_at: Date.now() + 300_000, // válido por +5 min
        },
      ],
    });
    const svc = svcWith(db);
    // Dedup de pending table-scope também barra (já existe pending na mesma
    // cerca) — de todo jeito, NÃO pode inserir uma 2ª cobrança da mesa.
    await expect(svc.requestPayment(SESSION, null, 'table', 'pix')).rejects.toThrow();
    const insertedTableBill = db.payments.filter((p) => p.visit_id === null).length;
    expect(insertedTableBill).toBe(1); // só o seed, nenhum INSERT novo
  });
});

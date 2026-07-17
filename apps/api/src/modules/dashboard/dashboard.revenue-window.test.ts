/**
 * BUG P1 (re-scan · dashboard.service.ts:loadRevenueChart): a janela de receita
 * tinha off-by-one. Uma janela com `- $1::int` e days=1 devolvia
 * HOJE + ONTEM (2 datas), não só hoje; days=7 devolvia 8 datas. Consequências
 * no financeiro do manager:
 *   (a) a "Receita" (soma do /revenue?days=1) divergia do "Faturamento" (overview
 *       só-hoje) na mesma tela — dois faturamentos contraditórios pra "Hoje";
 *   (b) o drill-down detalhe/[kind] inflava ~2x;
 *   (c) o gráfico "7 dias" mostrava 8 barras.
 *
 * FIX: `$1::int` → `($1 - 1)::int`, de forma que
 * days=N devolve EXATAMENTE N datas terminando HOJE (days=1 = só hoje).
 *
 * Estes testes modelam um banco ciente do SQL: `orders` espalhados por várias
 * datas ancoradas em HOJE, e o fake resolve a query de revenue aplicando a
 * MESMA janela que o SQL de fato pede (extraída do texto do WHERE). Assim o
 * teste FALHA contra o `- $1` bugado (N+1 datas) e PASSA depois do fix (N datas),
 * e não é um mock cego do resultado.
 */

import { DashboardService } from './dashboard.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

// Cache-aside transparente (FASE 3): exercitamos a query, não o cache.
const noCacheRedis = {
  get: async () => null,
  set: async () => {},
} as unknown as RedisService;

/** ISO YYYY-MM-DD de HOJE menos `back` dias (UTC, estável no CI). */
function daysAgo(back: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/**
 * Banco fake ciente de SQL para a janela de receita.
 *
 * Modela `orders` com uma data (`daysBack`, 0 = hoje) e um valor. Para a query
 * de revenue, extrai do texto do SQL o multiplicador da janela: se o WHERE usa
 * `($1 - 1)` (fix) a janela é `days - 1` dias atrás; se usa `$1` (bug) a
 * janela é `days` dias atrás. Depois filtra
 * `daysBack <= janela`, agrupa por data e devolve linhas ordenadas — igual ao
 * `GROUP BY DATE(created_at) ORDER BY date ASC` do Postgres.
 *
 * Para a query de overview (só-hoje), soma apenas os pedidos com daysBack === 0.
 */
function fakeRevenueDb(opts: {
  orders: Array<{ daysBack: number; revenueCents: number; settled?: boolean }>;
  todayCustomers?: number;
  avgRating?: number | null;
  pendingOrders?: number;
}) {
  const orders = opts.orders;

  const query = async (sql: string, params?: unknown[]): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    // --- revenue chart: GROUP BY DATE(created_at) com janela parametrizada ---
    if (s.includes('WITH settled AS') && s.includes('FROM payments')) {
      const days = Number((params ?? [])[0]);
      if (!Number.isFinite(days)) {
        throw new Error(`fake revenue: $1 (days) ausente/inválido: ${String((params ?? [])[0])}`);
      }
      // Extrai a janela do TEXTO do SQL (não confia só no param): quantos dias
      // atrás o filtro de fronteira civil alcança.
      let windowBack: number;
      if (/-\s*\(\s*\$1\s*-\s*1\s*\)::int/.test(s)) {
        windowBack = days - 1; // FIX: N datas terminando hoje
      } else if (/-\s*\$1::int/.test(s)) {
        windowBack = days; // BUG: N+1 datas (hoje + N dias atrás)
      } else {
        throw new Error(`fake revenue: janela não reconhecida no WHERE: ${s}`);
      }
      // Agrega por data dentro da janela [hoje .. hoje-windowBack].
      const byDate = new Map<string, { revenue: number; orders: number }>();
      for (const o of orders) {
        if (o.settled === false) continue;
        if (o.daysBack < 0 || o.daysBack > windowBack) continue;
        const date = daysAgo(o.daysBack);
        const cur = byDate.get(date) ?? { revenue: 0, orders: 0 };
        cur.revenue += o.revenueCents;
        cur.orders += 1;
        byDate.set(date, cur);
      }
      return [...byDate.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) // ORDER BY date ASC
        .map(([date, agg]) => ({
          date,
          revenue: String(agg.revenue),
          orders: String(agg.orders),
        }));
    }

    // --- overview "hoje": pedidos lançados e caixa liquidado são fontes separadas ---
    if (
      s.includes('FROM orders') &&
      s.includes("status != 'cancelled'") &&
      s.includes('COUNT(*)')
    ) {
      const todays = orders.filter((o) => o.daysBack === 0);
      return [{ count: String(todays.length) }];
    }
    if (s.includes('FROM payments') && s.includes("status IN ('confirmed', 'paid')")) {
      const todays = orders.filter((o) => o.daysBack === 0 && o.settled !== false);
      const revenue = todays.reduce((sum, o) => sum + o.revenueCents, 0);
      return [{ revenue: String(revenue) }];
    }
    // overview: distinct customers hoje
    if (s.includes('COUNT(DISTINCT customer_id)') && s.includes('FROM visits')) {
      return [{ count: String(opts.todayCustomers ?? 0) }];
    }
    // overview: avg rating 30d
    if (s.includes('AVG(overall_rating)')) {
      return [{ avg: opts.avgRating == null ? null : String(opts.avgRating) }];
    }
    // overview: pending orders
    if (s.includes("status NOT IN ('delivered', 'cancelled')")) {
      return [{ count: String(opts.pendingOrders ?? 0) }];
    }

    throw new Error(`fake revenue: SQL não roteado: ${s}`);
  };

  return { query, getTenantSlug: () => 'restaurant_dev' } as unknown as TenantConnectionProvider;
}

describe('DashboardService.getRevenueChart — janela days=N devolve EXATAMENTE N datas', () => {
  // Um pedido por dia nos últimos 10 dias (daysBack 0..9), cada um R$10,00.
  const oneOrderPerDay = Array.from({ length: 10 }, (_, back) => ({
    daysBack: back,
    revenueCents: 1000,
  }));

  it('days=1 devolve só HOJE (1 data), não hoje+ontem', async () => {
    const svc = new DashboardService(fakeRevenueDb({ orders: oneOrderPerDay }), noCacheRedis);
    const rows = await svc.getRevenueChart(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe(daysAgo(0));
  });

  it('days=7 devolve 7 datas terminando hoje (não 8)', async () => {
    const svc = new DashboardService(fakeRevenueDb({ orders: oneOrderPerDay }), noCacheRedis);
    const rows = await svc.getRevenueChart(7);
    expect(rows).toHaveLength(7);
    expect(rows[0].date).toBe(daysAgo(6)); // data mais antiga da janela
    expect(rows[rows.length - 1].date).toBe(daysAgo(0)); // termina hoje
  });

  it('days=30 devolve no máx. as datas com pedido dentro de 30 dias terminando hoje', async () => {
    // 10 dias de pedidos → todos entram numa janela de 30 dias; nenhuma data
    // fora do intervalo. Confirma que o teto respeita a borda de 30 dias.
    const svc = new DashboardService(fakeRevenueDb({ orders: oneOrderPerDay }), noCacheRedis);
    const rows = await svc.getRevenueChart(30);
    expect(rows).toHaveLength(10);
    // nenhuma data anterior a hoje-29
    expect(rows.every((r) => r.date >= daysAgo(29))).toBe(true);
    expect(rows[rows.length - 1].date).toBe(daysAgo(0));
  });
});

describe('DashboardService — reconciliação Faturamento (overview só-hoje) == Receita (revenue days=1)', () => {
  it('a soma da Receita com days=1 bate com o Faturamento só-hoje do overview', async () => {
    // HOJE: 3 pedidos (R$12 + R$8 + R$5 = R$25,00). ONTEM: 1 pedido de R$99,00
    // que NÃO pode contaminar o "Hoje".
    const orders = [
      { daysBack: 0, revenueCents: 1200 },
      { daysBack: 0, revenueCents: 800 },
      { daysBack: 0, revenueCents: 500 },
      { daysBack: 1, revenueCents: 9900 },
    ];
    const svc = new DashboardService(fakeRevenueDb({ orders }), noCacheRedis);

    const overview = await svc.getOverview();
    const revenue = await svc.getRevenueChart(1);
    // "Receita" no FE = soma de revenueCents da série (financeiro/page.tsx totals).
    const receitaCents = revenue.reduce((sum, r) => sum + r.revenueCents, 0);

    expect(overview.today.revenueCents).toBe(2500); // Faturamento só-hoje
    expect(receitaCents).toBe(2500); // Receita days=1 == Faturamento
    // e a série de days=1 é uma única barra (hoje), não duas.
    expect(revenue).toHaveLength(1);
  });

  it('pedido aberto/não pago não aumenta faturamento', async () => {
    const svc = new DashboardService(
      fakeRevenueDb({
        orders: [
          { daysBack: 0, revenueCents: 5000, settled: false },
          { daysBack: 0, revenueCents: 1200, settled: true },
        ],
      }),
      noCacheRedis,
    );

    const overview = await svc.getOverview();
    expect(overview.today.orders).toBe(2);
    expect(overview.today.revenueCents).toBe(1200);
  });
});

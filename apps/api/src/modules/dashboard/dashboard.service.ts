import { Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { RedisService } from '../../infra/redis/redis.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
  ) {}

  /**
   * FASE 3 · cache-aside das leituras do dashboard (mesmo padrão provado no
   * MenuService). Duas faixas de TTL por volatilidade:
   *  - AO VIVO (10s): funnel/team-kpis/active-tables/overview mudam a cada
   *    pedido e o manager observa em tempo quase-real; 10s absorve o burst
   *    de refresh do painel sem esconder mudança por muito tempo.
   *  - ANALÍTICO (60s): revenue/top-items/feedback/ai-usage são séries
   *    históricas (janelas de dias); 60s de atraso é irrelevante e alivia
   *    bem mais o Postgres.
   * Métodos com argumento (getRevenueChart(days), getTopItems(limit)) põem o
   * arg na key — como o MenuService faz com items:<catId>. Fail-open dos dois
   * lados (get E set em try/catch): Redis fora → query direto.
   */
  private async cached<T>(view: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    const key = `cache:dash:${this.tenantConn.getTenantSlug() ?? 'unknown'}:${view}`;
    try {
      const hit = await this.redis.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      /* fail-open */
    }
    const fresh = await load();
    try {
      await this.redis.set(key, JSON.stringify(fresh), ttlSeconds);
    } catch {
      /* fail-open */
    }
    return fresh;
  }

  /**
   * Funil real do dia (decisão Caleb 2026-07-04, gate 1D): tempos por
   * etapa vindos da order_status_history; "acima da meta" só quando há
   * kitchen_eta configurado — sem meta, sem julgamento inventado.
   */
  async getOrderFunnel(): Promise<{
    stages: Array<{
      stage: string;
      count: number;
      medianMinutes: number;
      p95Minutes: number;
      ok: boolean;
      note: string;
    }>;
  }> {
    // AO VIVO · TTL 10s (muda a cada mudança de status de pedido).
    return this.cached('funnel', 10, () => this.loadOrderFunnel());
  }

  private async loadOrderFunnel(): Promise<{
    stages: Array<{
      stage: string;
      count: number;
      medianMinutes: number;
      p95Minutes: number;
      ok: boolean;
      note: string;
    }>;
  }> {
    const rows = (await this.tenantConn.query(
      `WITH h AS (
         SELECT order_id, to_status, created_at
           FROM order_status_history
          WHERE created_at >= current_date
       ),
       deltas AS (
         SELECT p.stage, p.ord,
                EXTRACT(EPOCH FROM (b.created_at - a.created_at)) AS secs
           FROM (VALUES
                  ('Confirmação', 'pending_confirmation', 'received', 1),
                  ('Fila da cozinha', 'received', 'in_progress', 2),
                  ('Em preparo', 'in_progress', 'ready', 3),
                  ('Pronto → mesa', 'ready', 'delivered', 4)
                ) AS p(stage, from_st, to_st, ord)
           JOIN h a ON a.to_status = p.from_st
           JOIN h b ON b.order_id = a.order_id AND b.to_status = p.to_st
          WHERE b.created_at >= a.created_at
       )
       SELECT stage, ord,
              COUNT(*)::int AS count,
              ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) / 60)::numeric, 1) AS median_min,
              ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY secs) / 60)::numeric, 1) AS p95_min
         FROM deltas
        GROUP BY stage, ord
        ORDER BY ord`,
      [],
    )) as Array<{
      stage: string;
      ord: number;
      count: unknown;
      median_min: unknown;
      p95_min: unknown;
    }>;

    const etaRows = (await this.tenantConn.query(
      `SELECT kitchen_eta_max_minutes FROM settings LIMIT 1`,
      [],
    )) as Array<{ kitchen_eta_max_minutes: number | null }>;
    const kitchenEtaMax = Number(etaRows[0]?.kitchen_eta_max_minutes ?? NaN);

    return {
      stages: rows.map((r) => {
        // pg devolve numeric/ROUND como STRING — coerção obrigatória
        // (gotcha da fatia 1A: '790' + 79 = '79079').
        const medianMinutes = Number(r.median_min) || 0;
        const p95Minutes = Number(r.p95_min) || 0;
        const overKitchenTarget =
          r.stage === 'Em preparo' &&
          Number.isFinite(kitchenEtaMax) &&
          kitchenEtaMax > 0 &&
          medianMinutes > kitchenEtaMax;
        return {
          stage: r.stage,
          count: Number(r.count) || 0,
          medianMinutes,
          p95Minutes,
          ok: !overKitchenTarget,
          note: overKitchenTarget ? `Mediana acima da meta da cozinha (${kitchenEtaMax} min)` : '',
        };
      }),
    };
  }

  /** KPIs por funcionário HOJE — só métricas com fonte real (gate 1D). */
  async getTeamKpis(): Promise<{
    team: Array<{
      staffId: string;
      name: string;
      role: string;
      callsAcknowledged: number;
      avgResponseMinutes: number | null;
      deliveries: number;
      /** Nota média dos pedidos que o staff ENTREGOU (decisão 2026-07-04). */
      avgRating: number | null;
      ratingsCount: number;
    }>;
  }> {
    // AO VIVO · TTL 10s (calls/deliveries do dia sobem em tempo real).
    return this.cached('team-kpis', 10, () => this.loadTeamKpis());
  }

  private async loadTeamKpis(): Promise<{
    team: Array<{
      staffId: string;
      name: string;
      role: string;
      callsAcknowledged: number;
      avgResponseMinutes: number | null;
      deliveries: number;
      avgRating: number | null;
      ratingsCount: number;
    }>;
  }> {
    const rows = (await this.tenantConn.query(
      `SELECT s.id AS staff_id, s.name, s.role,
              COUNT(DISTINCT wc.id)::int AS calls_acknowledged,
              AVG(EXTRACT(EPOCH FROM (wc.acknowledged_at - wc.created_at))) AS avg_response_secs,
              COUNT(DISTINCT od.id)::int AS deliveries,
              rat.avg_rating,
              COALESCE(rat.ratings_count, 0)::int AS ratings_count
         FROM staff s
         LEFT JOIN waiter_calls wc
                ON wc.acknowledged_by = s.id
               AND wc.acknowledged_at >= current_date
         LEFT JOIN order_deliveries od
                ON od.claimed_by = s.id
               AND od.claimed_at >= current_date
         LEFT JOIN LATERAL (
           SELECT AVG(r.rating) AS avg_rating, COUNT(*) AS ratings_count
             FROM order_ratings r
             JOIN order_deliveries od2
               ON od2.order_id = r.order_id AND od2.claimed_by = s.id
            WHERE r.rating IS NOT NULL
              AND r.submitted_at >= current_date - interval '7 days'
         ) rat ON true
        WHERE s.is_active = true
        GROUP BY s.id, s.name, s.role, rat.avg_rating, rat.ratings_count
        ORDER BY s.name`,
      [],
    )) as Array<{
      staff_id: string;
      name: string;
      role: string;
      calls_acknowledged: unknown;
      avg_response_secs: unknown;
      deliveries: unknown;
      avg_rating: unknown;
      ratings_count: unknown;
    }>;
    return {
      team: rows.map((r) => {
        const avgSecs = r.avg_response_secs == null ? null : Number(r.avg_response_secs);
        return {
          staffId: r.staff_id,
          name: r.name,
          role: r.role,
          callsAcknowledged: Number(r.calls_acknowledged) || 0,
          avgResponseMinutes:
            avgSecs == null || !Number.isFinite(avgSecs)
              ? null
              : Math.round((avgSecs / 60) * 10) / 10,
          deliveries: Number(r.deliveries) || 0,
          avgRating:
            r.avg_rating == null || !Number.isFinite(Number(r.avg_rating))
              ? null
              : Math.round(Number(r.avg_rating) * 10) / 10,
          ratingsCount: Number(r.ratings_count) || 0,
        };
      }),
    };
  }

  /** Mesas ativas (conta e idade reais) + pedidos acima da meta da cozinha. */
  async getActiveTables(): Promise<{
    tables: Array<{
      sessionId: string;
      tableLabel: string;
      tableNumber: number;
      openedMinutes: number;
      people: number;
      subtotalCents: number;
    }>;
    lateOrders: Array<{
      orderId: string;
      tableLabel: string;
      minutesInPrep: number;
      itemCount: number;
    }>;
    kitchenEtaMaxMinutes: number | null;
  }> {
    // AO VIVO · TTL 10s (idade da mesa/subtotal andam com cada pedido).
    return this.cached('active-tables', 10, () => this.loadActiveTables());
  }

  private async loadActiveTables(): Promise<{
    tables: Array<{
      sessionId: string;
      tableLabel: string;
      tableNumber: number;
      openedMinutes: number;
      people: number;
      subtotalCents: number;
    }>;
    lateOrders: Array<{
      orderId: string;
      tableLabel: string;
      minutesInPrep: number;
      itemCount: number;
    }>;
    kitchenEtaMaxMinutes: number | null;
  }> {
    const activeRows = (await this.tenantConn.query(
      `SELECT ts.id AS session_id, t.label AS table_label,
              COALESCE(NULLIF(regexp_replace(t.code, '\\D', '', 'g'), ''), '0')::int AS table_number,
              EXTRACT(EPOCH FROM (now() - ts.created_at)) / 60 AS opened_minutes,
              (SELECT COUNT(*) FROM visits v WHERE v.table_session_id = ts.id)::int AS people,
              COALESCE((SELECT SUM(o.total_cents) FROM orders o
                         WHERE o.table_session_id = ts.id
                           AND o.status NOT IN ('cancelled', 'pending_confirmation')), 0) AS subtotal_cents
         FROM table_sessions ts
         JOIN tables t ON t.id = ts.table_id
        WHERE ts.status = 'active'
        ORDER BY table_number`,
      [],
    )) as Array<Record<string, unknown>>;

    const etaRows = (await this.tenantConn.query(
      `SELECT kitchen_eta_max_minutes FROM settings LIMIT 1`,
      [],
    )) as Array<{ kitchen_eta_max_minutes: number | null }>;
    const etaRaw = Number(etaRows[0]?.kitchen_eta_max_minutes ?? NaN);
    const kitchenEtaMaxMinutes = Number.isFinite(etaRaw) && etaRaw > 0 ? etaRaw : null;

    let lateRows: Array<Record<string, unknown>> = [];
    if (kitchenEtaMaxMinutes != null) {
      // BUG P1: o relógio de preparo NÃO pode sair de o.updated_at — o reorder
      // da cozinha (applyKitchenRanksInTx) faz `SET priority_rank=..., updated_at
      // = now()` em pedidos in_progress, então cada "Ver fila" + reordenar
      // zerava minutes_in_prep e sumia com TODOS os alertas. Fonte real do
      // "entrou em preparo" = a transição pra in_progress na order_status_history
      // (MESMA fonte que a query irmã loadOrderFunnel já usa). MAX(created_at)
      // pega a última entrada em preparo caso o pedido tenha revisitado o status.
      lateRows = (await this.tenantConn.query(
        `SELECT o.id AS order_id, t.label AS table_label,
                EXTRACT(EPOCH FROM (now() - prep.started_at)) / 60 AS minutes_in_prep,
                (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id)::int AS item_count
           FROM orders o
           JOIN table_sessions ts ON ts.id = o.table_session_id
           JOIN tables t ON t.id = ts.table_id
           JOIN LATERAL (
             SELECT MAX(h.created_at) AS started_at
               FROM order_status_history h
              WHERE h.order_id = o.id
                AND h.to_status = 'in_progress'
           ) prep ON true
          WHERE o.status = 'in_progress'
            AND prep.started_at IS NOT NULL
            AND prep.started_at < now() - ($1 || ' minutes')::interval
          ORDER BY prep.started_at ASC`,
        [String(kitchenEtaMaxMinutes)],
      )) as Array<Record<string, unknown>>;
    }

    return {
      tables: activeRows.map((r) => ({
        sessionId: String(r.session_id),
        tableLabel: String(r.table_label),
        tableNumber: Number(r.table_number) || 0,
        openedMinutes: Math.round(Number(r.opened_minutes) || 0),
        people: Number(r.people) || 0,
        subtotalCents: Number(r.subtotal_cents) || 0,
      })),
      lateOrders: lateRows.map((r) => ({
        orderId: String(r.order_id),
        tableLabel: String(r.table_label),
        minutesInPrep: Math.round(Number(r.minutes_in_prep) || 0),
        itemCount: Number(r.item_count) || 0,
      })),
      kitchenEtaMaxMinutes,
    };
  }

  async getOverview() {
    // AO VIVO · TTL 10s (pedidos/receita de hoje sobem em tempo real).
    return this.cached('overview', 10, () => this.loadOverview());
  }

  private async loadOverview() {
    // Today's stats
    const todayOrders = (await this.tenantConn.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_cents), 0) as revenue
       FROM orders
       WHERE created_at >= CURRENT_DATE AND status != 'cancelled'`,
    )) as { count: string; revenue: string }[];

    const todayCustomers = (await this.tenantConn.query(
      `SELECT COUNT(DISTINCT customer_id) as count
       FROM visits
       WHERE created_at >= CURRENT_DATE`,
    )) as { count: string }[];

    const avgRating = (await this.tenantConn.query(
      `SELECT ROUND(AVG(overall_rating), 1) as avg
       FROM feedbacks
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`,
    )) as { avg: string }[];

    const pendingOrders = (await this.tenantConn.query(
      `SELECT COUNT(*) as count FROM orders WHERE status NOT IN ('delivered', 'cancelled')`,
    )) as { count: string }[];

    return {
      today: {
        orders: parseInt(todayOrders[0].count),
        revenueCents: parseInt(todayOrders[0].revenue),
        customers: parseInt(todayCustomers[0].count),
        avgRating: parseFloat(avgRating[0].avg) || 0,
        pendingOrders: parseInt(pendingOrders[0].count),
      },
    };
  }

  async getRevenueChart(days = 7) {
    // ANALÍTICO · TTL 60s (série histórica de dias; arg entra na key).
    return this.cached(`revenue:${days}`, 60, () => this.loadRevenueChart(days));
  }

  private async loadRevenueChart(days: number) {
    // Janela FECHADA em N datas terminando HOJE: days=1 = só hoje. O `- ($1 - 1)`
    // (não `- $1`) corrige o off-by-one que devolvia N+1 datas — a soma da
    // "Receita" com days=1 tinha que bater com o "Faturamento" só-hoje do
    // overview (`created_at >= CURRENT_DATE`), e days=7 mostra 7 barras, não 8.
    const rows = (await this.tenantConn.query(
      `SELECT DATE(created_at) as date, COALESCE(SUM(total_cents), 0) as revenue, COUNT(*) as orders
       FROM orders
       WHERE created_at >= CURRENT_DATE - ($1 - 1)::int AND status != 'cancelled'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [days],
    )) as { date: string; revenue: string; orders: string }[];

    return rows.map((r) => ({
      date: r.date,
      revenueCents: parseInt(r.revenue),
      orders: parseInt(r.orders),
    }));
  }

  async getTopItems(limit = 10) {
    // ANALÍTICO · TTL 60s (ranking acumulado; arg entra na key).
    return this.cached(`top-items:${limit}`, 60, () => this.loadTopItems(limit));
  }

  private async loadTopItems(limit: number) {
    return this.tenantConn.query(
      `SELECT mi.id, mi.name, mi.price_cents, mi.total_orders, mc.name as category_name
       FROM menu_items mi
       JOIN menu_categories mc ON mc.id = mi.category_id
       ORDER BY mi.total_orders DESC
       LIMIT $1`,
      [limit],
    );
  }

  async getFeedbackSummary() {
    // ANALÍTICO · TTL 60s (distribuição/comentários históricos, sem janela do dia).
    return this.cached('feedback', 60, () => this.loadFeedbackSummary());
  }

  private async loadFeedbackSummary() {
    const distribution = (await this.tenantConn.query(
      `SELECT overall_rating, COUNT(*) as count
       FROM feedbacks
       GROUP BY overall_rating
       ORDER BY overall_rating DESC`,
    )) as { overall_rating: number; count: string }[];

    const recentComments = (await this.tenantConn.query(
      `SELECT f.overall_rating, f.comment, f.created_at, c.name as customer_name
       FROM feedbacks f
       LEFT JOIN customers c ON c.id = f.customer_id
       WHERE f.comment IS NOT NULL AND f.comment != ''
       ORDER BY f.created_at DESC
       LIMIT 10`,
    )) as unknown[];

    return { distribution, recentComments };
  }

  async getAiUsage() {
    // ANALÍTICO · TTL 60s (agregado de 30 dias de uso de IA).
    return this.cached('ai-usage', 60, () => this.loadAiUsage());
  }

  private async loadAiUsage() {
    const rows = (await this.tenantConn.query(
      `SELECT COUNT(*) as total_messages,
              SUM(tokens_in + tokens_out) as total_tokens,
              SUM(estimated_cost_cents) as total_cost_cents,
              SUM(CASE WHEN was_blocked THEN 1 ELSE 0 END) as blocked_count
       FROM assistant_messages
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`,
    )) as {
      total_messages: string;
      total_tokens: string;
      total_cost_cents: string;
      blocked_count: string;
    }[];

    return {
      totalMessages: parseInt(rows[0].total_messages) || 0,
      totalTokens: parseInt(rows[0].total_tokens) || 0,
      totalCostCents: parseInt(rows[0].total_cost_cents) || 0,
      blockedCount: parseInt(rows[0].blocked_count) || 0,
    };
  }
}

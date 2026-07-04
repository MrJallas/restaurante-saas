/**
 * FASE 3 · cache-aside das leituras do dashboard (mesmo padrão provado no
 * MenuService). O manager observa esses números em tempo quase-real, então
 * TTL curto pros painéis AO VIVO (funnel/team-kpis/active-tables/overview →
 * 10s) e TTL longo pros analíticos (revenue/top-items/feedback/ai-usage →
 * 60s). Fail-open dos dois lados (get E set em try/catch): Redis fora →
 * query direto, dashboard nunca cai por causa de cache.
 *
 * Contrato: miss roda query e grava cache:dash:<tenant>:<view> com o TTL
 * certo; hit não re-executa; Redis fora → query direto; métodos com
 * argumento (revenue:<days>, top-items:<limit>) usam chaves distintas.
 */

import { DashboardService } from './dashboard.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

function fakeRedis(opts: { broken?: boolean } = {}) {
  const store = new Map<string, { value: string; ttl?: number }>();
  const redis = {
    async get(key: string) {
      if (opts.broken) throw new Error('redis down');
      return store.get(key)?.value ?? null;
    },
    async set(key: string, value: string, ttl?: number) {
      if (opts.broken) throw new Error('redis down');
      store.set(key, { value, ttl });
    },
  } as unknown as RedisService;
  return { store, redis };
}

function fakeConn(rows: unknown[]) {
  let calls = 0;
  const conn = {
    query: async () => {
      calls += 1;
      return rows;
    },
    getTenantSlug: () => 'restaurant_dev',
  } as unknown as TenantConnectionProvider;
  return { conn, getCalls: () => calls };
}

describe('DashboardService — cache de leitura (FASE 3)', () => {
  describe('painéis AO VIVO (TTL 10s)', () => {
    it('getOverview: miss grava cache:dash:<tenant>:overview com TTL 10; hit não re-executa', async () => {
      const { store, redis } = fakeRedis();
      // getOverview roda 4 queries; fakeConn devolve os mesmos rows p/ todas.
      const { conn, getCalls } = fakeConn([{ count: '3', revenue: '900', avg: '4.5' }]);
      const svc = new DashboardService(conn, redis);

      const first = await svc.getOverview();
      const second = await svc.getOverview();

      expect(second).toEqual(first);
      // 4 queries no miss, ZERO no hit (cache guarda o objeto inteiro).
      expect(getCalls()).toBe(4);
      const entry = store.get('cache:dash:restaurant_dev:overview');
      expect(entry?.ttl).toBe(10);
    });

    it('getOrderFunnel: TTL 10 e hit não re-executa', async () => {
      const { store, redis } = fakeRedis();
      const { conn, getCalls } = fakeConn([]);
      const svc = new DashboardService(conn, redis);

      await svc.getOrderFunnel();
      await svc.getOrderFunnel();

      // 2 queries no miss (funnel + settings), 0 no hit.
      expect(getCalls()).toBe(2);
      expect(store.get('cache:dash:restaurant_dev:funnel')?.ttl).toBe(10);
    });

    it('getTeamKpis: TTL 10 e hit não re-executa', async () => {
      const { store, redis } = fakeRedis();
      const { conn, getCalls } = fakeConn([]);
      const svc = new DashboardService(conn, redis);

      await svc.getTeamKpis();
      await svc.getTeamKpis();

      expect(getCalls()).toBe(1);
      expect(store.get('cache:dash:restaurant_dev:team-kpis')?.ttl).toBe(10);
    });

    it('getActiveTables: TTL 10 e hit não re-executa', async () => {
      const { store, redis } = fakeRedis();
      // sem eta configurado → não roda a query de lateOrders
      const { conn, getCalls } = fakeConn([]);
      const svc = new DashboardService(conn, redis);

      await svc.getActiveTables();
      await svc.getActiveTables();

      // 2 queries no miss (active + settings), 0 no hit.
      expect(getCalls()).toBe(2);
      expect(store.get('cache:dash:restaurant_dev:active-tables')?.ttl).toBe(10);
    });
  });

  describe('painéis ANALÍTICOS (TTL 60s)', () => {
    it('getRevenueChart: TTL 60 e hit não re-executa', async () => {
      const { store, redis } = fakeRedis();
      const { conn, getCalls } = fakeConn([]);
      const svc = new DashboardService(conn, redis);

      await svc.getRevenueChart(7);
      await svc.getRevenueChart(7);

      expect(getCalls()).toBe(1);
      expect(store.get('cache:dash:restaurant_dev:revenue:7')?.ttl).toBe(60);
    });

    it('getRevenueChart: days=7 e days=30 usam chaves distintas', async () => {
      const { store, redis } = fakeRedis();
      const { conn, getCalls } = fakeConn([]);
      const svc = new DashboardService(conn, redis);

      await svc.getRevenueChart(7);
      await svc.getRevenueChart(30);

      expect(store.has('cache:dash:restaurant_dev:revenue:7')).toBe(true);
      expect(store.has('cache:dash:restaurant_dev:revenue:30')).toBe(true);
      // dois args distintos = dois misses = duas queries.
      expect(getCalls()).toBe(2);
    });

    it('getTopItems: TTL 60 e limit=10 vs limit=5 usam chaves distintas', async () => {
      const { store, redis } = fakeRedis();
      const { conn, getCalls } = fakeConn([]);
      const svc = new DashboardService(conn, redis);

      await svc.getTopItems(10);
      await svc.getTopItems(5);

      expect(store.get('cache:dash:restaurant_dev:top-items:10')?.ttl).toBe(60);
      expect(store.has('cache:dash:restaurant_dev:top-items:5')).toBe(true);
      expect(getCalls()).toBe(2);
    });

    it('getFeedbackSummary: TTL 60 e hit não re-executa', async () => {
      const { store, redis } = fakeRedis();
      const { conn, getCalls } = fakeConn([]);
      const svc = new DashboardService(conn, redis);

      await svc.getFeedbackSummary();
      await svc.getFeedbackSummary();

      // 2 queries no miss (distribution + recentComments), 0 no hit.
      expect(getCalls()).toBe(2);
      expect(store.get('cache:dash:restaurant_dev:feedback')?.ttl).toBe(60);
    });

    it('getAiUsage: TTL 60 e hit não re-executa', async () => {
      const { store, redis } = fakeRedis();
      const { conn, getCalls } = fakeConn([
        { total_messages: '5', total_tokens: '10', total_cost_cents: '2', blocked_count: '0' },
      ]);
      const svc = new DashboardService(conn, redis);

      await svc.getAiUsage();
      await svc.getAiUsage();

      expect(getCalls()).toBe(1);
      expect(store.get('cache:dash:restaurant_dev:ai-usage')?.ttl).toBe(60);
    });
  });

  describe('fail-open', () => {
    it('Redis fora → query roda e resultado sai (getOverview)', async () => {
      const { redis } = fakeRedis({ broken: true });
      const { conn, getCalls } = fakeConn([{ count: '1', revenue: '100', avg: '5' }]);
      const svc = new DashboardService(conn, redis);

      const result = await svc.getOverview();
      expect(result.today).toBeDefined();
      // get quebra → miss → 4 queries; set quebra → não propaga.
      expect(getCalls()).toBe(4);
    });

    it('Redis fora → query roda (getTopItems, método com arg)', async () => {
      const { redis } = fakeRedis({ broken: true });
      const rows = [{ id: 'i1' }];
      const { conn, getCalls } = fakeConn(rows);
      const svc = new DashboardService(conn, redis);

      expect(await svc.getTopItems(10)).toEqual(rows);
      expect(getCalls()).toBe(1);
    });
  });
});

/**
 * FASE 3 · cache de leitura do _kds (decisão Caleb: caches alto impacto,
 * cardápio + KDS/TV primeiro). As TVs fazem polling de 5s por estação na
 * query mais pesada do sistema; cache-aside com TTL 3s no Redis derruba a
 * carga sem staleness perceptível (o WS realtime segue empurrando updates).
 *
 * Contrato fixado aqui:
 *  1. MISS → roda a query, grava `cache:kds:<tenant>:<station>` com TTL 3s;
 *  2. HIT → devolve o payload do cache SEM bater na query (nem no sweep);
 *  3. Redis fora (get E set explodindo) → FAIL-OPEN: query roda normal;
 *  4. kitchen e bar têm chaves separadas.
 */

import { OrdersService } from './orders.service';
import { BillingService } from '../billing/billing.service';
import { ConsumptionSummaryService } from './consumption-summary.service';
import { KdsQueryService } from './kds-query.service';
import { OrderDeliveryService } from './order-delivery.service';
import { CustomerBillQueryService } from './customer-bill-query.service';
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
    // counter>1 = sweep recente → o throttled pula o sweep (irrelevante aqui)
    async incrWithExpiry() {
      return 2;
    },
    async decr() {
      return 0;
    },
  } as unknown as RedisService;
  return { store, redis };
}

function makeService(redis: RedisService, kdsRows: Array<Record<string, unknown>>) {
  let kdsCalls = 0;
  const conn = {
    query: async () => [],
    getTenantSlug: () => 'restaurant_dev',
  } as unknown as TenantConnectionProvider;
  const kdsQuery = {
    getActiveOrdersForKds: async () => {
      kdsCalls += 1;
      return kdsRows;
    },
  } as unknown as KdsQueryService;
  const service = new OrdersService(
    conn,
    redis,
    new BillingService(conn),
    new ConsumptionSummaryService(conn),
    kdsQuery,
    new OrderDeliveryService(conn, new ConsumptionSummaryService(conn)),
    new CustomerBillQueryService(conn, new BillingService(conn)),
  );
  return { service, getKdsCalls: () => kdsCalls };
}

const ROWS = [{ id: 'o1', priority: 'normal', table_label: 'Mesa 7' }];

describe('getActiveOrdersForKds — cache de leitura (FASE 3)', () => {
  it('miss roda a query e grava cache:kds:<tenant>:<station> com TTL 3s', async () => {
    const { store, redis } = fakeRedis();
    const { service, getKdsCalls } = makeService(redis, ROWS);

    const out = await service.getActiveOrdersForKds('kitchen');

    expect(out).toEqual(ROWS);
    expect(getKdsCalls()).toBe(1);
    const entry = store.get('cache:kds:restaurant_dev:kitchen');
    expect(entry).toBeDefined();
    expect(entry!.ttl).toBe(3);
    expect(JSON.parse(entry!.value)).toEqual(ROWS);
  });

  it('hit devolve o payload do cache SEM re-executar a query', async () => {
    const { redis } = fakeRedis();
    const { service, getKdsCalls } = makeService(redis, ROWS);

    await service.getActiveOrdersForKds('kitchen'); // popula
    const out = await service.getActiveOrdersForKds('kitchen'); // hit

    expect(out).toEqual(ROWS);
    expect(getKdsCalls()).toBe(1); // não subiu
  });

  it('Redis fora → fail-open: query roda normal e o resultado sai', async () => {
    const { redis } = fakeRedis({ broken: true });
    const { service, getKdsCalls } = makeService(redis, ROWS);

    const out = await service.getActiveOrdersForKds('kitchen');
    expect(out).toEqual(ROWS);
    expect(getKdsCalls()).toBe(1);
  });

  it('kitchen e bar usam chaves separadas (sem vazar entre estações)', async () => {
    const { store, redis } = fakeRedis();
    const { service } = makeService(redis, ROWS);

    await service.getActiveOrdersForKds('kitchen');
    await service.getActiveOrdersForKds('bar');

    expect(store.has('cache:kds:restaurant_dev:kitchen')).toBe(true);
    expect(store.has('cache:kds:restaurant_dev:bar')).toBe(true);
  });
});

/**
 * FASE 3 · cache de leitura do cardápio (decisão Caleb: caches alto
 * impacto, cardápio + KDS/TV primeiro). getCategories/getItems/getFeatured
 * são as leituras mais frequentes do customer e o cardápio praticamente
 * não muda em runtime (única mutação: total_orders+1 no pedido, que só
 * reordena destaque — atraso de 60s é irrelevante). TTL 60s, fail-open.
 *
 * Contrato: miss roda query e grava cache:menu:<tenant>:<view> com TTL 60;
 * hit não re-executa; Redis fora → query direto; getItems com e sem
 * categoryId usam chaves distintas.
 */

import { MenuService } from './menu.service';
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

const CATS = [{ id: 'c1', name: 'Pratos', sort_order: 1 }];

describe('MenuService — cache de leitura (FASE 3)', () => {
  it('getCategories: miss grava cache:menu:<tenant>:categories com TTL 60; hit não re-executa', async () => {
    const { store, redis } = fakeRedis();
    const { conn, getCalls } = fakeConn(CATS);
    const svc = new MenuService(conn, redis);

    const first = await svc.getCategories();
    const second = await svc.getCategories();

    expect(first).toEqual(CATS);
    expect(second).toEqual(CATS);
    expect(getCalls()).toBe(1);
    const entry = store.get('cache:menu:restaurant_dev:categories');
    expect(entry?.ttl).toBe(60);
  });

  it('getItems: sem categoria e por categoria usam chaves distintas', async () => {
    const { store, redis } = fakeRedis();
    const { conn } = fakeConn([{ id: 'i1' }]);
    const svc = new MenuService(conn, redis);

    await svc.getItems();
    await svc.getItems('cat-9');

    expect(store.has('cache:menu:restaurant_dev:items:all')).toBe(true);
    expect(store.has('cache:menu:restaurant_dev:items:cat-9')).toBe(true);
  });

  it('getFeatured: hit não re-executa a query', async () => {
    const { redis } = fakeRedis();
    const { conn, getCalls } = fakeConn([{ id: 'f1', badge: 'Destaque' }]);
    const svc = new MenuService(conn, redis);

    await svc.getFeatured();
    await svc.getFeatured();
    expect(getCalls()).toBe(1);
  });

  it('Redis fora → fail-open (query roda, resultado sai)', async () => {
    const { redis } = fakeRedis({ broken: true });
    const { conn, getCalls } = fakeConn(CATS);
    const svc = new MenuService(conn, redis);

    expect(await svc.getCategories()).toEqual(CATS);
    expect(getCalls()).toBe(1);
  });
});

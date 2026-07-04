import { StaffAuthService } from './staff-auth.service';
import type { RedisService } from '../../infra/redis/redis.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import {
  issueStaffSessionToken,
  verifyStaffSessionToken,
} from '../../common/auth/staff-session-token';

/**
 * P1-E (re-scan) — POST /:slug/staff-auth/logout.
 *
 * O logout do staff só limpava o localStorage; a sessão no Redis + o cookie
 * httpOnly `staff_token` seguiam vivos por até 12h, então reabrir o browser
 * num kiosk cavalgava o cookie e reentrava. Este endpoint revoga TODAS as
 * sessões do staff (mais seguro em device compartilhado) e o proxy limpa o
 * cookie. É idempotente: sem token válido responde 200 sem efeito.
 */

class FakeRedis {
  store = new Map<string, string>();
  counters = new Map<string, number>();
  sets = new Map<string, Set<string>>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
    this.counters.delete(key);
    this.sets.delete(key);
  }
  async sadd(key: string, ...members: string[]): Promise<number> {
    let set = this.sets.get(key);
    if (!set) {
      set = new Set<string>();
      this.sets.set(key, set);
    }
    for (const member of members) set.add(member);
    return members.length;
  }
  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }
  async expire(): Promise<void> {
    /* TTL irrelevante em memória */
  }
}

const STAFF_ID = 'a3f1c2d4-0000-4000-8000-000000000001';

function makeService(redis: FakeRedis) {
  const tenantConn = {
    getTenantSlug: () => 'acme',
    query: async () => [],
  } as unknown as TenantConnectionProvider;
  const service = new StaffAuthService(tenantConn, redis as unknown as RedisService);
  return { service };
}

async function issueFor(redis: FakeRedis, staffId = STAFF_ID, role = 'waiter') {
  return issueStaffSessionToken(redis as unknown as RedisService, {
    staffId,
    role,
    slug: 'acme',
  });
}

describe('StaffAuthService.logout', () => {
  it('com token válido revoga TODAS as sessões do staff (verify falha depois)', async () => {
    const redis = new FakeRedis();
    const { service } = makeService(redis);

    const current = await issueFor(redis);
    const otherDevice = await issueFor(redis);

    const result = await service.logout(current.token);
    expect(result).toMatchObject({ code: 'LOGGED_OUT' });

    // A sessão portadora E as outras do mesmo staff morreram.
    expect(
      await verifyStaffSessionToken(redis as unknown as RedisService, current.token, 'acme'),
    ).toBeNull();
    expect(
      await verifyStaffSessionToken(redis as unknown as RedisService, otherDevice.token, 'acme'),
    ).toBeNull();
  });

  it('sem token → 200 idempotente (logout é sempre seguro)', async () => {
    const redis = new FakeRedis();
    const { service } = makeService(redis);

    await expect(service.logout(undefined)).resolves.toMatchObject({ code: 'LOGGED_OUT' });
    await expect(service.logout('token-forjado-invalido')).resolves.toMatchObject({
      code: 'LOGGED_OUT',
    });
  });

  it('token de OUTRO tenant não revoga nada (confinado ao slug) e ainda responde 200', async () => {
    const redis = new FakeRedis();
    const { service } = makeService(redis);

    const foreign = await issueStaffSessionToken(redis as unknown as RedisService, {
      staffId: STAFF_ID,
      role: 'waiter',
      slug: 'outro-tenant',
    });

    await expect(service.logout(foreign.token)).resolves.toMatchObject({ code: 'LOGGED_OUT' });

    // O token de outro tenant continua vivo no SEU tenant (não foi revogado aqui).
    expect(
      await verifyStaffSessionToken(
        redis as unknown as RedisService,
        foreign.token,
        'outro-tenant',
      ),
    ).not.toBeNull();
  });
});

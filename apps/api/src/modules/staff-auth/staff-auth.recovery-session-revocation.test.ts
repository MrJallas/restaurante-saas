import { StaffAuthService } from './staff-auth.service';
import type { RedisService } from '../../infra/redis/redis.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { EventsGateway } from '../websocket/events.gateway';
import {
  issueStaffSessionToken,
  verifyStaffSessionToken,
} from '../../common/auth/staff-session-token';

const STAFF_ID = 'c8e2a1b0-3333-4333-8333-000000000001';
const CPF = '39053344705';
const RESET_TOKEN = 'recovery-token';
const SLUG = 'acme-recovery';

class FakeRedis {
  store = new Map<string, string>();
  sets = new Map<string, Set<string>>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
    this.sets.delete(key);
  }
  async sadd(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    members.forEach((member) => set.add(member));
    this.sets.set(key, set);
    return members.length;
  }
  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }
  async expire(): Promise<void> {}
}

describe('StaffAuthService.resetPin — revogação por recuperação', () => {
  it('revoga todos os tokens e desconecta sockets depois de trocar o PIN', async () => {
    const redis = new FakeRedis();
    redis.store.set(
      `staff-auth:reset:${SLUG}:${RESET_TOKEN}`,
      JSON.stringify({ staffId: STAFF_ID, cpf: CPF }),
    );
    const tenant = {
      getTenantSlug: () => SLUG,
      query: jest.fn(async (sql: string) => {
        if (/UPDATE staff/i.test(sql)) return [[{ id: STAFF_ID }], 1];
        return [];
      }),
    } as unknown as TenantConnectionProvider;
    const events = { disconnectStaff: jest.fn() } as unknown as EventsGateway;
    const service = new StaffAuthService(tenant, redis as unknown as RedisService, events);

    const first = await issueStaffSessionToken(redis as unknown as RedisService, {
      staffId: STAFF_ID,
      role: 'waiter',
      slug: SLUG,
    });
    const stolen = await issueStaffSessionToken(redis as unknown as RedisService, {
      staffId: STAFF_ID,
      role: 'waiter',
      slug: SLUG,
    });

    await expect(
      service.resetPin({ resetToken: RESET_TOKEN, pin: '654321' }),
    ).resolves.toMatchObject({ code: 'PIN_RESET' });
    await expect(
      verifyStaffSessionToken(redis as unknown as RedisService, first.token, SLUG),
    ).resolves.toBeNull();
    await expect(
      verifyStaffSessionToken(redis as unknown as RedisService, stolen.token, SLUG),
    ).resolves.toBeNull();
    expect(events.disconnectStaff).toHaveBeenCalledWith(STAFF_ID);
  });
});

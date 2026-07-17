import { ManagerAccountService } from './manager-account.service';
import type { RedisService } from '../../infra/redis/redis.service';
import type { EventsGateway } from '../websocket/events.gateway';
import { issueStaffSessionToken, listStaffSessions } from '../../common/auth/staff-session-token';

class FakeRedis {
  store = new Map<string, string>();
  sets = new Map<string, Set<string>>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.store.set(key, value);
  }
  async del(key: string) {
    this.store.delete(key);
    this.sets.delete(key);
  }
  async sadd(key: string, ...members: string[]) {
    const set = this.sets.get(key) ?? new Set<string>();
    members.forEach((member) => set.add(member));
    this.sets.set(key, set);
    return members.length;
  }
  async smembers(key: string) {
    return [...(this.sets.get(key) ?? [])];
  }
  async srem(key: string, ...members: string[]) {
    const set = this.sets.get(key) ?? new Set<string>();
    members.forEach((member) => set.delete(member));
    return members.length;
  }
  async expire() {}
}

describe('ManagerAccountService session socket revocation', () => {
  it('revogar outro device remove o token e força re-handshake dos sockets', async () => {
    const redis = new FakeRedis();
    const slug = 'demo-session-revoke';
    const staffId = '11111111-1111-4111-8111-111111111111';
    const current = await issueStaffSessionToken(redis as unknown as RedisService, {
      slug,
      staffId,
      role: 'owner',
    });
    await issueStaffSessionToken(redis as unknown as RedisService, {
      slug,
      staffId,
      role: 'owner',
    });
    const sessions = await listStaffSessions(redis as unknown as RedisService, {
      slug,
      staffId,
      currentToken: current.token,
    });
    const secondary = sessions.find((session) => !session.current)!;
    const events = { disconnectStaff: jest.fn() } as unknown as EventsGateway;
    const service = new ManagerAccountService(
      {} as never,
      {} as never,
      redis as unknown as RedisService,
      events,
    );

    await expect(
      service.revokeSession(slug, staffId, secondary.id, current.token),
    ).resolves.toEqual({ ok: true });
    expect(events.disconnectStaff).toHaveBeenCalledWith(staffId);
  });
});

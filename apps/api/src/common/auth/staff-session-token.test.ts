import {
  issueStaffSessionToken,
  listStaffSessions,
  revokeStaffSessionById,
  revokeStaffSessions,
  verifyStaffSessionToken,
} from './staff-session-token';
import type { RedisService } from '../../infra/redis/redis.service';

/**
 * Pacote TROCAR-PIN (decisões Caleb 2026-07-04) — revogação de sessões.
 *
 * O token de sessão era só `staff-session:v1:<sha256(token)>` no Redis, sem
 * índice reverso por staff: trocar o PIN não conseguia matar as OUTRAS
 * sessões vivas do mesmo staff (device roubado continuava logado por até
 * 12h). Agora `issueStaffSessionToken` registra o hash de cada sessão num
 * set `staff-sessions:v1:<slug>:<staffId>` e `revokeStaffSessions` derruba
 * todas de uma vez (SMEMBERS → DEL → DEL do set).
 */

// Fake Redis com suporte a sets — espelha o fake de referência do
// auth-guards.spec (Map) + SADD/SMEMBERS pro índice reverso.
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
    let set = this.sets.get(key);
    if (!set) {
      set = new Set<string>();
      this.sets.set(key, set);
    }
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added += 1;
      }
    }
    return added;
  }
  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }
  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const member of members) {
      if (set.delete(member)) removed += 1;
    }
    return removed;
  }
  async expire(): Promise<void> {
    // TTL irrelevante pro teste em memória.
  }
}

const asRedis = (fake: unknown) => fake as RedisService;

const STAFF = { staffId: 'staff-1', role: 'manager', slug: 'acme' };
const INDEX_KEY = 'staff-sessions:v1:acme:staff-1';

describe('staff-session-token — índice reverso + revogação', () => {
  it('issue registra o hash da sessão no set reverso por (slug, staffId)', async () => {
    const redis = new FakeRedis();

    await issueStaffSessionToken(asRedis(redis), STAFF);

    const members = await redis.smembers(INDEX_KEY);
    expect(members).toHaveLength(1);
    // O membro é a PRÓPRIA key `staff-session:v1:<sha256>` — apontável pro DEL.
    expect(members[0]).toMatch(/^staff-session:v1:[0-9a-f]{64}$/);
    expect(redis.store.has(members[0])).toBe(true);
  });

  it('revoke mata TODAS as sessões do staff — verify falha depois', async () => {
    const redis = new FakeRedis();

    const first = await issueStaffSessionToken(asRedis(redis), STAFF);
    const second = await issueStaffSessionToken(asRedis(redis), STAFF);
    // Sessão de OUTRO staff no mesmo tenant — não pode ser afetada.
    const bystander = await issueStaffSessionToken(asRedis(redis), {
      staffId: 'staff-2',
      role: 'waiter',
      slug: 'acme',
    });

    expect(await verifyStaffSessionToken(asRedis(redis), first.token, 'acme')).not.toBeNull();
    expect(await verifyStaffSessionToken(asRedis(redis), second.token, 'acme')).not.toBeNull();

    const revoked = await revokeStaffSessions(asRedis(redis), {
      staffId: 'staff-1',
      slug: 'acme',
    });

    expect(revoked).toBe(2);
    expect(await verifyStaffSessionToken(asRedis(redis), first.token, 'acme')).toBeNull();
    expect(await verifyStaffSessionToken(asRedis(redis), second.token, 'acme')).toBeNull();
    // Set reverso limpo — não sobra lixo apontando pra sessões mortas.
    expect(redis.sets.has(INDEX_KEY)).toBe(false);
    // O staff-2 segue logado.
    expect(await verifyStaffSessionToken(asRedis(redis), bystander.token, 'acme')).not.toBeNull();
  });

  it('revoke em staff sem sessões é no-op (retorna 0)', async () => {
    const redis = new FakeRedis();
    const revoked = await revokeStaffSessions(asRedis(redis), {
      staffId: 'ghost',
      slug: 'acme',
    });
    expect(revoked).toBe(0);
  });

  it('lista as sessões reais e identifica a sessão corrente sem expor token/hash', async () => {
    const redis = new FakeRedis();
    const current = await issueStaffSessionToken(asRedis(redis), {
      ...STAFF,
      ip: '10.0.0.10',
      userAgent: 'iPhone Safari',
    });
    await issueStaffSessionToken(asRedis(redis), {
      ...STAFF,
      ip: '10.0.0.11',
      userAgent: 'Mac Safari',
    });

    const sessions = await listStaffSessions(asRedis(redis), {
      staffId: STAFF.staffId,
      slug: STAFF.slug,
      currentToken: current.token,
    });

    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({
      current: true,
      ip: '10.0.0.10',
      userAgent: 'iPhone Safari',
    });
    expect(sessions.every((session) => !session.id.includes('staff-session:v1:'))).toBe(true);
    expect(sessions.every((session) => session.id !== current.token)).toBe(true);
  });

  it('revoga só a sessão selecionada e recusa encerrar a corrente por este endpoint', async () => {
    const redis = new FakeRedis();
    const current = await issueStaffSessionToken(asRedis(redis), STAFF);
    const other = await issueStaffSessionToken(asRedis(redis), STAFF);
    const before = await listStaffSessions(asRedis(redis), {
      staffId: STAFF.staffId,
      slug: STAFF.slug,
      currentToken: current.token,
    });
    const currentView = before.find((session) => session.current)!;
    const otherView = before.find((session) => !session.current)!;

    await expect(
      revokeStaffSessionById(asRedis(redis), {
        staffId: STAFF.staffId,
        slug: STAFF.slug,
        sessionId: currentView.id,
        currentToken: current.token,
      }),
    ).resolves.toBe('current');

    await expect(
      revokeStaffSessionById(asRedis(redis), {
        staffId: STAFF.staffId,
        slug: STAFF.slug,
        sessionId: otherView.id,
        currentToken: current.token,
      }),
    ).resolves.toBe('revoked');

    expect(await verifyStaffSessionToken(asRedis(redis), current.token, STAFF.slug)).not.toBeNull();
    expect(await verifyStaffSessionToken(asRedis(redis), other.token, STAFF.slug)).toBeNull();
    expect(await redis.smembers(INDEX_KEY)).toHaveLength(1);
  });

  it('issue tolera redis legado sem suporte a sets (fake get/set/del-only)', async () => {
    // O auth-guards.spec (ts-node legado, fora do jest) usa um fake sem
    // sadd/smembers — o issue não pode explodir nele; só o índice reverso
    // fica de fora (revogação exige redis com sets, que o RedisService real tem).
    const store = new Map<string, string>();
    const legacy = {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async set(key: string, value: string) {
        store.set(key, value);
      },
      async del(key: string) {
        store.delete(key);
      },
    };

    const session = await issueStaffSessionToken(asRedis(legacy), STAFF);
    expect(await verifyStaffSessionToken(asRedis(legacy), session.token, 'acme')).not.toBeNull();
  });
});

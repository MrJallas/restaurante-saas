/**
 * A07: o token de auth do cliente é HMAC(secret, sessionId), separado do
 * table_sessions.id. Isso torna o id exposto (host/tables etc.) INÓCUO — sem o
 * secret não dá pra derivar o token.
 */
import {
  sessionAuthToken,
  storeSessionAuth,
  readSessionAuthById,
  invalidateSessionAuthById,
} from './session-auth-token';
import type { RedisService } from '../../infra/redis/redis.service';

function fakeRedis() {
  const store = new Map<string, string>();
  const redis = {
    set: async (k: string, v: string) => void store.set(k, v),
    get: async (k: string) => store.get(k) ?? null,
    del: async (k: string) => void store.delete(k),
  } as unknown as RedisService;
  return { redis, store };
}

const SID = '11111111-1111-4111-8111-111111111111';

describe('sessionAuthToken (A07)', () => {
  it('é determinístico (mesmo id → mesmo token) — multi-device reusa uma chave', () => {
    expect(sessionAuthToken(SID)).toBe(sessionAuthToken(SID));
  });

  it('NÃO é o próprio id (o id exposto não é a credencial)', () => {
    const t = sessionAuthToken(SID);
    expect(t).not.toBe(SID);
    expect(t).toMatch(/^[0-9a-f]{64}$/); // HMAC-SHA256 hex
  });

  it('ids distintos → tokens distintos', () => {
    expect(sessionAuthToken('a')).not.toBe(sessionAuthToken('b'));
  });
});

describe('storeSessionAuth + readSessionAuthById + invalidate (A07)', () => {
  it('grava sob session:<token>, NÃO sob session:<id> (o id não autentica)', async () => {
    const { redis, store } = fakeRedis();
    const token = await storeSessionAuth(redis, SID, JSON.stringify({ sessionId: SID }), 3600);
    expect(store.has(`session:${token}`)).toBe(true);
    expect(store.has(`session:${SID}`)).toBe(false); // o id cru NÃO é chave de auth
    // o SessionGuard (que lê session:<token que o cliente manda>) só acha via token.
    expect(await redis.get(`session:${SID}`)).toBeNull();
    expect(await redis.get(`session:${token}`)).not.toBeNull();
  });

  it('readSessionAuthById computa o token e acha o payload (staff tenant-check)', async () => {
    const { redis } = fakeRedis();
    await storeSessionAuth(redis, SID, JSON.stringify({ sessionId: SID, schemaName: 't1' }), 3600);
    const raw = await readSessionAuthById(redis, SID);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).schemaName).toBe('t1');
  });

  it('readSessionAuthById cai no fallback legado session:<id> (sessão pré-split)', async () => {
    const { redis } = fakeRedis();
    // sessão antiga: gravada sob o id cru (token==id no mundo pré-split)
    await redis.set(`session:${SID}`, JSON.stringify({ sessionId: SID, schemaName: 'old' }), 3600);
    const raw = await readSessionAuthById(redis, SID);
    expect(JSON.parse(raw as string).schemaName).toBe('old');
  });

  it('invalidateSessionAuthById mata a chave do token E a legada', async () => {
    const { redis, store } = fakeRedis();
    const token = await storeSessionAuth(redis, SID, JSON.stringify({ sessionId: SID }), 3600);
    await redis.set(`session:${SID}`, 'legacy', 3600); // simula sessão pré-split coexistindo
    await invalidateSessionAuthById(redis, SID);
    expect(store.has(`session:${token}`)).toBe(false);
    expect(store.has(`session:${SID}`)).toBe(false);
  });
});

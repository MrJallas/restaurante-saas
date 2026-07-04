/**
 * Ciclo 2 · SEC (sessão staff server-side, decisão Caleb 2026-07-04):
 * o StaffOnlyGuard passa a aceitar o `x-staff-token` de sessão (verificado
 * no Redis) ALÉM da `x-staff-key` compartilhada. É ADITIVO — o caminho da
 * key continua idêntico. Isso é a fundação pra o client parar de embarcar
 * a key: quando ele mandar só o token (via proxy/cookie), os 64 endpoints
 * StaffOnly continuam autorizando.
 */

import { HttpException } from '@nestjs/common';
import { StaffOnlyGuard } from './staff-only.guard';
import type { RedisService } from '../../infra/redis/redis.service';
import { issueStaffSessionToken } from '../auth/staff-session-token';

const STAFF_KEY = 'staff-key-secreta';

/** Redis em memória (mesmo store que issue/verify usam). */
function fakeRedis(): RedisService {
  const store = new Map<string, string>();
  return {
    async set(key: string, value: string) {
      store.set(key, value);
    },
    async get(key: string) {
      return store.get(key) ?? null;
    },
  } as unknown as RedisService;
}

function ctx(headers: Record<string, string>, slug = 'restaurant_dev') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, params: { slug } }),
    }),
  } as never;
}

describe('StaffOnlyGuard — key OU token de sessão', () => {
  const OLD = process.env.STAFF_API_KEY;
  beforeEach(() => {
    process.env.STAFF_API_KEY = STAFF_KEY;
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.STAFF_API_KEY;
    else process.env.STAFF_API_KEY = OLD;
  });

  it('aceita x-staff-key válida (comportamento atual preservado)', async () => {
    const guard = new StaffOnlyGuard(fakeRedis());
    await expect(guard.canActivate(ctx({ 'x-staff-key': STAFF_KEY }))).resolves.toBe(true);
  });

  it('rejeita x-staff-key inválida quando não há token', async () => {
    const guard = new StaffOnlyGuard(fakeRedis());
    await expect(guard.canActivate(ctx({ 'x-staff-key': 'errada' }))).rejects.toThrow(
      HttpException,
    );
  });

  it('rejeita sem key e sem token', async () => {
    const guard = new StaffOnlyGuard(fakeRedis());
    await expect(guard.canActivate(ctx({}))).rejects.toThrow(HttpException);
  });

  it('aceita x-staff-token de sessão válido SEM key (o novo caminho)', async () => {
    const redis = fakeRedis();
    const { token } = await issueStaffSessionToken(redis, {
      staffId: 'aaaaaaaa-0000-4000-8000-00000000000a',
      role: 'manager',
      slug: 'restaurant_dev',
    });
    const guard = new StaffOnlyGuard(redis);
    await expect(guard.canActivate(ctx({ 'x-staff-token': token }))).resolves.toBe(true);
  });

  it('rejeita x-staff-token inválido/forjado sem key', async () => {
    const guard = new StaffOnlyGuard(fakeRedis());
    await expect(guard.canActivate(ctx({ 'x-staff-token': 'token-forjado-xyz' }))).rejects.toThrow(
      HttpException,
    );
  });

  it('token de OUTRO tenant não autoriza (confinamento por slug)', async () => {
    const redis = fakeRedis();
    const { token } = await issueStaffSessionToken(redis, {
      staffId: 'aaaaaaaa-0000-4000-8000-00000000000a',
      role: 'manager',
      slug: 'outro_tenant',
    });
    const guard = new StaffOnlyGuard(redis);
    await expect(
      guard.canActivate(ctx({ 'x-staff-token': token }, 'restaurant_dev')),
    ).rejects.toThrow(HttpException);
  });
});

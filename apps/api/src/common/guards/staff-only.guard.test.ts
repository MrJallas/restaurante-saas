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
import { issueStaffSessionToken, type StaffSessionPayload } from '../auth/staff-session-token';

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

/**
 * Gate #34 (decisão Caleb, opção A): a identidade que AGE deriva do token
 * de sessão verificado. O guard, ao autorizar via token, carimba
 * `req.staffAuth` com o payload VERIFICADO (staffId/role/slug) pro
 * CallerResolver ler de lá em vez do header client-controlled
 * `x-staff-id`. Autorização via key legada NÃO carimba (req.staffAuth
 * ausente) — o fluxo TV/estação continua caindo no fallback atual.
 */
describe('StaffOnlyGuard — carimbo req.staffAuth (gate #34)', () => {
  const OLD = process.env.STAFF_API_KEY;
  beforeEach(() => {
    process.env.STAFF_API_KEY = STAFF_KEY;
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.STAFF_API_KEY;
    else process.env.STAFF_API_KEY = OLD;
  });

  /** Ctx com request ESTÁVEL (mesmo objeto em todo getRequest) pra inspecionar o carimbo. */
  function stableCtx(headers: Record<string, string>, slug = 'restaurant_dev') {
    const request: {
      headers: Record<string, string>;
      params: { slug: string };
      staffAuth?: StaffSessionPayload;
    } = { headers, params: { slug } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;
    return { request, context };
  }

  it('token válido → carimba req.staffAuth com o payload verificado', async () => {
    const redis = fakeRedis();
    const { token } = await issueStaffSessionToken(redis, {
      staffId: 'aaaaaaaa-0000-4000-8000-00000000000a',
      role: 'waiter',
      slug: 'restaurant_dev',
    });
    const guard = new StaffOnlyGuard(redis);
    const { request, context } = stableCtx({ 'x-staff-token': token });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.staffAuth).toMatchObject({
      staffId: 'aaaaaaaa-0000-4000-8000-00000000000a',
      role: 'waiter',
      slug: 'restaurant_dev',
    });
  });

  it('x-staff-key legada (sem token) → NÃO carimba req.staffAuth', async () => {
    const guard = new StaffOnlyGuard(fakeRedis());
    const { request, context } = stableCtx({ 'x-staff-key': STAFF_KEY });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.staffAuth).toBeUndefined();
  });
});

/**
 * Enforcement server-side de must_change_pin (P2 hardening). O token emitido
 * no login com PIN temporário (reset do gerente) carrega mustChangePin=true.
 * O StaffOnlyGuard — porta dos 64 endpoints privilegiados — o RECUSA em bloco
 * (403 AUTH_PIN_CHANGE_REQUIRED) e NÃO carimba req.staffAuth, até a troca. Não
 * confia no redirect do FE: token temporário resetado não abre rota nenhuma.
 */
describe('StaffOnlyGuard — bloqueio por must_change_pin', () => {
  const OLD = process.env.STAFF_API_KEY;
  beforeEach(() => {
    process.env.STAFF_API_KEY = STAFF_KEY;
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.STAFF_API_KEY;
    else process.env.STAFF_API_KEY = OLD;
  });

  function stableCtx(headers: Record<string, string>, slug = 'restaurant_dev') {
    const request: {
      headers: Record<string, string>;
      params: { slug: string };
      staffAuth?: StaffSessionPayload;
    } = { headers, params: { slug } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;
    return { request, context };
  }

  it('token com mustChangePin=true → 403 AUTH_PIN_CHANGE_REQUIRED e NÃO carimba', async () => {
    const redis = fakeRedis();
    const { token } = await issueStaffSessionToken(redis, {
      staffId: 'bbbbbbbb-0000-4000-8000-00000000000b',
      role: 'waiter',
      slug: 'restaurant_dev',
      mustChangePin: true,
    });
    const guard = new StaffOnlyGuard(redis);
    const { request, context } = stableCtx({ 'x-staff-token': token });

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    try {
      await guard.canActivate(context);
    } catch (err) {
      expect((err as HttpException).getResponse()).toMatchObject({
        code: 'AUTH_PIN_CHANGE_REQUIRED',
      });
    }
    expect(request.staffAuth).toBeUndefined();
  });

  it('token normal (sem a flag) → autoriza e carimba (regressão do caminho feliz)', async () => {
    const redis = fakeRedis();
    const { token } = await issueStaffSessionToken(redis, {
      staffId: 'bbbbbbbb-0000-4000-8000-00000000000c',
      role: 'waiter',
      slug: 'restaurant_dev',
    });
    const guard = new StaffOnlyGuard(redis);
    const { request, context } = stableCtx({ 'x-staff-token': token });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.staffAuth).toBeDefined();
    expect(request.staffAuth!.mustChangePin).toBeUndefined();
  });
});

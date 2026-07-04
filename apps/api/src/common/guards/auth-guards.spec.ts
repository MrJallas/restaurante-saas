/**
 * Contract assertions for staff auth guards.
 *
 * apps/api still uses executable TypeScript specs instead of a Jest runner.
 * Run with:
 *   TS_NODE_PROJECT=apps/api/tsconfig.json TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node -r ts-node/register apps/api/src/common/guards/auth-guards.spec.ts
 */

import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { authErrorResponse, type AuthErrorResponse } from './auth-error-response';
import { HostOrManagerGuard } from './host-only.guard';
import { ManagerOnlyGuard } from './manager-only.guard';
import { StaffOnlyGuard } from './staff-only.guard';
import { issueStaffSessionToken, verifyStaffSessionToken } from '../auth/staff-session-token';
import type { RedisService } from '../../infra/redis/redis.service';
import type { TenantConnectionProvider } from '../../modules/tenant/tenant-connection.provider';

const MANAGER_ID = '11111111-1111-4111-8111-111111111111';
const HOST_ID = '22222222-2222-4222-8222-222222222222';
const WAITER_ID = '33333333-3333-4333-8333-333333333333';
const INACTIVE_ID = '44444444-4444-4444-8444-444444444444';

function fakeCtx(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

function fakeTenantConn() {
  return {
    getTenantSlug: () => `auth-guards-spec-${Date.now()}-${Math.random()}`,
    async query(_sql: string, params: unknown[]) {
      const id = params[0];
      if (id === MANAGER_ID) return [{ role: 'manager' }];
      if (id === HOST_ID) return [{ role: 'host' }];
      if (id === WAITER_ID) return [{ role: 'waiter' }];
      if (id === INACTIVE_ID) return [];
      throw new Error(`Unexpected staff id ${String(id)}`);
    },
  };
}

// Fake Redis backing store para o token de sessão de staff. Sem token
// (`x-staff-token`) e sem `STAFF_SESSION_REQUIRED`, os guards caem no
// fallback legado `x-staff-id` e o Redis nunca é consultado.
function fakeRedis() {
  const store = new Map<string, string>();
  return {
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
}

function responseOf(err: unknown): AuthErrorResponse {
  if (err instanceof HttpException) {
    return err.getResponse() as AuthErrorResponse;
  }
  throw err;
}

function assertAuthResponse(err: unknown, expected: AuthErrorResponse): void {
  const response = responseOf(err);
  if (
    response.code !== expected.code ||
    response.message !== expected.message ||
    response.message_user !== expected.message_user
  ) {
    throw new Error(
      `Unexpected auth response ${JSON.stringify(response)}; expected ${JSON.stringify(expected)}`,
    );
  }
}

/* eslint-disable no-console */
export async function runAuthGuardAssertions(): Promise<void> {
  const managerGuard = new ManagerOnlyGuard(
    fakeTenantConn() as unknown as TenantConnectionProvider,
    fakeRedis() as unknown as RedisService,
  );
  const hostGuard = new HostOrManagerGuard(
    fakeTenantConn() as unknown as TenantConnectionProvider,
    fakeRedis() as unknown as RedisService,
  );

  try {
    await managerGuard.canActivate(fakeCtx({}));
    throw new Error('ManagerOnlyGuard accepted missing x-staff-id.');
  } catch (err) {
    assertAuthResponse(err, authErrorResponse('AUTH_MISSING', 'Sessão expirada'));
  }

  try {
    await hostGuard.canActivate(fakeCtx({ 'x-staff-id': 'not-a-uuid' }));
    throw new Error('HostOrManagerGuard accepted invalid x-staff-id.');
  } catch (err) {
    assertAuthResponse(err, authErrorResponse('AUTH_INVALID', 'Sessão expirada'));
  }

  if (!(await managerGuard.canActivate(fakeCtx({ 'x-staff-id': MANAGER_ID })))) {
    throw new Error('ManagerOnlyGuard rejected a real manager.');
  }

  if (!(await hostGuard.canActivate(fakeCtx({ 'x-staff-id': MANAGER_ID })))) {
    throw new Error('HostOrManagerGuard rejected manager fallback access.');
  }

  try {
    await managerGuard.canActivate(fakeCtx({ 'x-staff-id': WAITER_ID }));
    throw new Error('ManagerOnlyGuard accepted a waiter.');
  } catch (err) {
    assertAuthResponse(
      err,
      authErrorResponse('AUTH_FORBIDDEN', 'Acesso não permitido para este perfil'),
    );
  }

  try {
    await managerGuard.canActivate(fakeCtx({ 'x-staff-id': INACTIVE_ID }));
    throw new Error('ManagerOnlyGuard accepted inactive staff.');
  } catch (err) {
    assertAuthResponse(err, authErrorResponse('AUTH_INVALID', 'Sessão expirada'));
  }

  // --- Token de sessão de staff (binding server-side ao PIN) ---------
  // Um guard com Redis compartilhado + tenant fixo, pra emitir e verificar
  // tokens na MESMA store/slug.
  const tokenRedis = fakeRedis();
  const TENANT_SLUG = 'token-binding-tenant';
  const fixedTenantConn = {
    getTenantSlug: () => TENANT_SLUG,
    async query(_sql: string, params: unknown[]) {
      const id = params[0];
      if (id === MANAGER_ID) return [{ role: 'manager' }];
      if (id === WAITER_ID) return [{ role: 'waiter' }];
      return [];
    },
  } as unknown as TenantConnectionProvider;
  const tokenManagerGuard = new ManagerOnlyGuard(
    fixedTenantConn,
    tokenRedis as unknown as RedisService,
  );

  // Token de manager legítimo → autoriza.
  const managerToken = await issueStaffSessionToken(tokenRedis as unknown as RedisService, {
    staffId: MANAGER_ID,
    role: 'manager',
    slug: TENANT_SLUG,
  });
  if (!(await tokenManagerGuard.canActivate(fakeCtx({ 'x-staff-token': managerToken.token })))) {
    throw new Error('ManagerOnlyGuard rejected a valid staff session token.');
  }

  // Token de WAITER, mesmo forjando role no header, NÃO escala — o role
  // vem do payload verificado + reconferência no DB (waiter).
  const waiterToken = await issueStaffSessionToken(tokenRedis as unknown as RedisService, {
    staffId: WAITER_ID,
    role: 'waiter',
    slug: TENANT_SLUG,
  });
  try {
    await tokenManagerGuard.canActivate(
      fakeCtx({ 'x-staff-token': waiterToken.token, 'x-staff-role': 'manager' }),
    );
    throw new Error('ManagerOnlyGuard escalated a waiter token to manager.');
  } catch (err) {
    assertAuthResponse(
      err,
      authErrorResponse('AUTH_FORBIDDEN', 'Acesso não permitido para este perfil'),
    );
  }

  // Token inválido presente → rejeita e NÃO faz downgrade pro x-staff-id
  // legado (ainda que um UUID de manager válido seja mandado junto).
  try {
    await tokenManagerGuard.canActivate(
      fakeCtx({ 'x-staff-token': 'garbage-token', 'x-staff-id': MANAGER_ID }),
    );
    throw new Error('ManagerOnlyGuard fell back to x-staff-id despite an invalid token.');
  } catch (err) {
    assertAuthResponse(err, authErrorResponse('AUTH_INVALID', 'Sessão expirada'));
  }

  // Token de OUTRO tenant não vale aqui (confinamento por slug).
  const crossTenant = verifyStaffSessionToken(
    tokenRedis as unknown as RedisService,
    managerToken.token,
    'a-different-tenant',
  );
  if ((await crossTenant) !== null) {
    throw new Error('verifyStaffSessionToken accepted a token from another tenant.');
  }

  const staffOnly = new StaffOnlyGuard(tokenRedis as unknown as RedisService);
  const oldStaffKey = process.env.STAFF_API_KEY;
  process.env.STAFF_API_KEY = 'expected-key';
  try {
    await staffOnly.canActivate(fakeCtx({ 'x-staff-key': 'wrong-key' }));
    throw new Error('StaffOnlyGuard accepted an invalid key.');
  } catch (err) {
    assertAuthResponse(
      err,
      authErrorResponse('AUTH_INVALID', 'Sessão de equipe inválida. Faça login novamente.'),
    );
  } finally {
    if (oldStaffKey === undefined) {
      delete process.env.STAFF_API_KEY;
    } else {
      process.env.STAFF_API_KEY = oldStaffKey;
    }
  }

  console.log('auth-guards assertions OK');
}

if (require.main === module) {
  runAuthGuardAssertions().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

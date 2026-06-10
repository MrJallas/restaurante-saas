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
    fakeTenantConn() as import('../../modules/tenant/tenant-connection.provider').TenantConnectionProvider,
  );
  const hostGuard = new HostOrManagerGuard(
    fakeTenantConn() as import('../../modules/tenant/tenant-connection.provider').TenantConnectionProvider,
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

  const staffOnly = new StaffOnlyGuard();
  const oldStaffKey = process.env.STAFF_API_KEY;
  process.env.STAFF_API_KEY = 'expected-key';
  try {
    staffOnly.canActivate(fakeCtx({ 'x-staff-key': 'wrong-key' }));
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

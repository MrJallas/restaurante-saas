import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { RedisService } from '../../infra/redis/redis.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { issueStaffSessionToken } from '../../common/auth/staff-session-token';
import { KitchenOrManagerGuard } from '../../common/guards/kitchen-or-manager.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { KitchenController } from './kitchen.controller';

function fakeRedis(): RedisService {
  const store = new Map<string, string>();
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  } as unknown as RedisService;
}

function context(token: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-staff-token': token } }) }),
  } as unknown as ExecutionContext;
}

describe('KitchenController RBAC', () => {
  it('separa comandos gerenciais de leitura/resposta da cozinha', () => {
    for (const method of ['reorder', 'requestReorder', 'cancelReorderRequest'] as const) {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        KitchenController.prototype[method],
      ) as unknown[];
      expect(guards).toContain(ManagerOnlyGuard);
    }
    for (const method of [
      'queue',
      'pendingReorderRequests',
      'getReorderRequest',
      'respondReorderRequest',
    ] as const) {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        KitchenController.prototype[method],
      ) as unknown[];
      expect(guards).toContain(KitchenOrManagerGuard);
    }
  });

  it.each(['cook', 'manager', 'owner'])('aceita %s na leitura/decisão da cozinha', async (role) => {
    const redis = fakeRedis();
    const staffId = `${role.padEnd(8, '0').slice(0, 8)}-0000-4000-8000-000000000001`;
    const slug = `kitchen-${role}`;
    const tenant = {
      getTenantSlug: () => slug,
      query: jest.fn(async () => [{ role }]),
    } as unknown as TenantConnectionProvider;
    const issued = await issueStaffSessionToken(redis, { staffId, role, slug });
    await expect(
      new KitchenOrManagerGuard(tenant, redis).canActivate(context(issued.token)),
    ).resolves.toBe(true);
  });

  it.each(['waiter', 'host', 'cashier', 'bartender'])('bloqueia %s na cozinha', async (role) => {
    const redis = fakeRedis();
    const staffId = `${role.padEnd(8, '0').slice(0, 8)}-0000-4000-8000-000000000002`;
    const slug = `not-kitchen-${role}`;
    const tenant = {
      getTenantSlug: () => slug,
      query: jest.fn(async () => [{ role }]),
    } as unknown as TenantConnectionProvider;
    const issued = await issueStaffSessionToken(redis, { staffId, role, slug });
    await expect(
      new KitchenOrManagerGuard(tenant, redis).canActivate(context(issued.token)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

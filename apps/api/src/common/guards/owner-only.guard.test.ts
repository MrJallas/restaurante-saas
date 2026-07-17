import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { RedisService } from '../../infra/redis/redis.service';
import type { TenantConnectionProvider } from '../../modules/tenant/tenant-connection.provider';
import { issueStaffSessionToken } from '../auth/staff-session-token';
import { ManagerOnlyGuard } from './manager-only.guard';
import { OwnerOnlyGuard } from './owner-only.guard';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MANAGER_ID = '22222222-2222-4222-8222-222222222222';

function fakeRedis(): RedisService {
  const store = new Map<string, string>();
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
  } as unknown as RedisService;
}

function fakeTenant(slug: string): TenantConnectionProvider {
  return {
    getTenantSlug: () => slug,
    query: jest.fn(async (_sql: string, params?: unknown[]) => {
      if (params?.[0] === OWNER_ID) return [{ role: 'owner' }];
      if (params?.[0] === MANAGER_ID) return [{ role: 'manager' }];
      return [];
    }),
  } as unknown as TenantConnectionProvider;
}

function context(token: string): ExecutionContext {
  const request = { headers: { 'x-staff-token': token } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('owner/manager authorization hierarchy', () => {
  it('owner herda rotas gerenciais e também passa no gate exclusivo', async () => {
    const slug = `owner-guard-${Date.now()}-${Math.random()}`;
    const redis = fakeRedis();
    const tenant = fakeTenant(slug);
    const token = await issueStaffSessionToken(redis, {
      staffId: OWNER_ID,
      role: 'owner',
      slug,
    });

    await expect(
      new ManagerOnlyGuard(tenant, redis).canActivate(context(token.token)),
    ).resolves.toBe(true);
    await expect(new OwnerOnlyGuard(tenant, redis).canActivate(context(token.token))).resolves.toBe(
      true,
    );
  });

  it('manager continua gerencial, mas recebe 403 no gate do estabelecimento', async () => {
    const slug = `manager-guard-${Date.now()}-${Math.random()}`;
    const redis = fakeRedis();
    const tenant = fakeTenant(slug);
    const token = await issueStaffSessionToken(redis, {
      staffId: MANAGER_ID,
      role: 'manager',
      slug,
    });

    await expect(
      new ManagerOnlyGuard(tenant, redis).canActivate(context(token.token)),
    ).resolves.toBe(true);
    await expect(
      new OwnerOnlyGuard(tenant, redis).canActivate(context(token.token)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejeita owner pelo x-staff-id legado quando não existe token individual', async () => {
    const slug = `legacy-owner-${Date.now()}-${Math.random()}`;
    const guard = new OwnerOnlyGuard(fakeTenant(slug), fakeRedis());
    const legacyContext = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-staff-id': OWNER_ID } }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(legacyContext)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

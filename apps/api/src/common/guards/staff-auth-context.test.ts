/**
 * Gate #34 (decisão Caleb, opção A) — `resolveAuthenticatedStaff` é o
 * caminho token-first dos guards ManagerOnly/HostOrManager. Ao verificar o
 * token com sucesso, ele carimba `req.staffAuth` com o payload VERIFICADO
 * ({staffId, role, slug}) pro CallerResolverService derivar a identidade
 * que AGE do token, não do header client-controlled `x-staff-id`.
 * No fallback legado (header, sem token) NÃO carimba.
 */

import { resolveAuthenticatedStaff } from './staff-auth-context';
import { issueStaffSessionToken, type StaffSessionPayload } from '../auth/staff-session-token';
import type { RedisService } from '../../infra/redis/redis.service';
import type { TenantConnectionProvider } from '../../modules/tenant/tenant-connection.provider';

const STAFF_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';
const SLUG = 'restaurant_dev';

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

function fakeTenantConn(): TenantConnectionProvider {
  return { getTenantSlug: () => SLUG } as unknown as TenantConnectionProvider;
}

describe('resolveAuthenticatedStaff — carimbo req.staffAuth (gate #34)', () => {
  it('token válido → resolve via token E carimba req.staffAuth com o payload', async () => {
    const redis = fakeRedis();
    const { token } = await issueStaffSessionToken(redis, {
      staffId: STAFF_ID,
      role: 'manager',
      slug: SLUG,
    });
    const req: {
      headers: Record<string, string | string[] | undefined>;
      staffAuth?: StaffSessionPayload;
    } = { headers: { 'x-staff-token': token } };

    const resolved = await resolveAuthenticatedStaff(req, fakeTenantConn(), redis);

    expect(resolved).toMatchObject({ staffId: STAFF_ID, source: 'token' });
    expect(req.staffAuth).toMatchObject({ staffId: STAFF_ID, role: 'manager', slug: SLUG });
  });

  it('fallback legado x-staff-id (sem token) → resolve via header e NÃO carimba', async () => {
    const req: {
      headers: Record<string, string | string[] | undefined>;
      staffAuth?: StaffSessionPayload;
    } = { headers: { 'x-staff-id': STAFF_ID } };

    const resolved = await resolveAuthenticatedStaff(req, fakeTenantConn(), fakeRedis());

    expect(resolved).toMatchObject({ staffId: STAFF_ID, source: 'header' });
    expect(req.staffAuth).toBeUndefined();
  });

  it('token inválido → erro e NÃO carimba (sem downgrade)', async () => {
    const req: {
      headers: Record<string, string | string[] | undefined>;
      staffAuth?: StaffSessionPayload;
    } = { headers: { 'x-staff-token': 'token-forjado-abcdef', 'x-staff-id': STAFF_ID } };

    const resolved = await resolveAuthenticatedStaff(req, fakeTenantConn(), fakeRedis());

    expect(resolved).toMatchObject({ error: 'invalid' });
    expect(req.staffAuth).toBeUndefined();
  });
});

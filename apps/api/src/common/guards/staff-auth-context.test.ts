/**
 * Gate #34 (decisão Caleb, opção A) — `resolveAuthenticatedStaff` é o
 * caminho token-first dos guards ManagerOnly/HostOrManager. Ao verificar o
 * token com sucesso, ele carimba `req.staffAuth` com o payload VERIFICADO
 * ({staffId, role, slug}) pro CallerResolverService derivar a identidade
 * que AGE do token, não do header client-controlled `x-staff-id`.
 * No fallback legado (header, sem token) NÃO carimba.
 */

import { resolveAuthenticatedStaff, staffSessionTokenRequired } from './staff-auth-context';
import { issueStaffSessionToken, type StaffSessionPayload } from '../auth/staff-session-token';
import type { RedisService } from '../../infra/redis/redis.service';
import type { TenantConnectionProvider } from '../../modules/tenant/tenant-connection.provider';

const STAFF_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';
// id distinto por teste que toca o role-cache (module-level Map com TTL 60s):
// evita bleed do must_change_pin entre casos no mesmo run.
const STAFF_ID_MUSTCHANGE = 'bbbbbbbb-0000-4000-8000-00000000000b';
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

function fakeTenantConn(opts?: {
  mustChangePin?: boolean;
  role?: string;
  active?: boolean;
}): TenantConnectionProvider {
  return {
    getTenantSlug: () => SLUG,
    // staff-role-cache: SELECT role, must_change_pin FROM staff WHERE id=$1 AND is_active=true
    query: async (_sql: string, _params: unknown[]) => {
      if (opts?.active === false) return [];
      return [{ role: opts?.role ?? 'manager', must_change_pin: opts?.mustChangePin ?? false }];
    },
  } as unknown as TenantConnectionProvider;
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

  it('fallback legado x-staff-id com must_change_pin no DB → pin_change_required (P2: path legado honra a flag)', async () => {
    const req: {
      headers: Record<string, string | string[] | undefined>;
      staffAuth?: StaffSessionPayload;
    } = { headers: { 'x-staff-id': STAFF_ID_MUSTCHANGE } };

    const resolved = await resolveAuthenticatedStaff(
      req,
      fakeTenantConn({ mustChangePin: true }),
      fakeRedis(),
    );

    // Antes: o path header retornava {staffId, source:'header'} sem NUNCA olhar
    // a flag — um PIN temporário burlava o gate via x-staff-id (o token path
    // já barrava). Agora o path legado também recusa até a troca.
    expect(resolved).toMatchObject({ error: 'pin_change_required' });
    expect(req.staffAuth).toBeUndefined();
  });

  it('token com mustChangePin → erro pin_change_required e NÃO carimba (enforcement P2)', async () => {
    const redis = fakeRedis();
    const { token } = await issueStaffSessionToken(redis, {
      staffId: STAFF_ID,
      role: 'manager',
      slug: SLUG,
      mustChangePin: true,
    });
    const req: {
      headers: Record<string, string | string[] | undefined>;
      staffAuth?: StaffSessionPayload;
    } = { headers: { 'x-staff-token': token } };

    const resolved = await resolveAuthenticatedStaff(req, fakeTenantConn(), redis);

    expect(resolved).toMatchObject({ error: 'pin_change_required' });
    expect(req.staffAuth).toBeUndefined();
  });
});

describe('staffSessionTokenRequired', () => {
  it('mantém o fallback legado apenas no desenvolvimento local', () => {
    expect(staffSessionTokenRequired({ NODE_ENV: 'development' })).toBe(false);
    expect(
      staffSessionTokenRequired({ NODE_ENV: 'development', STAFF_SESSION_REQUIRED: 'true' }),
    ).toBe(true);
  });

  it.each([
    { NODE_ENV: 'production' },
    { NODE_ENV: 'development', APP_ENV: 'staging' },
    { NODE_ENV: 'development', VERCEL_ENV: 'preview' },
  ])('é fail-closed em deploy mesmo sem flag: %o', (env) => {
    expect(staffSessionTokenRequired(env)).toBe(true);
  });
});

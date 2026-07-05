import { TenantConnectionProvider } from '../../modules/tenant/tenant-connection.provider';

interface CachedStaffRole {
  expiresAt: number;
  role: string | null;
}

const staffRoleCache = new Map<string, CachedStaffRole>();
const staffRoleCacheTtlMs = Number(process.env.STAFF_ROLE_CACHE_TTL_MS ?? 60_000);

export async function getCachedActiveStaffRole(
  tenantConn: TenantConnectionProvider,
  staffId: string,
): Promise<string | null> {
  const cacheKey = `staff-role:v1:${tenantConn.getTenantSlug() ?? 'unknown'}:${staffId}`;
  const now = Date.now();
  const cached = staffRoleCache.get(cacheKey);
  if (
    Number.isFinite(staffRoleCacheTtlMs) &&
    staffRoleCacheTtlMs > 0 &&
    cached &&
    cached.expiresAt > now
  ) {
    return cached.role;
  }

  const rows = (await tenantConn.query(
    `SELECT role FROM staff WHERE id = $1 AND is_active = true`,
    [staffId],
  )) as { role: string }[];
  const role = rows[0]?.role ?? null;

  if (Number.isFinite(staffRoleCacheTtlMs) && staffRoleCacheTtlMs > 0) {
    staffRoleCache.set(cacheKey, {
      expiresAt: now + staffRoleCacheTtlMs,
      role,
    });
  }

  return role;
}

/**
 * Lê `must_change_pin` do staff ativo — leitura FRESH (sem cache) usada só
 * pelo path legado `x-staff-id` do resolveAuthenticatedStaff. Query própria
 * (não toca a de role, que muitos fakes de teste casam por string exata), e
 * fresh de propósito: o gate de PIN temporário não pode ter janela de
 * staleness. O path legado é baixo-tráfego (retirando com STAFF_SESSION_REQUIRED).
 */
export async function readStaffMustChangePin(
  tenantConn: TenantConnectionProvider,
  staffId: string,
): Promise<boolean> {
  const rows = (await tenantConn.query(
    `SELECT must_change_pin FROM staff WHERE id = $1 AND is_active = true`,
    [staffId],
  )) as { must_change_pin: boolean | null }[];
  return rows[0]?.must_change_pin === true;
}

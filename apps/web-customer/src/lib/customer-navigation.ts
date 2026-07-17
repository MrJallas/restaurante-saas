import { toTenantInternalPath } from './safe-internal-path';

/**
 * Resolve a server-provided customer route without allowing it to escape the
 * current restaurant. Continuation payloads may be either tenant-absolute
 * (`/demo/cardapio`) or tenant-relative (`cardapio`). Invalid or cross-tenant
 * values fail closed to the tenant home.
 */
export function tenantNavigationDestination(slug: string, raw: string | null | undefined): string {
  const tenantRoot = toTenantInternalPath(`/${slug}`, slug) ?? '/';
  const value = (raw ?? '').trim();
  if (!value) return tenantRoot;

  // A URI scheme is never a customer route. Without this guard, prefixing a
  // value such as `javascript:...` would turn an unsafe instruction into a
  // misleading (albeit internal) path.
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return tenantRoot;

  const candidate = value.startsWith('/') ? value : `/${slug}/${value}`;
  return toTenantInternalPath(candidate, slug) ?? tenantRoot;
}

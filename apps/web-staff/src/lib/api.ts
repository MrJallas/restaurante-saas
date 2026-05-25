const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
// Chave de staff. Backend exige `x-staff-key` em endpoints protegidos
// por `StaffOrSessionGuard` (ex.: PATCH /orders/:id/status, antes
// publico — qualquer um podia avancar status ou cancelar pedido em
// qualquer tenant). Em prod evolui pra JWT via PIN.
const STAFF_API_KEY =
  process.env.NEXT_PUBLIC_STAFF_API_KEY ||
  (process.env.NODE_ENV !== 'production'
    ? 'dev-staff-api-key-change-in-prod'
    : '');

/**
 * Read identity headers from `localStorage`. Manager-only endpoints
 * (zone-pause start/end, complaint respond, VIP/allergy session flags)
 * are guarded by `ManagerOnlyGuard`, which inspects `x-staff-role`. The
 * websocket gateway and audit fields also key off `x-staff-id`. The
 * staff-login flow seeds these two keys on success; SSR has no
 * `localStorage` so we guard with `typeof window`.
 */
function staffIdentityHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const headers: Record<string, string> = {};

  const params = new URLSearchParams(window.location.search);
  const urlStaffId =
    params.get('staffId') ||
    params.get('hostId') ||
    params.get('managerId') ||
    params.get('waiterId') ||
    params.get('cookId');
  const urlStaffRole =
    params.get('staffRole') ||
    (params.get('managerId') ? 'manager' : null) ||
    (params.get('hostId') ? 'host' : null) ||
    (params.get('waiterId') ? 'waiter' : null) ||
    (params.get('cookId') ? 'cook' : null);

  const staffId = urlStaffId || window.localStorage.getItem('staffId');
  const staffRole = urlStaffRole || window.localStorage.getItem('staffRole');

  if (urlStaffId) window.localStorage.setItem('staffId', urlStaffId);
  if (urlStaffRole) window.localStorage.setItem('staffRole', urlStaffRole);

  if (staffId) headers['x-staff-id'] = staffId;
  if (staffRole) headers['x-staff-role'] = staffRole;
  return headers;
}

export async function staffApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  // Header merge order — defaults first, then caller overrides last so an
  // explicit `headers: { 'x-staff-role': ... }` from the caller still wins.
  const res = await fetch(url, {
    ...options,
    cache: options.cache ?? 'no-store',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(STAFF_API_KEY ? { 'x-staff-key': STAFF_API_KEY } : {}),
      ...staffIdentityHeaders(),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message || 'Erro inesperado.');
  }

  return res.json() as Promise<T>;
}

export function staffGet<T>(path: string): Promise<T> {
  return staffApi<T>(path, { method: 'GET' });
}

export function staffPost<T>(path: string, body: unknown): Promise<T> {
  return staffApi<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function staffPatch<T>(path: string, body: unknown): Promise<T> {
  return staffApi<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export function staffDelete<T>(path: string): Promise<T> {
  return staffApi<T>(path, { method: 'DELETE' });
}

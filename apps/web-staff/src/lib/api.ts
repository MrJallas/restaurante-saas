const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
// Chave de staff. Backend exige `x-staff-key` em endpoints protegidos
// por `StaffOrSessionGuard` (ex.: PATCH /orders/:id/status, antes
// publico — qualquer um podia avancar status ou cancelar pedido em
// qualquer tenant). Em prod evolui pra JWT via PIN.
const STAFF_API_KEY =
  process.env.NEXT_PUBLIC_STAFF_API_KEY ||
  (process.env.NODE_ENV !== 'production' ? 'dev-staff-api-key-change-in-prod' : '');

const STAFF_ID_QUERY_KEYS = ['staffId', 'hostId', 'managerId', 'waiterId', 'cookId'] as const;

const STAFF_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function roleFromIdentityParam(key: (typeof STAFF_ID_QUERY_KEYS)[number]): string | null {
  if (key === 'managerId') return 'manager';
  if (key === 'hostId') return 'host';
  if (key === 'waiterId') return 'waiter';
  if (key === 'cookId') return 'cook';
  return null;
}

function firstUrlStaffIdentity(params: URLSearchParams): {
  key: (typeof STAFF_ID_QUERY_KEYS)[number];
  value: string;
} | null {
  for (const key of STAFF_ID_QUERY_KEYS) {
    if (params.has(key)) {
      return { key, value: params.get(key) ?? '' };
    }
  }
  return null;
}

type StaffIdentityStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Read identity headers from query params/localStorage. Role guards trust the
 * DB role for `x-staff-id`; query params only seed the current authenticated
 * staff UUID. Invalid explicit IDs are never sent, so placeholders such as
 * `cookId=kitchen-display` cannot poison manager requests later.
 */
export function resolveStaffIdentityHeaders(
  params: URLSearchParams,
  storage: StaffIdentityStorage,
): Record<string, string> {
  const headers: Record<string, string> = {};
  const explicitIdentity = firstUrlStaffIdentity(params);
  const explicitRole = params.get('staffRole');

  let staffId: string | null = null;
  let staffRole: string | null = null;

  if (explicitIdentity) {
    if (!STAFF_ID_RE.test(explicitIdentity.value)) {
      return headers;
    }

    staffId = explicitIdentity.value;
    staffRole =
      explicitRole || roleFromIdentityParam(explicitIdentity.key) || storage.getItem('staffRole');
    storage.setItem('staffId', staffId);
    if (staffRole) storage.setItem('staffRole', staffRole);
  } else {
    const storedStaffId = storage.getItem('staffId');
    if (storedStaffId && STAFF_ID_RE.test(storedStaffId)) {
      staffId = storedStaffId;
      staffRole = explicitRole || storage.getItem('staffRole');
      if (explicitRole) storage.setItem('staffRole', explicitRole);
    } else if (storedStaffId) {
      storage.removeItem('staffId');
    }
  }

  if (staffId) headers['x-staff-id'] = staffId;
  if (staffRole) headers['x-staff-role'] = staffRole;
  return headers;
}

function staffIdentityHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  return resolveStaffIdentityHeaders(
    new URLSearchParams(window.location.search),
    window.localStorage,
  );
}

function extractApiErrorMessage(body: unknown): string {
  if (!body || typeof body !== 'object') return 'Erro inesperado.';
  const record = body as {
    message_user?: unknown;
    message?: unknown;
    error?: unknown;
  };
  if (typeof record.message_user === 'string') return record.message_user;
  if (typeof record.message === 'string') return record.message;
  if (Array.isArray(record.message) && record.message.length > 0) {
    return 'Dados inválidos. Revise e tente novamente.';
  }
  if (typeof record.error === 'string') return record.error;
  return 'Erro inesperado.';
}

export async function staffApi<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    const error = new Error(extractApiErrorMessage(body)) as Error & {
      code?: string;
    };
    const code =
      body && typeof body === 'object'
        ? ((body as { code?: unknown; error_code?: unknown }).code ??
          (body as { error_code?: unknown }).error_code)
        : undefined;
    if (typeof code === 'string') error.code = code;
    throw error;
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

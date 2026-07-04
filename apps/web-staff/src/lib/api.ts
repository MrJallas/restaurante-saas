const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
// P1-F: o x-staff-key NAO vive mais no client. Toda var NEXT_PUBLIC_* e
// inlinada no bundle JS, entao carregar o segredo aqui vazava credencial
// de nivel staff/kitchen pra qualquer visitante via DevTools. O literal
// committado `dev-staff-api-key-change-in-prod` era pior ainda — segredo
// publico conhecido. A chave agora e injetada SO server-side pelo proxy
// (/api/proxy, STAFF_API_KEY sem prefixo NEXT_PUBLIC_). Manter vazio aqui.
const STAFF_API_KEY = process.env.NEXT_PUBLIC_STAFF_API_KEY || '';

const STAFF_ID_QUERY_KEYS = ['staffId', 'hostId', 'managerId', 'waiterId', 'cookId'] as const;

const STAFF_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StaffRole = 'manager' | 'host' | 'waiter' | 'cook' | 'bartender' | 'cashier';

export interface StaffSession {
  staffId: string;
  staffRole: StaffRole;
  staffName: string;
}

export interface StaffAuthLoginResponse {
  staff: {
    id: string;
    name: string;
    role: StaffRole;
  };
  headers: {
    staffId: string;
    staffRole: StaffRole;
  };
  nextPath: string;
}

export interface StaffForgotResponse {
  message_user: string;
  code: string;
  channels: Array<{ type: string; masked: string }>;
  devCode?: string;
}

export interface StaffForgotVerifyResponse {
  message_user: string;
  code: string;
  resetToken: string;
}

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
    combinedStaffStorage(),
  );
}

function combinedStaffStorage(): StaffIdentityStorage {
  return {
    getItem: (key: string) =>
      window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key),
    setItem: (key: string, value: string) => {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    },
    removeItem: (key: string) => {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    },
  };
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

export function defaultTenantSlug(): string {
  return (
    process.env.NEXT_PUBLIC_TENANT_SLUG ||
    process.env.NEXT_PUBLIC_DEFAULT_TENANT ||
    'restaurant_dev'
  );
}

export function homeForStaffRole(role: StaffRole): string {
  if (role === 'manager') return '/manager';
  if (role === 'host') return '/host';
  if (role === 'waiter') return '/waiter';
  if (role === 'cook') return '/cozinha';
  return '/dashboard';
}

export function readStaffSession(): StaffSession | null {
  if (typeof window === 'undefined') return null;
  const storage = combinedStaffStorage();
  const staffId = storage.getItem('staffId');
  const staffRole = storage.getItem('staffRole') as StaffRole | null;
  const staffName = storage.getItem('staffName') ?? '';
  if (!staffId || !STAFF_ID_RE.test(staffId) || !staffRole) return null;
  return { staffId, staffRole, staffName };
}

export function saveStaffSession(session: StaffSession, remember: boolean): void {
  if (typeof window === 'undefined') return;
  const primary = remember ? window.localStorage : window.sessionStorage;
  const secondary = remember ? window.sessionStorage : window.localStorage;
  for (const key of ['staffId', 'staffRole', 'staffName']) {
    secondary.removeItem(key);
  }
  primary.setItem('staffId', session.staffId);
  primary.setItem('staffRole', session.staffRole);
  primary.setItem('staffName', session.staffName);
}

export function clearStaffSession(): void {
  if (typeof window === 'undefined') return;
  for (const key of ['staffId', 'staffRole', 'staffName']) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
}

async function staffAuthApi<T>(slug: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/${slug}/staff-auth${path}`, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const responseBody = await res.json().catch(() => ({}));
    const error = new Error(extractApiErrorMessage(responseBody)) as Error & {
      code?: string;
    };
    const code =
      responseBody && typeof responseBody === 'object'
        ? (responseBody as { code?: unknown }).code
        : undefined;
    if (typeof code === 'string') error.code = code;
    throw error;
  }

  return res.json() as Promise<T>;
}

export function staffAuthLogin(
  slug: string,
  body: { cpf: string; pin: string },
): Promise<StaffAuthLoginResponse> {
  return staffAuthApi<StaffAuthLoginResponse>(slug, '/login', body);
}

export function staffAuthForgot(slug: string, body: { cpf: string }): Promise<StaffForgotResponse> {
  return staffAuthApi<StaffForgotResponse>(slug, '/forgot', body);
}

export function staffAuthVerifyForgot(
  slug: string,
  body: { cpf: string; code: string },
): Promise<StaffForgotVerifyResponse> {
  return staffAuthApi<StaffForgotVerifyResponse>(slug, '/forgot/verify', body);
}

export function staffAuthResetPin(
  slug: string,
  body: { resetToken: string; pin: string },
): Promise<{ message_user: string; code: string }> {
  return staffAuthApi<{ message_user: string; code: string }>(slug, '/reset-pin', body);
}

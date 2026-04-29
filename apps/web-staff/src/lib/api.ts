const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
// Chave de staff. Backend exige `x-staff-key` em endpoints protegidos
// por `StaffOrSessionGuard` (ex.: PATCH /orders/:id/status, antes
// publico — qualquer um podia avancar status ou cancelar pedido em
// qualquer tenant). Em prod evolui pra JWT via PIN.
const STAFF_API_KEY = process.env.NEXT_PUBLIC_STAFF_API_KEY || '';

export async function staffApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(STAFF_API_KEY ? { 'x-staff-key': STAFF_API_KEY } : {}),
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

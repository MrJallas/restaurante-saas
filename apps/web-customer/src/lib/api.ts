const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface ApiError {
  message: string;
  statusCode: number;
}

export class ApiRequestError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      // Sessao expirada — redireciona pro QR
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
      throw new ApiRequestError(401, 'Sessao expirada.');
    }

    const body = (await res.json().catch(() => ({}))) as ApiError;
    throw new ApiRequestError(res.status, body.message || 'Erro inesperado.');
  }

  return res.json() as Promise<T>;
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function apiGet<T>(path: string): Promise<T> {
  return api<T>(path, { method: 'GET' });
}

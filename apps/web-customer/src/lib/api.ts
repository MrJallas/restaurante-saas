import { getSessionToken } from './storage';
import { continuationRequestHeaders } from './continuationHints';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const DEFAULT_TIMEOUT_MS = 15_000;

interface ApiError {
  message: string | string[];
  message_user?: string;
  error_code?: string;
  code?: string;
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

  // Em cross-origin (ex.: iPhone na LAN → api no Mac) o cookie httpOnly
  // SameSite=Lax nao e enviado pelo browser, entao mandamos o sessionId
  // tambem como header. O server aceita os dois via SessionGuard.
  const sessionToken =
    typeof window !== 'undefined' ? getSessionToken() : null;

  const signal = options.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const continuationHeaders =
    typeof window !== 'undefined' ? continuationRequestHeaders(path) : {};

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      signal,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
        ...continuationHeaders,
        ...options.headers,
      },
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      throw new Error('TIMEOUT');
    }
    throw err;
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiError;
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message_user || body.message;
    if (res.status === 401) {
      // Sessao expirada. NAO redirecionamos pra `/` daqui — esse path
      // levaria o usuario pra placeholder root e ele perderia o slug
      // /tableCode, ficando preso. Quem chamou e quem sabe o contexto
      // (ex.: estamos em /mesa/[code] → re-iniciar sessao na mesma URL,
      // estamos em /assistente → voltar pra mesa). O caller decide.
      throw new ApiRequestError(
        401,
        message || 'Sessao expirada. Escaneie o QR Code novamente.',
      );
    }

    throw new ApiRequestError(res.status, message || 'Erro inesperado.');
  }

  return res.json() as Promise<T>;
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function apiGet<T>(path: string): Promise<T> {
  return api<T>(path, { method: 'GET' });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

// recognition_token is now set as httpOnly cookie by the server.
// These functions are kept for call-site compat but no longer write document.cookie.
export function setRecognitionToken(_token: string): void {
  // no-op: server sets httpOnly cookie
}

export function getRecognitionToken(): string | null {
  // httpOnly cookies are not readable from JS — the server reads from req.cookies
  return null;
}

export function clearRecognitionToken(): void {
  // no-op: server controls the cookie
}

// Fallback para ambientes cross-origin (LAN + celular real) onde o cookie
// httpOnly SameSite=Lax nao e enviado nas chamadas `fetch` a outra origem.
// O server aceita este valor como header `x-session-token` via SessionGuard.
const SESSION_TOKEN_KEY = 'session_token';

export function setSessionToken(token: string): void {
  try {
    window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    /* storage bloqueado (private mode) — seguimos sem header */
  }
}

export function getSessionToken(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearSessionToken(): void {
  try {
    window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

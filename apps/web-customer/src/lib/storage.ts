const RECOGNITION_COOKIE = 'recognition_token';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function setRecognitionToken(token: string): void {
  const expires = new Date(Date.now() + ONE_YEAR_MS).toUTCString();
  document.cookie = `${RECOGNITION_COOKIE}=${token}; expires=${expires}; path=/; SameSite=Lax`;
}

export function getRecognitionToken(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${RECOGNITION_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearRecognitionToken(): void {
  document.cookie = `${RECOGNITION_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
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

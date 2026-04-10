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

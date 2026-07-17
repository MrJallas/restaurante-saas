import { ApiRequestError } from './api';

/**
 * Uma sessão reidratada é apenas um cache de navegação. Se a primeira
 * revalidação protegida disser 401, o scan físico precisa voltar ao bootstrap
 * em vez de renderizar uma home falsa com o token encerrado.
 */
export function shouldRebootstrapQrSession(error: unknown): boolean {
  return error instanceof ApiRequestError && error.statusCode === 401;
}

/**
 * Enquanto a entrada física está pendente, 401/404 não são uma oscilação de
 * rede: significam que a sessão foi encerrada/expirou ou que o participante
 * deixou de existir. Manter a animação de espera nesses casos cria um estado
 * impossível, pois nenhum evento futuro pode aprovar aquele token.
 */
export function shouldExitPendingQrApproval(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.statusCode === 401 || error.statusCode === 404);
}

const QR_BOOTSTRAP_SECRET_PARAMS = ['hmac', 'ts', 'accessToken'] as const;

/** Remove só as credenciais efêmeras, preservando query funcional e hash. */
export function qrUrlWithoutBootstrapSecrets(currentUrl: string): string {
  const url = new URL(currentUrl, 'http://localhost');
  for (const key of QR_BOOTSTRAP_SECRET_PARAMS) url.searchParams.delete(key);
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
}

/**
 * Substitui a entrada atual, em vez de navegar: Back/Forward nunca reexpõe o
 * HMAC/token do QR depois que a sessão já está persistida e revalidada.
 */
export function stripQrBootstrapSecretsFromHistory(): boolean {
  if (typeof window === 'undefined') return false;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const safe = qrUrlWithoutBootstrapSecrets(window.location.href);
  if (safe === current) return false;
  window.history.replaceState(window.history.state, '', safe);
  return true;
}

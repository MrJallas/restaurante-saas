import type { Request } from 'express';
import type { CookieOptions } from 'express';

/**
 * Calcula `CookieOptions` adequado pra request (HTTPS-aware).
 *
 * Por que: cookies persistentes (`recognition_token`, `customer_session`)
 * eram hardcoded com `secure: process.env.NODE_ENV === 'production'`.
 * Em DEV via Cloudflare Tunnel (HTTPS público que aponta pra container
 * Docker local), o NODE_ENV é 'development' → `secure: false` → Safari
 * iOS REJEITA o Set-Cookie de origem HTTPS sem o flag secure.
 *
 * Consequência: cookie nunca era persistido no browser → customerId
 * nunca chegava no backend → /home retornava `isReturning: false` mesmo
 * pra Caleb cadastrado há dias → eyebrow "RECONHECEU VOCÊ" sumia.
 *
 * Fix: detectar HTTPS via `req.secure` (Express trust proxy) OU header
 * `X-Forwarded-Proto: https` (presente quando atrás de tunnel/proxy).
 * Quando HTTPS, aplicar `secure: true` + `sameSite: 'none'` (necessário
 * pra cookies cross-site funcionarem com secure). Quando HTTP local,
 * keep `secure: false` + `sameSite: 'lax'` (default seguro pra dev).
 *
 * Round 21 §F — bug isReturning false via Cloudflare Tunnel.
 */
export function getSecureCookieOptions(req: Request, base: CookieOptions = {}): CookieOptions {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    path: '/',
    ...base,
    // Quando HTTPS (tunnel ou prod), browsers modernos exigem `secure:
    // true` + `sameSite: 'none'` pra aceitar cookies que serão enviados
    // em contexto cross-site (ex.: app cliente em domínio tunnel, backend
    // via mesma origem mas com proxy intermediário).
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
  };
}

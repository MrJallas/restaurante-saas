import type { Request, Response, NextFunction } from 'express';

/**
 * A05 (Security Misconfiguration) — a API não setava NENHUM header de
 * segurança. Este middleware adiciona o conjunto seguro-por-padrão para uma
 * API JSON-only:
 *
 *  - `X-Content-Type-Options: nosniff` — impede MIME-sniffing (um JSON não
 *    pode ser reinterpretado como HTML/JS).
 *  - `X-Frame-Options: DENY` + `frame-ancestors 'none'` — a API nunca é
 *    embutida em frame; corta clickjacking / UI-redress.
 *  - `Content-Security-Policy: default-src 'none'` — a API não serve HTML nem
 *    assets, então a política mais restritiva é segura e vira defense-in-depth
 *    caso algum caminho acidentalmente devolva conteúdo renderizável.
 *  - `Referrer-Policy: no-referrer` — respostas de API não devem vazar URL.
 *  - `Cross-Origin-Resource-Policy: same-site` — impede leitura cross-site.
 *  - `Strict-Transport-Security` — só em produção (em http local o browser
 *    ignora, e não queremos pinar HTTPS no localhost de dev).
 *
 * Manual (sem helmet) de propósito: evita adicionar dependência + churn de
 * package-lock, e mantém explícito exatamente qual header sai.
 */
export function createSecurityHeadersMiddleware(
  isProduction = process.env.NODE_ENV === 'production',
) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    }
    next();
  };
}

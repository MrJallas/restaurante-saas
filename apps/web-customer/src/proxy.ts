import { NextRequest, NextResponse } from 'next/server';

/**
 * A05 etapa 2 — CSP ENFORCE com nonce por-request.
 *
 * O `next.config.js` só consegue headers ESTÁTICOS; um CSP com nonce precisa ser
 * gerado por request (aqui). O ganho real de XSS: `script-src` com nonce +
 * `strict-dynamic` BLOQUEIA qualquer `<script>` injetado sem o nonce (o
 * `'unsafe-inline'` do report-only anterior deixava passar). O Next lê o nonce do
 * header CSP na REQUEST e carimba automaticamente os próprios scripts.
 *
 * Trade-offs deliberados (validados no preview, V20 não pode quebrar):
 *  - `style-src 'unsafe-inline'`: React usa `style={{...}}` (atributos de estilo,
 *    que nonce/hlueash não cobrem) → sem unsafe-inline o V20 quebraria.
 *  - `'unsafe-eval'` só em DEV (HMR/react-refresh do Next precisa); prod remove
 *    (mais forte). Os containers de beta rodam NODE_ENV=development → não quebram.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const isProd = process.env.NODE_ENV === 'production';
  const scriptEval = isProd ? '' : " 'unsafe-eval'";

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // 'self' (não 'none'): o V20 embute o cardápio num <iframe src=/cardapio?embed=1>
    // same-origin (MenuOverlay). 'none' recusaria framar em QUALQUER lugar e
    // deixaria o overlay em branco. 'self' preserva o anti-clickjacking cross-origin.
    "frame-ancestors 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${scriptEval}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: http: https:",
    "form-action 'self'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next lê o nonce deste header (na request) pra carimbar seus <script>.
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Tudo menos `/api/*` (proxyado pro backend, que tem CSP própria) e os assets
  // estáticos do Next (servidos com headers próprios).
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};

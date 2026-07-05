import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy (Next 16, ex-middleware) do web-staff. Faz DUAS coisas:
 *
 * 1. **CSP enforce com nonce** (A05 etapa 2) em TODA resposta — igual ao
 *    web-customer. `script-src` com nonce + `strict-dynamic` bloqueia `<script>`
 *    injetado sem o nonce (o `'unsafe-inline'` do report-only anterior deixava
 *    passar). `style-src 'unsafe-inline'` mantido (React inline styles +
 *    styled-jsx do web-staff). `'unsafe-eval'` só em dev.
 * 2. **TV-gate** (segurança pré-existente): /cozinha/tv e /bar/tv exigem o cookie
 *    `tv_pin == TV_ACCESS_PIN`; sem PIN configurado o gate é no-op (dev).
 */
const PROTECTED_PATHS = ['/cozinha/tv', '/bar/tv'];

function buildCsp(): { csp: string; nonce: string } {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const isProd = process.env.NODE_ENV === 'production';
  const scriptEval = isProd ? '' : " 'unsafe-eval'";
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // 'self' (não 'none') pra permitir embed same-origin sem abrir clickjacking
    // cross-origin — espelha o web-customer (MenuOverlay iframe).
    "frame-ancestors 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${scriptEval}`,
    // Google Fonts (tema do tenant) — espelha o web-customer.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' ws: wss: http: https:",
    "form-action 'self'",
  ].join('; ');
  return { csp, nonce };
}

export function proxy(req: NextRequest): NextResponse {
  const { csp, nonce } = buildCsp();
  const path = req.nextUrl.pathname;

  // TV-gate primeiro (pode redirecionar). O redirect também leva o CSP.
  const expectedPin = process.env.TV_ACCESS_PIN;
  const isProtected = PROTECTED_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  if (expectedPin && isProtected) {
    const pin = req.cookies.get('tv_pin')?.value;
    if (pin !== expectedPin) {
      const url = req.nextUrl.clone();
      url.pathname = '/cozinha/unlock';
      url.searchParams.set('next', path);
      const redirect = NextResponse.redirect(url);
      redirect.headers.set('Content-Security-Policy', csp);
      return redirect;
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp); // Next lê o nonce daqui
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Todas as rotas (menos assets estáticos) — o CSP vale em tudo; o TV-gate só
  // atua nos PROTECTED_PATHS.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

import { NextRequest, NextResponse } from 'next/server';

/**
 * Gate simples pras telas de TV (/cozinha/tv e /bar/tv). Antes essas
 * rotas eram totalmente publicas — qualquer um que adivinhasse a URL
 * conseguia abrir o KDS e ver os pedidos do tenant. Combinado com o
 * P1-F (STAFF_API_KEY embarcada), virava bypass completo de staff
 * auth.
 *
 * Next 16: a convenção de arquivo `middleware` foi deprecada em favor de
 * `proxy` (mesma semântica edge). Renomeado middleware.ts → proxy.ts e
 * `middleware()` → `proxy()`; o `config.matcher` é idêntico.
 *
 * Modelo:
 *   - Cookie `tv_pin` deve casar com process.env.TV_ACCESS_PIN.
 *   - Sem PIN configurado (env vazia), o gate vira no-op.
 *     Mantem dev local destravado sem precisar setar pin.
 *   - Sem cookie ou cookie errado: redirect pra /cozinha/unlock.
 */
const PROTECTED_PATHS = ['/cozinha/tv', '/bar/tv'];

export function proxy(req: NextRequest) {
  const expectedPin = process.env.TV_ACCESS_PIN;
  if (!expectedPin) return NextResponse.next();

  const path = req.nextUrl.pathname;
  if (!PROTECTED_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const pin = req.cookies.get('tv_pin')?.value;
  if (pin === expectedPin) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/cozinha/unlock';
  url.searchParams.set('next', path);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/cozinha/:path*', '/bar/:path*'],
};

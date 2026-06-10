import { NextRequest, NextResponse } from 'next/server';

/**
 * Gate simples pras telas de TV (/cozinha/tv e /bar/tv). Antes essas
 * rotas eram totalmente publicas — qualquer um que adivinhasse a URL
 * conseguia abrir o KDS e ver os pedidos do tenant. Combinado com o
 * P1-F (STAFF_API_KEY embarcada), virava bypass completo de staff
 * auth.
 *
 * Modelo:
 *   - Cookie `tv_pin` deve casar com process.env.TV_ACCESS_PIN.
 *   - Sem PIN configurado (env vazia), middleware vira no-op.
 *     Mantem dev local destravado sem precisar setar pin.
 *   - Sem cookie ou cookie errado: redirect pra /cozinha/unlock.
 *
 * NOTA: o /cozinha/unlock e o seu form ainda nao existem — esse
 * commit gateia as rotas mas deixa unlock como TODO. Em dev (sem env)
 * tudo funciona; em prod sem unlock ainda nao da pra entrar — proximo
 * pass deve criar a pagina + endpoint /api/tv-unlock que valida PIN
 * e seta o cookie. Tracked via P1-F (refactor PIN/JWT).
 */
const PROTECTED_PATHS = ['/cozinha/tv', '/bar/tv'];

export function middleware(req: NextRequest) {
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

import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy server-side — o CAMINHO ÚNICO de toda chamada de staff (ciclo 2,
 * decisão Caleb 2026-07-04). O `x-staff-key` fica numa env NÃO pública
 * (STAFF_API_KEY, sem prefixo NEXT_PUBLIC_) e nunca chega ao bundle JS.
 *
 * Três tipos de rota:
 *  - LOGIN (`/:tenant/staff-auth/login`): encaminha, captura o `staffToken`
 *    da resposta, seta cookie httpOnly `staff_token` e OMITE o token do body
 *    devolvido ao client (o browser nunca vê o segredo).
 *  - LOGOUT (`/:tenant/staff-auth/logout`): limpa o cookie.
 *  - TV pública (KDS/status/call-waiter): gate por cookie `tv_pin`.
 *  - Demais (staff autenticado): exige o cookie `staff_token`; injeta
 *    `x-staff-token` (do cookie) + `x-staff-key` (server-side). O backend
 *    confia no token (Redis, confinado ao tenant); a key só abre o portão
 *    StaffOnly e o token inválido é rejeitado (staff-only.guard sub-fatia 1).
 *
 * Resolve P1-F de vez: a credencial de staff não vive mais no client.
 */
const API_BASE = process.env.STAFF_API_BASE_URL || 'http://localhost:3001/api';
const STAFF_KEY = process.env.STAFF_API_KEY || '';
const STAFF_TOKEN_COOKIE = 'staff_token';
const STAFF_TOKEN_MAX_AGE = 12 * 60 * 60; // 12h, igual ao TTL do token no Redis

const FORWARDED_REQUEST_HEADERS = new Set(['accept', 'content-type', 'user-agent', 'x-staff-id']);
const FORWARDED_RESPONSE_HEADERS = new Set(['content-type', 'cache-control']);

/** Rotas de TV pública (estação anônima) — gate por PIN, sem login. */
const TV_ROUTES: { method: string; re: RegExp }[] = [
  { method: 'GET', re: /^[\w-]+\/orders\/_kds(\?|$)/ },
  { method: 'PATCH', re: /^[\w-]+\/orders\/[a-f0-9-]{36}\/status$/ },
  { method: 'POST', re: /^[\w-]+\/orders\/[a-f0-9-]{36}\/call-waiter$/ },
];
const LOGIN_RE = /^[\w-]+\/staff-auth\/login$/;
const LOGOUT_RE = /^[\w-]+\/staff-auth\/logout$/;
// Rotas que EMITEM staffToken novo no body (login e change-pin — a troca de
// PIN revoga todas as sessões e devolve um token novo pra sessão corrente
// não morrer junto). O proxy captura o token, seta o cookie httpOnly e
// OMITE o segredo do body devolvido ao browser. O change-pin, ao contrário
// do login, continua exigindo o cookie de sessão pra passar do portão.
const TOKEN_ISSUING_RE = /^[\w-]+\/staff-auth\/(login|change-pin)$/;

function tvPinValid(req: NextRequest): boolean {
  const expected = process.env.TV_ACCESS_PIN;
  if (!expected) return true; // dev mode, no-op
  return req.cookies.get('tv_pin')?.value === expected;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: STAFF_TOKEN_MAX_AGE,
  };
}

async function handle(req: NextRequest, ctx: { params: { path: string[] } }) {
  const path = ctx.params.path.join('/');
  const method = req.method.toUpperCase();
  const pathWithSearch = path + (req.nextUrl.search || '');
  const url = `${API_BASE}/${path}${req.nextUrl.search}`;

  const isTv = TV_ROUTES.some((r) => r.method === method && r.re.test(pathWithSearch));
  const isLogin = method === 'POST' && LOGIN_RE.test(pathWithSearch);
  const isLogout = method === 'POST' && LOGOUT_RE.test(pathWithSearch);
  const issuesToken = method === 'POST' && TOKEN_ISSUING_RE.test(pathWithSearch);
  const sessionToken = req.cookies.get(STAFF_TOKEN_COOKIE)?.value;

  // Autorização por tipo de rota.
  if (isTv) {
    if (!tvPinValid(req)) {
      return NextResponse.json({ error: 'TV nao desbloqueada' }, { status: 401 });
    }
  } else if (!isLogin && !isLogout && !sessionToken) {
    // Rota de staff autenticado sem cookie de sessão → 401 antes de bater
    // no backend (não injeta a key pra quem não fez login).
    return NextResponse.json(
      {
        code: 'AUTH_MISSING',
        message_user: 'Sessão de equipe necessária. Faça login novamente.',
      },
      { status: 401 },
    );
  }

  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    if (FORWARDED_REQUEST_HEADERS.has(k.toLowerCase())) headers[k] = v;
  }
  if (STAFF_KEY) headers['x-staff-key'] = STAFF_KEY;
  if (sessionToken) headers['x-staff-token'] = sessionToken;

  const init: RequestInit = {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text(),
    redirect: 'manual',
  };

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch (err) {
    return NextResponse.json(
      { error: 'API indisponivel', detail: (err as Error).message },
      { status: 502 },
    );
  }

  // LOGIN / CHANGE-PIN: extrai o staffToken da resposta, seta cookie
  // httpOnly, devolve o body SEM o token (o browser nunca recebe o segredo).
  // No change-pin isso é o que mantém o usuário logado: o backend revogou
  // TODAS as sessões (inclusive a do cookie atual) e emitiu uma nova.
  if (issuesToken) {
    const bodyText = await upstream.text();
    if (!upstream.ok) {
      return new NextResponse(bodyText, {
        status: upstream.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      /* backend devolveu algo não-JSON; segue sem cookie */
    }
    const token = typeof json.staffToken === 'string' ? json.staffToken : null;
    const safeBody = { ...json };
    delete safeBody.staffToken;
    const res = NextResponse.json(safeBody, { status: upstream.status });
    if (token) res.cookies.set(STAFF_TOKEN_COOKIE, token, cookieOptions());
    return res;
  }

  // LOGOUT: limpa o cookie de sessão.
  if (isLogout) {
    const res = new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });
    res.cookies.set(STAFF_TOKEN_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
    return res;
  }

  const respHeaders: Record<string, string> = {};
  upstream.headers.forEach((v, k) => {
    if (FORWARDED_RESPONSE_HEADERS.has(k.toLowerCase())) respHeaders[k] = v;
  });
  return new NextResponse(upstream.body, { status: upstream.status, headers: respHeaders });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;

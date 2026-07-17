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
// Recuperacao acontece ANTES de existir uma sessao. A allowlist e exata para
// nao transformar `staff-auth/*` inteiro em rota publica; change-pin e qualquer
// endpoint futuro continuam passando pelo cookie de staff.
const PUBLIC_RECOVERY_ROUTES: { method: string; re: RegExp }[] = [
  { method: 'POST', re: /^[\w-]+\/staff-auth\/forgot$/ },
  { method: 'POST', re: /^[\w-]+\/staff-auth\/forgot\/verify$/ },
  { method: 'POST', re: /^[\w-]+\/staff-auth\/reset-pin$/ },
];
// Rotas que EMITEM staffToken novo no body (login e change-pin — a troca de
// PIN revoga todas as sessões e devolve um token novo pra sessão corrente
// não morrer junto). O proxy captura o token, seta o cookie httpOnly e
// OMITE o segredo do body devolvido ao browser. O change-pin, ao contrário
// do login, continua exigindo o cookie de sessão pra passar do portão.
const TOKEN_ISSUING_RE = /^[\w-]+\/staff-auth\/(login|change-pin)$/;

/**
 * Detecta ambiente "sério" (prod/staging) onde ausência de segredo deve
 * FAIL-CLOSE, espelhando o padrão do ai-service (Round 9 B-NEW-45). Em dev
 * local sem env tudo destrava; em prod/staging a falta de PIN bloqueia.
 */
function isProdLikeEnv(): boolean {
  const env = (process.env.VERCEL_ENV || process.env.NODE_ENV || 'development').toLowerCase();
  return env === 'production' || env === 'prod' || env === 'staging';
}

/**
 * Gate das rotas de TV pública (KDS/status/call-waiter) via cookie `tv_pin`.
 *
 * Segurança (P1 OWASP A05, re-scan): FAIL-CLOSE quando TV_ACCESS_PIN está
 * ausente em prod/staging. Antes esse ramo devolvia `true` (fail-OPEN), então
 * um deploy sem o PIN configurado — o DEFAULT, já que a var não está no compose
 * nem no .env.example — liberava KDS/status/call-waiter ANONIMAMENTE e o proxy
 * ainda injetava o `x-staff-key` real: qualquer visitante lia/mutava a cozinha
 * do tenant. Agora, sem PIN em prod, a TV é bloqueada (mesma doutrina do
 * AI_SERVICE_API_KEY / STAFF_API_KEY: segredo ausente = negar, não liberar).
 *
 * Em dev local (NODE_ENV !== production/staging) mantém-se o no-op com WARNING
 * loud no log, pra que o dev veja na consola e o fluxo de teste não trave.
 */
function tvPinValid(req: NextRequest): boolean {
  const expected = process.env.TV_ACCESS_PIN;
  if (!expected) {
    if (isProdLikeEnv()) {
      console.error(
        '[proxy] TV_ACCESS_PIN ausente em prod/staging — fail-CLOSE bloqueando rota de TV.',
      );
      return false; // fail-CLOSE: sem PIN configurado em prod, nega acesso
    }
    console.warn(
      '[proxy] TV_ACCESS_PIN ausente — gate de TV desligado (dev only). NAO usar assim em prod.',
    );
    return true; // dev mode, no-op
  }
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

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  // Next 16: `params` de route handler é assíncrono (era objeto puro no 14).
  // `await` num objeto puro também resolve, então é seguro nos dois runtimes.
  const { path: pathParts } = await ctx.params;
  const path = pathParts.join('/');
  const method = req.method.toUpperCase();
  const pathWithSearch = path + (req.nextUrl.search || '');
  const url = `${API_BASE}/${path}${req.nextUrl.search}`;

  const isTv = TV_ROUTES.some((r) => r.method === method && r.re.test(pathWithSearch));
  const isLogin = method === 'POST' && LOGIN_RE.test(pathWithSearch);
  const isLogout = method === 'POST' && LOGOUT_RE.test(pathWithSearch);
  const isPublicRecovery = PUBLIC_RECOVERY_ROUTES.some(
    (route) => route.method === method && route.re.test(pathWithSearch),
  );
  const issuesToken = method === 'POST' && TOKEN_ISSUING_RE.test(pathWithSearch);
  const sessionToken = req.cookies.get(STAFF_TOKEN_COOKIE)?.value;

  // Autorização por tipo de rota.
  if (isTv) {
    // O mesmo endpoint KDS atende dois clientes distintos:
    // - display /bar/tv ou /cozinha/tv: sem staff individual, exige tv_pin;
    // - KDS individual /bar: staff_token httpOnly do login dispensa TV PIN.
    // O token não é aceito cegamente: segue para apps/api como
    // x-staff-token e os guards revalidam Redis, tenant, PIN obrigatório e
    // papel. Um cookie forjado só troca este 401 pelo 401/403 autoritativo do
    // backend, nunca recebe x-staff-key sem a sessão também ser enviada.
    if (!sessionToken && !tvPinValid(req)) {
      return NextResponse.json({ error: 'TV nao desbloqueada' }, { status: 401 });
    }
  } else if (!isLogin && !isLogout && !isPublicRecovery && !sessionToken) {
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

import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy server-side pra API staff. O staff-key fica numa env NAO publica
 * (STAFF_API_KEY, sem prefixo NEXT_PUBLIC_) e nunca chega ao bundle JS
 * do client. O cliente chama `/api/proxy/<tenant>/orders/_kds` (same
 * origin do web-staff) e o handler:
 *  1. valida cookie tv_pin contra TV_ACCESS_PIN do env (em dev sem env,
 *     vira no-op e proxa direto)
 *  2. se valido, faz fetch pra API real adicionando x-staff-key
 *  3. retransmite status + body
 *
 * Resolve P1-F: antes a STAFF_API_KEY ia embarcada no bundle via
 * NEXT_PUBLIC_STAFF_API_KEY — qualquer um com DevTools lia o token
 * staff completo.
 */
const API_BASE = process.env.STAFF_API_BASE_URL || 'http://localhost:3001/api';
const STAFF_KEY = process.env.STAFF_API_KEY || '';
// x-staff-id: a TV não envia (estação anônima), mas um client staff
// identificado roteado pelo proxy não pode perder a atribuição em
// silêncio (code-review). x-staff-key continua server-side only.
const FORWARDED_REQUEST_HEADERS = new Set(['accept', 'content-type', 'user-agent', 'x-staff-id']);

const ALLOWED_ROUTES: { method: string; re: RegExp }[] = [
  { method: 'GET', re: /^[\w-]+\/orders\/_kds(\?|$)/ },
  { method: 'PATCH', re: /^[\w-]+\/orders\/[a-f0-9-]{36}\/status$/ },
  { method: 'POST', re: /^[\w-]+\/orders\/[a-f0-9-]{36}\/call-waiter$/ },
];

function pinValid(req: NextRequest): boolean {
  const expected = process.env.TV_ACCESS_PIN;
  if (!expected) return true; // dev mode, no-op
  const pin = req.cookies.get('tv_pin')?.value;
  return pin === expected;
}

async function handle(req: NextRequest, ctx: { params: { path: string[] } }) {
  if (!pinValid(req)) {
    return NextResponse.json({ error: 'TV nao desbloqueada' }, { status: 401 });
  }
  const path = ctx.params.path.join('/');
  const method = req.method.toUpperCase();
  const pathWithSearch = path + (req.nextUrl.search || '');
  if (!ALLOWED_ROUTES.some((r) => r.method === method && r.re.test(pathWithSearch))) {
    return new Response('Not found', { status: 404 });
  }
  const url = `${API_BASE}/${path}${req.nextUrl.search}`;

  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    if (FORWARDED_REQUEST_HEADERS.has(k.toLowerCase())) headers[k] = v;
  }
  if (STAFF_KEY) headers['x-staff-key'] = STAFF_KEY;

  const init: RequestInit = {
    method: req.method,
    headers,
    // GET/HEAD nao podem ter body. Outras: forward.
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

  const FORWARDED_RESPONSE_HEADERS = new Set(['content-type', 'cache-control']);
  const respHeaders: Record<string, string> = {};
  upstream.headers.forEach((v, k) => {
    if (FORWARDED_RESPONSE_HEADERS.has(k.toLowerCase())) respHeaders[k] = v;
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;

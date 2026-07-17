import { NextRequest, NextResponse } from 'next/server';
import { createRateLimitState, evaluateRateLimit } from './rate-limit';

/**
 * POST /api/tv-unlock — recebe { pin }, compara com TV_ACCESS_PIN, e
 * seta cookie `tv_pin` se bater. O proxy do Next 16 (`src/proxy.ts`) usa
 * esse cookie pra liberar /cozinha/tv e /bar/tv.
 *
 * timing-safe compare protege contra side-channel de PIN curto.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  const padA = a.padEnd(maxLen, '\0');
  const padB = b.padEnd(maxLen, '\0');
  let result = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    result |= padA.charCodeAt(i) ^ padB.charCodeAt(i);
  }
  return result === 0;
}

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12; // 12h cobre dois turnos

const prodRateState = createRateLimitState();

function getClientIp(req: NextRequest): string {
  // Next 16 removeu `NextRequest.ip`/`.geo`. Num Route Handler (Web Request) não
  // há socket TCP — só headers. Atrás de proxy confiável (Vercel/edge/Cloudflare)
  // o x-forwarded-for leftmost é o IP real; SEM proxy é forjável. Por isso o IP
  // é só a chave FINA (per-IP best-effort) — a proteção contra XFF forjado é o
  // backstop GLOBAL em evaluateRateLimit (rate-limit.ts), que independe do IP.
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || '127.0.0.1';
}

function checkRateLimit(ip: string): boolean {
  return evaluateRateLimit(prodRateState, ip, Date.now());
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return new Response('Too many requests', { status: 429 });
  }

  let body: { pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body invalido' }, { status: 400 });
  }

  const expected = process.env.TV_ACCESS_PIN;
  if (!expected) {
    // Sem env: middleware nao gateia, entao essa rota nao e necessaria.
    // Resposta 200 manten compat com o front, sem setar cookie inutil.
    return NextResponse.json({ ok: true, dev: true });
  }

  const provided = (body.pin ?? '').trim();
  if (!provided || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: 'PIN invalido' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('tv_pin', expected, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}

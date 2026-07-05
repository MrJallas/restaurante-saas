import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/tv-unlock — recebe { pin }, compara com TV_ACCESS_PIN, e
 * seta cookie `tv_pin` se bater. O middleware (../middleware.ts) usa
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

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
// Cap absoluto pra evitar growth ilimitado se muitos IPs distintos chegarem.
// 5000 entries * ~80 bytes ~= 400KB worst case.
const MAX_BUCKETS = 5000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
let cleanupCounter = 0;

function getClientIp(req: NextRequest): string {
  // Next 16 removeu `NextRequest.ip`/`.geo`. Num Route Handler (Web Request)
  // não há acesso ao socket TCP — só headers. Atrás da infra confiável
  // (Vercel/edge), o x-forwarded-for LEFTMOST é o IP real do cliente (o proxy
  // reescreve o header). Sem proxy confiável ele é forjável, mas este
  // rate-limit é defense-in-depth: o gate real da rota é o compare timing-safe
  // do PIN + janela curta. Fallback estável pra bucketizar quando ausente.
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || '127.0.0.1';
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();

  if (++cleanupCounter % 100 === 0 || rateBuckets.size > MAX_BUCKETS) {
    for (const [k, b] of rateBuckets) {
      if (now >= b.resetAt) rateBuckets.delete(k);
    }
    if (rateBuckets.size > MAX_BUCKETS) {
      const toDelete = Math.ceil(rateBuckets.size * 0.2);
      let i = 0;
      for (const key of rateBuckets.keys()) {
        if (i++ >= toDelete) break;
        rateBuckets.delete(key);
      }
    }
  }

  const bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  bucket.count++;
  return bucket.count <= RATE_LIMIT;
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

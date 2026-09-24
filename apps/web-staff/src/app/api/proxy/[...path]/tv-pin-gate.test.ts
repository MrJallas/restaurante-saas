/**
 * @jest-environment node
 *
 * Roda no ambiente `node` (não jsdom) porque `next/server` precisa dos globals
 * Web `Request`/`Response`/`Headers` no import — presentes no Node 20, ausentes
 * no jsdom. O default do harness é jsdom (jest.config.js), então este docblock
 * troca só pra este arquivo.
 */
/**
 * P1 OWASP A05 (Security Misconfiguration) — o gate `tvPinValid()` do proxy
 * das TVs anônimas (KDS / status / call-waiter) NÃO pode FAIL-OPEN quando
 * TV_ACCESS_PIN está ausente. Ausente é o estado DEFAULT (a var não vinha no
 * compose nem no .env.example), e nesse ramo o proxy antes devolvia `true`,
 * liberava a rota e ainda injetava o `x-staff-key` real → cozinha do tenant
 * acessível/mutável anonimamente.
 *
 * Doutrina (espelha ai-service AI_SERVICE_API_KEY / STAFF_API_KEY):
 *   - PIN ausente em prod/staging  → FAIL-CLOSE (bloqueia, 401).
 *   - PIN ausente em dev local     → no-op com warning (libera).
 *   - PIN setado + cookie correto  → libera (caso legítimo preservado).
 *   - PIN setado + cookie errado   → bloqueia (401).
 *
 * Os handlers só expõem HTTP, então dirigimos `GET` com um `fetch` mockado e
 * um NextRequest de mentira, cobrindo a rota de TV `_kds`.
 *
 * NOTA sobre o sinal de prod: sob `next/jest` o SWC força `NODE_ENV=test` e
 * INLINA `process.env.NODE_ENV` como a constante literal `"test"` no módulo da
 * rota transformado — logo o ramo `NODE_ENV === 'production'` não é acionável
 * daqui (e continua correto num build real de prod). Já `VERCEL_ENV` NÃO é
 * inlinado, então usamos ele pra provar o fail-CLOSE em ambiente prod-like.
 */
import type { NextRequest } from 'next/server';

const KDS_PATH = ['restaurant_dev', 'orders', '_kds'];

type FakeReqOpts = {
  method: string;
  path: string[];
  cookies?: Record<string, string>;
  search?: string;
  headers?: Record<string, string>;
};

/** NextRequest mínimo suficiente pro handler do proxy. */
function fakeReq(opts: FakeReqOpts): NextRequest {
  const cookies = opts.cookies ?? {};
  return {
    method: opts.method,
    headers: new Headers(opts.headers ?? {}),
    nextUrl: { search: opts.search ?? '' },
    cookies: {
      get: (name: string) => (name in cookies ? { value: cookies[name] } : undefined),
    },
    text: async () => '',
  } as unknown as NextRequest;
}

/**
 * `@types/node` tipa `process.env.NODE_ENV` como read-only, então a atribuição
 * direta quebra `tsc --noEmit`. Escrevemos via view mutável do env, sempre
 * mirando o `process.env` VIVO (não uma referência capturada, que ficaria
 * stale se algum hook reatribuísse `process.env`).
 */
function setEnv(key: string, value: string): void {
  (process.env as Record<string, string | undefined>)[key] = value;
}
function unsetEnv(key: string): void {
  delete (process.env as Record<string, string | undefined>)[key];
}

async function loadRoute() {
  // Import isolado por teste pra que os module-level consts (STAFF_KEY etc.)
  // sejam re-lidos com o env do caso corrente.
  let mod: typeof import('./route');
  await jest.isolateModulesAsync(async () => {
    mod = await import('./route');
  });
  return mod!;
}

describe('proxy TV gate — tvPinValid fail-CLOSE (P1 A05)', () => {
  // Snapshot só das chaves que mexemos — restauramos por chave em vez de
  // reatribuir `process.env` (reatribuir quebraria closures que capturam a ref).
  const TOUCHED = ['TV_ACCESS_PIN', 'VERCEL_ENV'];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    jest.resetModules();
    for (const k of TOUCHED) saved[k] = process.env[k];
    // Backend nunca deve ser tocado quando o gate bloqueia; quando libera,
    // devolvemos um 200 vazio pra provar que passou do gate.
    global.fetch = jest.fn(
      async () => new Response('[]', { status: 200 }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    for (const k of TOUCHED) {
      if (saved[k] === undefined) unsetEnv(k);
      else setEnv(k, saved[k]!);
    }
    jest.restoreAllMocks();
  });

  it('PIN ausente em prod-like (VERCEL_ENV=production) → BLOQUEIA (401) e não bate no backend', async () => {
    unsetEnv('TV_ACCESS_PIN');
    setEnv('VERCEL_ENV', 'production');

    const { GET } = await loadRoute();
    const res = await GET(fakeReq({ method: 'GET', path: KDS_PATH }), {
      params: Promise.resolve({ path: KDS_PATH }),
    });

    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('PIN ausente em staging (VERCEL_ENV=staging) → BLOQUEIA (401)', async () => {
    unsetEnv('TV_ACCESS_PIN');
    setEnv('VERCEL_ENV', 'staging');

    const { GET } = await loadRoute();
    const res = await GET(fakeReq({ method: 'GET', path: KDS_PATH }), {
      params: Promise.resolve({ path: KDS_PATH }),
    });

    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('PIN ausente em dev (sem VERCEL_ENV) → LIBERA (no-op) e chama o backend', async () => {
    unsetEnv('TV_ACCESS_PIN');
    unsetEnv('VERCEL_ENV'); // NODE_ENV inlina "test" → não prod-like

    const { GET } = await loadRoute();
    const res = await GET(fakeReq({ method: 'GET', path: KDS_PATH }), {
      params: Promise.resolve({ path: KDS_PATH }),
    });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('PIN setado + cookie correto → LIBERA (caso legítimo da TV preservado, mesmo prod-like)', async () => {
    setEnv('TV_ACCESS_PIN', 'secret-pin-123');
    setEnv('VERCEL_ENV', 'production');

    const { GET } = await loadRoute();
    const res = await GET(
      fakeReq({ method: 'GET', path: KDS_PATH, cookies: { tv_pin: 'secret-pin-123' } }),
      { params: Promise.resolve({ path: KDS_PATH }) },
    );

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('PIN setado + cookie errado → BLOQUEIA (401)', async () => {
    setEnv('TV_ACCESS_PIN', 'secret-pin-123');
    setEnv('VERCEL_ENV', 'production');

    const { GET } = await loadRoute();
    const res = await GET(
      fakeReq({ method: 'GET', path: KDS_PATH, cookies: { tv_pin: 'wrong' } }),
      { params: Promise.resolve({ path: KDS_PATH }) },
    );

    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('staff_token individual válido no browser não exige TV PIN', async () => {
    setEnv('TV_ACCESS_PIN', 'secret-pin-123');
    setEnv('VERCEL_ENV', 'production');

    const { GET } = await loadRoute();
    const res = await GET(
      fakeReq({
        method: 'GET',
        path: KDS_PATH,
        cookies: { staff_token: 'staff-session-token' },
      }),
      { params: Promise.resolve({ path: KDS_PATH }) },
    );

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const upstream = (global.fetch as jest.Mock).mock.calls[0]?.[1] as RequestInit;
    expect(upstream.headers).toMatchObject({ 'x-staff-token': 'staff-session-token' });
  });

  it('x-staff-id do browser não chega na API (identidade é só o token do cookie)', async () => {
    const CALL_WAITER_PATH = [
      'restaurant_dev',
      'orders',
      'aaaaaaa1-0000-0000-0000-000000000001',
      'call-waiter',
    ];
    const { POST } = await loadRoute();
    const res = await POST(
      fakeReq({
        method: 'POST',
        path: CALL_WAITER_PATH,
        headers: {
          'x-staff-id': '99999999-9999-4999-8999-999999999999',
          'content-type': 'application/json',
        },
      }),
      { params: Promise.resolve({ path: CALL_WAITER_PATH }) },
    );

    expect(res.status).toBe(200);
    const upstream = (global.fetch as jest.Mock).mock.calls[0]?.[1] as RequestInit;
    const sent = upstream.headers as Record<string, string>;
    expect(Object.keys(sent).map((k) => k.toLowerCase())).not.toContain('x-staff-id');
    expect(sent['content-type']).toBe('application/json');
  });
});

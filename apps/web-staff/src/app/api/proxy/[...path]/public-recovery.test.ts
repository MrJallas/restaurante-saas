/**
 * @jest-environment node
 *
 * Recuperacao de PIN acontece antes de existir uma sessao de staff. O proxy
 * precisa encaminhar somente os tres POSTs publicos do contrato e continuar
 * bloqueando change-pin e qualquer outro endpoint de staff sem cookie.
 */
import type { NextRequest } from 'next/server';

function fakePost(_path: string[]): NextRequest {
  return {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json' }),
    nextUrl: { search: '' },
    cookies: { get: () => undefined },
    text: async () => '{}',
  } as unknown as NextRequest;
}

async function call(path: string[]) {
  const { POST } = await import('./route');
  return POST(fakePost(path), { params: Promise.resolve({ path }) });
}

describe('proxy staff-auth recovery sem sessao', () => {
  beforeEach(() => {
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ code: 'OK' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([['forgot'], ['forgot', 'verify'], ['reset-pin']])(
    'encaminha POST /staff-auth/%s sem cookie',
    async (...segments: string[]) => {
      const path = ['restaurant_dev', 'staff-auth', ...segments];
      const res = await call(path);

      expect(res.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([['change-pin'], ['login-history']])(
    'mantem POST /staff-auth/%s protegido sem cookie',
    async (...segments: string[]) => {
      const path = ['restaurant_dev', 'staff-auth', ...segments];
      const res = await call(path);

      expect(res.status).toBe(401);
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );
});

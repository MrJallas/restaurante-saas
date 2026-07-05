import type { Request, Response, NextFunction } from 'express';
import { createSecurityHeadersMiddleware } from './security-headers';

function fakeRes() {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
  } as unknown as Response;
  return { res, headers };
}

describe('createSecurityHeadersMiddleware (A05)', () => {
  it('seta o conjunto seguro-por-padrão e chama next()', () => {
    const { res, headers } = fakeRes();
    let nexted = false;
    const next: NextFunction = () => {
      nexted = true;
    };
    createSecurityHeadersMiddleware(false)({} as Request, res, next);

    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Content-Security-Policy']).toContain("default-src 'none'");
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['Cross-Origin-Resource-Policy']).toBe('same-site');
    expect(nexted).toBe(true);
  });

  it('NÃO seta HSTS fora de produção (evita pinar HTTPS no localhost)', () => {
    const { res, headers } = fakeRes();
    createSecurityHeadersMiddleware(false)({} as Request, res, () => undefined);
    expect(headers['Strict-Transport-Security']).toBeUndefined();
  });

  it('seta HSTS em produção', () => {
    const { res, headers } = fakeRes();
    createSecurityHeadersMiddleware(true)({} as Request, res, () => undefined);
    expect(headers['Strict-Transport-Security']).toContain('max-age=63072000');
    expect(headers['Strict-Transport-Security']).toContain('includeSubDomains');
  });
});

import { toInternalPath } from './safe-internal-path';

/**
 * Open-redirect do gate da TV (`/cozinha/unlock?next=…`) fechado por construção.
 * A guarda antiga `/^\/(?!\/)/.test(rawNext)` bloqueava `//host` mas deixava
 * passar `/\host` (o parser WHATWG normaliza `\`→`/`). A correção exige que o
 * destino resolva na MESMA origin.
 */
describe('toInternalPath', () => {
  it('aceita path interno absoluto (destino de TV)', () => {
    expect(toInternalPath('/cozinha/tv')).toBe('/cozinha/tv');
    expect(toInternalPath('/bar/tv')).toBe('/bar/tv');
  });

  it('rejeita protocol-relative //host', () => {
    expect(toInternalPath('//evil.com')).toBeNull();
  });

  it('rejeita o bypass por backslash (a classe que o denylist deixava passar)', () => {
    expect(toInternalPath('/\\evil.com')).toBeNull();
    expect(toInternalPath('\\/evil.com')).toBeNull();
    expect(toInternalPath('/\\/evil.com')).toBeNull();
  });

  it('rejeita esquema absoluto e javascript:', () => {
    expect(toInternalPath('http://evil.com')).toBeNull();
    expect(toInternalPath('javascript:alert(1)')).toBeNull();
  });

  it('vazio / nulo → null', () => {
    expect(toInternalPath('')).toBeNull();
    expect(toInternalPath(null)).toBeNull();
    expect(toInternalPath(undefined)).toBeNull();
  });
});

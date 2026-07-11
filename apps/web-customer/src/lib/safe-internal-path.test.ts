import { toInternalPath } from './safe-internal-path';

/**
 * Open-redirect fechado POR CONSTRUÇÃO (não por denylist). O bug original: a
 * guarda `startsWith('/') && !startsWith('//')` bloqueava `//host` mas deixava
 * passar o bypass por backslash `/\host` (o parser WHATWG normaliza `\`→`/`, e
 * `new URL('/\host', origin)` vira `https://host/`). A correção resolve contra
 * uma base fixa e exige MESMA origin — a classe inteira fecha de uma vez.
 */
describe('toInternalPath', () => {
  it('aceita path interno absoluto', () => {
    expect(toInternalPath('/mesa/ABC')).toBe('/mesa/ABC');
    expect(toInternalPath('/cozinha/tv')).toBe('/cozinha/tv');
  });

  it('preserva query e hash internos', () => {
    expect(toInternalPath('/slug/assistente?next=1#x')).toBe('/slug/assistente?next=1#x');
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
    expect(toInternalPath('https://evil.com/x')).toBeNull();
    expect(toInternalPath('javascript:alert(1)')).toBeNull();
  });

  it('vazio / nulo / whitespace → null', () => {
    expect(toInternalPath('')).toBeNull();
    expect(toInternalPath(null)).toBeNull();
    expect(toInternalPath(undefined)).toBeNull();
    expect(toInternalPath('   ')).toBeNull();
  });
});

import { toInternalPath, toTenantInternalPath } from './safe-internal-path';

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

describe('toTenantInternalPath', () => {
  it('aceita somente paths internos do mesmo slug', () => {
    expect(toTenantInternalPath('/bistro/waiting-approval?x=1', 'bistro')).toBe(
      '/bistro/waiting-approval?x=1',
    );
    expect(toTenantInternalPath('/bistro', 'bistro')).toBe('/bistro');
    expect(toTenantInternalPath('/outro/waiting-approval', 'bistro')).toBeNull();
    expect(toTenantInternalPath('/bistro-mal/waiting-approval', 'bistro')).toBeNull();
  });

  it.each([
    '//evil.test/waiting-approval',
    '/\\evil.test/waiting-approval',
    'javascript:alert(document.domain)//waiting-approval',
    'https://evil.test/bistro/waiting-approval',
  ])('rejeita destino adversarial %s', (candidate) => {
    expect(toTenantInternalPath(candidate, 'bistro')).toBeNull();
  });

  it('rejeita slug malformado', () => {
    expect(toTenantInternalPath('/ok/home', '../ok')).toBeNull();
  });
});

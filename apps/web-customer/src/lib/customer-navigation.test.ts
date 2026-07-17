import { tenantNavigationDestination } from './customer-navigation';

describe('tenantNavigationDestination', () => {
  it('accepts tenant-relative and tenant-absolute destinations', () => {
    expect(tenantNavigationDestination('bistro', 'cardapio?from=home')).toBe(
      '/bistro/cardapio?from=home',
    );
    expect(tenantNavigationDestination('bistro', '/bistro/pedido#itens')).toBe(
      '/bistro/pedido#itens',
    );
  });

  it.each([
    '/outro/cardapio',
    '../outro/cardapio',
    'https://evil.example/roubo',
    'javascript:alert(document.domain)',
    '//evil.example/roubo',
    '/\\evil.example/roubo',
  ])('fails closed for cross-tenant or executable payload %s', (payload) => {
    expect(tenantNavigationDestination('bistro', payload)).toBe('/bistro');
  });

  it('fails closed when the slug itself is invalid', () => {
    expect(tenantNavigationDestination('../admin', 'cardapio')).toBe('/');
  });
});

import { resolveCustomerSocketUrl } from './customerSocket';

describe('customer socket URL', () => {
  it('usa same-origin quando não há endpoint público dedicado', () => {
    expect(resolveCustomerSocketUrl(undefined, 'http://192.168.1.20:3003')).toBe(
      'http://192.168.1.20:3003',
    );
    expect(resolveCustomerSocketUrl('   ', 'https://cliente.exemplo.com')).toBe(
      'https://cliente.exemplo.com',
    );
  });

  it('preserva endpoint explícito em deploy com API separada', () => {
    expect(
      resolveCustomerSocketUrl('https://realtime.exemplo.com', 'https://cliente.exemplo.com'),
    ).toBe('https://realtime.exemplo.com');
  });
});

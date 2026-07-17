import { PIX_INITIAL_LOAD_ERROR, resolvePixGate } from './pixLoadState';

describe('resolvePixGate', () => {
  it('bloqueia a demonstração quando paymentId não existe', () => {
    expect(resolvePixGate('', 'loading', false)).toBe('missing-payment');
    expect(resolvePixGate('   ', 'ready', true)).toBe('missing-payment');
  });

  it('não considera o Pix pronto antes de haver payment real', () => {
    expect(resolvePixGate('pay-1', 'loading', false)).toBe('loading');
    expect(resolvePixGate('pay-1', 'ready', false)).toBe('loading');
    expect(resolvePixGate('pay-1', 'ready', true)).toBe('ready');
  });

  it('expõe falha inicial com copy honesta de demonstração', () => {
    expect(resolvePixGate('pay-1', 'error', false)).toBe('load-error');
    expect(PIX_INITIAL_LOAD_ERROR).toMatch(/demonstração/i);
    expect(PIX_INITIAL_LOAD_ERROR).toMatch(/tente novamente/i);
  });
});

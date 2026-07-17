import { serviceFeeCopy } from './serviceFeeCopy';

describe('serviceFeeCopy', () => {
  it('uses the percentage supplied by the backend', () => {
    expect(serviceFeeCopy(12.5)).toBe('inclui taxa 12,5%');
  });

  it('does not invent a percentage while the backend value is unavailable', () => {
    expect(serviceFeeCopy(null)).toBe('taxa de serviço incluída');
  });

  it('describes a zero-fee tenant honestly', () => {
    expect(serviceFeeCopy(0)).toBe('sem taxa de serviço');
  });
});

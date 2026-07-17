import { readStaffId, resolveStaffSocketUrl } from './staffSocket';

describe('resolveStaffSocketUrl', () => {
  it('usa a origem do app e não exige a porta 3001 no iPhone/tablet', () => {
    expect(resolveStaffSocketUrl(undefined, 'https://192.168.1.44:3002')).toBe(
      'https://192.168.1.44:3002',
    );
  });

  it('preserva endpoint explícito em deploy com realtime separado', () => {
    expect(resolveStaffSocketUrl('https://ws.exemplo.com', 'https://staff.exemplo.com')).toBe(
      'https://ws.exemplo.com',
    );
  });
});

describe('readStaffId', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('le identidade persistida', () => {
    window.localStorage.setItem('staffId', '11111111-1111-4111-8111-111111111111');
    expect(readStaffId()).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('le identidade da sessao quando manter conectado esta desligado', () => {
    window.sessionStorage.setItem('staffId', '22222222-2222-4222-8222-222222222222');
    expect(readStaffId()).toBe('22222222-2222-4222-8222-222222222222');
  });
});

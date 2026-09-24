import { clearPersistedCustomerSession, readBundle } from './SessionProvider';

describe('SessionProvider cold rehydration', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('restaura sessão, customer e visit do bundle da aba', () => {
    window.sessionStorage.setItem(
      'session:bundle',
      JSON.stringify({
        sessionId: 'session-1',
        tableCode: 'M7',
        tableLabel: 'Mesa 7',
        slug: 'bistro',
        customerId: 'customer-1',
        visitId: 'visit-1',
        customerName: 'Bia',
        isReturning: true,
      }),
    );

    expect(readBundle()).toMatchObject({
      sessionId: 'session-1',
      customerId: 'customer-1',
      visitId: 'visit-1',
      slug: 'bistro',
    });
  });

  it('não trata cache incompleto como sessão válida', () => {
    window.sessionStorage.setItem('session:bundle', JSON.stringify({ customerId: 'customer-1' }));
    expect(readBundle()).toBeNull();
  });

  it('remove tudo que reidrataria PII ou consumo após exclusão LGPD', () => {
    window.sessionStorage.setItem(
      'session:bundle',
      JSON.stringify({
        sessionId: 'session-lgpd',
        tableCode: 'M7',
        tableLabel: 'Mesa 7',
        slug: 'bistro',
        customerId: 'customer-lgpd',
        visitId: 'visit-lgpd',
        customerName: 'Nome removido',
      }),
    );
    window.sessionStorage.setItem('session_token', 'opaque-token');
    window.sessionStorage.setItem('continuation:kind-hint', '{"kind":"pagou"}');
    window.sessionStorage.setItem('complaint:cache:old', '{"text":"dado pessoal"}');
    window.sessionStorage.setItem('table-merge:old', '{"originHostName":"Nome removido"}');
    window.sessionStorage.setItem('table-merge-command-choice:old', '1');
    window.localStorage.setItem('commandMode:session-lgpd', 'individual');
    window.localStorage.setItem('draft:session-lgpd', '[{"name":"item"}]');
    window.localStorage.setItem('draft:older-session', '[{"name":"item antigo"}]');
    window.localStorage.setItem('theme', 'system');

    clearPersistedCustomerSession();

    expect(readBundle()).toBeNull();
    expect(window.sessionStorage.getItem('session_token')).toBeNull();
    expect(window.sessionStorage.getItem('continuation:kind-hint')).toBeNull();
    expect(window.sessionStorage.getItem('complaint:cache:old')).toBeNull();
    expect(window.sessionStorage.getItem('table-merge:old')).toBeNull();
    expect(window.sessionStorage.getItem('table-merge-command-choice:old')).toBeNull();
    expect(window.localStorage.getItem('commandMode:session-lgpd')).toBeNull();
    expect(window.localStorage.getItem('draft:session-lgpd')).toBeNull();
    expect(window.localStorage.getItem('draft:older-session')).toBeNull();
    expect(window.localStorage.getItem('theme')).toBe('system');
  });
});

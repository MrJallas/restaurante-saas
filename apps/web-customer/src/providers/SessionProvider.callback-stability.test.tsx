import { act, useContext } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SessionContext, SessionProvider, type SessionContextValue } from './SessionProvider';

describe('SessionProvider callback stability', () => {
  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  let container: HTMLDivElement;
  let root: Root;
  let current: SessionContextValue | null;

  beforeAll(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(async () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    current = null;

    function Probe() {
      current = useContext(SessionContext);
      return null;
    }

    await act(async () => {
      root.render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('mantém clearSession estável quando o bootstrap grava a nova sessão', async () => {
    expect(current).not.toBeNull();
    const clearBeforeBootstrap = current!.clearSession;

    await act(async () => {
      current!.setSession({
        sessionId: 'session-from-valid-qr',
        tableCode: 'QRTEST91',
        tableLabel: 'Mesa QR 91',
        slug: 'restaurant_dev',
      });
    });

    expect(current!.sessionId).toBe('session-from-valid-qr');
    expect(current!.clearSession).toBe(clearBeforeBootstrap);

    await act(async () => current!.clearSession());

    expect(current!.sessionId).toBeNull();
    expect(window.sessionStorage.getItem('session:bundle')).toBeNull();
  });
});

import { ApiRequestError } from './api';
import {
  hasFreshQrBootstrapCredentials,
  qrUrlWithoutBootstrapSecrets,
  shouldExitPendingQrApproval,
  shouldRebootstrapQrSession,
  stripQrBootstrapSecretsFromHistory,
} from './qr-session-recovery';

describe('shouldRebootstrapQrSession', () => {
  it('restarts the physical QR bootstrap when a rehydrated token was closed', () => {
    expect(
      shouldRebootstrapQrSession(
        new ApiRequestError(401, 'Sessão encerrada.', {
          message: 'Sessão encerrada.',
          statusCode: 401,
          code: 'AUTH_INVALID',
        }),
      ),
    ).toBe(true);
  });

  it('does not turn transport or server failures into a new QR session', () => {
    expect(shouldRebootstrapQrSession(new ApiRequestError(500, 'Falha interna.'))).toBe(false);
    expect(shouldRebootstrapQrSession(new Error('offline'))).toBe(false);
  });
});

describe('shouldExitPendingQrApproval', () => {
  it.each([401, 404])('encerra a espera quando o backend devolve %s', (statusCode) => {
    expect(shouldExitPendingQrApproval(new ApiRequestError(statusCode, 'Sessão encerrada.'))).toBe(
      true,
    );
  });

  it('não transforma falha transitória em rejeição do cliente', () => {
    expect(shouldExitPendingQrApproval(new ApiRequestError(500, 'Falha temporária.'))).toBe(false);
    expect(shouldExitPendingQrApproval(new Error('offline'))).toBe(false);
  });
});

describe('hasFreshQrBootstrapCredentials', () => {
  it('reconhece um scan físico fresco (hmac + ts na URL)', () => {
    expect(hasFreshQrBootstrapCredentials('?hmac=secret&ts=123')).toBe(true);
    expect(hasFreshQrBootstrapCredentials('?hmac=secret&ts=123&accessToken=daily')).toBe(true);
  });

  it('não trata URL sem credenciais completas como scan fresco', () => {
    expect(hasFreshQrBootstrapCredentials('')).toBe(false);
    expect(hasFreshQrBootstrapCredentials('?campaign=mesa')).toBe(false);
    expect(hasFreshQrBootstrapCredentials('?hmac=secret')).toBe(false);
    expect(hasFreshQrBootstrapCredentials('?ts=123')).toBe(false);
    expect(hasFreshQrBootstrapCredentials('?hmac=&ts=123')).toBe(false);
    expect(hasFreshQrBootstrapCredentials('?hmac=%20&ts=123')).toBe(false);
  });
});

describe('QR bootstrap URL hygiene', () => {
  it('remove credenciais do QR e preserva outros parâmetros e hash', () => {
    expect(
      qrUrlWithoutBootstrapSecrets(
        'https://customer.test/restaurante/mesa/M1?hmac=secret&campaign=mesa&ts=123&accessToken=daily#top',
      ),
    ).toBe('/restaurante/mesa/M1?campaign=mesa#top');
  });

  it('substitui a entrada atual sem apagar o state do histórico', () => {
    window.history.pushState(
      { source: 'physical-qr' },
      '',
      '/restaurant_dev/mesa/QRTEST92?hmac=secret&ts=123&accessToken=daily',
    );
    const historyLength = window.history.length;

    expect(stripQrBootstrapSecretsFromHistory()).toBe(true);

    expect(window.location.pathname).toBe('/restaurant_dev/mesa/QRTEST92');
    expect(window.location.search).toBe('');
    expect(window.history.state).toEqual({ source: 'physical-qr' });
    expect(window.history.length).toBe(historyLength);
    expect(stripQrBootstrapSecretsFromHistory()).toBe(false);
  });
});

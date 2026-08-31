import {
  approvalSecondsLeft,
  approvalUiState,
  mergeApprovalUiState,
  participantGateDestination,
  participantGateRecoveryDestination,
  parseWaitingMode,
} from './waiting-approval-state';

describe('waiting approval usa lifecycle autoritativo', () => {
  it.each([
    ['pending', 'waiting'],
    ['approved', 'approved'],
    ['rejected', 'rejected'],
    ['timeout', 'expired'],
    ['expired', 'expired'],
    ['cancelled', 'cancelled'],
  ] as const)('mapeia %s para %s', (status, expected) => {
    expect(approvalUiState(status)).toBe(expected);
  });

  it('não inventa 60 s quando o servidor não devolveu prazo válido', () => {
    expect(approvalSecondsLeft(null)).toBeNull();
    expect(approvalSecondsLeft('não-é-data')).toBeNull();
  });

  it('nunca deixa countdown negativo depois do TTL', () => {
    expect(
      approvalSecondsLeft('2026-07-11T12:00:00.000Z', Date.parse('2026-07-11T12:00:01Z')),
    ).toBe(0);
  });

  it('query mode desconhecida cai no fluxo seguro de late-arrival', () => {
    expect(parseWaitingMode('javascript:merge-origin')).toBe('late-arrival');
    expect(parseWaitingMode('merge-target')).toBe('merge-target');
  });

  it('snapshot pending atrasado não regride decisão terminal recebida por WS', () => {
    expect(mergeApprovalUiState('approved', 'waiting')).toBe('approved');
    expect(mergeApprovalUiState('rejected', 'waiting')).toBe('rejected');
    expect(mergeApprovalUiState('checking', 'waiting')).toBe('waiting');
  });

  it.each([
    ['approved', 'home'],
    ['pending', 'pending_approval'],
    ['rejected', 'error'],
    ['unavailable', 'error'],
  ] as const)('gate de participante %s leva a %s', (status, expected) => {
    expect(participantGateDestination(status)).toBe(expected);
  });

  it.each([
    ['rejected', 'rebootstrap'],
    ['unavailable', 'rebootstrap'],
  ] as const)(
    'gate %s com QR fresco na URL descarta o bundle e re-bootstrapa',
    (status, expected) => {
      expect(participantGateRecoveryDestination(status, true)).toBe(expected);
    },
  );

  it.each([
    ['rejected', 'error'],
    ['unavailable', 'error'],
  ] as const)('gate %s sem QR fresco permanece na tela de erro', (status, expected) => {
    expect(participantGateRecoveryDestination(status, false)).toBe(expected);
  });

  it('QR fresco nunca pula a espera nem inventa aprovação', () => {
    expect(participantGateRecoveryDestination('approved', true)).toBe('home');
    expect(participantGateRecoveryDestination('pending', true)).toBe('pending_approval');
    expect(participantGateRecoveryDestination('approved', false)).toBe('home');
    expect(participantGateRecoveryDestination('pending', false)).toBe('pending_approval');
  });
});

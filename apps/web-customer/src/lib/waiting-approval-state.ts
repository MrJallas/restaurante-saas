import type { LateArrivalStatus, TableMergeStatus } from '@restaurant/shared-types';

export type ApprovalServerStatus = LateArrivalStatus | TableMergeStatus;
export type ParticipantGateStatus = 'approved' | 'pending' | 'rejected' | 'unavailable';
export type ParticipantGateDestination = 'home' | 'pending_approval' | 'error';
export type ApprovalUiState =
  | 'checking'
  | 'waiting'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'unavailable';

/**
 * O acesso à mesa é fail-closed: somente um `approved` autoritativo libera a
 * home. Participante ausente e falha de transporte são ambos `unavailable`,
 * nunca equivalem a aprovado.
 */
export function participantGateDestination(
  status: ParticipantGateStatus,
): ParticipantGateDestination {
  if (status === 'approved') return 'home';
  if (status === 'pending') return 'pending_approval';
  return 'error';
}

/** Mapeamento único do lifecycle persistido para o estado visível. */
export function approvalUiState(status: ApprovalServerStatus): ApprovalUiState {
  switch (status) {
    case 'pending':
      return 'waiting';
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'timeout':
    case 'expired':
      return 'expired';
    case 'cancelled':
      return 'cancelled';
  }
}

/**
 * Respostas REST podem chegar fora de ordem em relação ao WS. Um snapshot
 * pending iniciado antes da decisão nunca pode regredir um terminal que já
 * foi confirmado pelo servidor.
 */
export function mergeApprovalUiState(
  current: ApprovalUiState,
  incoming: ApprovalUiState,
): ApprovalUiState {
  const terminal = ['approved', 'rejected', 'expired', 'cancelled'] as const;
  if (terminal.includes(current as (typeof terminal)[number]) && incoming === 'waiting') {
    return current;
  }
  return incoming;
}

/** Countdown só existe para um prazo ISO válido devolvido pelo servidor. */
export function approvalSecondsLeft(expiresAt: string | null, now = Date.now()): number | null {
  if (!expiresAt) return null;
  const deadline = new Date(expiresAt).getTime();
  if (!Number.isFinite(deadline)) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function parseWaitingMode(
  value: string | null,
): 'late-arrival' | 'merge-target' | 'merge-origin' {
  if (value === 'merge-target' || value === 'merge-origin') return value;
  return 'late-arrival';
}

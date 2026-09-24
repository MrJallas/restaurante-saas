import type { TableMergeStatus } from '@restaurant/shared-types';

/**
 * Lifecycle persistido que esta tela sabe traduzir. Hoje só o merge tem um
 * recurso REST próprio pra acompanhar; o modo `late-arrival` é dirigido pelo
 * System A (participants) via wrapper, com o seu próprio
 * `ParticipantGateStatus` abaixo.
 */
export type ApprovalServerStatus = TableMergeStatus;
/**
 * `rejected` (o HOST recusou) e `cancelled` (o próprio cliente desistiu) são
 * estados distintos desde a migration 080. Os dois são fail-closed no gate —
 * nenhum libera a mesa — mas a mensagem terminal não pode ser a mesma: acusar
 * de "o host não autorizou" quem apertou "Cancelar pedido" foi exatamente o bug
 * reproduzido em iPhone real.
 */
export type ParticipantGateStatus =
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'cancelled'
  | 'unavailable';
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

/**
 * Por que o gate parou no `error`. O destino já é fail-closed; isto só escolhe
 * o que o cliente lê e se faz sentido oferecer "escaneie o QR de novo".
 *  - `host_rejected`  → o host recusou. Re-escanear não adianta enquanto a
 *    sessão viver (o backend rebarra), mas outra mesa/o garçom resolve.
 *  - `self_cancelled` → o próprio cliente desistiu. Escanear de novo funciona:
 *    o backend cria um pedido de entrada novo e o host recebe.
 *  - `unavailable`    → não sabemos (transporte caiu, participante ausente).
 *    Não afirma nada sobre a decisão do host nem manda re-escanear.
 */
export type ParticipantGateErrorReason = 'host_rejected' | 'self_cancelled' | 'unavailable';

export function participantGateErrorReason(
  status: ParticipantGateStatus,
): ParticipantGateErrorReason {
  if (status === 'rejected') return 'host_rejected';
  if (status === 'cancelled') return 'self_cancelled';
  return 'unavailable';
}

export type ParticipantGateRecovery = ParticipantGateDestination | 'rebootstrap';

/**
 * Variante do gate para o bundle reidratado do sessionStorage. Rejeição e
 * indisponibilidade continuam fail-closed (nunca viram home), mas quando a URL
 * ainda carrega credenciais frescas de um scan físico, o beco é falso: o bundle
 * é só cache — descartá-lo e re-bootstrapar deixa o servidor decidir de novo
 * (mesa livre → primeiro participante; ocupada → novo join request; rejeição
 * ainda vigente → o próprio init re-exibe o erro autoritativo).
 */
export function participantGateRecoveryDestination(
  status: ParticipantGateStatus,
  hasFreshQrCredentials: boolean,
): ParticipantGateRecovery {
  const destination = participantGateDestination(status);
  if (destination === 'error' && hasFreshQrCredentials) return 'rebootstrap';
  return destination;
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

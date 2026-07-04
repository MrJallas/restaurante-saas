import type { TimelineKind } from '@restaurant/shared-types';

/**
 * Enum FECHADO do 1º corte da timeline. A ORDEM do array é canônica: é a
 * prioridade de desempate do sort quando dois entries têm o mesmo `at`
 * (causalidade: sessão abre antes de tudo, pagamento/fechamento por último).
 *
 * O VALOR vive aqui (não no shared-types) porque o package é consumido como
 * source .ts e import de valor dele quebra o runtime ts-node CJS do
 * container (boot do M4, 2026-07-04). Os guards abaixo fazem o tsc acusar
 * qualquer divergência com o type do shared-types nos DOIS sentidos.
 */
export const TIMELINE_KINDS = [
  'session.opened',
  'participant.joined',
  'participant.approved',
  'late_arrival.requested',
  'late_arrival.approved',
  'late_arrival.rejected',
  'merge.requested',
  'merge.approved',
  'merge.rejected',
  'waiter.called',
  'waiter.acknowledged',
  'order.created',
  'order.status_changed',
  'delivery.called',
  'delivery.claimed',
  'delivery.delivered',
  'courtesy.created',
  'complaint.received',
  'complaint.resolved',
  'session.flag_changed',
  'payment.confirmed',
  'session.closed',
] as const satisfies readonly TimelineKind[];

// Completude: se um TimelineKind novo nascer no shared-types e não entrar
// aqui, esta linha para de compilar.
type MissingKinds = Exclude<TimelineKind, (typeof TIMELINE_KINDS)[number]>;
const _allKindsCovered: MissingKinds extends never ? true : never = true;
void _allKindsCovered;

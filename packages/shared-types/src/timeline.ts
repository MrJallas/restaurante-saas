// === Session timeline (fatia M1 — contrato) ===
// Entrada canônica da timeline de sessão (decisão Caleb 2026-07-04:
// event-store Mongo; M1 é contrato + mappers, agnóstico ao store). Cada
// entry nasce de uma row SQL (mappers puros em
// apps/api/src/modules/session-timeline/) ou, no futuro (M2+), de um WS
// event dobrado no store. O `id` é derivado da fonte — reprocessar a mesma
// row SEMPRE produz o mesmo id (idempotência no upsert do store).

export type TimelineActorType = 'staff' | 'customer' | 'system';

/**
 * Quem praticou o ATO. Colunas legacy (`changed_by`, `closed_by`,
 * `created_by`) são VARCHAR misturando UUID de staff, 'system', 'customer'
 * e labels compostos ('scan_verification:rejected', 'system:ttl-4h') — o
 * mapper traduz pra este shape e preserva o label cru em `payload.reason`
 * quando não há UUID. `name` só vem preenchido quando o caller já resolveu
 * o nome (join feito FORA do mapper puro).
 */
export interface TimelineActor {
  type: TimelineActorType;
  id: string | null;
  name: string | null;
}

/**
 * Enum FECHADO do 1º corte (famílias mapeadas). A ORDEM do array é
 * canônica: é a prioridade de desempate do sort quando dois entries têm o
 * mesmo `at` (causalidade: sessão abre antes de tudo, pagamento/fechamento
 * por último).
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
] as const;

export type TimelineKind = (typeof TIMELINE_KINDS)[number];

/** Ponteiros pros agregados de origem (todos opcionais — depende do kind). */
export interface TimelineRefs {
  orderId?: string;
  paymentId?: string;
  callId?: string;
  requestId?: string;
  deliveryId?: string;
}

export interface TimelineEntry {
  /**
   * "<fonte>:<pk>" — estável/idempotente (ex.: "osh:8f3a…", "pay:…",
   * "wcall:…"). Fontes multi-fase sufixam a fase: "odel:<pk>:claimed".
   */
  id: string;
  kind: TimelineKind;
  /** ISO timestamp do ATO (não do insert, quando a fonte distingue). */
  at: string;
  /** tableSessionId dono da timeline. */
  sessionId: string;
  actor: TimelineActor;
  refs: TimelineRefs;
  /**
   * Dados específicos do kind (fromStatus/toStatus, totalCents,
   * otherTableNumber…). `reason` carrega o label legacy cru quando o actor
   * não era um UUID.
   */
  payload: Record<string, unknown>;
}

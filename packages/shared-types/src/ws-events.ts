// === WebSocket events ===
// Typed discriminated union for the gateway. B2 emits these; FE (C1-C5) and
// staff app subscribe. Every variant has a typed `payload` keyed by the
// `event` literal.

import type { LateArrivalStatus } from './customer-host';
import type { TableMergeStatus, MergeCooldownReason } from './customer-host';
import type { ComplaintChipAction, ComplaintProblemType } from './complaint';
import type { SessionFlag } from './vip';
import type { StaffMessageDto } from './staff-message';
import type { LgpdRequestKind } from './lgpd';
import type { ScanVerificationStatus } from './scan-verification';
import type { CustomerCourtesyDto } from './courtesy';

// ─── Escalation generic events (for qr-issue cascade and others) ───

export interface WsEscalationCreated {
  event: 'escalation.created';
  payload: {
    escalationId: string;
    /**
     * Domain that triggered the escalation. `complaint` covers manager-to-
     * manager forwards (P1 #29) where the complaint climbs the chain because
     * the original assignee couldn't or wouldn't resolve it.
     */
    type: 'late_arrival' | 'table_merge' | 'qr_issue' | 'complaint' | 'scan_verification';
    tenantId: string;
    /** Free-form context payload (kind-specific). */
    context: Record<string, unknown>;
    /** Deadline for the current step. */
    deadline: string;
  };
}

export interface WsEscalationAdvanced {
  event: 'escalation.advanced';
  payload: {
    escalationId: string;
    fromStep: number;
    toStep: number;
    /** ISO datetime of the new deadline. */
    deadline: string;
  };
}

export interface WsEscalationCompleted {
  event: 'escalation.completed';
  payload: {
    escalationId: string;
    outcome: 'approved' | 'rejected' | 'timeout' | 'cancelled';
    /** Discriminated id: 'customer:<uuid>' | 'staff:<uuid>'. */
    resolvedBy: string | null;
  };
}

// ─── Late-arrival ───

export interface WsLateArrivalCreated {
  event: 'late_arrival.created';
  payload: {
    requestId: string;
    tableSessionId: string;
    tableNumber: number;
    requesterCustomerId: string;
    requesterName: string;
    visitContext?: string;
    expiresAt: string;
    /** M2 (timeline): timestamp do ato (row created_at). */
    occurredAt?: string;
  };
}

export interface WsLateArrivalApproved {
  event: 'late_arrival.approved';
  payload: {
    requestId: string;
    tableSessionId: string;
    tableNumber: number;
    requesterCustomerId: string;
    requesterName: string;
    /** New party size after the approval. */
    partySize: number;
    /** M2 (timeline): timestamp do ato (decided_at). */
    occurredAt?: string;
    /** M2 (timeline): host que aprovou — null quando staff decidiu. */
    decidedByCustomerId?: string | null;
  };
}

export interface WsLateArrivalRejected {
  event: 'late_arrival.rejected';
  payload: {
    requestId: string;
    tableSessionId: string;
    requesterCustomerId: string;
    /** Why: host_rejected | host_timeout | walkin_no_host. */
    reason: 'host_rejected' | 'host_timeout' | 'walkin_no_host';
    /** M2 (timeline): timestamp do ato (decided_at). */
    occurredAt?: string;
    /** M2 (timeline): host que rejeitou — null quando staff decidiu. */
    decidedByCustomerId?: string | null;
    /** M2 (timeline): número da mesa — só presente quando o caller tem o valor real. */
    tableNumber?: number;
  };
}

export interface WsLateArrivalExpired {
  event: 'late_arrival.expired';
  payload: {
    requestId: string;
    tableSessionId: string;
    /** M2 (timeline): timestamp do ato (decided_at do sweep). */
    occurredAt?: string;
  };
}

// ─── Scan verification ───

export interface WsScanVerificationCreated {
  event: 'scan_verification.created';
  payload: {
    requestId: string;
    tableSessionId: string;
    tableId: string;
    tableCode: string;
    tableNumber: number;
    requesterCustomerId: string;
    requesterName: string;
    cpfMasked: string | null;
    locationStatus: string;
    expiresAt: string;
  };
}

export interface WsScanVerificationEscalated {
  event: 'scan_verification.escalated';
  payload: {
    requestId: string;
    tableSessionId: string;
    escalationId: string;
    fromStep: number;
    toStep: number;
    assigneeRole: 'host' | 'manager' | 'waiter';
    expiresAt: string;
  };
}

export interface WsScanVerificationResolved {
  event: 'scan_verification.resolved';
  payload: {
    requestId: string;
    tableSessionId: string;
    requesterCustomerId: string;
    status: ScanVerificationStatus;
    decidedAt: string;
    decidedByStaffId: string | null;
    reason?: string | null;
  };
}

// ─── Table merge ───

export interface WsTableMergeCreated {
  event: 'table_merge.created';
  payload: {
    requestId: string;
    originSessionId: string;
    targetSessionId: string;
    originTableNumber: number;
    targetTableNumber: number;
    originHostName: string | null;
    targetHostName: string | null;
    originPartySize: number;
    targetPartySize: number;
    expiresAt: string;
    /** M2 (timeline): timestamp de criação do request (row created_at). */
    createdAt?: string;
  };
}

export interface WsTableMergeLifecycleDetails {
  originSessionId?: string;
  targetSessionId?: string;
  originTableNumber?: number;
  targetTableNumber?: number;
  originHostName?: string | null;
  targetHostName?: string | null;
  originPartySize?: number;
  targetPartySize?: number;
  expiresAt?: string;
}

export interface WsTableMergeApproved {
  event: 'table_merge.approved';
  payload: {
    requestId: string;
    /** Both sides approved — emitted once per session involved. */
    side: 'a' | 'b' | 'both';
    status: TableMergeStatus;
    mergeId?: string;
    /** M2 (timeline): timestamp do ato (decided_at / now() do lado que agiu). */
    decidedAt?: string;
    /** M2 (timeline): host que decidiu — validado server-side; null em staff override. */
    decidedByCustomerId?: string | null;
  } & WsTableMergeLifecycleDetails;
}

export interface WsTableMergeRejected {
  event: 'table_merge.rejected';
  payload: {
    requestId: string;
    /** Which side rejected ('timeout' on auto-expiration). */
    rejectedBy: 'a' | 'b' | 'timeout';
    /** M2 (timeline): timestamp do ato (decided_at / now()). */
    decidedAt?: string;
    /** M2 (timeline): host que rejeitou — ausente no timeout. */
    decidedByCustomerId?: string | null;
  } & WsTableMergeLifecycleDetails;
}

export interface WsMergeCooldownStarted {
  event: 'merge.cooldown_started';
  payload: {
    cooldownId: string;
    tenantId: string;
    originTable: number;
    targetTable: number;
    reason: MergeCooldownReason;
    expiresAt: string;
    cooldownEndsAt?: string;
    retryAfterSeconds?: number;
  } & WsTableMergeLifecycleDetails;
}

export interface WsMergeCooldownExpired {
  event: 'merge.cooldown_expired';
  payload: {
    cooldownId: string;
    originTable: number;
    targetTable: number;
  };
}

// ─── LGPD ───

export interface WsLgpdRequestFulfilled {
  event: 'lgpd.request_fulfilled';
  payload: {
    requestId: string;
    customerId: string;
    type: LgpdRequestKind;
    protocolNumber: string;
    fulfilledAt: string;
  };
}

// ─── Complaint ───

/**
 * P1 #33 — WS event naming canonicalised to `complaint.received` (was
 * `complaint.created`). The spec is the contract: the manager's inbox
 * "receives" a complaint, it doesn't "create" one — the customer creates
 * it. Aligning the wire name with the spec removes the drift the
 * consolidated QA report flagged. There is no migration period: every
 * server emit and every FE listener was renamed in the same change.
 */
export interface WsComplaintReceived {
  event: 'complaint.received';
  payload: {
    complaintId: string;
    tableSessionId: string;
    tableNumber: number;
    customerId: string;
    customerName: string;
    problemType: ComplaintProblemType;
    rating: number | null;
    description: string;
    createdAt: string;
  };
}

export interface WsComplaintResponded {
  event: 'complaint.responded';
  payload: {
    complaintId: string;
    messageId: string;
    /** Manager's response prose. */
    content: string;
    chipAction?: ComplaintChipAction;
    /** Display name for the eyebrow (e.g. "Renata"). */
    staffName: string;
    /** Full message DTO when available. Optional to keep the wire small. */
    message?: StaffMessageDto;
  };
}

export interface WsComplaintRead {
  event: 'complaint.read';
  payload: {
    complaintId: string;
    readAt: string;
  };
}

export interface WsComplaintResolved {
  event: 'complaint.resolved';
  payload: {
    complaintId: string;
    resolvedAt: string;
    resolvedBy: string;
  };
}

// ─── Staff messages ───

export interface WsStaffMessageReceived {
  event: 'staff_message.received';
  payload: {
    message: StaffMessageDto;
  };
}

/**
 * Read-receipt for a previously delivered `staff_message`. Mirrors the
 * `complaint.read` shape so the staff app can update its inbox UI when the
 * counterpart marks a message as read.
 */
export interface WsStaffMessageRead {
  event: 'staff_message.read';
  payload: {
    messageId: string;
    threadId: string;
    readAt: string;
    /** Staff id of the reader. */
    by: string;
  };
}

/**
 * Customer replied to a staff thread via the in-app inbox (`POST
 * /customer-staff-messages/threads/:threadId/messages`) OR via the AI
 * dispatch of `send_message_to_manager` (round 22).
 *
 * Routed to BOTH `session:<tableSessionId>` (customer's own UI in
 * parallel tabs/devices) AND `tenant:<slug>` (manager inbox badge).
 */
export interface WsStaffMessagesCustomerReplied {
  event: 'staff_messages.customer_replied';
  payload: {
    threadId: string;
    messageId: string;
    tableSessionId: string;
    customerId: string;
    content: string;
    createdAt: string;
  };
}

// ─── Courtesy arrival ───

export interface WsCourtesyCreated {
  event: 'courtesy.created';
  payload: CustomerCourtesyDto;
}

export interface WsCourtesyUpdated {
  event: 'courtesy.updated';
  payload: CustomerCourtesyDto;
}

// ─── Payments ───

/**
 * M3 (timeline): pagamento transicionou pra 'confirmed' (paid_at gravado).
 * Antes o pagamento não emitia NADA — este é o primeiro evento WS da
 * família. Payload alinhado ao TimelineEntry kind 'payment.confirmed' (M1):
 * refs.paymentId + sessionId + payload financeiro. Emitido APÓS o UPDATE
 * commitar — emissão nunca segura/aborta o pagamento.
 */
export interface WsPaymentConfirmed {
  event: 'payment.confirmed';
  payload: {
    paymentId: string;
    tableSessionId: string;
    amountCents: number;
    /** pix | card | cash | credit | debit — ausente se a row legacy não tiver. */
    method?: string;
    /** equal | by_item | custom — só em pagamento de conta dividida. */
    splitMode?: string;
    /** Comanda individual paga — ausente em pagamento de mesa. */
    visitId?: string | null;
    /**
     * payments NÃO tem customer_id (só visit_id) — este campo só vem
     * preenchido quando um caller futuro (webhook PSP / confirm de staff)
     * resolver o customer server-side. Nunca derivado de input do client.
     */
    customerId?: string | null;
    /** ISO do ATO — paid_at gravado no UPDATE (fallback now()). */
    confirmedAt: string;
    /** ISO da emissão (padrão da família). */
    timestamp: string;
  };
}

// ─── Waiter calls / order handoff ───

export interface WsOrderReady {
  event: 'order:ready';
  payload: {
    orderId: string;
    tableLabel: string;
    timestamp: string;
  };
}

/** Transição de status emitida pros rooms waiter/kitchen do tenant. */
export interface WsOrderStatus {
  event: 'order:status';
  payload: {
    orderId: string;
    status: string;
    tableLabel?: string | null;
    timestamp: string;
    /** M2 (timeline): sessão dona do pedido — correlação pro event-store. */
    tableSessionId?: string;
    /**
     * M2 (timeline): ator da transição, derivado SEMPRE de identidade
     * server-side (staff autenticado / session guard) — nunca de input do
     * client. `id` fica null quando o ator é uma estação compartilhada
     * (TV x-staff-key) ou um customer sem id resolvido.
     */
    changedBy?: { type: 'staff' | 'customer'; id: string | null };
    /** M2 (timeline): staff que confirmou a entrega (só no 'delivered'). */
    deliveredBy?: string;
    /**
     * FIX convergência de id (2026-07-04): pk natural da row de
     * order_status_history inserida NESTA transição. Quando presente, o tap
     * (M4) usa `osh:<historyId>` — CONVERGE com o id do backfill (M5), então
     * live e backfill upsertam no MESMO doc (sem duplicata). Ausente no
     * caminho KDS mark-ready (emite sem inserir osh) → tap cai no fallback
     * `ws:*`, que não tem competidor no backfill.
     */
    historyId?: string;
  };
}

/** Garçom reivindicou a entrega ("Estou levando") — remove das outras telas. */
export interface WsOrderClaimed {
  event: 'order:claimed';
  payload: {
    orderId: string;
    claimedBy: string;
    timestamp: string;
    /** M2 (timeline): sessão dona do pedido. */
    tableSessionId?: string;
    /** M2 (timeline): label da mesa (ex.: "Mesa 3"). */
    tableLabel?: string;
    /**
     * FIX convergência de id (2026-07-04): pk natural da row de
     * order_deliveries reivindicada. Quando presente, o tap (M4) usa
     * `odel:<deliveryId>:claimed` — CONVERGE com o id do backfill (M5).
     * Ausente → tap cai no fallback `ws:order:claimed:<orderId>:<claimedBy>`.
     */
    deliveryId?: string;
  };
}

export interface WsWaiterCall {
  event: 'waiter:call';
  payload: {
    callId: string;
    tableLabel: string;
    tableCode: string;
    reason?: string;
    timestamp: string;
    /** M2 (timeline): sessão que abriu o chamado. */
    tableSessionId?: string;
    /** M2 (timeline): customer resolvido server-side (cookie) — null se anônimo. */
    customerId?: string | null;
  };
}

export interface WsWaiterAcknowledged {
  event: 'waiter:acknowledged';
  payload: {
    callId: string;
    timestamp: string;
    /** M2 (timeline): sessão do chamado. */
    tableSessionId?: string;
    /** M2 (timeline): staff autenticado que atendeu (nome efetivo do banco). */
    acknowledgedBy?: { id: string; name: string | null };
    /** M2 (timeline): ETA prometida — antes só ia pro response REST. */
    etaMinutes?: number | null;
  };
}

export interface WsWaiterResolved {
  event: 'waiter:resolved';
  payload: {
    callId: string;
    timestamp: string;
    /** Sessão do chamado — destrava a sheet do cliente em realtime. */
    tableSessionId?: string;
  };
}

export interface WsOrderHandoffCalled {
  event: 'order:handoff_called';
  payload: {
    orderId: string;
    deliveryId: string;
    tableLabel: string;
    tableCode: string;
    /** Nome da zona da mesa (Varanda, Salão Principal…) — null se a mesa não tem zona. */
    zoneName?: string | null;
    targetWaiterId: string | null;
    targetWaiterName?: string | null;
    timestamp: string;
    /** M2 (timeline): sessão dona do pedido. */
    tableSessionId?: string;
    /** M2 (timeline): staff que chamou — null quando foi a estação (TV sem x-staff-id). */
    calledBy?: string | null;
  };
}

export interface WsKitchenPriorityRequest {
  event: 'kitchen:priority_request';
  payload: {
    requestId: string;
    orderIds: string[];
    reason?: string | null;
    requestedBy?: string | null;
    timestamp: string;
  };
}

export interface WsKitchenPriorityResponse {
  event: 'kitchen:priority_response';
  payload: {
    requestId: string;
    orderIds: string[];
    status: 'accepted' | 'next';
    protectedOrderIds?: string[];
    respondedBy?: string | null;
    timestamp: string;
  };
}

// ─── Zone pause ───

export interface WsZonePauseStarted {
  event: 'zone_pause.started';
  payload: {
    id: string;
    waiterId: string;
    waiterName: string;
    endsAt: string;
    startedBy: string;
    reason: string | null;
  };
}

export interface WsZonePauseEnded {
  event: 'zone_pause.ended';
  payload: {
    id: string;
    waiterId: string;
    endedAt: string;
    endedBy: string | null;
    autoExpired: boolean;
  };
}

// ─── Session flag (VIP / allergy) ───

export interface WsSessionFlagChanged {
  event: 'session.flag_changed';
  payload: {
    sessionId: string;
    tableNumber: number;
    flags: SessionFlag[];
    by: {
      staffId: string;
      name: string;
    };
  };
}

// ─── Host module (recepcionista) ───
//
// Eventos emitidos pelo modulo `host` (apps/api/src/modules/host). Foco em
// operacoes de "gestao do salao": liberar mesa, swap entre mesas, flag de
// VIP via menu da mesa. Sao consumidos pelos hooks `useHostEvents` (host) e
// `useWaiterEvents` (garcom) — staff dashboards subscrevem via room
// `tenant:<slug>`.

/**
 * Mesa foi liberada pelo host (close da `table_session`).
 *
 * Modos:
 *  - `auto`         : sessao fechou normal (ex.: pagamento confirmado)
 *  - `manual_paid`  : recepcionista forcou close apos confirmar pagamento
 *  - `manual_force` : recepcionista forcou close mesmo sem pagar (motivo
 *                     livre — comp, no-show, mesa abandonada, etc).
 */
/** Cliente pediu a RECEPÇÃO na mesa (assistente · junção de mesas etc.). */
export interface WsHostAssistRequested {
  event: 'host.assist_requested';
  payload: {
    tableLabel: string | null;
    tableCode: string | null;
    tableSessionId: string;
    reason?: string | null;
    timestamp: string;
  };
}

export interface WsHostTableLiberated {
  event: 'host.table_liberated';
  payload: {
    tableId: string;
    tableNumber: number;
    sessionId: string;
    mode: 'auto' | 'manual_paid' | 'manual_force';
    by: {
      staffId: string | null;
      name?: string;
    };
    reason?: string | null;
    liberatedAt: string;
  };
}

/**
 * Pedido de swap criado (mover sessao da mesa A pra mesa B). Emite assim
 * que o host abre o request — antes de in_progress / completed.
 */
export interface WsHostSwapRequested {
  event: 'host.swap_requested';
  payload: {
    swapId: string;
    sessionId: string;
    fromTableId: string;
    fromTableNumber: number;
    toTableId: string;
    toTableNumber: number;
    requestedBy: string | null;
    createdAt: string;
  };
}

/**
 * Estado do swap mudou (in_progress | completed | cancelled). Estados
 * intermediarios entre o create e o completed final ficam aqui pra UIs que
 * pre-visualizam "trocando agora..." ou "cancelado".
 */
export interface WsHostSwapStateChanged {
  event: 'host.swap_state_changed';
  payload: {
    swapId: string;
    sessionId: string;
    fromTableNumber: number;
    toTableNumber: number;
    status: 'in_progress' | 'completed' | 'cancelled';
    /** ISO timestamp da transicao. */
    at: string;
    reason?: string | null;
  };
}

/**
 * VIP flag toggled via TableMenu da recepcionista. Diferente do WS event
 * `session.flag_changed` (vip-customer.md): este foca apenas em VIP e e
 * emitido pelo modulo host. O FE pode subscrever em ambos.
 */
export interface WsHostVipFlagged {
  event: 'host.vip_flagged';
  payload: {
    sessionId: string;
    tableId: string;
    tableNumber: number;
    flag: boolean;
    reason?: string | null;
    by: {
      staffId: string | null;
      name?: string;
    };
    at: string;
  };
}

export interface WsAlertCreated {
  event: 'alert.created';
  payload: Record<string, unknown>;
}

// ─── Discriminated union ───

/**
 * Discriminated union of every WS event B2 emits. FE switch on `event.event`
 * to access the strongly-typed `payload`.
 */
export type WsEvent =
  | WsEscalationCreated
  | WsEscalationAdvanced
  | WsEscalationCompleted
  | WsLateArrivalCreated
  | WsLateArrivalApproved
  | WsLateArrivalRejected
  | WsLateArrivalExpired
  | WsScanVerificationCreated
  | WsScanVerificationEscalated
  | WsScanVerificationResolved
  | WsTableMergeCreated
  | WsTableMergeApproved
  | WsTableMergeRejected
  | WsMergeCooldownStarted
  | WsMergeCooldownExpired
  | WsLgpdRequestFulfilled
  | WsComplaintReceived
  | WsComplaintResponded
  | WsComplaintRead
  | WsComplaintResolved
  | WsStaffMessageReceived
  | WsStaffMessageRead
  | WsStaffMessagesCustomerReplied
  | WsCourtesyCreated
  | WsCourtesyUpdated
  | WsPaymentConfirmed
  | WsOrderReady
  | WsOrderStatus
  | WsOrderClaimed
  | WsOrderHandoffCalled
  | WsKitchenPriorityRequest
  | WsKitchenPriorityResponse
  | WsWaiterCall
  | WsWaiterAcknowledged
  | WsWaiterResolved
  | WsZonePauseStarted
  | WsZonePauseEnded
  | WsSessionFlagChanged
  | WsHostAssistRequested
  | WsHostTableLiberated
  | WsHostSwapRequested
  | WsHostSwapStateChanged
  | WsHostVipFlagged
  | WsAlertCreated;

/** String-literal name of each `WsEvent` variant — useful for room-routing. */
export type WsEventName = WsEvent['event'];

/** Helper to extract a specific variant from `WsEvent` by name. */
export type WsEventByName<N extends WsEventName> = Extract<WsEvent, { event: N }>;

/** Re-export `LateArrivalStatus` type so consumers can build payload guards. */
export type { LateArrivalStatus };

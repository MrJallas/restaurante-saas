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

// ─── Escalation generic events (for qr-issue cascade and others) ───

export interface WsEscalationCreated {
  event: 'escalation.created';
  payload: {
    escalationId: string;
    type: 'late_arrival' | 'table_merge' | 'qr_issue';
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
  };
}

export interface WsLateArrivalExpired {
  event: 'late_arrival.expired';
  payload: {
    requestId: string;
    tableSessionId: string;
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
    originHostName: string;
    targetHostName: string | null;
    originPartySize: number;
    targetPartySize: number;
    expiresAt: string;
  };
}

export interface WsTableMergeApproved {
  event: 'table_merge.approved';
  payload: {
    requestId: string;
    /** Both sides approved — emitted once per session involved. */
    side: 'a' | 'b' | 'both';
    status: TableMergeStatus;
    mergeId?: string;
  };
}

export interface WsTableMergeRejected {
  event: 'table_merge.rejected';
  payload: {
    requestId: string;
    /** Which side rejected ('timeout' on auto-expiration). */
    rejectedBy: 'a' | 'b' | 'timeout';
  };
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
  };
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

export interface WsComplaintCreated {
  event: 'complaint.created';
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
  | WsTableMergeCreated
  | WsTableMergeApproved
  | WsTableMergeRejected
  | WsMergeCooldownStarted
  | WsMergeCooldownExpired
  | WsLgpdRequestFulfilled
  | WsComplaintCreated
  | WsComplaintResponded
  | WsComplaintRead
  | WsComplaintResolved
  | WsStaffMessageReceived
  | WsZonePauseStarted
  | WsZonePauseEnded
  | WsSessionFlagChanged;

/** String-literal name of each `WsEvent` variant — useful for room-routing. */
export type WsEventName = WsEvent['event'];

/** Helper to extract a specific variant from `WsEvent` by name. */
export type WsEventByName<N extends WsEventName> = Extract<WsEvent, { event: N }>;

/** Re-export `LateArrivalStatus` type so consumers can build payload guards. */
export type { LateArrivalStatus };

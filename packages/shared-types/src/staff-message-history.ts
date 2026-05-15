// === Staff message history (NoSQL · 30-day TTL) ===
// Per the customer-facing "Mensagens com a equipe" feature. Mirrors the shape
// of `chat-history.ts` (AI chat) but for staff→customer (and customer→staff)
// messages — separate Mongo collections keep the two histories cleanly
// partitioned in the customer UI ("Conversas com IA" vs "Mensagens com a
// equipe"). Postgres `assistant_messages` continues to be the operational
// source-of-truth for inline render; Mongo gives the customer a persistent
// inbox view that survives session end.

/**
 * Author role on a staff-message thread. `staff` covers manager/waiter/host/
 * kitchen — distinguished via `fromRoleLabel`.
 */
export type StaffMessageHistoryFromRole = 'staff' | 'customer';

/**
 * Human-readable label for the staff author. The set is closed for now to
 * keep the customer UI predictable; broaden when product asks for more.
 */
export type StaffMessageHistoryRoleLabel =
  | 'gerente'
  | 'garçom'
  | 'host'
  | 'cozinha';

/**
 * Domain shape for a staff-message thread. Mirrors `staff_threads`
 * collection. One thread per `(customerId, tableSessionId)` pair so that
 * a single visit (even with multiple back-and-forth interactions) shows up
 * as one entry in the inbox; a return visit (new tableSessionId) opens a
 * new thread. `expiresAt` is the TTL trigger (30d).
 */
export interface StaffMessageHistoryThread {
  threadId: string;
  customerId: string;
  tenantId: string;
  tableSessionId: string;
  startedAt: Date;
  lastMessageAt: Date;
  messageCount: number;
  /** Last staff author's display name (preview eyebrow on the list). */
  lastStaffName: string | null;
  lastStaffRole: StaffMessageHistoryRoleLabel | null;
  /** Last message content (truncated to ~80 chars). */
  preview: string;
  expiresAt: Date;
  /** Soft-delete marker (customer wiped via "Apagar"). */
  deletedByUser?: boolean;
  deletedAt?: Date | null;
}

/**
 * DTO emitted by `GET /:slug/staff-messages/threads`. ISO date strings.
 */
export interface StaffMessageHistoryThreadDto {
  threadId: string;
  tableSessionId: string;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
  lastStaffName: string | null;
  lastStaffRole: StaffMessageHistoryRoleLabel | null;
  preview: string;
  expiresAt: string;
}

/**
 * Domain shape for a single staff-history message. Mirrors `staff_messages`
 * Mongo collection — distinct from the Postgres-backed `staff_messages`
 * table used by the inline render path (`assistant_messages` columns).
 *
 * The Mongo collection is the customer-facing inbox; the Postgres table
 * stays as the operational/realtime source. Persistence in Mongo is
 * best-effort (soft-fails on Mongo outage, same pattern as `chat_messages`).
 */
export interface StaffMessageHistoryMessage {
  messageId: string;
  threadId: string;
  customerId: string;
  tenantId: string;
  fromRole: StaffMessageHistoryFromRole;
  /** First name or display name of the staff (eyebrow on the bubble). */
  fromName: string | null;
  /** Role chip on the eyebrow (Gerente, Garçom, …). */
  fromRoleLabel: StaffMessageHistoryRoleLabel | null;
  content: string;
  createdAt: Date;
  /** Set when the customer opens the thread (POST /threads/:id/read). */
  readAt?: Date | null;
  expiresAt: Date;
}

/**
 * DTO returned by `GET /:slug/staff-messages/threads/:threadId/messages`.
 */
export interface StaffMessageHistoryMessageDto {
  messageId: string;
  fromRole: StaffMessageHistoryFromRole;
  fromName: string | null;
  fromRoleLabel: StaffMessageHistoryRoleLabel | null;
  content: string;
  createdAt: string;
  readAt: string | null;
}

/** Response of `DELETE /:slug/staff-messages/threads/:threadId`. */
export interface StaffMessageHistoryThreadDeleteResponse {
  deletedAt: string;
  messagesDeleted: number;
}

/** Response of `DELETE /:slug/staff-messages`. Bulk delete. */
export interface StaffMessageHistoryDeleteResponse {
  deletedCount: number;
  threadsMarked: number;
  mongoAvailable: boolean;
}

/** Response of `POST /:slug/staff-messages/threads/:threadId/read`. */
export interface StaffMessageHistoryReadResponse {
  threadId: string;
  markedCount: number;
}

/**
 * Body of `POST /:slug/staff-messages/threads/:threadId/messages`. Customer
 * replying to a staff thread. The backend persists in Mongo + emits WS so a
 * future staff inbox can react; no auto-routing logic yet.
 */
export interface StaffMessageHistoryCustomerSendDto {
  content: string;
}

/**
 * Response of the customer-send endpoint. Echoes the persisted shape so the
 * FE can append optimistically without a second fetch.
 */
export interface StaffMessageHistoryCustomerSendResponse {
  messageId: string;
  threadId: string;
  createdAt: string;
}

/**
 * Staff-side thread DTO returned by
 * `GET /:slug/customer-staff-messages/staff/threads`. Round 22.
 *
 * Difference vs `StaffMessageHistoryThreadDto` (que é per-customer):
 *  - inclui `customerId` (manager precisa identificar o autor)
 *  - inclui `unreadCount` (mensagens fromRole='customer' sem readAt)
 *  - NÃO traz a flag `deletedByUser` — staff vê todos os threads
 *    ativos independente de o customer ter limpado o histórico dele.
 */
export interface StaffInboundThreadDto {
  threadId: string;
  customerId: string;
  tableSessionId: string;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;
  lastStaffName: string | null;
  lastStaffRole: StaffMessageHistoryRoleLabel | null;
  preview: string;
  expiresAt: string;
}

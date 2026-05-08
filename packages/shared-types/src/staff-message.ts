// === Staff messages (manager bubble) ===
// Per docs/features/complaint-flow-v12.md and chat-history-lgpd.md ("mensagens
// da gerencia"). Lives in Postgres `assistant_messages` rather than NoSQL,
// because it has operational/audit value (not pure conversation).

import type { ComplaintChipAction } from './complaint';

/** Role of the message author within a staff thread. */
export type StaffMessageFromRole = 'customer' | 'staff';

/**
 * Kind of staff message. `complaint_response` is the canonical V12 case;
 * `courtesy` and `direct_reply` are existing kinds. Free-form on backend
 * (text column with CHECK in-app).
 */
export type StaffMessageKind =
  | 'complaint_response'
  | 'courtesy'
  | 'direct_reply'
  | 'system_notice';

/**
 * Metadata payload attached to a staff message. Carries the `chipAction` for
 * the `ManagerBubbleWithAction` and the `complaintId` for cross-linking.
 */
export interface StaffMessageMetadata {
  chipAction?: ComplaintChipAction;
  complaintId?: string;
  /** Free-form extension slot for future kinds (courtesy itemId etc.). */
  [key: string]: unknown;
}

/**
 * Domain entity mirroring `assistant_messages` rows where `from_role='staff'`
 * (or 'customer' for the customer-side replies in the rolling 5-min window).
 */
export interface StaffMessage {
  id: string;
  threadId: string;
  tableSessionId: string;
  customerId: string;
  visitId: string;
  fromRole: StaffMessageFromRole;
  /** When fromRole='staff', who authored. */
  staffId: string | null;
  kind: StaffMessageKind;
  content: string;
  metadata: StaffMessageMetadata;
  createdAt: Date;
  /** Read-receipt — set when `complaint.read` WS event fires. */
  readAt: Date | null;
}

/**
 * DTO emitted in WS `staff_message.received` and returned by GET endpoints.
 */
export interface StaffMessageDto {
  id: string;
  threadId: string;
  fromRole: StaffMessageFromRole;
  staffId: string | null;
  /** Display name for the bubble eyebrow ("Renata" etc.); resolved server-side. */
  staffName: string | null;
  kind: StaffMessageKind;
  content: string;
  metadata: StaffMessageMetadata;
  createdAt: string;
  readAt: string | null;
}

/**
 * Aggregated thread view for the customer's "Caixa de mensagens da gerencia".
 * Distinct from `ChatThreadDto` (NoSQL, AI chat history).
 */
export interface StaffMessageThread {
  threadId: string;
  customerId: string;
  tableSessionId: string;
  /** Last message preview shown in the inbox list. */
  lastMessagePreview: string;
  lastMessageAt: Date;
  unreadCount: number;
  /** Linked complaint id (if the thread originated from a complaint). */
  complaintId: string | null;
}

export interface StaffMessageThreadDto {
  threadId: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  complaintId: string | null;
}

/**
 * Body of `POST /staff/messages` (manager direct reply outside the complaint
 * flow). For complaint responses, use `POST /staff/complaints/:id/respond`.
 */
export interface StaffMessageSendDto {
  tableSessionId: string;
  customerId: string;
  content: string;
  kind?: StaffMessageKind;
  metadata?: StaffMessageMetadata;
}

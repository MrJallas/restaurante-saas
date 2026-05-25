// === Complaint + order rating ===
// Per docs/features/complaint-flow-v12.md. Customer rates after delivery; if
// rating <=3 or comment populated, may escalate to a complaint -> manager flow.

/**
 * Lifecycle of a complaint. Created with `responded_at = NULL`. Manager
 * responds (state = `responded`), 30s later card auto-collapses; complaint
 * is `resolved` when manager taps "Mark as resolved" or after read-receipt.
 */
export type ComplaintStatus =
  | 'created'
  | 'responded'
  | 'resolved';

/**
 * Predefined problem categories the customer picks via chips. `outro` is the
 * free-text fallback.
 */
export type ComplaintProblemType =
  | 'demora'
  | 'item-errado'
  | 'item-faltando'
  | 'comida-fria'
  | 'outro';

/**
 * Manager response chip-action; renders as `ChipActionInset` inside the
 * `ManagerBubbleWithAction`. `custom` means free text (no inset).
 */
export type ComplaintChipAction =
  | 'on-the-way'
  | 'kitchen-check'
  | 'courtesy'
  | 'custom';

/**
 * Domain entity mirroring `complaints` table.
 */
export interface Complaint {
  id: string;
  tableSessionId: string;
  customerId: string;
  orderId: string;
  /** 1-5 stars; NULL if customer skipped rating and went straight to complaint. */
  rating: number | null;
  problemType: ComplaintProblemType;
  description: string;
  createdAt: Date;
  respondedAt: Date | null;
  respondedBy: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  /** Links the complaint to the assistant_messages thread for the manager bubble. */
  threadId: string | null;
}

/**
 * DTO for customer-facing list (rare) or staff list. Fields denormalized for
 * the staff card (`MComplaintInProgressCard` shows table number + customer name).
 */
export interface ComplaintDto {
  id: string;
  tableSessionId: string;
  tableNumber: number;
  customerId: string;
  customerName: string;
  orderId: string;
  rating: number | null;
  problemType: ComplaintProblemType;
  description: string;
  status: ComplaintStatus;
  createdAt: string;
  respondedAt: string | null;
  respondedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

/**
 * Body of `POST /customer/orders/:orderId/complaint`.
 */
export interface ComplaintCreateDto {
  /** Optional rating 1-5; included when customer rated before opening complaint. */
  rating?: number;
  problemType: ComplaintProblemType;
  description: string;
}

/**
 * Response of `POST /customer/orders/:orderId/complaint`.
 */
export interface ComplaintCreateResponseDto {
  complaintId: string;
  threadId: string;
  /** Pre-formatted ETA for the waiting screen (e.g. "~2 min"). */
  eta: string;
}

/**
 * Body of `POST /:slug/complaints/:id/respond`. Manager picks a chip OR
 * writes a custom text reply.
 */
export interface ComplaintResponseDto {
  content: string;
  chipAction?: ComplaintChipAction;
}

/**
 * Body of `POST /:slug/complaints/:id/resolve`.
 */
export interface ComplaintResolveDto {
  reason?: string;
}

/**
 * Body of `POST /:slug/complaints/:id/forward`.
 */
export interface ComplaintForwardDto {
  toStaffId: string;
}

// ─────────────────────────────────────────────────────────────
// Order rating
// ─────────────────────────────────────────────────────────────

/**
 * Domain entity mirroring `order_ratings` table. UNIQUE(order_id) enforced
 * at DB level for idempotency.
 */
export interface OrderRating {
  id: string;
  orderId: string;
  customerId: string;
  tableSessionId: string;
  /** 1-5 stars. */
  rating: number;
  comment: string | null;
  createdAt: Date;
}

/**
 * DTO returned when fetching a rating (rare; mostly for the customer to see
 * their own rating). Read-only.
 */
export interface OrderRatingDto {
  id: string;
  orderId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

/**
 * Body of `POST /customer/orders/:orderId/rating`.
 */
export interface OrderRatingSubmitDto {
  rating: number;
  comment?: string;
}

/**
 * Response of `POST /customer/orders/:orderId/rating`.
 *  - rating >= 4 + empty comment -> ends here
 *  - rating <= 3 OR comment populated -> `redirectTo` set to /complaint route
 *  - already rated (UNIQUE conflict) -> `alreadyRated: true`
 */
export interface OrderRatingSubmitResponseDto {
  id: string;
  savedAt: string;
  alreadyRated?: boolean;
  /** Path to the complaint compose screen if backend wants the FE to navigate. */
  redirectTo?: string;
}

/**
 * Backend-scheduled rating push (3-5 min after delivery). Stored so we can
 * audit deliveries and dedupe pushes.
 */
export interface RatingPushScheduled {
  orderId: string;
  customerId: string;
  tableSessionId: string;
  /** ISO datetime when the push should fire. */
  scheduledFor: string;
  /** ISO datetime when the push was actually sent. NULL until fired. */
  sentAt: string | null;
}

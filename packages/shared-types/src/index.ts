// === Enums / Union Types ===

export type BillingMode = 'table' | 'individual';

/**
 * Extended to support the 15s pre-confirmation flow on the customer app:
 * `pending_confirmation` is the transient state after POST /orders before the
 * kitchen can see it. Auto-promoted to `received` after autoConfirmAt, or via
 * PATCH /orders/:id/confirm. PATCH /orders/:id/cancel sets `cancelled`.
 * `received` is what the kitchen sees first (replaces the legacy `open`).
 */
export type OrderStatus =
  | 'pending_confirmation'
  | 'received'
  | 'open'
  | 'confirmed'
  | 'preparing'
  | 'in_progress'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus =
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'refunded'
  | 'expired'
  | 'cancelled';
export type PaymentMethod = 'pix' | 'credit' | 'debit' | 'card' | 'cash';

export type StaffRole = 'owner' | 'manager' | 'waiter' | 'kitchen';
export type TableSessionStatus = 'active' | 'closed';
export type WaiterCallStatus = 'pending' | 'acknowledged' | 'resolved' | 'cancelled';
export type WaiterCallReason =
  | 'bring_menu'
  | 'place_order'
  | 'serve_drink'
  | 'ask_bill'
  | 'other';

export type MenuItemKind = 'food' | 'drink';
export type SplitMode = 'equal' | 'by_item' | 'custom';

export interface TableParticipant {
  customerId: string;
  name: string;
  initial: string;
  color: string;
}

// === Session DTOs ===

export interface InitSessionDto {
  tableCode: string;
  hmacSignature: string;
  timestamp: string;
}

export interface SessionResponseDto {
  sessionId: string;
  tableCode: string;
  tableLabel: string;
}

// === Customer DTOs ===

export interface CustomerWelcomeDto {
  name: string;
  cpf: string;
}

export interface CustomerRecognizeDto {
  recognitionToken: string;
}

export interface CustomerWelcomeResponseDto {
  customerId: string;
  name: string;
  recognitionToken: string;
  isReturning: boolean;
  totalVisits: number;
  lastVisitSummary: {
    last_items?: unknown[];
    favorite_items?: unknown[];
    total_spent_cents?: number;
  } | null;
  visitId: string;
  wasReclaim: boolean;
}

// === New feature contracts (per docs/features/*) ===
// Domain entities + DTOs + WS events for the 5 new product features. Each
// module groups types by feature; this barrel re-exports them flat to keep
// existing import sites (`from '@restaurant/shared-types'`) unchanged.

export * from './customer-host';
export * from './chat-history';
export * from './lgpd';
export * from './complaint';
export * from './staff-message';
export * from './vip';
export * from './zone-pause';
export * from './host';
export * from './ai';
export * from './ws-events';

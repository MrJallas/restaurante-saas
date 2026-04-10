// === Enums / Union Types ===

export type BillingMode = 'table' | 'individual';
export type OrderStatus = 'open' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';
export type StaffRole = 'owner' | 'manager' | 'waiter' | 'kitchen';
export type TableSessionStatus = 'active' | 'closed';
export type WaiterCallStatus = 'pending' | 'acknowledged';

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
}

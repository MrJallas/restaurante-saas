// === LGPD requests ===
// Per docs/features/chat-history-lgpd.md. Triggered via the LLM tool
// `lgpd_data_request`; processed immediately for `erasure` of NoSQL chat data.

/**
 * Kind of LGPD request. `access` and `portability` are reserved for V2;
 * `erasure` is the only kind handled by `POST /customer/lgpd-requests` today.
 */
export type LgpdRequestKind = 'erasure' | 'access' | 'portability';

/**
 * Lifecycle status. Erasure goes straight to `fulfilled` because deletion of
 * NoSQL chat data is instantaneous; access/portability require manager action.
 */
export type LgpdRequestStatus =
  | 'pending'
  | 'in_progress'
  | 'fulfilled'
  | 'rejected';

/**
 * How the customer answered the consent capture (chip vs free text).
 * Auditable proof of active consent (LGPD Art. 8).
 */
export type LgpdConsentMethod = 'chip' | 'free_text';

/**
 * Domain entity mirroring `lgpd_requests` table. Stored in Postgres for audit
 * even when target data lives in NoSQL.
 */
export interface LgpdRequest {
  id: string;
  customerId: string;
  tenantId: string;
  type: LgpdRequestKind;
  message: string | null;
  status: LgpdRequestStatus;
  createdAt: Date;
  fulfilledAt: Date | null;
  fulfilledBy: string | null;
  responseText: string | null;
  /** Sequential human-readable number, e.g. 7234 -> "REQ-7234". */
  requestNumber: number;
  /** Audit trail of consent capture. */
  consentMethod: LgpdConsentMethod;
  consentChipLabel: string | null;
  consentOriginalMessage: string | null;
}

/**
 * DTO for the LGPD list endpoint and audit views.
 */
export interface LgpdRequestDto {
  id: string;
  type: LgpdRequestKind;
  status: LgpdRequestStatus;
  createdAt: string;
  fulfilledAt: string | null;
  requestNumber: number;
  protocolNumber: string;
}

/**
 * Body of `POST /customer/lgpd-requests`. The LLM tool `lgpd_data_request`
 * relays this with consent metadata captured client-side.
 */
export interface LgpdRequestCreateDto {
  type: LgpdRequestKind;
  consentMethod: LgpdConsentMethod;
  /** Label of the chip the customer tapped (when method = 'chip'). */
  consentChipLabel?: string;
  /** Free-text message the customer typed (when method = 'free_text'). */
  consentOriginalMessage?: string;
}

/**
 * Response of `POST /customer/lgpd-requests`. For `erasure`, status is
 * `fulfilled` immediately; protocol is kept 90 days for proof.
 */
export interface LgpdRequestProtocolDto {
  /** Format: `LGPD-AAAA-MM-DD-XXXX`. */
  protocolNumber: string;
  status: LgpdRequestStatus;
  /** ISO datetime when the action was executed. */
  executedAt: string;
  /** ISO datetime when the protocol record itself can be purged (90 days out). */
  expiresAt: string;
}

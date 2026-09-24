// === Customer-host model ===
// Table-merge + escalation chains. Per docs/produto/funcionalidades/cliente-host-e-mesa-compartilhada.md.
//
// Chegada tardia NÃO mora aqui: o fluxo real é o System A
// (`session_participants`, o host da mesa aprova). A tabela
// `late_arrival_requests` e seus DTOs saíram na migration 081.

// ─────────────────────────────────────────────────────────────
// Table merge
// ─────────────────────────────────────────────────────────────

export type TableMergeStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'timeout'
  | 'expired'
  | 'cancelled';

/**
 * Domain entity for the in-flight merge request (escalation_chains row).
 * After both hosts approve, a row in `table_merges` is materialized and the
 * status becomes `approved`. See `TableMerge` for the post-approval entity.
 */
export interface TableMergeRequest {
  id: string;
  tenantId: string;
  /** Origin table session — the one initiating the merge. */
  sessionAId: string;
  /** Target table session. */
  sessionBId: string;
  /** Customer-host of session A — must approve. */
  approverAId: string;
  /** Customer-host of session B — must approve. NULL when target is walkin (no host). */
  approverBId: string | null;
  status: TableMergeStatus;
  approvedByAAt: Date | null;
  approvedByBAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Materialized merge after both sides approved. Mirrors `table_merges` table.
 */
export interface TableMerge {
  id: string;
  tenantId: string;
  sessionAId: string;
  sessionBId: string;
  approvedByA: string;
  approvedByB: string;
  mergedAt: Date;
  unmergedAt: Date | null;
  unmergedBy: string | null;
}

/**
 * DTO for the merge approval screen / typewriter bubble. Includes denormalized
 * info both hosts need to decide.
 */
export interface TableMergeRequestDto {
  id: string;
  status: TableMergeStatus;
  /** Origin table label (e.g. number 14). */
  originTableNumber: number;
  /** Target table label (e.g. number 15). */
  targetTableNumber: number;
  /** Display name of customer-host on origin side (Caleb da Mesa 14...). */
  originHostName: string | null;
  /** Display name of customer-host on target side. NULL if walkin (no host). */
  targetHostName: string | null;
  /** Party size on each side, used in merge prose. */
  originPartySize: number;
  targetPartySize: number;
  approvedByAAt: string | null;
  approvedByBAt: string | null;
  expiresAt: string;
  createdAt: string;
}

/**
 * Body of `POST /table-merge-requests`. Customer-host (origin) chose target
 * via OverlaySalonMap.
 */
export interface TableMergeCreateDto {
  /** Active table-session id selected from OverlaySalonMap. Preferred. */
  targetTableSessionId?: string;
  /** Table number of the target side (e.g. 15 for "M14 -> M15" merge). */
  targetTableNumber?: number;
  /** Human label/code fallback from the assistant, e.g. "M15" or "Mesa 15". */
  targetTableLabel?: string;
  /** Optional customer-facing note copied into the request. */
  message?: string;
}

/**
 * Body of `POST /table-merge-requests/:id/respond`. Each host answers individually.
 */
export interface TableMergeApproveDto {
  decision: 'approve' | 'reject';
}

// ─────────────────────────────────────────────────────────────
// Merge cooldown
// ─────────────────────────────────────────────────────────────

/** Why a merge cooldown was started. */
export type MergeCooldownReason = 'rejected' | 'timeout';

/**
 * Domain entity for `merge_cooldowns`. Unidirectional: blocks (origin -> target)
 * for 20 minutes. The reverse path (target -> origin) stays open.
 */
export interface TableMergeCooldown {
  id: string;
  tenantId: string;
  originTable: number;
  targetTable: number;
  reason: MergeCooldownReason;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * DTO returned in 429 response when a customer tries to merge during cooldown.
 * Frontend uses this to render the "voce pode tentar de novo em 20 min" hint.
 */
export interface MergeCooldownDto {
  originTable: number;
  targetTable: number;
  originTableNumber?: number;
  targetTableNumber?: number;
  originSessionId?: string;
  targetSessionId?: string;
  originHostName?: string | null;
  targetHostName?: string | null;
  originPartySize?: number;
  targetPartySize?: number;
  reason: MergeCooldownReason;
  /** ISO datetime when the cooldown expires; UI shows the countdown. */
  cooldownEndsAt: string;
  retryAfterSeconds?: number;
  code?: string;
  /** Pre-formatted human message returned by API for direct rendering. */
  message: string;
  message_user?: string;
}

// ─────────────────────────────────────────────────────────────
// Escalation chains (qr-issue cascade still uses this)
// ─────────────────────────────────────────────────────────────

/** Kinds of escalation chains. Table-merge keeps its own table; uma chain de
 *  `late_arrival` não é mais produzida por ninguém (System B removido na
 *  migration 081) — o valor segue vivo no enum do Postgres porque
 *  `ALTER TYPE ... DROP VALUE` não existe, mas não é um kind alcançável. */
export type EscalationKind = 'table_merge' | 'qr_issue';

export type EscalationStatus = 'pending' | 'approved' | 'rejected' | 'timeout' | 'cancelled';

/**
 * Single step in an escalation cascade. Roles include `customer-host` for
 * social decisions and staff roles for operational ones.
 */
export interface EscalationStep {
  /** Role that the cascade asks at this step. */
  role: 'customer-host' | 'host' | 'manager' | 'waiter' | 'owner';
  /** Optional explicit staff/customer id when targeting a specific person. */
  targetId?: string;
  /** ISO datetime when this step times out and the cascade advances. */
  deadline: string;
  notifiedAt?: string;
  respondedAt?: string;
}

/**
 * Domain entity mirroring `escalation_chains` table.
 */
export interface EscalationChain {
  id: string;
  tenantId: string;
  type: EscalationKind;
  /** Free-form payload specific to the kind (e.g. tableNumber, requesterName). */
  context: Record<string, unknown>;
  currentStep: number;
  status: EscalationStatus;
  resolvedAt: Date | null;
  /** Discriminated string: `customer:<uuid>` or `staff:<uuid>`. */
  resolvedBy: string | null;
  steps: EscalationStep[];
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────
// Customer identify (gate de CPF · bootstrap de identidade)
// ─────────────────────────────────────────────────────────────

/**
 * Body of `POST /customers/identify`. Usado pelo gate de CPF
 * (`ScreenCustomerIdentifyBeforeJoin`) e pelo welcome da mesa.
 */
export interface CustomerIdentifyDto {
  name: string;
  /** CPF in either masked (000.000.000-00) or unmasked form. Backend normalizes. */
  cpf: string;
  currentSessionId: string;
}

/**
 * Public projection of a customer (safe for cross-customer reads — host sees
 * the requester's first name and visit context but not full PII).
 */
export interface PublicCustomer {
  customerId: string;
  /** First name for social validation. */
  name: string;
  /** Total visits across the same tenant (or tenant group, if shared). */
  totalVisits?: number;
}

/**
 * Response of `POST /customers/identify`. Covers both branches:
 *  - CPF found: returning customer, recognitionToken refreshed
 *  - CPF new: created on the fly, recognitionToken issued
 */
export interface CustomerIdentifyResponse {
  customerId: string;
  /** True when the CPF lookup matched an existing customer record. */
  isReturning: boolean;
  /** Canonical name from DB; if `isReturning`, may differ from input. */
  canonicalName: string;
  /** Public projection useful for the host approval screen. */
  customer?: PublicCustomer;
  /** Recognition token (HMAC) issued/refreshed; client persists in cookie. */
  recognitionToken?: string;
}

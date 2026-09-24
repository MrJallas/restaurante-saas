// === VIP marker + session flags + priority ===
// Per docs/produto/funcionalidades/cliente-vip.md. VIP is session-scoped (lives in
// `table_sessions.flags`), not a permanent customer attribute.

/**
 * Session-level flags. Stored as `table_sessions.flags text[]`. Always a set
 * (no duplicates). Drives priority overrides in the call balancer.
 */
export type SessionFlag = 'vip' | 'allergy' | 'reincidente';

/**
 * Marker payload for the audit log + WS event. Issued when a manager/host
 * toggles a VIP flag on a session.
 */
export interface VipMarker {
  sessionId: string;
  tableNumber: number;
  /** Current flag set after the toggle. */
  flags: SessionFlag[];
  /** Staff who applied the change. */
  by: {
    staffId: string;
    name: string;
  };
  /** When the toggle occurred. */
  at: string;
  reason?: string;
}

/**
 * Body of `POST /staff/sessions/:tableSessionId/flags`.
 */
export interface SessionFlagToggleDto {
  flag: SessionFlag;
  action: 'add' | 'remove';
  reason?: string;
}

/**
 * Response of the same endpoint and the field returned in `session.flag_changed` WS event.
 */
export interface SessionFlagToggleResponseDto {
  flags: SessionFlag[];
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// Priority calculation input augmentation
// ─────────────────────────────────────────────────────────────

/**
 * Priority levels emitted by `priorityOf(call, loads)`. Matches existing
 * staff app expectations.
 */
export type Priority = 'high' | 'medium' | 'low';

/**
 * Subset of `Call` shape consumed by `priorityOf()`. Augmented with `flags`
 * so VIP/allergy overrides apply before saturation branches.
 */
export interface PriorityCallInput {
  type: string;
  sourceStation: string;
  elapsedMin: number;
  /** Session flags inherited from the source table session. */
  flags?: SessionFlag[];
}

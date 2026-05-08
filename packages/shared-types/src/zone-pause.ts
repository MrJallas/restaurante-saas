// === Zone pause ===
// Per docs/features/zone-pause.md. Localized pause of new orders for the
// tables of one specific waiter; rest of the salon keeps flowing.

/**
 * What the pause inhibits. Today only `orders` is implemented (silent ETA
 * inflation on customer side, queue on backend); `all` is reserved for V2
 * (full-scope freeze).
 */
export type ZonePauseKind = 'orders' | 'all';

/**
 * Predefined durations the manager can pick. Backend enforces.
 */
export type ZonePauseDurationMinutes = 5 | 10 | 15 | 30;

/**
 * Domain entity mirroring `zone_pauses` table.
 */
export interface ZonePause {
  id: string;
  waiterId: string;
  kind: ZonePauseKind;
  startedAt: Date;
  endsAt: Date;
  startedBy: string;
  endedAt: Date | null;
  endedBy: string | null;
  reason: string | null;
}

/**
 * DTO returned by `GET /staff/zone-pauses` and broadcasted in WS events.
 */
export interface ZonePauseDto {
  id: string;
  waiterId: string;
  /** Display name shown in the manager card and waiter banner. */
  waiterName: string;
  kind: ZonePauseKind;
  startedAt: string;
  endsAt: string;
  startedBy: string;
  startedByName: string;
  endedAt: string | null;
  endedBy: string | null;
  reason: string | null;
  /** True when the row is the active pause for the waiter (endedAt is null and endsAt > now). */
  active: boolean;
}

/**
 * Body of `POST /staff/zone-pauses`.
 */
export interface ZonePauseCreateDto {
  waiterId: string;
  durationMinutes: ZonePauseDurationMinutes;
  kind?: ZonePauseKind;
  reason?: string;
}

/**
 * Body of `DELETE /staff/zone-pauses/:id` (early termination by manager).
 */
export interface ZonePauseEndDto {
  reason?: string;
}

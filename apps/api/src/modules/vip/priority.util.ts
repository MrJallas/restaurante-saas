import type { Priority, PriorityCallInput, SessionFlag } from '@restaurant/shared-types';

/** Saturation thresholds — kept locally to avoid leaking config across modules. */
const HIGH_THRESHOLD = 0.8;
const MED_THRESHOLD = 0.5;

export interface StationLoad {
  /** 0..1 — fraction of capacity currently in use. */
  saturation: number;
}

/**
 * `priorityOf(call, loads)` · per docs/features/vip-customer.md.
 *
 * Decision order:
 *   1. ABSOLUTE OVERRIDES (`allergy`, `vip`) — bypass saturation logic.
 *   2. Contextual rules (long-elapsed certain types).
 *   3. Saturation fallback.
 *
 * `flags` is the set on `table_sessions.flags` (text[]) for the source table.
 */
export function priorityOf(call: PriorityCallInput, loads: Record<string, StationLoad>): Priority {
  const flags: SessionFlag[] = call.flags ?? [];

  // Absolute overrides first — VIP/allergy outrank saturation always.
  if (flags.includes('allergy')) return 'high';
  if (flags.includes('vip')) return 'high';

  // Contextual rules.
  if (call.type === 'pediu-conta' && call.elapsedMin > 5) return 'high';
  if (call.type === 'pronto-cozinha' && call.elapsedMin > 3) return 'high';

  // Saturation fallback.
  const sat = loads[call.sourceStation]?.saturation ?? 0;
  if (sat >= HIGH_THRESHOLD) return 'high';
  if (sat >= MED_THRESHOLD) return 'medium';
  return 'low';
}

/**
 * Tie-break ordering for multiple `high` calls. Lower index = higher priority.
 * Returns negative when `a` should come before `b`, positive when after.
 */
export function compareHighCalls(a: PriorityCallInput, b: PriorityCallInput): number {
  const aFlags = a.flags ?? [];
  const bFlags = b.flags ?? [];

  if (aFlags.includes('allergy') !== bFlags.includes('allergy')) {
    return aFlags.includes('allergy') ? -1 : 1;
  }
  if (aFlags.includes('vip') !== bFlags.includes('vip')) {
    return aFlags.includes('vip') ? -1 : 1;
  }
  if (a.elapsedMin !== b.elapsedMin) {
    return b.elapsedMin - a.elapsedMin; // longer wait first
  }
  const order = ['pronto-cozinha', 'pediu-conta', 'chamou-garcom', 'mais-bebida'];
  const ai = order.indexOf(a.type);
  const bi = order.indexOf(b.type);
  if (ai === -1 && bi === -1) return 0;
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}

'use client';

import { ReactNode } from 'react';

/**
 * Pattern V4 (canvas) · gerente · border-left ink fixed 3px.
 *
 * STUB: this is C1's primitive — replace with the real implementation when C1
 * lands. Until then this matches the canvas reference in `cliente-tokens.jsx`
 * (V20) closely enough to render the complaint waiting / response UX.
 *
 * `chipAction` inset (per `complaint-flow-v12.md`):
 *   - `on-the-way`   → "Renata avisou · 'Chega em 3 min'" + clock icon
 *   - `kitchen-check`→ "Renata avisou · 'Foi falar com a cozinha'" + check icon
 *   - `courtesy`     → "Renata avisou · 'Cortesia a caminho'" + gift icon
 *   - `custom`       → no inset, just prose
 */
export type ManagerChipActionKind =
  | 'on-the-way'
  | 'kitchen-check'
  | 'courtesy'
  | 'custom';

interface ManagerBubbleProps {
  /** Display name (e.g. "Renata"). */
  name?: string;
  /** Role label rendered next to name (e.g. "Gerente"). */
  role?: string;
  /** Relative time display (e.g. "há 1 min"). */
  when?: string;
  /** Optional chip-action inset. */
  chipAction?: ManagerChipActionKind | null;
  children: ReactNode;
}

const CHIP_LABELS: Record<Exclude<ManagerChipActionKind, 'custom'>, string> = {
  'on-the-way': 'Chega em 3 min',
  'kitchen-check': 'Foi falar com a cozinha',
  courtesy: 'Cortesia a caminho',
};

function ChipIcon({ kind }: { kind: Exclude<ManagerChipActionKind, 'custom'> }) {
  if (kind === 'on-the-way') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle
          cx="7"
          cy="7"
          r="5.5"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path
          d="M7 4v3.2L9 9"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === 'kitchen-check') {
    return (
      <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path
          d="M3.5 9.5l3.5 3.5L14 5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  // courtesy
  return (
    <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M16 9v14M9 16h14"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ManagerBubble({
  name = 'Renata',
  role = 'Gerente',
  when = 'há 1 min',
  chipAction = null,
  children,
}: ManagerBubbleProps) {
  const inset =
    chipAction && chipAction !== 'custom' ? (
      <div className="mt-3 flex items-center gap-2 border-t border-border-soft pt-3">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink/40 text-ink"
          aria-hidden
        >
          <ChipIcon kind={chipAction} />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[1.2px] text-mute">
          {name} avisou
        </span>
        <span className="text-[12px] text-ink">{CHIP_LABELS[chipAction]}</span>
      </div>
    ) : null;

  return (
    <div className="rounded-[10px] border border-border-soft border-l-[3px] border-l-ink bg-[#fafaf8] px-4 py-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white">
          {name.charAt(0)}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-ink">
          {name} · {role}
        </span>
        <span className="ml-auto text-[10px] text-faint">{when}</span>
      </div>
      <div className="text-[15px] leading-[1.45] text-ink" style={{ textWrap: 'pretty' as never }}>
        {children}
      </div>
      {inset}
    </div>
  );
}

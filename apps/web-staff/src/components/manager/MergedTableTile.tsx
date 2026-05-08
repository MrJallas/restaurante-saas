'use client';

// "Merged tile V3" — when 2+ table sessions are joined via approved
// table_merges, the floor map renders them as a single grouped tile so the
// manager sees one grouping instead of N tiles.
//
// Driven by `apps/api/src/modules/table-merge` data; consumes the merge group
// shape (origin + target table numbers + party sizes + status).

import { useG, MONO_FONT } from './tokens';
import { Icon } from './Icons';
import { MPill } from './primitives';

export interface MergedTableTileProps {
  /** The leading table number (display order). */
  primaryTableNumber: number;
  /** Other tables joined to the primary. */
  joinedTableNumbers: number[];
  /** Combined party size after merge. */
  totalParty: number;
  /** Combined ticket in BRL (cents → reais). */
  totalTicketCents?: number;
  /** Minutes since the merge was created. */
  minutesOpen?: number;
  /** Slot for status: ok / warn / crit / new. */
  status?: 'ok' | 'warn' | 'crit' | 'new';
  /** Initials of the responsible waiter. */
  waiterInit?: string;
  waiterColor?: string;
  onClick?: () => void;
  dark?: boolean;
  /** Manager can request UNMERGE inline. */
  onUnmerge?: () => void;
}

export function MergedTableTile({
  primaryTableNumber,
  joinedTableNumbers,
  totalParty,
  totalTicketCents,
  minutesOpen = 0,
  status = 'ok',
  waiterInit,
  waiterColor,
  onClick,
  dark,
  onUnmerge,
}: MergedTableTileProps) {
  const C = useG(!!dark);
  const stColors = {
    ok: { bg: C.bg, border: C.borderSoft, fg: C.ink, dot: '#1E8C5A' },
    warn: { bg: '#FFF7EC', border: '#F0DCB6', fg: '#7a4d10', dot: '#D98E2B' },
    crit: { bg: '#FFF1F1', border: '#F4C7C7', fg: '#A12626', dot: '#C43A3A' },
    new: { bg: C.bg, border: C.borderSoft, fg: C.ink, dot: '#3B5FBE' },
  } as const;
  const c = stColors[status];

  const tableLabel = `Mesa ${primaryTableNumber}` +
    (joinedTableNumbers.length ? ` + ${joinedTableNumbers.map((n) => `M${n}`).join(' + ')}` : '');
  const ticket =
    totalTicketCents != null ? `R$${Math.floor(totalTicketCents / 100)}` : null;

  return (
    <button
      onClick={onClick}
      aria-label={`${tableLabel} · juntada · ${totalParty} pessoas`}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        gridColumn: 'span 2',
        padding: 10,
        border: `1.5px solid ${c.border}`,
        borderRadius: 12,
        background: c.bg,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        position: 'relative',
        boxShadow: '0 0 0 0 rgba(0,0,0,0)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: c.fg, letterSpacing: -0.3 }}>
            M{primaryTableNumber}
            {joinedTableNumbers.map((n) => (
              <span key={n} style={{ color: C.faint, fontWeight: 700 }}> + M{n}</span>
            ))}
          </span>
          <MPill tone="info" dark={dark}>
            JUNTAS
          </MPill>
        </div>
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: c.dot,
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: C.faint,
            fontWeight: 700,
            fontFamily: MONO_FONT,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          {totalParty} pessoas · {minutesOpen}m{ticket ? ` · ${ticket}` : ''}
        </div>
        {waiterInit && (
          <span
            aria-hidden
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: waiterColor ?? '#777',
              color: '#fff',
              fontSize: 9,
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {waiterInit}
          </span>
        )}
      </div>

      {onUnmerge && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onUnmerge();
          }}
          role="button"
          tabIndex={0}
          aria-label="Desjuntar mesas"
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 22,
            height: 22,
            borderRadius: 11,
            border: `1px solid ${C.borderSoft}`,
            background: C.bg,
            color: C.faint,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {Icon.x(12)}
        </span>
      )}
    </button>
  );
}

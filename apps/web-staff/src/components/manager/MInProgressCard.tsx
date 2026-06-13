'use client';

// Persistent "Em curso" card. Async operations the manager dispatched and
// awaits resolution (kitchen accept, customer read, pause expire, courtesy
// accepted, complaint responded, escalation step closing, LGPD ready).
//
// Faithful port of `MInProgressCard` in garcom-screens-c.jsx (V4 · 2026-05).
// Three families:
//   • 4 active (V4): late-arrival, table-merge, complaint, escalation
//   • 3 info passive (V4): zone-pause-active, lgpd-request-pending,
//                          staff-message-unread
//   • Existing async (kitchen-reorder, contact-client, courtesy, pause-orders)

import type { MouseEvent, ReactNode } from 'react';
import { useG, MONO_FONT } from './tokens';
import { Icon } from './Icons';

export type InProgressKind =
  | 'pause-orders'
  | 'kitchen-reorder'
  | 'contact-client'
  | 'courtesy'
  | 'late-arrival'
  | 'table-merge'
  | 'complaint'
  | 'escalation'
  | 'zone-pause-active'
  | 'lgpd-request-pending'
  | 'staff-message-unread';

export type InProgressState = 'active' | 'waiting' | 'resolved-summary';

export interface MInProgressCardProps {
  id?: string;
  kind: InProgressKind;
  state?: InProgressState;
  /** Pause-orders + active. */
  ttl?: { remaining: number; total: number };
  pauseMeta?: { startedAt: string; endsAt: string };
  /** resolved-summary. */
  resolvedKicker?: string;
  resolvedHeadline?: string;
  resolvedSub?: string;
  /** kitchen-reorder. */
  reorderEta?: string;
  reorderItems?: string;
  /** contact-client. */
  contactTable?: number;
  contactPreview?: string;
  /** courtesy. */
  courtesyTable?: number;
  courtesyItem?: string;
  /** complaint. */
  complaintTable?: number;
  complaintCustomer?: string;
  complaintSummary?: string;
  /** escalation. */
  escalationKind?: 'late_arrival' | 'table_merge' | 'qr_issue';
  escalationHeadline?: string;
  escalationDeadline?: string;
  /** late-arrival / table-merge requesters. */
  requesterName?: string;
  requestedTable?: number;
  /** zone-pause-active. */
  zonePauseWaiterName?: string;
  zonePauseRemaining?: number;
  /** lgpd-request-pending. */
  lgpdRequestNumber?: string;
  lgpdType?: 'erasure' | 'access' | 'portability';
  /** staff-message-unread. */
  staffMessageFromName?: string;
  staffMessagePreview?: string;
  staffMessageCount?: number;
  /** Common */
  onTap?: () => void;
  onPrimary?: () => void;
  onSecondary?: () => void;
  onDismiss?: () => void;
  dark?: boolean;
}

const stop = (e: MouseEvent) => e.stopPropagation();

function PillBtn({
  filled,
  label,
  onClick,
  dark,
}: {
  filled?: boolean;
  label: string;
  onClick?: () => void;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  return (
    <button
      onClick={(e: MouseEvent) => {
        stop(e);
        onClick?.();
      }}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        padding: '7px 12px',
        height: 32,
        borderRadius: 8,
        border: filled ? 'none' : `1px solid ${C.borderSoft}`,
        background: filled ? C.ink : 'transparent',
        color: filled ? C.bg : C.ink,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: -0.1,
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {label}
    </button>
  );
}

function Spinner({ accent }: { accent: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: accent,
            opacity: 0.7,
          }}
        />
      ))}
    </span>
  );
}

function pickAccent(kind: InProgressKind, state: InProgressState) {
  if (state === 'resolved-summary') return '#1E8C5A';
  if (kind === 'pause-orders' && state === 'active') return '#9A7212';
  if (kind === 'zone-pause-active') return '#9A7212';
  if (kind === 'complaint') return '#C43A3A';
  if (kind === 'escalation') return '#C43A3A';
  if (kind === 'late-arrival') return '#3B5FBE';
  if (kind === 'table-merge') return '#3B5FBE';
  if (kind === 'lgpd-request-pending') return '#1F3784';
  if (kind === 'staff-message-unread') return '#1F3784';
  return '#3B5FBE';
}

function fmtMmSs(seconds: number) {
  const r = Math.max(0, seconds);
  return `${Math.floor(r / 60)
    .toString()
    .padStart(2, '0')}:${(r % 60).toString().padStart(2, '0')}`;
}

export function MInProgressCard(props: MInProgressCardProps) {
  const {
    kind,
    state = 'active',
    ttl,
    pauseMeta,
    resolvedKicker,
    resolvedHeadline,
    resolvedSub,
    reorderEta,
    reorderItems,
    contactTable,
    contactPreview,
    courtesyTable,
    courtesyItem,
    complaintTable,
    complaintCustomer,
    complaintSummary,
    escalationKind,
    escalationHeadline,
    escalationDeadline,
    requesterName,
    requestedTable,
    zonePauseWaiterName,
    zonePauseRemaining,
    lgpdRequestNumber,
    lgpdType,
    staffMessageFromName,
    staffMessagePreview,
    staffMessageCount,
    onTap,
    onPrimary,
    onSecondary,
    onDismiss,
    dark,
  } = props;
  const C = useG(!!dark);
  const isResolved = state === 'resolved-summary';
  const accent = pickAccent(kind, state);

  const kicker = ((): string => {
    if (isResolved) return resolvedKicker ?? 'OPERAÇÃO RESOLVIDA';
    switch (kind) {
      case 'pause-orders':
        return 'PAUSA · RETOMA SOZINHO';
      case 'kitchen-reorder':
        return 'REORDENAR · AGUARDANDO COZINHA';
      case 'contact-client':
        return `MENSAGEM · MESA ${contactTable ?? '?'} · AGUARDANDO LEITURA`;
      case 'courtesy':
        return `CORTESIA · MESA ${courtesyTable ?? '?'} · AGUARDANDO ACEITAR`;
      case 'late-arrival':
        return `CHEGADA TARDIA · MESA ${requestedTable ?? '?'} · AGUARDA HOST`;
      case 'table-merge':
        return `JUNÇÃO DE MESAS · MESA ${requestedTable ?? '?'}`;
      case 'complaint':
        return `RECLAMAÇÃO · MESA ${complaintTable ?? '?'} · ABERTA`;
      case 'escalation':
        return `ESCALAÇÃO · ${(escalationKind ?? 'qr_issue').toUpperCase().replace('_', ' ')}`;
      case 'zone-pause-active':
        return `ZONA PAUSADA · ${zonePauseWaiterName?.toUpperCase() ?? 'GARÇOM'}`;
      case 'lgpd-request-pending':
        return `LGPD · ${lgpdRequestNumber ?? 'PROTOCOLO'} · ${lgpdType?.toUpperCase() ?? 'ERASURE'}`;
      case 'staff-message-unread':
        return `MENSAGEM PRA VOCÊ · ${staffMessageFromName?.toUpperCase() ?? 'STAFF'}`;
      default:
        return '';
    }
  })();

  // ─── Body ──────────────────────────────────────────────────
  let body: ReactNode = null;
  if (isResolved) {
    body = (
      <>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: C.ink,
            letterSpacing: -0.15,
            lineHeight: 1.35,
            marginTop: 6,
          }}
        >
          {resolvedHeadline}
        </div>
        {resolvedSub && (
          <div
            style={{
              fontSize: 10.5,
              color: C.faint,
              fontWeight: 500,
              marginTop: 4,
              fontFamily: MONO_FONT,
              letterSpacing: 0.3,
              textTransform: 'uppercase',
            }}
          >
            {resolvedSub}
          </div>
        )}
      </>
    );
  } else if (kind === 'pause-orders' && state === 'active' && ttl) {
    const mm = Math.floor(ttl.remaining / 60)
      .toString()
      .padStart(2, '0');
    const ss = (ttl.remaining % 60).toString().padStart(2, '0');
    const pct = Math.max(0, Math.min(100, ((ttl.total - ttl.remaining) / ttl.total) * 100));
    body = (
      <>
        <div
          style={{
            fontSize: 30,
            fontWeight: 800,
            color: '#7A4D10',
            letterSpacing: -1,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.05,
            marginTop: 6,
            fontFamily: MONO_FONT,
          }}
        >
          {mm}
          <span style={{ opacity: 0.45 }}>:</span>
          {ss}
        </div>
        <div
          style={{
            marginTop: 8,
            height: 4,
            borderRadius: 100,
            background: '#F0DCB6',
            overflow: 'hidden',
          }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: '#9A7212' }} />
        </div>
        {pauseMeta && (
          <div style={{ fontSize: 11, color: C.faint, fontWeight: 500, marginTop: 6 }}>
            Pausada às {pauseMeta.startedAt} · termina {pauseMeta.endsAt}
          </div>
        )}
      </>
    );
  } else if (kind === 'kitchen-reorder' && state === 'waiting') {
    body = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <Spinner accent={accent} />
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
            Resposta esperada em {reorderEta ?? '~30s'}
          </div>
        </div>
        {reorderItems && (
          <div
            style={{
              fontSize: 11.5,
              color: C.mute,
              fontWeight: 500,
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            {reorderItems}
          </div>
        )}
      </>
    );
  } else if (kind === 'contact-client' && state === 'waiting') {
    body = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#D98E2B',
            flexShrink: 0,
          }}
        />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            color: C.ink,
            fontWeight: 500,
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {contactPreview ? `“${contactPreview}”` : '—'}
        </div>
      </div>
    );
  } else if (kind === 'courtesy' && state === 'waiting') {
    body = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <Spinner accent={accent} />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: -0.1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {courtesyItem ?? '—'}
        </div>
      </div>
    );
  } else if (kind === 'complaint') {
    body = (
      <>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: C.ink,
            marginTop: 6,
            letterSpacing: -0.15,
          }}
        >
          {complaintCustomer ?? 'Cliente'} · Mesa {complaintTable ?? '?'}
        </div>
        {complaintSummary && (
          <div
            style={{
              fontSize: 12.5,
              color: C.mute,
              fontWeight: 500,
              marginTop: 3,
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {complaintSummary}
          </div>
        )}
      </>
    );
  } else if (kind === 'late-arrival' || kind === 'table-merge') {
    body = (
      <>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: C.ink,
            marginTop: 6,
            letterSpacing: -0.15,
          }}
        >
          {requesterName ?? 'Cliente'} · Mesa {requestedTable ?? '?'}
        </div>
        <div
          style={{
            fontSize: 11,
            color: C.faint,
            fontWeight: 600,
            marginTop: 3,
            fontFamily: MONO_FONT,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          {kind === 'late-arrival' ? 'Aguarda host aprovar' : 'Aguarda hosts aprovar'}
        </div>
      </>
    );
  } else if (kind === 'escalation') {
    body = (
      <>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: C.ink,
            marginTop: 6,
            letterSpacing: -0.15,
            lineHeight: 1.35,
          }}
        >
          {escalationHeadline ?? 'Escalação aberta'}
        </div>
        {escalationDeadline && (
          <div
            style={{
              fontSize: 11,
              color: C.faint,
              fontWeight: 600,
              marginTop: 3,
              fontFamily: MONO_FONT,
              letterSpacing: 0.3,
              textTransform: 'uppercase',
            }}
          >
            Deadline: {escalationDeadline}
          </div>
        )}
      </>
    );
  } else if (kind === 'zone-pause-active') {
    const remainingTxt = zonePauseRemaining != null ? fmtMmSs(zonePauseRemaining) : '—';
    body = (
      <>
        <div
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: '#7A4D10',
            letterSpacing: -0.6,
            fontFamily: MONO_FONT,
            fontVariantNumeric: 'tabular-nums',
            marginTop: 6,
            lineHeight: 1.05,
          }}
        >
          {remainingTxt}
        </div>
        <div
          style={{
            fontSize: 11,
            color: C.faint,
            fontWeight: 500,
            marginTop: 5,
          }}
        >
          {zonePauseWaiterName ?? 'Garçom'} · pedidos novos pausados
        </div>
      </>
    );
  } else if (kind === 'lgpd-request-pending') {
    body = (
      <>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: C.ink,
            marginTop: 6,
            letterSpacing: -0.15,
          }}
        >
          Solicitação LGPD pendente
        </div>
        <div
          style={{ fontSize: 11.5, color: C.mute, fontWeight: 500, marginTop: 3, lineHeight: 1.4 }}
        >
          Protocolo {lgpdRequestNumber ?? '—'} · {lgpdType ?? 'erasure'}
        </div>
      </>
    );
  } else if (kind === 'staff-message-unread') {
    body = (
      <>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: C.ink,
            marginTop: 6,
            letterSpacing: -0.15,
          }}
        >
          {staffMessageFromName ?? 'Staff'}
          {staffMessageCount && staffMessageCount > 1 ? ` · ${staffMessageCount} novas` : ''}
        </div>
        {staffMessagePreview && (
          <div
            style={{
              fontSize: 12.5,
              color: C.mute,
              fontWeight: 500,
              marginTop: 3,
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {staffMessagePreview}
          </div>
        )}
      </>
    );
  }

  // ─── Actions ───────────────────────────────────────────────
  let actions: ReactNode = null;
  if (isResolved) {
    actions = (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <PillBtn label="Ver detalhes" onClick={onPrimary} dark={dark} />
        <div style={{ flex: 1 }} />
        {onDismiss && (
          <button
            onClick={(e: MouseEvent) => {
              stop(e);
              onDismiss();
            }}
            aria-label="Dispensar"
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: 28,
              height: 28,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: C.faint,
            }}
          >
            {Icon.x(16)}
          </button>
        )}
      </div>
    );
  } else if (kind === 'pause-orders') {
    actions = (
      <div style={{ display: 'flex', gap: 6 }}>
        <PillBtn label="+5 min" onClick={onSecondary} dark={dark} />
        <PillBtn filled label="Despausar agora" onClick={onPrimary} dark={dark} />
      </div>
    );
  } else if (kind === 'zone-pause-active') {
    actions = (
      <div style={{ display: 'flex', gap: 6 }}>
        <PillBtn label="Encerrar agora" onClick={onPrimary} dark={dark} />
      </div>
    );
  } else if (kind === 'complaint') {
    actions = (
      <div style={{ display: 'flex', gap: 6 }}>
        <PillBtn filled label="Responder" onClick={onPrimary} dark={dark} />
      </div>
    );
  } else if (kind === 'late-arrival' || kind === 'table-merge' || kind === 'escalation') {
    actions = (
      <div style={{ display: 'flex', gap: 6 }}>
        <PillBtn label="Ver detalhes" onClick={onPrimary} dark={dark} />
      </div>
    );
  } else if (kind === 'kitchen-reorder' || kind === 'contact-client' || kind === 'courtesy') {
    actions = (
      <div style={{ display: 'flex', gap: 6 }}>
        <PillBtn
          label={
            kind === 'kitchen-reorder'
              ? 'Cancelar'
              : kind === 'contact-client'
                ? 'Reenviar'
                : 'Cancelar envio'
          }
          onClick={onSecondary}
          dark={dark}
        />
      </div>
    );
  } else if (kind === 'lgpd-request-pending') {
    actions = (
      <div style={{ display: 'flex', gap: 6 }}>
        <PillBtn filled label="Atender" onClick={onPrimary} dark={dark} />
      </div>
    );
  } else if (kind === 'staff-message-unread') {
    actions = (
      <div style={{ display: 'flex', gap: 6 }}>
        <PillBtn filled label="Abrir" onClick={onPrimary} dark={dark} />
      </div>
    );
  }

  return (
    <div
      onClick={onTap}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onTap) {
          e.preventDefault();
          onTap();
        }
      }}
      aria-label={kicker}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        padding: '12px 12px 12px 14px',
        borderRadius: 14,
        border: `1px solid ${C.borderSoft}`,
        borderLeft: `3px solid ${accent}`,
        background: C.bg,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 800,
          color: accent,
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          fontFamily: MONO_FONT,
        }}
      >
        {kicker}
      </div>
      {body}
      {actions && <div style={{ marginTop: 12 }}>{actions}</div>}
    </div>
  );
}

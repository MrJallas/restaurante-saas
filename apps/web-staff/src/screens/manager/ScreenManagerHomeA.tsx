'use client';

// Painel (Home) — first screen the manager sees.
//
// V4 layout (per garcom-screens-c.jsx):
//   1. HERO — saudação · AO VIVO · sino com badge
//   2. FERRAMENTAS RÁPIDAS — slim 2-card MQuickActionsBar (Pausar Zona +
//      Mensagem Equipe)
//   3. EM CURSO — persistent cards for async ops the manager dispatched
//   4. HOJE NO TURNO — alerts (compacted)
//   5. EQUIPE EM TURNO — top 4 + warning de sobrecarga
//   6. PRÓXIMAS RESERVAS — top 3
//
// All real data is loaded via the manager API helpers + useManagerEvents for
// live updates. Mock arrays for sections that don't have a v1 endpoint yet
// (M_TEAM, NEXT_RESERVATIONS) are clearly marked.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  Icon,
  MAppHeader,
  MBottomNav,
  MSection,
  MAvatar,
  MPill,
  MQuickActionsBar,
  MInProgressCard,
  type InProgressKind,
  type InProgressState,
} from '../../components/manager';
import { manager } from '../../lib/api/manager';
import { useManagerEvents } from '../../hooks/useManagerEvents';

// ─── Mock data — bottlenecks + reservations ────────────────────
// Will be wired to /alerts and /host/reservations once those endpoints land.

const DEFAULT_ALERTS = [
  {
    id: 1,
    sev: 'high' as const,
    msg: 'Cozinha · Risoto cogumelos esperando há 22 min',
    sub: 'Mesa 14 · meta 12 min',
    ts: 'agora',
    actions: ['Avisar cozinha', 'Contactar cliente'] as const,
  },
  {
    id: 2,
    sev: 'high' as const,
    msg: 'Henrique · 3 chamados sem resposta há > 4 min',
    sub: 'Mesas 7, 9, 12',
    ts: '2 min',
    actions: ['Realocar mesa', 'Chamar Henrique'] as const,
  },
  {
    id: 3,
    sev: 'med' as const,
    msg: 'Mesa 14 · pedido pronto há 9 min, ainda na pass',
    sub: '2 pratos esperando',
    ts: '5 min',
    actions: ['Entregar agora', 'Avisar Caleb'] as const,
  },
];

const M_TEAM_FALLBACK = [
  { id: 1, name: 'Caleb Souza', role: 'Garçom', init: 'CS', shift: 'on', rating: 4.8, callsAvg: 1.2, tables: 7, scaled: 0, color: '#4F6BFF', flag: null },
  { id: 2, name: 'Olivia Martins', role: 'Garçom', init: 'OM', shift: 'on', rating: 4.6, callsAvg: 1.8, tables: 6, scaled: 1, color: '#E37D2F', flag: 'in-call' as const },
  { id: 3, name: 'Henrique Lima', role: 'Garçom', init: 'HL', shift: 'on', rating: 4.4, callsAvg: 2.4, tables: 5, scaled: 2, color: '#7A4FBE', flag: 'overload' as const },
  { id: 5, name: 'Bruno Pacheco', role: 'Cozinheiro', init: 'BP', shift: 'on', rating: 4.5, callsAvg: 0, tables: 0, scaled: 0, color: '#C43A3A', flag: null },
  { id: 6, name: 'Júlia Andrade', role: 'Bartender', init: 'JA', shift: 'on', rating: 4.9, callsAvg: 0.8, tables: 0, scaled: 0, color: '#0B7A8B', flag: null },
];

const NEXT_RESERVATIONS = [
  { id: 1, time: '20:00', name: 'Família Costa', party: 4, in: '18 min', table: 'Mesa 9', tag: 'aniversário', tagTone: 'warn' as const },
  { id: 2, time: '20:30', name: 'Ana Pereira', party: 2, in: '48 min', table: 'Mesa 3', tag: 'varanda', tagTone: 'success' as const },
  { id: 3, time: '21:00', name: 'Grupo João', party: 6, in: '78 min', table: 'Mesa 7', tag: null, tagTone: null },
];

interface InProgressItem {
  id: string;
  kind: InProgressKind;
  state: InProgressState;
  ttl?: { remaining: number; total: number };
  pauseMeta?: { startedAt: string; endsAt: string };
  contactTable?: number;
  contactPreview?: string;
  zonePauseWaiterName?: string;
  zonePauseRemaining?: number;
  complaintTable?: number;
  complaintCustomer?: string;
  complaintSummary?: string;
  requesterName?: string;
  requestedTable?: number;
  lgpdRequestNumber?: string;
  lgpdType?: 'erasure' | 'access' | 'portability';
  staffMessageFromName?: string;
  staffMessagePreview?: string;
  staffMessageCount?: number;
  toRoute: string;
}

export interface ScreenManagerHomeAProps {
  dark?: boolean;
  tenantSlug: string;
  greetingName?: string;
  bellBadge?: number;
}

export function ScreenManagerHomeA({
  dark,
  tenantSlug,
  greetingName,
  bellBadge,
}: ScreenManagerHomeAProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const api = manager(tenantSlug);

  const [inProgress, setInProgress] = useState<InProgressItem[]>([]);
  const [team, setTeam] = useState(M_TEAM_FALLBACK);
  const [, setRefreshTick] = useState(0);

  const refreshAll = useMemo(
    () => async () => {
      try {
        const [pauses, complaints, lateArrivals, merges, lgpd] = await Promise.all([
          api.zonePauses.list({ active: true }).catch(() => []),
          api.complaints.list().catch(() => []),
          api.lateArrival.list().catch(() => []),
          api.tableMerge.list().catch(() => []),
          api.lgpd.list().catch(() => []),
        ]);

        const items: InProgressItem[] = [];

        // Active zone pauses → zone-pause-active info card
        for (const p of pauses) {
          if (!p.active) continue;
          const remaining = Math.max(
            0,
            Math.floor((new Date(p.endsAt).getTime() - Date.now()) / 1000),
          );
          items.push({
            id: `zp-${p.id}`,
            kind: 'zone-pause-active',
            state: 'active',
            zonePauseWaiterName: p.waiterName,
            zonePauseRemaining: remaining,
            toRoute: '/manager/pausa-zona',
          });
        }

        // Open complaints (status !== resolved)
        for (const c of complaints) {
          if (c.status === 'resolved') continue;
          items.push({
            id: `c-${c.id}`,
            kind: 'complaint',
            state: 'active',
            complaintTable: c.tableNumber,
            complaintCustomer: c.customerName,
            complaintSummary: c.description,
            toRoute: `/manager/chamado/${c.id}?kind=complaint`,
          });
        }

        // Pending late-arrivals
        for (const r of lateArrivals) {
          if (r.status !== 'pending') continue;
          items.push({
            id: `la-${r.id}`,
            kind: 'late-arrival',
            state: 'waiting',
            requesterName: r.requesterName,
            requestedTable: r.tableNumber,
            toRoute: `/manager/stat/late-arrival/${r.id}`,
          });
        }

        // Pending merges
        for (const m of merges) {
          if (m.status !== 'pending') continue;
          items.push({
            id: `tm-${m.id}`,
            kind: 'table-merge',
            state: 'waiting',
            requesterName: m.originHostName,
            requestedTable: m.originTableNumber,
            toRoute: `/manager/stat/merge/${m.id}`,
          });
        }

        // LGPD pending (rare; usually fulfilled instantly for erasure)
        for (const l of lgpd) {
          if (l.status === 'fulfilled' || l.status === 'rejected') continue;
          items.push({
            id: `lgpd-${l.id}`,
            kind: 'lgpd-request-pending',
            state: 'active',
            lgpdRequestNumber: l.protocolNumber,
            lgpdType: l.type,
            toRoute: `/manager/stat/lgpd/${l.id}`,
          });
        }

        setInProgress(items);
      } catch {
        // silent — keep last good state
      }
    },
    [api],
  );

  useEffect(() => {
    refreshAll();
    const tick = setInterval(() => setRefreshTick((n) => n + 1), 1000); // for ttl ticking
    const refresh = setInterval(refreshAll, 30000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [refreshAll]);

  // Fetch staff list for shift section
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/${tenantSlug}/staff`,
          { credentials: 'include' },
        );
        if (!r.ok) return;
        const data = (await r.json()) as Array<{
          id: string;
          name: string;
          role: string;
          color?: string;
        }>;
        if (cancelled || !Array.isArray(data) || !data.length) return;
        setTeam(
          data.map((s, i) => ({
            id: i + 1,
            name: s.name,
            role: s.role,
            init: s.name
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')
              .toUpperCase(),
            shift: 'on',
            rating: 4.5 + (i % 3) * 0.1,
            callsAvg: 1.2 + (i % 4) * 0.3,
            tables: Math.max(0, 7 - i),
            scaled: i === 2 ? 2 : 0,
            color: s.color || ['#4F6BFF', '#E37D2F', '#7A4FBE', '#1E8C5A', '#C43A3A', '#0B7A8B'][i % 6],
            flag: null,
          })),
        );
      } catch {
        // keep fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  // Live updates
  useManagerEvents(tenantSlug, (event) => {
    switch (event.event) {
      case 'complaint.created':
      case 'complaint.responded':
      case 'complaint.resolved':
      case 'late_arrival.created':
      case 'late_arrival.approved':
      case 'late_arrival.rejected':
      case 'late_arrival.expired':
      case 'table_merge.created':
      case 'table_merge.approved':
      case 'table_merge.rejected':
      case 'zone_pause.started':
      case 'zone_pause.ended':
      case 'lgpd.request_fulfilled':
        refreshAll();
        break;
      default:
        break;
    }
  });

  const onShift = team.filter((t) => t.shift === 'on');
  const overloaded = onShift.filter((t) => t.scaled > 1).length;
  const inCall = onShift.filter((t) => t.flag === 'in-call').length;
  const pauseOp = inProgress.find(
    (o) => o.kind === 'zone-pause-active' && o.zonePauseRemaining != null,
  );
  const topAlerts = DEFAULT_ALERTS.slice(0, 3);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        <MAppHeader
          dark={dark}
          title="Painel"
          greetingName={greetingName ?? 'Renata Albuquerque'}
          bellBadge={bellBadge ?? inProgress.length}
        />

        <div style={{ marginTop: 4 }}>
          <MQuickActionsBar
            dark={dark}
            slim
            onTo={(r) => router.push(r)}
            pauseActive={
              pauseOp && pauseOp.zonePauseRemaining != null
                ? { remaining: pauseOp.zonePauseRemaining }
                : null
            }
          />
        </div>

        {inProgress.length > 0 && (
          <MSection dark={dark} title={`Em curso · ${inProgress.length}`}>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {inProgress.map((op) => (
                <MInProgressCard
                  key={op.id}
                  dark={dark}
                  kind={op.kind}
                  state={op.state}
                  ttl={op.ttl}
                  pauseMeta={op.pauseMeta}
                  contactTable={op.contactTable}
                  contactPreview={op.contactPreview}
                  zonePauseWaiterName={op.zonePauseWaiterName}
                  zonePauseRemaining={op.zonePauseRemaining}
                  complaintTable={op.complaintTable}
                  complaintCustomer={op.complaintCustomer}
                  complaintSummary={op.complaintSummary}
                  requesterName={op.requesterName}
                  requestedTable={op.requestedTable}
                  lgpdRequestNumber={op.lgpdRequestNumber}
                  lgpdType={op.lgpdType}
                  staffMessageFromName={op.staffMessageFromName}
                  staffMessagePreview={op.staffMessagePreview}
                  staffMessageCount={op.staffMessageCount}
                  onTap={() => router.push(op.toRoute)}
                  onPrimary={() => router.push(op.toRoute)}
                />
              ))}
            </div>
          </MSection>
        )}

        <MSection
          dark={dark}
          title={`Hoje no turno · ${DEFAULT_ALERTS.length}`}
          action="Ver todos →"
          onAction={() => router.push('/manager/operacoes')}
        >
          {topAlerts.length === 0 ? (
            <div
              style={{
                padding: '4px 16px 0',
                fontSize: 10.5,
                color: C.faint,
                fontWeight: 700,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
              }}
            >
              Tudo tranquilo por aqui
            </div>
          ) : (
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topAlerts.map((a) => {
                const isHigh = a.sev === 'high';
                return (
                  <div
                    key={a.id}
                    style={{
                      position: 'relative',
                      padding: 12,
                      borderRadius: 12,
                      background: C.bg,
                      border: `1px solid ${isHigh ? '#F4C7C7' : '#F0DCB6'}`,
                      borderLeft: `3px solid ${isHigh ? '#C43A3A' : '#D98E2B'}`,
                    }}
                  >
                    <button
                      aria-label="Dispensar"
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: C.faint,
                      }}
                    >
                      {Icon.x(14)}
                    </button>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 6,
                        paddingRight: 24,
                      }}
                    >
                      <MPill tone={isHigh ? 'danger' : 'warn'} dark={dark}>
                        {isHigh ? 'CRÍTICO' : 'ATENÇÃO'} · há {a.ts}
                      </MPill>
                    </div>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: C.ink,
                        lineHeight: 1.3,
                        letterSpacing: -0.1,
                        paddingRight: 24,
                      }}
                    >
                      {a.msg}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: C.faint,
                        fontWeight: 500,
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {a.sub}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: C.ink,
                          color: C.bg,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {a.actions[0]}
                      </button>
                      <button
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: 'transparent',
                          color: C.ink,
                          border: `1px solid ${C.borderSoft}`,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {a.actions[1]}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </MSection>

        <MSection
          dark={dark}
          title={`Equipe em turno · ${onShift.length}`}
          action="Ver mais →"
          onAction={() => router.push('/manager/equipe')}
        >
          {(overloaded > 0 || inCall > 0) && (
            <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {overloaded > 0 && (
                <MPill tone="danger" dot dark={dark}>
                  {overloaded} sobrecarregado{overloaded !== 1 && 's'}
                </MPill>
              )}
              {inCall > 0 && (
                <MPill tone="warn" dot dark={dark}>
                  {inCall} em chamado
                </MPill>
              )}
            </div>
          )}
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {onShift.slice(0, 4).map((p) => {
              const flag =
                p.flag === 'overload'
                  ? { tone: 'danger' as const, label: 'Sobrec.' }
                  : p.flag === 'in-call'
                  ? { tone: 'warn' as const, label: 'Em chamado' }
                  : null;
              return (
                <button
                  key={p.id}
                  onClick={() => router.push('/manager/equipe')}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${C.borderSoft}`,
                    background: C.bg,
                  }}
                >
                  <MAvatar name={p.name} init={p.init} color={p.color} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: C.ink,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.faint, fontWeight: 500, marginTop: 1 }}>
                      {p.role}
                      {p.tables > 0 && ` · ${p.tables} mesas`}
                      {p.callsAvg > 0 && ` · ${p.callsAvg}m resposta`}
                    </div>
                  </div>
                  {flag && (
                    <MPill tone={flag.tone} dark={dark}>
                      {flag.label}
                    </MPill>
                  )}
                  <div
                    style={{
                      fontSize: 11,
                      color: C.faint,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    ★ {p.rating}
                  </div>
                </button>
              );
            })}
          </div>
        </MSection>

        <MSection
          dark={dark}
          title="Próximas reservas"
          action="Agenda completa →"
        >
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {NEXT_RESERVATIONS.map((r) => (
              <div
                key={r.id}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${C.borderSoft}`,
                  background: C.bg,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    minWidth: 64,
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: '#F4F0E8',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: C.ink,
                      letterSpacing: -0.4,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {r.time}
                  </div>
                  <div
                    style={{
                      fontSize: 9.5,
                      color: C.faint,
                      fontWeight: 700,
                      marginTop: 1,
                      letterSpacing: 0.3,
                    }}
                  >
                    EM {r.in.replace(' min', "'")}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: C.ink,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.faint, fontWeight: 500, marginTop: 2 }}>
                    {r.party} pessoas · {r.table}
                  </div>
                  {r.tag && r.tagTone && (
                    <div style={{ marginTop: 4 }}>
                      <MPill tone={r.tagTone} dark={dark}>
                        {r.tag}
                      </MPill>
                    </div>
                  )}
                </div>
                <span style={{ color: C.faint, opacity: 0.6 }}>{Icon.arrow(16)}</span>
              </div>
            ))}
          </div>
        </MSection>

        <div style={{ height: 24 }} />
      </div>

      <MBottomNav active="home" dark={dark} onTo={(r) => router.push(r)} alerts={DEFAULT_ALERTS.length} />
    </div>
  );
}

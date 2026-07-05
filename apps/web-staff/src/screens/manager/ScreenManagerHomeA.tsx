'use client';

// Painel (Home) — first screen the manager sees.
//
// V4 layout (per garcom-screens-c.jsx):
//   1. HERO — saudação · AO VIVO · sino com badge
//   2. FERRAMENTAS RÁPIDAS — slim 2-card MQuickActionsBar (Pausar Zona +
//      Mensagem Equipe)
//   3. EM CURSO — persistent cards for async ops the manager dispatched
//   4. HOJE NO TURNO — alerts (compacted)
//   5. EQUIPE ATIVA — top 4 (contas com is_active; NÃO é presença de turno)
//   6. PRÓXIMAS RESERVAS — top 3 (GET /host/reservations, awaited)
//
// All real data is loaded via the manager API helpers + useManagerEvents for
// live updates.

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  MContactClientSheet,
  type InProgressKind,
  type InProgressState,
} from '../../components/manager';
import { manager, staffRosterApi, teamKpisApi } from '../../lib/api/manager';
import { listReservations, type ReservationEntry } from '../../lib/api/host';
import { useManagerEvents } from '../../hooks/useManagerEvents';
import type { ComplaintDto } from '@restaurant/shared-types';

// ─── Mock data — bottlenecks + reservations ────────────────────
// Will be wired to /alerts and /host/reservations once those endpoints land.

// Auditoria 2026-07-03 (Balde 2): os 3 alertas eram FAKE — agora vêm do
// GET /alerts (status=open) e o Dispensar faz POST /alerts/:id/dismiss
// com rollback. Sem alertas reais, o card mostra o empty-state.
interface HomeAlert {
  id: string;
  sev: 'high' | 'med';
  msg: string;
  sub: string;
  ts: string;
  actions: string[];
}

function homeRelativeTs(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(min) || min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h`;
}

// P1 #32 — empty until /staff loads. Empty-state copy below covers gap.
//
// Anti-placebo (P1-F do re-scan, 2026-07-04): as métricas por funcionário
// não são mais fabricadas por índice do array. `avgRating`/`avgResponseMin`
// vêm do GET /dashboard/team-kpis (avgRating dos últimos 7d via order_ratings,
// avgResponseMin de waiter_calls acknowledged HOJE) e são `null` quando não há
// dado real — a UI simplesmente omite o campo em vez de inventar número.
// Removidos: `tables` (não há contagem por-staff real na home), `scaled` e a
// pill "N sobrecarregado" (não existe sinal real de sobrecarga).
type TeamMember = {
  id: string;
  name: string;
  role: string;
  init: string;
  shift: string;
  avgRating: number | null;
  ratingsCount: number;
  avgResponseMin: number | null;
  color: string;
  flag: 'in-call' | 'overload' | null;
};

const M_TEAM_FALLBACK: TeamMember[] = [];

const HOME_ROLE_PALETTE = ['#4F6BFF', '#E37D2F', '#7A4FBE', '#1E8C5A', '#C43A3A', '#0B7A8B'];

// P2 (re-scan 2026-07-05) — "Próximas reservas" agora vem do GET
// /:slug/host/reservations (listReservations). Mostra só as `awaited`
// ordenadas por horário, top 3 (sem fabricar "em X min" — `when` é HH:MM,
// não temos data/tz confiável). Sem reservas → empty-state honesto.

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
  complaint?: ComplaintDto;
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
  const searchParams = useSearchParams();
  const replyComplaintId = searchParams.get('replyComplaint');
  const api = useMemo(() => manager(tenantSlug), [tenantSlug]);

  const [inProgress, setInProgress] = useState<InProgressItem[]>([]);
  const [replyComplaint, setReplyComplaint] = useState<ComplaintDto | null>(null);
  const [team, setTeam] = useState(M_TEAM_FALLBACK);
  const [, setRefreshTick] = useState(0);
  const [alerts, setAlerts] = useState<HomeAlert[]>([]);
  const [reservations, setReservations] = useState<ReservationEntry[]>([]);

  useEffect(() => {
    let stop = false;
    api.alerts
      .list({ status: 'open' })
      .then((rows) => {
        if (stop) return;
        setAlerts(
          rows.map((row) => ({
            id: row.id,
            sev: row.sev === 'crítica' ? ('high' as const) : ('med' as const),
            msg: row.title,
            sub: row.sub ?? '',
            ts: homeRelativeTs(row.created_at),
            actions: (row.actions ?? []).map((a) => a.label).slice(0, 2),
          })),
        );
      })
      .catch(() => {
        /* sem servidor → card fica no empty-state, sem inventar alerta */
      });
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug]);

  const dismissAlert = (id: string) => {
    const snapshot = alerts;
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    api.alerts.dismiss(id).catch(() => setAlerts(snapshot));
  };
  const runAlertAction = (action: string) => {
    const label = action.toLowerCase();
    if (label.includes('cozinha') || label.includes('fila')) {
      router.push(`/manager/kitchen-reorder?slug=${tenantSlug}`);
    } else if (label.includes('cliente') || label.includes('mensagem')) {
      router.push(`/manager/mensagens?slug=${tenantSlug}`);
    } else if (label.includes('garçom') || label.includes('garcom') || label.includes('equipe')) {
      router.push(`/manager/equipe?slug=${tenantSlug}`);
    } else {
      router.push(`/manager/alertas?slug=${tenantSlug}`);
    }
  };

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
            complaint: c,
            toRoute: `/manager/chamado/${c.id}?kind=complaint`,
          });
        }
        if (replyComplaintId && !replyComplaint) {
          const pendingReply = complaints.find(
            (c) => c.id === replyComplaintId && c.status !== 'resolved',
          );
          if (pendingReply?.tableSessionId && pendingReply.customerId) {
            setReplyComplaint(pendingReply);
          }
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
            requesterName: m.originHostName ?? undefined,
            requestedTable: m.originTableNumber ?? undefined,
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
    [api, replyComplaint, replyComplaintId],
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

  // Fetch staff list + real per-staff KPIs for the shift section (P1 #14, #32,
  // P1-F). team-kpis é ranqueado por staffId; casamos com o roster pelo id.
  // Sem KPI real pro staff (ou endpoint fora), rating/tempo ficam null e a UI
  // omite — nunca inventa (doutrina anti-placebo).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [roster, kpis] = await Promise.all([
          staffRosterApi(tenantSlug).list(),
          teamKpisApi(tenantSlug)
            .get()
            .then((r) => r.team)
            .catch(() => []),
        ]);
        if (cancelled || !roster.length) return;
        const kpiByStaffId = new Map(kpis.map((k) => [k.staffId, k]));
        setTeam(
          roster.map((s, i) => {
            const k = kpiByStaffId.get(s.id);
            return {
              id: s.id,
              name: s.name,
              role: s.role,
              init: s.name
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
                .toUpperCase(),
              // is_active = conta ativa no sistema (não presença de turno ao
              // vivo — o app não registra login/entrada). "on" = conta ativa.
              shift: s.is_active ? 'on' : 'off',
              avgRating: k?.avgRating ?? null,
              ratingsCount: k?.ratingsCount ?? 0,
              avgResponseMin: k?.avgResponseMinutes ?? null,
              color: HOME_ROLE_PALETTE[i % HOME_ROLE_PALETTE.length],
              flag: null,
            };
          }),
        );
      } catch {
        // keep fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  // Próximas reservas (P2 re-scan) — dado real de GET /host/reservations.
  // Sem reservas ou endpoint fora → lista vazia e a UI mostra empty-state.
  useEffect(() => {
    let cancelled = false;
    listReservations(tenantSlug)
      .then((data) => {
        if (!cancelled) setReservations(data);
      })
      .catch(() => {
        // keep empty → empty-state honesto
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  // Live updates
  useManagerEvents(tenantSlug, (event) => {
    switch (event.event) {
      case 'complaint.received':
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
  // Sem sinal real de sobrecarga na home → sem pill "N sobrecarregado" (P1-F).
  const inCall = onShift.filter((t) => t.flag === 'in-call').length;
  const pauseOp = inProgress.find(
    (o) => o.kind === 'zone-pause-active' && o.zonePauseRemaining != null,
  );
  const topAlerts = alerts.slice(0, 3);
  // Só as que ainda vão chegar, por horário, top 3.
  const upcomingReservations = reservations
    .filter((r) => r.status === 'awaited')
    .sort((a, b) => a.when.localeCompare(b.when))
    .slice(0, 3);

  return (
    <div
      style={{
        height: '100vh',
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
          greetingName={greetingName}
          bellBadge={bellBadge ?? inProgress.length}
        />

        <div style={{ marginTop: 4 }}>
          {/* V11 · Cozinha · Reordenar fila / Pausa · Pedidos novos
              (não é mais "Pausar Zona / Mensagem Equipe" do V3). */}
          <MQuickActionsBar
            dark={dark}
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
                  onTap={() =>
                    op.kind === 'complaint' &&
                    op.complaint?.tableSessionId &&
                    op.complaint.customerId
                      ? setReplyComplaint(op.complaint)
                      : router.push(op.toRoute)
                  }
                  onPrimary={() =>
                    op.kind === 'complaint' &&
                    op.complaint?.tableSessionId &&
                    op.complaint.customerId
                      ? setReplyComplaint(op.complaint)
                      : router.push(op.toRoute)
                  }
                />
              ))}
            </div>
          </MSection>
        )}

        <MSection
          dark={dark}
          title={`Hoje no turno · ${alerts.length}`}
          action="Ver todos →"
          onAction={() => router.push('/manager/alertas')}
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
                      type="button"
                      aria-label="Dispensar"
                      onClick={() => dismissAlert(a.id)}
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
                        type="button"
                        onClick={() => runAlertAction(a.actions[0])}
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
                        type="button"
                        onClick={() => runAlertAction(a.actions[1])}
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
          title={`Equipe ativa · ${onShift.length}`}
          action="Ver mais →"
          onAction={() => router.push('/manager/equipe')}
        >
          {inCall > 0 && (
            <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <MPill tone="warn" dot dark={dark}>
                {inCall} em chamado
              </MPill>
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
                      {p.avgResponseMin != null &&
                        ` · ${p.avgResponseMin.toFixed(1).replace('.', ',')}m resposta`}
                    </div>
                  </div>
                  {flag && (
                    <MPill tone={flag.tone} dark={dark}>
                      {flag.label}
                    </MPill>
                  )}
                  {p.avgRating != null && p.ratingsCount > 0 && (
                    <div
                      style={{
                        fontSize: 11,
                        color: C.faint,
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      ★ {p.avgRating.toFixed(1).replace('.', ',')}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </MSection>

        <MSection
          dark={dark}
          title="Próximas reservas"
          action={upcomingReservations.length > 0 ? 'Agenda completa →' : undefined}
          onAction={
            upcomingReservations.length > 0
              ? () => router.push(`/host/reservations?tenant=${tenantSlug}`)
              : undefined
          }
        >
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcomingReservations.length === 0 ? (
              <div
                style={{
                  padding: '16px 12px',
                  borderRadius: 12,
                  border: `1px dashed ${C.borderSoft}`,
                  background: C.bg,
                  fontSize: 12.5,
                  color: C.faint,
                  fontWeight: 500,
                  lineHeight: 1.5,
                }}
              >
                Nenhuma reserva aguardada. Reservas criadas na recepção aparecem aqui.
              </div>
            ) : (
              upcomingReservations.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => router.push(`/host/reservations?tenant=${tenantSlug}`)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    width: '100%',
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
                      {r.when}
                    </div>
                    <div
                      style={{
                        fontSize: 9.5,
                        color: C.faint,
                        fontWeight: 700,
                        marginTop: 1,
                        letterSpacing: 0.3,
                        textTransform: 'uppercase',
                      }}
                    >
                      Aguardada
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
                      {r.party} {r.party === 1 ? 'pessoa' : 'pessoas'}
                      {r.table != null ? ` · Mesa ${r.table}` : ''}
                    </div>
                  </div>
                  <span style={{ color: C.faint, opacity: 0.6 }}>{Icon.arrow(16)}</span>
                </button>
              ))
            )}
          </div>
        </MSection>

        <div style={{ height: 24 }} />
      </div>

      <MBottomNav active="home" dark={dark} onTo={(r) => router.push(r)} alerts={alerts.length} />

      {replyComplaint && replyComplaint.tableSessionId && replyComplaint.customerId && (
        <MContactClientSheet
          open={!!replyComplaint}
          dark={dark}
          tenantSlug={tenantSlug}
          tenantId={tenantSlug}
          tableSessionId={replyComplaint.tableSessionId}
          customerId={replyComplaint.customerId}
          customerName={replyComplaint.customerName}
          tableNumber={replyComplaint.tableNumber}
          waitingContext="reclamação aberta"
          orderHint={replyComplaint.description}
          managerName="Gerência"
          draftStorageKey={`manager:complaint-draft:${replyComplaint.id}`}
          suggestionOverrides={[
            { id: 'on-the-way', text: 'Estou indo até a mesa agora.', icon: 'user' },
            {
              id: 'kitchen-check',
              text: 'Vou verificar com a cozinha e já volto com uma resposta.',
              icon: 'clock',
            },
            {
              id: 'courtesy',
              text: 'Vou registrar uma cortesia pela espera.',
              icon: 'gift',
              linksTo: 'mgr-compensate',
            },
          ]}
          onClose={() => setReplyComplaint(null)}
          onLinkTo={(route) => {
            if (route === 'mgr-compensate') {
              const qs = new URLSearchParams({
                slug: tenantSlug,
                tableNumber: String(replyComplaint.tableNumber),
                tableSessionId: replyComplaint.tableSessionId,
              });
              router.push(`/manager/compensate?${qs.toString()}`);
            }
          }}
          onSent={(content) => {
            api.complaints
              .respond(replyComplaint.id, {
                content,
                chipAction: 'custom',
              })
              .then(() => refreshAll())
              .catch(() => refreshAll());
          }}
        />
      )}
    </div>
  );
}

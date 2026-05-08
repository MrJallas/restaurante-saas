'use client';

// Operação tab. 3 sub-tabs:
//   Calls / Escalations / Pauses
//
// Adapted from `ScreenManagerOps` in garcom-screens-d.jsx (which had Alertas /
// Mapa / Funil) — replaces the analytics tabs with operational lists that map
// 1:1 to the manager API endpoints we ship in Phase 2.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  Icon,
  MAppHeader,
  MBottomNav,
  MTab,
  MStat,
  MPill,
  MQuickActionsBar,
} from '../../components/manager';
import { manager } from '../../lib/api/manager';
import { useManagerEvents } from '../../hooks/useManagerEvents';
import type {
  ComplaintDto,
  ZonePauseDto,
  LateArrivalRequestDto,
  TableMergeRequestDto,
} from '@restaurant/shared-types';

export type OpsTab = 'calls' | 'escalations' | 'pauses';

export interface ScreenManagerOpsProps {
  dark?: boolean;
  tenantSlug: string;
  tab?: OpsTab;
}

export function ScreenManagerOps({ dark, tenantSlug, tab = 'calls' }: ScreenManagerOpsProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const api = manager(tenantSlug);
  const [active, setActive] = useState<OpsTab>(tab);
  const [complaints, setComplaints] = useState<ComplaintDto[]>([]);
  const [pauses, setPauses] = useState<ZonePauseDto[]>([]);
  const [lateArrivals, setLateArrivals] = useState<LateArrivalRequestDto[]>([]);
  const [merges, setMerges] = useState<TableMergeRequestDto[]>([]);

  const refresh = async () => {
    const [c, p, la, m] = await Promise.all([
      api.complaints.list().catch(() => []),
      api.zonePauses.list().catch(() => []),
      api.lateArrival.list().catch(() => []),
      api.tableMerge.list().catch(() => []),
    ]);
    setComplaints(c);
    setPauses(p);
    setLateArrivals(la);
    setMerges(m);
  };

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 30000);
    return () => clearInterval(i);
  }, [tenantSlug]);

  useManagerEvents(tenantSlug, (e) => {
    if (
      e.event.startsWith('complaint.') ||
      e.event.startsWith('late_arrival.') ||
      e.event.startsWith('table_merge.') ||
      e.event.startsWith('zone_pause.')
    ) {
      refresh();
    }
  });

  const openComplaints = complaints.filter((c) => c.status !== 'resolved');
  const activePauses = pauses.filter((p) => p.active);
  const pendingLA = lateArrivals.filter((r) => r.status === 'pending');
  const pendingMerges = merges.filter((m) => m.status === 'pending');

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
        <MAppHeader dark={dark} title="Operação" bellBadge={openComplaints.length} />

        <div
          role="tablist"
          aria-label="Sub-abas de operação"
          style={{
            display: 'flex',
            borderBottom: `1px solid ${C.borderSoft}`,
            background: C.bg,
          }}
        >
          <MTab
            dark={dark}
            active={active === 'calls'}
            count={openComplaints.length}
            onClick={() => setActive('calls')}
          >
            Chamados
          </MTab>
          <MTab
            dark={dark}
            active={active === 'escalations'}
            count={pendingLA.length + pendingMerges.length}
            onClick={() => setActive('escalations')}
          >
            Escalações
          </MTab>
          <MTab
            dark={dark}
            active={active === 'pauses'}
            count={activePauses.length}
            onClick={() => setActive('pauses')}
          >
            Pausas
          </MTab>
        </div>

        <div style={{ padding: '12px 16px 0', display: 'flex', gap: 10 }}>
          <MStat
            dark={dark}
            compact
            label="Críticos"
            value={String(openComplaints.length)}
            sub={openComplaints.length > 0 ? 'resolver agora' : 'tudo ok'}
            accent={openComplaints.length > 0 ? '#C43A3A' : null}
          />
          <MStat
            dark={dark}
            compact
            label="Pausas"
            value={String(activePauses.length)}
            sub={activePauses.length > 0 ? 'em andamento' : 'nenhuma'}
            accent={activePauses.length > 0 ? '#9A7212' : null}
          />
        </div>

        {active === 'calls' && (
          <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {openComplaints.length === 0 ? (
              <EmptyState dark={dark} text="Nenhum chamado aberto." />
            ) : (
              openComplaints.map((c) => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/manager/chamado/${c.id}?kind=complaint`)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid #F4C7C7`,
                    borderLeft: `3px solid #C43A3A`,
                    background: C.bg,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <MPill tone="danger" dark={dark}>
                      Reclamação
                    </MPill>
                    <span style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>
                      Mesa {c.tableNumber} · {c.customerName}
                    </span>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>
                    {c.problemType.replace('-', ' ')}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
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
                    {c.description}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {active === 'escalations' && (
          <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingLA.length === 0 && pendingMerges.length === 0 ? (
              <EmptyState dark={dark} text="Nenhuma escalação pendente." />
            ) : (
              <>
                {pendingLA.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => router.push(`/manager/stat/late-arrival/${r.id}`)}
                    style={cardButton(C, '#3B5FBE', '#EFF3FA')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <MPill tone="info" dark={dark}>
                        Chegada Tardia
                      </MPill>
                      <span style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>
                        Mesa {r.tableNumber}
                      </span>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>
                      {r.requesterName}
                    </div>
                    {r.visitContext && (
                      <div style={{ fontSize: 12, color: C.mute, marginTop: 3 }}>{r.visitContext}</div>
                    )}
                  </button>
                ))}
                {pendingMerges.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => router.push(`/manager/stat/merge/${m.id}`)}
                    style={cardButton(C, '#3B5FBE', '#EFF3FA')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <MPill tone="info" dark={dark}>
                        Junção de Mesas
                      </MPill>
                      <span style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>
                        M{m.originTableNumber} → M{m.targetTableNumber}
                      </span>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>
                      {m.originHostName}
                      {m.targetHostName ? ` ↔ ${m.targetHostName}` : ' ↔ walk-in'}
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {active === 'pauses' && (
          <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activePauses.length === 0 ? (
              <EmptyState dark={dark} text="Nenhuma pausa ativa." />
            ) : (
              activePauses.map((p) => {
                const remaining = Math.max(
                  0,
                  Math.floor((new Date(p.endsAt).getTime() - Date.now()) / 1000),
                );
                const mm = Math.floor(remaining / 60).toString().padStart(2, '0');
                const ss = (remaining % 60).toString().padStart(2, '0');
                return (
                  <div
                    key={p.id}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: '1px solid #F0DCB6',
                      borderLeft: '3px solid #9A7212',
                      background: '#FFF7E6',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <MPill tone="warn" dark={dark}>
                        Zona Pausada
                      </MPill>
                      <span style={{ fontSize: 11, color: '#7A4D10', fontWeight: 700 }}>
                        {p.waiterName}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 800,
                        color: '#7A4D10',
                        letterSpacing: -1,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {mm}:{ss}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        onClick={() => api.zonePauses.end(p.id).then(refresh)}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: '#9A7212',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        Encerrar agora
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <MQuickActionsBar dark={dark} onTo={(r) => router.push(r)} />
      <MBottomNav active="ops" dark={dark} onTo={(r) => router.push(r)} alerts={openComplaints.length} />
    </div>
  );
}

const cardButton = (
  C: ReturnType<typeof useG>,
  border: string,
  bg: string,
): React.CSSProperties => ({
  all: 'unset',
  cursor: 'pointer',
  boxSizing: 'border-box',
  padding: 12,
  borderRadius: 12,
  border: `1px solid ${C.borderSoft}`,
  borderLeft: `3px solid ${border}`,
  background: bg,
});

function EmptyState({ dark, text }: { dark?: boolean; text: string }) {
  const C = useG(!!dark);
  return (
    <div
      style={{
        padding: 28,
        border: `1.5px dashed ${C.borderSoft}`,
        borderRadius: 14,
        textAlign: 'center',
        color: C.faint,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      <span style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }}>
        {Icon.check(16)}
      </span>
      {text}
    </div>
  );
}

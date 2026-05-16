'use client';

// ScreenWaiterCalls — canvas garcom-screens-b.jsx:1908. Lista
// unificada de chamados do salão pro waiter (table-calls + manager-msgs
// + cozinha-ready). Tap em card → /waiter/call/[id].
//
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useG, G_FONT, MONO_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GIconBtn, GBottomNav } from '../../components/waiter/Primitives';
import { listPendingCalls, type WaiterCallSummary } from '../../lib/api/waiter';

type CallType = 'pediu-conta' | 'chamou-garcom' | 'pronto-cozinha' | 'mais-bebida';
type Urgency = 'high' | 'med' | 'low';

interface CallRow {
  id: string;
  type: CallType;
  tableNumber?: number;
  partySize?: number;
  sub: string;
  ts: string;
  urgency: Urgency;
}

const COPY: Record<CallType, { label: string; tint: string; icon: (s?: number) => ReactNode }> = {
  'pediu-conta': { label: 'Pediu a conta', tint: '#C43A3A', icon: Icon.receipt },
  'chamou-garcom': { label: 'Chamou garçom', tint: '#D98E2B', icon: Icon.hand },
  'pronto-cozinha': { label: 'Pronto · cozinha', tint: '#2F7D4F', icon: Icon.check },
  'mais-bebida': { label: 'Pediu bebida', tint: '#1F3784', icon: Icon.glass },
};

type Filter = 'todos' | 'urgentes' | 'pronto' | 'minhas';

const REASON_LABEL: Record<string, string> = {
  bring_menu: 'Trazer cardápio',
  place_order: 'Anotar pedido',
  serve_drink: 'Trazer bebida',
  ask_bill: 'Cliente pediu a conta',
  other: 'Sem motivo informado',
};

function typeFromReason(reason?: string | null): CallType {
  if (reason === 'ask_bill') return 'pediu-conta';
  if (reason === 'serve_drink') return 'mais-bebida';
  return 'chamou-garcom';
}

function tableNumberFromCode(row: WaiterCallSummary): number | undefined {
  const raw = row.table_code || row.table_label || '';
  const match = raw.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function relativeTime(value: string): string {
  const created = new Date(value).getTime();
  const diffSeconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
  if (diffSeconds < 60) return `há ${Math.max(diffSeconds, 1)}s`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `há ${diffHours} h`;
}

function urgencyFromCreatedAt(value: string): Urgency {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (diffSeconds >= 180) return 'high';
  if (diffSeconds >= 60) return 'med';
  return 'low';
}

function mapCall(row: WaiterCallSummary): CallRow {
  return {
    id: row.id,
    type: typeFromReason(row.reason),
    tableNumber: tableNumberFromCode(row),
    sub: row.note || REASON_LABEL[row.reason || 'other'] || 'Sem motivo informado',
    ts: relativeTime(row.created_at),
    urgency: urgencyFromCreatedAt(row.created_at),
  };
}

export function ScreenWaiterCalls({ dark = false, tenantSlug }: { dark?: boolean; tenantSlug: string }) {
  const C = useG(dark);
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('todos');
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const rows = await listPendingCalls(tenantSlug);
        if (cancelled) return;
        setCalls(rows.map(mapCall));
        setErrorMsg(null);
      } catch (error) {
        console.error('[waiter-calls] list failed', error);
        if (!cancelled) setErrorMsg('Não foi possível carregar os chamados.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load(true);
    const intervalId = window.setInterval(() => load(false), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [tenantSlug]);

  const filtered = calls.filter((c) => {
    if (filter === 'urgentes') return c.urgency === 'high';
    if (filter === 'pronto') return c.type === 'pronto-cozinha';
    if (filter === 'minhas') return false; // requires waiter-table assignment data
    return true;
  });

  const open = (c: CallRow) => {
    const qs = new URLSearchParams({
      type: c.type,
      tenant: tenantSlug,
    });
    if (c.tableNumber) qs.set('tableNumber', String(c.tableNumber));
    router.push(`/waiter/call/${c.id}?${qs.toString()}`);
  };

  const tabs: { id: Filter; lbl: string; count: number }[] = [
    { id: 'todos', lbl: 'Todos', count: calls.length },
    { id: 'urgentes', lbl: 'Urgentes', count: calls.filter((c) => c.urgency === 'high').length },
    { id: 'pronto', lbl: 'Pronto', count: calls.filter((c) => c.type === 'pronto-cozinha').length },
    { id: 'minhas', lbl: 'Minhas mesas', count: 0 },
  ];

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: C.bg,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => router.push(`/waiter?tenant=${tenantSlug}`)} />}
        title="Chamados"
        right={
          <GIconBtn
            dark={dark}
            icon={Icon.bell(20)}
            onClick={() => router.push(`/waiter/notifications?tenant=${tenantSlug}`)}
            ariaLabel="Notificações"
          />
        }
      />

      <div
        data-hide-scrollbar
        style={{
          padding: '12px 16px 8px',
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            aria-pressed={filter === t.id}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: 100,
              border: `1px solid ${filter === t.id ? C.ink : C.borderSoft}`,
              background: filter === t.id ? C.ink : 'transparent',
              color: filter === t.id ? C.bg : C.ink,
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {t.lbl} · {t.count}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 24px' }}>
        {loading ? (
          <div
            style={{
              padding: 32,
              border: `1px dashed ${C.borderSoft}`,
              borderRadius: 12,
              textAlign: 'center',
              color: C.faint,
              fontSize: 13,
            }}
          >
            Carregando chamados...
          </div>
        ) : errorMsg ? (
          <div
            style={{
              padding: 32,
              border: `1px dashed ${C.borderSoft}`,
              borderRadius: 12,
              textAlign: 'center',
              color: C.faint,
              fontSize: 13,
            }}
          >
            {errorMsg}
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: 32,
              border: `1px dashed ${C.borderSoft}`,
              borderRadius: 12,
              textAlign: 'center',
              color: C.faint,
              fontSize: 13,
            }}
          >
            Sem chamados nessa categoria.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((c) => {
              const cp = COPY[c.type];
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => open(c)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    width: '100%',
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid ${C.borderSoft}`,
                    background: C.bg,
                    borderLeft: `4px solid ${cp.tint}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: cp.tint,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {cp.icon(20)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        color: cp.tint,
                        fontFamily: MONO_FONT,
                      }}
                    >
                      {cp.label} · {c.ts}
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: C.ink,
                        letterSpacing: -0.2,
                        marginTop: 2,
                      }}
                    >
                      Mesa {c.tableNumber ?? '-'}{c.partySize ? ` · ${c.partySize}p` : ''}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: C.mute,
                        marginTop: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.sub}
                    </div>
                  </div>
                  <span style={{ color: C.faint, flexShrink: 0 }}>{Icon.arrow(16)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <GBottomNav
        active="calls"
        dark={dark}
        onTabChange={(id) => {
          if (id === 'home') router.push(`/waiter?tenant=${tenantSlug}`);
          else if (id === 'me') router.push(`/waiter/eu?tenant=${tenantSlug}`);
          else if (id === 'scan') router.push(`/waiter/scan-qr?tenant=${tenantSlug}`);
        }}
      />
    </div>
  );
}

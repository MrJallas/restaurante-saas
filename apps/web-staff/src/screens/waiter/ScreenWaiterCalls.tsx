'use client';

// ScreenWaiterCalls — canvas garcom-screens-b.jsx:1908. Lista
// unificada de chamados do salão pro waiter (table-calls + manager-msgs
// + cozinha-ready). Tap em card → /waiter/call/[id].
//
// Backend: existe `GET /staff/calls` (waiter-calls module). Pra Onda 3
// vou usar mock visual; quando wirar a API real, basta substituir
// MOCK_CALLS por fetch.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useG, G_FONT, MONO_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GIconBtn, GBottomNav } from '../../components/waiter/Primitives';

type CallType = 'pediu-conta' | 'chamou-garcom' | 'pronto-cozinha' | 'mais-bebida';
type Urgency = 'high' | 'med' | 'low';

interface CallRow {
  id: string;
  type: CallType;
  tableNumber: number;
  partySize: number;
  sub: string;
  ts: string;
  urgency: Urgency;
}

const MOCK_CALLS: CallRow[] = [
  { id: 'c1', type: 'pediu-conta', tableNumber: 3, partySize: 5, sub: 'R$ 612,40 · maquininha', ts: 'há 1 min', urgency: 'high' },
  { id: 'c2', type: 'chamou-garcom', tableNumber: 18, partySize: 4, sub: 'Sem motivo informado', ts: 'há 30s', urgency: 'high' },
  { id: 'c3', type: 'pronto-cozinha', tableNumber: 12, partySize: 4, sub: 'Risoto + Filé · 2 pratos', ts: 'há 2 min', urgency: 'high' },
  { id: 'c4', type: 'mais-bebida', tableNumber: 7, partySize: 2, sub: 'Aperol Spritz · sem azeitona', ts: 'há 4 min', urgency: 'med' },
  { id: 'c5', type: 'chamou-garcom', tableNumber: 9, partySize: 3, sub: 'Cliente acionou app', ts: 'há 5 min', urgency: 'low' },
];

const COPY: Record<CallType, { label: string; tint: string; icon: (s?: number) => React.ReactNode }> = {
  'pediu-conta': { label: 'Pediu a conta', tint: '#C43A3A', icon: Icon.receipt },
  'chamou-garcom': { label: 'Chamou garçom', tint: '#D98E2B', icon: Icon.hand },
  'pronto-cozinha': { label: 'Pronto · cozinha', tint: '#2F7D4F', icon: Icon.check },
  'mais-bebida': { label: 'Pediu bebida', tint: '#1F3784', icon: Icon.glass },
};

type Filter = 'todos' | 'urgentes' | 'pronto' | 'minhas';

export function ScreenWaiterCalls({ dark = false }: { dark?: boolean }) {
  const C = useG(dark);
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('todos');

  const filtered = MOCK_CALLS.filter((c) => {
    if (filter === 'urgentes') return c.urgency === 'high';
    if (filter === 'pronto') return c.type === 'pronto-cozinha';
    if (filter === 'minhas') return false; // requires waiter-table assignment data
    return true;
  });

  const open = (c: CallRow) => {
    const qs = new URLSearchParams({
      type: c.type,
      tableNumber: String(c.tableNumber),
    }).toString();
    router.push(`/waiter/call/${c.id}?${qs}`);
  };

  const tabs: { id: Filter; lbl: string; count: number }[] = [
    { id: 'todos', lbl: 'Todos', count: MOCK_CALLS.length },
    { id: 'urgentes', lbl: 'Urgentes', count: MOCK_CALLS.filter((c) => c.urgency === 'high').length },
    { id: 'pronto', lbl: 'Pronto', count: MOCK_CALLS.filter((c) => c.type === 'pronto-cozinha').length },
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
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={() => router.push('/waiter')} />}
        title="Chamados"
        right={
          <GIconBtn
            dark={dark}
            icon={Icon.bell(20)}
            onClick={() => router.push('/waiter/notifications')}
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
        {filtered.length === 0 ? (
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
                      Mesa {c.tableNumber} · {c.partySize}p
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
        <div
          style={{
            margin: '14px 0',
            padding: '10px 12px',
            border: '1px dashed #F0DCB6',
            borderRadius: 10,
            background: '#FFF7E6',
            fontSize: 11,
            color: '#7A4D10',
            fontWeight: 500,
            fontFamily: MONO_FONT,
          }}
        >
          DADOS MOCK · backend GET /staff/calls real chega na Onda 4
        </div>
      </div>

      <GBottomNav
        active="calls"
        dark={dark}
        onTabChange={(id) => {
          if (id === 'home') router.push('/waiter');
          else if (id === 'me') router.push('/waiter/eu');
          else if (id === 'scan') router.push('/waiter/scan-qr');
        }}
      />
    </div>
  );
}

'use client';

// ScreenManagerAlertsAll — canvas garcom-screens-d.jsx:1684.
//
// Rota /manager/alertas — expansão do Operação · Alertas. Permite ver
// lista completa, filtrar por severidade/tipo, dispensar e visualizar
// histórico do dia.
//
// Backend (todos TODO Onda 4):
//   • GET /alerts?severity=*&kind=*&limit=*
//   • POST /alerts/:id/dismiss
//   • POST /alerts/:id/action (label)
//   • GET /alerts/resolved?date=today
//
// Por enquanto mock inline + dismiss/action stub toast (mesma estratégia
// de Painel/Operação).

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  useG,
  G_FONT,
  MONO_FONT,
  MTopBar,
  GIconBtn,
  MStat,
  MPill,
  MBottomNav,
  Icon,
} from '../../components/manager';

type Severity = 'high' | 'med' | 'low';

interface AlertRow {
  id: number;
  sev: Severity;
  kind: string;
  t: string;
  ttl: string;
  sub: string;
  actions: [string, string];
}

const DEFAULT_ALERTS: AlertRow[] = [
  { id: 1, sev: 'high', kind: 'kitchen-slow', t: 'agora', ttl: 'Risoto cogumelos · 22 min na cozinha', sub: 'Mesa 14 · meta 12 min · Marina chamou 2×', actions: ['Avisar cozinha', 'Contactar cliente'] },
  { id: 2, sev: 'high', kind: 'waiter-late', t: 'agora', ttl: 'Henrique · 3 chamados sem resposta há > 4 min', sub: 'Mesas 7, 9, 12 · ele está com 5 mesas', actions: ['Realocar mesa', 'Chamar Henrique'] },
  { id: 3, sev: 'med', kind: 'table-cold', t: '5 min', ttl: 'Pedido pronto há 9 min · ainda na pass', sub: 'Mesa 14 · 2 pratos esperando entrega', actions: ['Entregar agora', 'Avisar Caleb'] },
  { id: 4, sev: 'med', kind: 'kitchen-queue', t: '8 min', ttl: 'Cozinha · fila com 11 pedidos', sub: 'Capacidade da cozinha é 8 simultâneos', actions: ['Pausar pedidos', 'Ver fila'] },
  { id: 5, sev: 'med', kind: 'payment-stuck', t: '12 min', ttl: 'Mesa 8 pediu a conta há 12 min', sub: 'Olivia ocupada com mesa 11', actions: ['Levar maquininha', 'Pagar pelo app'] },
  { id: 6, sev: 'low', kind: 'low-stock', t: '20 min', ttl: 'Estoque · vinho Malbec acabando', sub: '2 garrafas restantes · venda média 3/noite', actions: ['Avisar bar', 'Esconder do menu'] },
];

const RESOLVED_HISTORY = [
  { t: '19:18', txt: 'Mesa 11 · conta paga (8 min)', who: 'Olivia' },
  { t: '19:02', txt: 'Cozinha · fila normalizou (8/8)', who: 'auto' },
  { t: '18:47', txt: 'Mesa 5 · garçom respondeu chamado', who: 'Caleb' },
  { t: '18:30', txt: 'Estoque · cerveja IPA reposta', who: 'bar' },
];

type FilterTab = 'todos' | 'criticos' | 'medios' | 'cozinha';

export function ScreenManagerAlertsAll({ dark = false }: { dark?: boolean }) {
  const C = useG(dark);
  const router = useRouter();
  const [alerts, setAlerts] = useState<AlertRow[]>(DEFAULT_ALERTS);
  const [filter, setFilter] = useState<FilterTab>('todos');
  const [stubMsg, setStubMsg] = useState<string | null>(null);
  const showStub = (m: string) => {
    setStubMsg(`${m} · em desenvolvimento (Onda 4 backend).`);
    setTimeout(() => setStubMsg(null), 2800);
  };

  const high = alerts.filter((a) => a.sev === 'high').length;
  const med = alerts.filter((a) => a.sev === 'med').length;

  const filtered =
    filter === 'todos'
      ? alerts
      : filter === 'criticos'
      ? alerts.filter((a) => a.sev === 'high')
      : filter === 'medios'
      ? alerts.filter((a) => a.sev === 'med')
      : alerts.filter((a) => a.kind.startsWith('kitchen'));

  const tabs: { id: FilterTab; lbl: string; count: number }[] = [
    { id: 'todos', lbl: 'Todos', count: alerts.length },
    { id: 'criticos', lbl: 'Críticos', count: high },
    { id: 'medios', lbl: 'Médios', count: med },
    { id: 'cozinha', lbl: 'Cozinha', count: alerts.filter((a) => a.kind.startsWith('kitchen')).length },
  ];

  const sevDecor: Record<
    Severity,
    { bar: string; tone: 'danger' | 'warn' | 'mute'; label: string }
  > = {
    high: { bar: '#C43A3A', tone: 'danger', label: 'CRÍTICO' },
    med: { bar: '#D98E2B', tone: 'warn', label: 'ATENÇÃO' },
    low: { bar: C.faint, tone: 'mute', label: 'AVISO' },
  };

  const dismiss = (id: number) => setAlerts((prev) => prev.filter((a) => a.id !== id));

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <MTopBar
        dark={dark}
        title="Atenção · agora"
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.push('/manager/operacoes')}
            ariaLabel="Voltar"
          />
        }
        right={
          <GIconBtn
            dark={dark}
            icon={Icon.search(20)}
            onClick={() => showStub('Buscar alertas')}
            ariaLabel="Buscar"
          />
        }
      />

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        <div style={{ padding: '12px 16px 0', display: 'flex', gap: 10 }}>
          <MStat
            dark={dark}
            label="Críticos"
            value={String(high)}
            sub="resolver agora"
            accent={high > 0 ? '#C43A3A' : undefined}
            help="Pedidos ou chamados muito acima da meta — cliente esperando."
          />
          <MStat
            dark={dark}
            label="Atenção"
            value={String(med)}
            sub="próximos 10 min"
            accent={med > 0 ? '#9A7212' : undefined}
            help="Vai virar crítico se não agir logo."
          />
        </div>

        <div
          data-hide-scrollbar
          style={{
            padding: '14px 16px 4px',
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

        <div
          style={{
            padding: '8px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: 24,
                border: `1px dashed ${C.borderSoft}`,
                borderRadius: 12,
                textAlign: 'center',
                color: C.faint,
                fontSize: 13,
              }}
            >
              Sem alertas nessa categoria · tudo no ritmo.
            </div>
          ) : (
            filtered.map((a) => {
              const sc = sevDecor[a.sev];
              return (
                <div
                  key={a.id}
                  style={{
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 12,
                    overflow: 'hidden',
                    borderLeft: `4px solid ${sc.bar}`,
                    background: C.bg,
                  }}
                >
                  <div style={{ padding: 12 }}>
                    <div style={{ marginBottom: 4 }}>
                      <MPill tone={sc.tone} dark={dark}>
                        {sc.label} · há {a.t}
                      </MPill>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, letterSpacing: -0.1 }}>
                      {a.ttl}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: C.faint,
                        fontWeight: 500,
                        marginTop: 2,
                        lineHeight: 1.4,
                      }}
                    >
                      {a.sub}
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => showStub(a.actions[0])}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          padding: '8px 12px',
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
                        onClick={() => showStub(a.actions[1])}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: `1px solid ${C.borderSoft}`,
                          color: C.ink,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {a.actions[1]}
                      </button>
                      <button
                        type="button"
                        onClick={() => dismiss(a.id)}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          padding: '8px 10px',
                          borderRadius: 8,
                          color: C.faint,
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        Dispensar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding: '0 16px 24px' }}>
          <div
            style={{
              fontSize: 11,
              color: C.faint,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginBottom: 8,
              fontFamily: MONO_FONT,
            }}
          >
            Resolvidos hoje · {RESOLVED_HISTORY.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {RESOLVED_HISTORY.map((h) => (
              <div
                key={h.t}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  background: C.surface,
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontVariantNumeric: 'tabular-nums',
                    color: C.faint,
                    fontWeight: 700,
                    width: 36,
                    fontFamily: MONO_FONT,
                  }}
                >
                  {h.t}
                </div>
                <div style={{ flex: 1, fontSize: 12, color: C.ink, fontWeight: 500 }}>
                  {h.txt}
                </div>
                <div style={{ fontSize: 10, color: C.faint, fontWeight: 600 }}>{h.who}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <MBottomNav active="ops" dark={dark} onTo={(r) => router.push(r)} alerts={alerts.length} />

      {stubMsg && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 90,
            transform: 'translateX(-50%)',
            zIndex: 80,
            padding: '12px 18px',
            borderRadius: 999,
            background: C.ink,
            color: C.bg,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: -0.1,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            maxWidth: 'calc(100vw - 32px)',
            textAlign: 'center',
          }}
        >
          {stubMsg}
        </div>
      )}
    </div>
  );
}

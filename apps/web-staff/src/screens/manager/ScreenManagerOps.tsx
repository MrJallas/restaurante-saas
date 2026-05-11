'use client';

// Operação — V11 layout · faithful port of ScreenManagerOps em
// docs/design-canvas/handoff/garcom/garcom-screens-d.jsx:189.
//
// Estrutura:
//   • Hero (MAppHeader saudação + AO VIVO)
//   • 3 sub-tabs: Alertas · Mapa · Funil
//     - Alertas: 2 KPIs (Críticos · Atenção) + cards alerta com 2 ações inline
//     - Mapa: 2 KPIs (Mesas ativas · Em alerta) + grid 4×N + carga por garçom
//     - Funil: 5 etapas com tempo médio + barra + nota "pior caso"
//   • Barra fixa "Agir agora" (Cozinha · Pausa) sobre o bottom-nav
//   • MBottomNav active="ops"

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  Icon,
  MAppHeader,
  MBottomNav,
  MTab,
  MStat,
  MSection,
  MAvatar,
  MQuickActionsBar,
} from '../../components/manager';
import { manager } from '../../lib/api/manager';

export type OpsTab = 'alerts' | 'map' | 'funnel';

export interface ScreenManagerOpsProps {
  dark?: boolean;
  tenantSlug: string;
  tab?: OpsTab;
}

// Mock data fallback bate com canvas garcom-screens-c.jsx M_BOTTLENECKS.
const FALLBACK_ALERTS = [
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
  {
    id: 4,
    sev: 'med' as const,
    msg: 'Cozinha · fila com 11 pedidos',
    sub: 'capacidade é 8',
    ts: '8 min',
    actions: ['Pausar pedidos', 'Ver fila'] as const,
  },
];

const FALLBACK_FUNNEL = [
  { stage: 'Pedido lançado', median: 0.3, p95: 0.8, count: 142, ok: true, note: '' },
  { stage: 'Confirmado', median: 0.2, p95: 0.5, count: 142, ok: true, note: '' },
  { stage: 'Em preparo', median: 14, p95: 28, count: 138, ok: false, note: 'Cozinha sobrecarregada às 19h' },
  { stage: 'Pronto', median: 0.5, p95: 1.2, count: 134, ok: true, note: '' },
  { stage: 'Entregue na mesa', median: 6, p95: 14, count: 130, ok: false, note: 'Pratos esfriando na pass' },
];

interface MapTable {
  n: number;
  st: 'ok' | 'warn' | 'crit' | 'free';
  wait?: number;
  waiter?: string;
  val?: number;
}

const FALLBACK_TABLES: MapTable[] = [
  { n: 1, st: 'ok', wait: 4, waiter: 'CS', val: 142 },
  { n: 2, st: 'ok', wait: 7, waiter: 'CS', val: 88 },
  { n: 3, st: 'warn', wait: 22, waiter: 'HL', val: 312 },
  { n: 4, st: 'ok', wait: 11, waiter: 'OM', val: 64 },
  { n: 5, st: 'free' },
  { n: 6, st: 'warn', wait: 18, waiter: 'OM', val: 184 },
  { n: 7, st: 'ok', wait: 9, waiter: 'CS', val: 96 },
  { n: 8, st: 'ok', wait: 5, waiter: 'HL', val: 220 },
  { n: 9, st: 'ok', wait: 14, waiter: 'CS', val: 412 },
  { n: 10, st: 'free' },
  { n: 11, st: 'crit', wait: 28, waiter: 'OM', val: 156 },
  { n: 12, st: 'ok', wait: 8, waiter: 'HL', val: 78 },
];

const WAITER_PALETTE: Record<string, string> = {
  CS: '#4F6BFF',
  OM: '#E37D2F',
  HL: '#7A4FBE',
  BP: '#C43A3A',
  JA: '#0B7A8B',
};

export function ScreenManagerOps({ dark, tenantSlug, tab = 'alerts' }: ScreenManagerOpsProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const [active, setActive] = useState<OpsTab>(tab);
  const api = manager(tenantSlug);

  // Round 18 (Onda 2A): alerts é state mutável pra Dispensar funcionar.
  // Antes era const sem setter — clique no X era silencioso.
  const [alerts, setAlerts] = useState(FALLBACK_ALERTS);
  const [stubMsg, setStubMsg] = useState<string | null>(null);
  const dismissAlert = (id: number) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };
  const showStub = (action: string) => {
    setStubMsg(`${action} · em desenvolvimento (Onda 3 backend).`);
    setTimeout(() => setStubMsg(null), 2800);
  };
  const [pauseRemaining, setPauseRemaining] = useState<number | null>(null);

  // Buscar pausa ativa pra mostrar countdown na MQuickActionsBar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.zonePauses.list({ active: true }).catch(() => []);
        if (cancelled) return;
        const live = list.find((p) => p.active);
        if (live) {
          const remaining = Math.max(
            0,
            Math.floor((new Date(live.endsAt).getTime() - Date.now()) / 1000),
          );
          setPauseRemaining(remaining);
        } else {
          setPauseRemaining(null);
        }
      } catch {
        // ignore
      }
    })();
    const tick = setInterval(() => {
      setPauseRemaining((r) => (r != null && r > 0 ? r - 1 : r));
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, [api]);

  const high = alerts.filter((a) => a.sev === 'high').length;
  const med = alerts.filter((a) => a.sev === 'med').length;

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
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 132 }}>
        <MAppHeader dark={dark} title="Operação" />

        {/* sub-tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: `1px solid ${C.borderSoft}`,
            background: C.bg,
          }}
        >
          <MTab dark={dark} active={active === 'alerts'} count={high + med} onClick={() => setActive('alerts')}>
            Alertas
          </MTab>
          <MTab dark={dark} active={active === 'map'} onClick={() => setActive('map')}>
            Mapa
          </MTab>
          <MTab dark={dark} active={active === 'funnel'} onClick={() => setActive('funnel')}>
            Funil
          </MTab>
        </div>

        {active === 'alerts' && (
          <OpsAlerts
            dark={dark}
            alerts={alerts}
            high={high}
            med={med}
            onDismiss={dismissAlert}
            onAction={showStub}
          />
        )}
        {active === 'map' && <OpsMap dark={dark} tables={FALLBACK_TABLES} />}
        {active === 'funnel' && <OpsFunnel dark={dark} stages={FALLBACK_FUNNEL} />}

        <style jsx global>{`
          @keyframes gPulse {
            0%,
            100% {
              opacity: 1;
            }
            50% {
              opacity: 0.4;
            }
          }
        `}</style>
      </div>

      <MQuickActionsBar
        dark={dark}
        onTo={(r) => router.push(r)}
        pauseActive={pauseRemaining != null ? { remaining: pauseRemaining } : null}
      />
      <MBottomNav active="ops" dark={dark} onTo={(r) => router.push(r)} alerts={alerts.length} />

      {stubMsg && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 132,
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

// ─── ALERTAS sub-tab ─────────────────────────────────────────────
function OpsAlerts({
  dark,
  alerts,
  high,
  med,
  onDismiss,
  onAction,
}: {
  dark?: boolean;
  alerts: typeof FALLBACK_ALERTS;
  high: number;
  med: number;
  onDismiss?: (id: number) => void;
  onAction?: (label: string) => void;
}) {
  const C = useG(!!dark);
  const router = useRouter();
  return (
    <div>
      {/* Round 18 Onda 4: 2 chips (Críticos · Atenção) viraram tap-targets
          pros drill-downs V9. Visual preservado · wrapper <button> reset. */}
      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 10 }}>
        <ChipButton onClick={() => router.push('/manager/operacoes/criticos')}>
          <MStat
            dark={dark}
            compact
            label="Críticos"
            value={String(high)}
            sub="resolver agora"
            accent={high > 0 ? '#C43A3A' : null}
            help="Pedido ou chamado passou muito da meta — cliente está esperando."
            onHelp={() => router.push('/manager/operacoes/criticos')}
          />
        </ChipButton>
        <ChipButton onClick={() => router.push('/manager/operacoes/atencao')}>
          <MStat
            dark={dark}
            compact
            label="Atenção"
            value={String(med)}
            sub="próx. 10 min"
            accent={med > 0 ? '#9A7212' : null}
            help="Vai virar crítico se não agir logo."
            onHelp={() => router.push('/manager/operacoes/atencao')}
          />
        </ChipButton>
      </div>

      <div
        style={{
          padding: '10px 16px 4px',
          fontSize: 9.5,
          color: C.faint,
          fontWeight: 700,
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          fontFamily: MONO_FONT,
        }}
      >
        Cada alerta · 2 ações inline · X dispensa
      </div>

      <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {alerts.length === 0 ? (
          <div
            style={{
              padding: '24px 20px',
              textAlign: 'center',
              border: `1.5px dashed ${C.borderSoft}`,
              borderRadius: 14,
              color: C.faint,
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            Sem alertas no turno · tudo no ritmo.
          </div>
        ) : (
          alerts.map((a) => {
            const isHigh = a.sev === 'high';
            return (
              <div
                key={a.id}
                style={{
                  borderRadius: 12,
                  position: 'relative',
                  border: `1px solid ${isHigh ? '#F4C7C7' : '#F0DCB6'}`,
                  background: C.bg,
                  borderLeft: `3px solid ${isHigh ? '#C43A3A' : '#D98E2B'}`,
                  padding: '9px 10px',
                }}
              >
                <button
                  type="button"
                  title="Dispensar"
                  aria-label="Dispensar alerta"
                  onClick={() => onDismiss?.(a.id)}
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: 'transparent',
                    color: C.faint,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {Icon.x(13)}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 26 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: isHigh ? '#C43A3A' : '#D98E2B',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {Icon.flame(13)}
                  </div>
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      letterSpacing: 0.7,
                      textTransform: 'uppercase',
                      color: isHigh ? '#A12626' : '#7A4D10',
                      fontFamily: MONO_FONT,
                    }}
                  >
                    {isHigh ? 'CRÍTICO' : 'ATENÇÃO'} · há {a.ts}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.ink,
                    lineHeight: 1.25,
                    letterSpacing: -0.1,
                    marginTop: 5,
                    paddingRight: 26,
                  }}
                >
                  {a.msg}
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: C.faint,
                    fontWeight: 500,
                    marginTop: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.sub}
                </div>

                <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                  <button
                    type="button"
                    onClick={() => onAction?.(a.actions[0])}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      padding: '0 10px',
                      height: 32,
                      borderRadius: 8,
                      background: '#1d1c19',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    {a.actions[0]}
                  </button>
                  <button
                    type="button"
                    onClick={() => onAction?.(a.actions[1])}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      padding: '0 10px',
                      height: 32,
                      borderRadius: 8,
                      background: 'transparent',
                      color: '#1d1c19',
                      border: `1px solid ${C.borderSoft}`,
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    {a.actions[1]}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── MAPA sub-tab ────────────────────────────────────────────────
function OpsMap({ dark, tables }: { dark?: boolean; tables: MapTable[] }) {
  const C = useG(!!dark);
  const router = useRouter();
  const occupied = tables.filter((t) => t.st !== 'free').length;
  const free = tables.length - occupied;
  const critical = tables.filter((t) => t.st === 'crit').length;
  const warn = tables.filter((t) => t.st === 'warn').length;

  const stColors: Record<MapTable['st'], { bg: string; border: string; fg: string; dot: string | null }> = {
    ok: { bg: C.bg, border: C.borderSoft, fg: C.ink, dot: '#1E8C5A' },
    warn: { bg: '#FFF7EC', border: '#F0DCB6', fg: '#7a4d10', dot: '#D98E2B' },
    crit: { bg: '#FFF1F1', border: '#F4C7C7', fg: '#A12626', dot: '#C43A3A' },
    free: { bg: 'transparent', border: C.borderSoft, fg: C.faint, dot: null },
  };

  // Carga por garçom — derived from tables.
  const waiterLoad = useMemo(() => {
    const buckets: Record<string, { load: number; val: number }> = {};
    for (const t of tables) {
      if (t.st === 'free' || !t.waiter) continue;
      buckets[t.waiter] = buckets[t.waiter] || { load: 0, val: 0 };
      buckets[t.waiter].load += 1;
      buckets[t.waiter].val += t.val ?? 0;
    }
    const NAME: Record<string, string> = {
      CS: 'Caleb Souza',
      OM: 'Olivia Martins',
      HL: 'Henrique Lima',
      BP: 'Bruno Pacheco',
      JA: 'Júlia Andrade',
    };
    return Object.entries(buckets).map(([init, b]) => ({
      init,
      name: NAME[init] ?? init,
      load: b.load,
      total: 7,
      val: b.val,
    }));
  }, [tables]);

  return (
    <div>
      {/* Round 18 Onda 4: 2 chips (Mesas ativas · Em alerta) viraram tap-
          targets pros drill-downs V9. Visual preservado. */}
      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 10 }}>
        <ChipButton onClick={() => router.push('/manager/operacoes/mesas-ativas')}>
          <MStat
            dark={dark}
            compact
            label="Mesas ativas"
            value={`${occupied}/${tables.length}`}
            sub={`${free} livres`}
            help="Mesas com cliente sentado agora · resto está vazio."
            onHelp={() => router.push('/manager/operacoes/mesas-ativas')}
          />
        </ChipButton>
        <ChipButton onClick={() => router.push('/manager/operacoes/em-alerta')}>
          <MStat
            dark={dark}
            compact
            label="Em alerta"
            value={String(critical + warn)}
            sub={critical > 0 ? `${critical} críticas` : 'nenhuma crítica'}
            accent={critical > 0 ? '#C43A3A' : null}
            help="Mesas onde o pedido passou da meta de tempo."
            onHelp={() => router.push('/manager/operacoes/em-alerta')}
          />
        </ChipButton>
      </div>

      <div style={{ padding: '12px 16px 6px', fontSize: 11.5, color: C.faint, fontWeight: 500, lineHeight: 1.5 }}>
        Toque numa mesa pra ver detalhes.{' '}
        <span style={{ color: '#1E8C5A', fontWeight: 700 }}>Verde</span> = ok ·{' '}
        <span style={{ color: '#D98E2B', fontWeight: 700 }}>amarelo</span> = lenta ·{' '}
        <span style={{ color: '#C43A3A', fontWeight: 700 }}>vermelho</span> = crítica.
      </div>

      <div
        style={{
          padding: '4px 16px 16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
        }}
      >
        {tables.map((t) => {
          const c = stColors[t.st];
          if (t.st === 'free') {
            return (
              <div
                key={t.n}
                style={{
                  aspectRatio: '1/1',
                  padding: 8,
                  border: `1px dashed ${c.border}`,
                  borderRadius: 10,
                  background: 'transparent',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  color: c.fg,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 800 }}>{t.n}</div>
                <div style={{ fontSize: 10, fontWeight: 600 }}>livre</div>
              </div>
            );
          }
          return (
            <button
              key={t.n}
              type="button"
              onClick={() => router.push(`/manager/mesa/${t.n}`)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                aspectRatio: '1/1',
                padding: 8,
                boxSizing: 'border-box',
                border: `1px solid ${c.border}`,
                borderRadius: 10,
                background: c.bg,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: c.fg,
                    letterSpacing: -0.3,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {t.n}
                </div>
                {c.dot && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, marginTop: 2 }} />
                )}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: c.fg,
                    letterSpacing: -0.2,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {t.wait}m
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: WAITER_PALETTE[t.waiter ?? ''] ?? '#777',
                      color: '#fff',
                      fontSize: 8,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {t.waiter}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: c.fg,
                      fontWeight: 600,
                      opacity: 0.85,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    R${t.val}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {waiterLoad.length > 0 && (
        <MSection dark={dark} title="Carga por garçom · em turno">
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {waiterLoad.map((row) => {
              const pct = (row.load / row.total) * 100;
              const overload = pct >= 80;
              return (
                <div
                  key={row.init}
                  style={{
                    padding: 10,
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 10,
                    background: C.bg,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <MAvatar init={row.init} color={WAITER_PALETTE[row.init]} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{row.name}</div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: overload ? '#C43A3A' : C.ink,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {row.load}/{row.total} mesas
                      </div>
                    </div>
                    <div
                      style={{
                        height: 4,
                        borderRadius: 2,
                        background: C.borderSoft,
                        marginTop: 6,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: overload ? '#C43A3A' : C.ink,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </MSection>
      )}
    </div>
  );
}

// ─── FUNIL sub-tab ───────────────────────────────────────────────
function OpsFunnel({ dark, stages }: { dark?: boolean; stages: typeof FALLBACK_FUNNEL }) {
  const C = useG(!!dark);
  const max = Math.max(...stages.map((s) => s.median), 1);
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: C.faint, fontWeight: 500, marginBottom: 14, lineHeight: 1.5 }}>
        Tempo médio em cada etapa do pedido.{' '}
        <span style={{ color: '#C43A3A', fontWeight: 700 }}>Vermelho</span> = passou da meta ·{' '}
        <span style={{ color: C.ink, fontWeight: 700 }}>preto</span> = no ritmo.
      </div>

      {stages.map((s, i) => {
        const pct = (s.median / max) * 100;
        return (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
                {i + 1}. {s.stage}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: s.ok ? C.ink : '#C43A3A',
                    letterSpacing: -0.3,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {s.median} min
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: C.faint,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  pior caso {s.p95} min
                </div>
              </div>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: C.borderSoft, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: s.ok ? C.ink : '#C43A3A',
                  borderRadius: 4,
                }}
              />
            </div>
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 4, fontWeight: 500 }}>
              {s.count} pedidos
              {!s.ok && s.note && <span style={{ color: '#C43A3A', fontWeight: 700 }}> · {s.note}</span>}
            </div>
          </div>
        );
      })}

      <div
        style={{
          marginTop: 18,
          padding: 14,
          borderRadius: 14,
          background: C.ink,
          color: C.bg,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            opacity: 0.7,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            marginBottom: 8,
          }}
        >
          O que fazer agora
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, fontWeight: 500 }}>
          <li style={{ marginBottom: 6 }}>Verifique a cozinha — pratos quentes estão 17% acima da meta.</li>
          <li style={{ marginBottom: 6 }}>Coloque mais garçons levando pedidos prontos pras mesas.</li>
          <li>Se piorar, pause pedidos novos por 5 min até a fila baixar.</li>
        </ol>
      </div>
    </div>
  );
}

// ─── ChipButton — wraps MStat pra virar nav target.
// USA `div role="button"` em vez de `<button>` porque o MStat interno
// já contém um `<button>` (o ícone `?` de help tooltip), e nesting de
// button dentro de button é HTML inválido + causa hydration error.
// Keyboard handler dá Enter/Space pra a11y, igual a um `<button>` nativo.
function ChipButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        cursor: 'pointer',
        flex: 1,
        display: 'flex',
        minWidth: 0,
      }}
    >
      {children}
    </div>
  );
}

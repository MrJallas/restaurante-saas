'use client';

// ScreenManagerTableTimeline — canvas garcom-screens-d.jsx:851.
//
// Diagnóstico de uma mesa lenta: hero crítico, ação sugerida, timeline
// das 6 etapas do pedido, chamados do garçom, CTAs.
//
// Backend: a rota usa timeline de leitura limitada enquanto o endpoint
// dedicado de pedidos não chega; CTAs navegam para fluxos reais.

import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  MTopBar,
  GIconBtn,
  MPill,
  MBottomNav,
  GButton,
  Icon,
} from '../../components/manager';

type StepStatus = 'done' | 'slow' | 'open' | 'wait';

interface TimelineStep {
  label: string;
  t: string;
  delta: number | null;
  status: StepStatus;
  meta: string;
}

const DEFAULT_STEPS: TimelineStep[] = [
  { label: 'Pedido feito', t: '20:42', delta: null, status: 'done', meta: '6 itens · R$ 156,00' },
  { label: 'Confirmado', t: '20:42', delta: 0.4, status: 'done', meta: 'auto · 24s' },
  { label: 'Cozinha começou', t: '20:54', delta: 12, status: 'slow', meta: 'meta: 2 min · ⚠ excedeu' },
  { label: 'Em preparo', t: '—', delta: 16, status: 'open', meta: 'há 16 min · meta 12 min' },
  { label: 'Pronto', t: '—', delta: null, status: 'wait', meta: '' },
  { label: 'Entregue na mesa', t: '—', delta: null, status: 'wait', meta: '' },
];

const CALLS = [
  { time: '20:50', txt: 'Cliente chamou garçom (água)', resolved: '20:53', diff: '3 min' },
  { time: '21:04', txt: 'Cliente chamou garçom (status do pedido)', resolved: null, diff: 'sem resposta há 6 min' },
];

export interface ScreenManagerTableTimelineProps {
  dark?: boolean;
  orderId: string;
  tableNumber?: number;
}

export function ScreenManagerTableTimeline({
  dark = false,
  orderId: _orderId,
  tableNumber = 11,
}: ScreenManagerTableTimelineProps) {
  const C = useG(dark);
  const router = useRouter();
  const slug =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('slug') ?? ''
      : '';

  const dotColor = (s: StepStatus): string => {
    if (s === 'done') return '#1E8C5A';
    if (s === 'slow') return '#D98E2B';
    if (s === 'open') return '#C43A3A';
    return C.borderSoft;
  };

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
        title={`Mesa ${tableNumber} · timeline`}
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.back()}
            ariaLabel="Voltar"
          />
        }
      />

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        {/* Hero crítico */}
        <div style={{ padding: '18px 16px 4px' }}>
          <div
            style={{
              background: '#FFF1F1',
              border: '1px solid #C43A3A',
              borderRadius: 14,
              padding: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                background: '#C43A3A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 800,
                fontSize: 17,
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
              }}
            >
              28′
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <MPill tone="danger" dark={dark}>
                Crítica
              </MPill>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1d1c19', marginTop: 6 }}>
                Pedido em preparo há 16 min — meta 12 min
              </div>
              <div style={{ fontSize: 12, color: '#A12626', marginTop: 2, fontWeight: 600 }}>
                Garçom: Olivia M. · R$ 156,00
              </div>
            </div>
          </div>
        </div>

        {/* Ação sugerida */}
        <div style={{ padding: '14px 16px 4px' }}>
          <div style={{ background: C.ink, color: C.bg, borderRadius: 14, padding: 14 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.6,
                opacity: 0.7,
                textTransform: 'uppercase',
                marginBottom: 8,
                fontFamily: MONO_FONT,
              }}
            >
              O que fazer agora
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
              <li style={{ marginBottom: 4 }}>
                <b>Verifique a cozinha</b> — pergunte se o prato está pronto.
              </li>
              <li style={{ marginBottom: 4 }}>
                <b>Avise um garçom</b> pra levar o pedido assim que sair.
              </li>
              <li>
                <b>Fale com o cliente</b> — explique que já está saindo.
              </li>
            </ol>
          </div>
        </div>

        {/* Etapas do pedido */}
        <div style={{ padding: '18px 16px 4px' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              color: C.faint,
              textTransform: 'uppercase',
              marginBottom: 10,
              fontFamily: MONO_FONT,
            }}
          >
            Etapas do pedido
          </div>
          <div style={{ position: 'relative', paddingLeft: 22 }}>
            <div
              style={{
                position: 'absolute',
                left: 9,
                top: 6,
                bottom: 6,
                width: 2,
                background: C.borderSoft,
              }}
            />
            {DEFAULT_STEPS.map((s) => (
              <div
                key={s.label}
                style={{ position: 'relative', paddingBottom: 14, display: 'flex', gap: 12 }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: -22,
                    top: 3,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: dotColor(s.status),
                    border: s.status === 'wait' ? `2px dashed ${C.borderSoft}` : 'none',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: s.status === 'wait' ? C.faint : C.ink,
                      }}
                    >
                      {s.label}
                    </span>
                    {s.t && (
                      <span
                        style={{
                          fontSize: 12,
                          color: C.faint,
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 600,
                        }}
                      >
                        {s.t}
                      </span>
                    )}
                  </div>
                  {s.meta && (
                    <div
                      style={{
                        fontSize: 12,
                        color: s.status === 'open' ? '#C43A3A' : s.status === 'slow' ? '#9A7212' : C.faint,
                        marginTop: 2,
                        fontWeight: s.status === 'open' || s.status === 'slow' ? 600 : 500,
                      }}
                    >
                      {s.meta}
                    </div>
                  )}
                  {s.delta != null && (
                    <div
                      style={{
                        fontSize: 11,
                        color: C.faint,
                        marginTop: 2,
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600,
                      }}
                    >
                      Δ {s.delta} min
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chamados na mesa */}
        <div style={{ padding: '14px 16px 4px' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              color: C.faint,
              textTransform: 'uppercase',
              marginBottom: 10,
              fontFamily: MONO_FONT,
            }}
          >
            Chamados de garçom
          </div>
          {CALLS.map((c) => (
            <div
              key={c.time}
              style={{
                padding: '12px 14px',
                border: `1px solid ${c.resolved ? C.borderSoft : '#C43A3A'}`,
                borderRadius: 12,
                marginBottom: 8,
                background: c.resolved ? C.bg : '#FFF1F1',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 2,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700 }}>{c.txt}</span>
                <span
                  style={{
                    fontSize: 11,
                    color: C.faint,
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 600,
                  }}
                >
                  {c.time}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: c.resolved ? '#1E8C5A' : '#C43A3A',
                  fontWeight: 700,
                  marginTop: 2,
                }}
              >
                {c.resolved ? `Resolvido em ${c.diff}` : c.diff}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Round 18 sticky-footer fix (audit P0): CTAs movidos pra FORA do
          scroll container · ficam sempre visíveis acima do bottom-nav. */}
      <div
        style={{
          padding: '14px 16px 24px',
          display: 'flex',
          gap: 10,
          background: C.bg,
          borderTop: `1px solid ${C.borderSoft}`,
          flexShrink: 0,
        }}
      >
        <GButton
          dark={dark}
          full
          kind="ghost"
          onClick={() => router.push(`/manager/kitchen-reorder?slug=${slug}`)}
        >
          Avisar cozinha
        </GButton>
        <GButton
          dark={dark}
          full
          kind="primary"
          onClick={() => {
            const qs = new URLSearchParams({ slug, tableNumber: String(tableNumber) }).toString();
            router.push(`/manager/compensate?${qs}`);
          }}
        >
          Cortesia
        </GButton>
      </div>

      <MBottomNav active="ops" dark={dark} onTo={(r) => router.push(r)} />
    </div>
  );
}

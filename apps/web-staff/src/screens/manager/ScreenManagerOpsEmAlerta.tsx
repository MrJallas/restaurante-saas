'use client';

// V9 drill-down — EM ALERTA chip (/manager/operacoes/em-alerta).
//
// Canvas spec: docs/design-canvas/handoff/garcom/garcom-screens-e.jsx:886-987
// (variant `em-alerta`). Hero "N" + sub split em "X CRÍTICAS · Y LENTAS"
// + lista mesas em alerta com cor por status (vermelho/amarelo) + 2
// ActionPills "Realocar críticas" + "Mensagem direta pros garçons" + Fórmula.
//
// Backend wiring (Round 18 Onda 4):
//   • REAL (parcial): tap em mesa abre `/manager/mesa/N`. A lista vem do
//     mesmo endpoint TODO `/tables/open` com filtro `state in (warn,
//     crit)`. Por enquanto mock derivado.
//     TODO(round19): wire GET /:slug/tables/alerts.
//   • REAL: ações navegam para redistribuição de equipe e mensagens.

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  Icon,
  MTopBar,
  GIconBtn,
  MBottomNav,
} from '../../components/manager';

interface AlertTable {
  n: number;
  waiter: { init: string; color: string; name: string };
  t: string;
  state: 'CRÍTICA' | 'LENTA';
  stateColor: string;
  borderColor: string;
  bg: string;
}

export interface ScreenManagerOpsEmAlertaProps {
  dark?: boolean;
  tenantSlug: string;
}

// Mock canvas spec. TODO(round19): replace com GET /:slug/tables/alerts.
const FALLBACK_ALERT_TABLES: AlertTable[] = [
  {
    n: 11,
    waiter: { init: 'OM', color: '#E37D2F', name: 'Olivia' },
    t: '1h 38',
    state: 'CRÍTICA',
    stateColor: '#A12626',
    borderColor: '#F4C7C7',
    bg: '#FFF1F1',
  },
  {
    n: 14,
    waiter: { init: 'HL', color: '#7A4FBE', name: 'Henrique' },
    t: '2h 03',
    state: 'CRÍTICA',
    stateColor: '#A12626',
    borderColor: '#F4C7C7',
    bg: '#FFF1F1',
  },
  {
    n: 3,
    waiter: { init: 'HL', color: '#7A4FBE', name: 'Henrique' },
    t: '1h 47',
    state: 'LENTA',
    stateColor: '#9A7212',
    borderColor: '#F0DCB6',
    bg: '#FFF7E6',
  },
  {
    n: 6,
    waiter: { init: 'OM', color: '#E37D2F', name: 'Olivia' },
    t: '1h 22',
    state: 'LENTA',
    stateColor: '#9A7212',
    borderColor: '#F0DCB6',
    bg: '#FFF7E6',
  },
];

export function ScreenManagerOpsEmAlerta({ dark, tenantSlug }: ScreenManagerOpsEmAlertaProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const params = useSearchParams();
  const slugQs = params.get('slug');
  const backHref = slugQs ? `/manager/operacoes?slug=${slugQs}` : '/manager/operacoes';

  const items = FALLBACK_ALERT_TABLES;
  const crit = items.filter((i) => i.state === 'CRÍTICA').length;
  const lent = items.filter((i) => i.state === 'LENTA').length;

  // Render-time `new Date()` causa hydration mismatch (server em UTC,
  // client em Brasília). Placeholder no SSR, atualiza após mount.
  const [updatedAt, setUpdatedAt] = useState<string>('--:--');
  useEffect(() => {
    setUpdatedAt(
      new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
  }, []);

  const openTable = (n: number) => {
    router.push(slugQs ? `/manager/mesa/${n}?slug=${slugQs}` : `/manager/mesa/${n}`);
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
        title="Em alerta"
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.push(backHref)}
            ariaLabel="Voltar"
          />
        }
      />

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingBottom: 100 }}>
        {/* Hero */}
        <div style={{ padding: '20px 16px 18px' }}>
          <div
            style={{
              fontSize: 10.5,
              color: C.faint,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              fontFamily: MONO_FONT,
            }}
          >
            Atualizado às {updatedAt}
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: -1,
              color: items.length > 0 ? '#A12626' : C.ink,
              marginTop: 6,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.05,
            }}
          >
            {items.length}
          </div>
          {items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 800,
                  color: '#A12626',
                  fontFamily: MONO_FONT,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                }}
              >
                · {crit} CRÍTICAS
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 800,
                  color: '#9A7212',
                  fontFamily: MONO_FONT,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                }}
              >
                · {lent} LENTAS
              </div>
            </div>
          )}
          <div style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}>
            {items.length > 0
              ? `${items.length} mesas onde algo passou da meta de tempo.`
              : 'Nenhuma mesa em alerta agora.'}
          </div>
        </div>

        {items.length > 0 && (
          <>
            <SectionLabel C={C}>Mesas em alerta</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((t) => (
                <button
                  key={t.n}
                  type="button"
                  onClick={() => openTable(t.n)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${t.borderColor}`,
                    background: t.bg,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: '#fff',
                      color: t.stateColor,
                      border: `1px solid ${t.borderColor}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: 14,
                      fontWeight: 800,
                      letterSpacing: -0.2,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {t.n}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        color: t.stateColor,
                        letterSpacing: 0.7,
                        textTransform: 'uppercase',
                        fontFamily: MONO_FONT,
                      }}
                    >
                      {t.state}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: t.stateColor,
                        letterSpacing: -0.1,
                        marginTop: 2,
                      }}
                    >
                      {t.waiter.name} · {t.t} aberta
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: t.stateColor,
                      letterSpacing: 0.4,
                      fontFamily: MONO_FONT,
                      textTransform: 'uppercase',
                      marginRight: 4,
                    }}
                  >
                    VER →
                  </span>
                </button>
              ))}
            </div>

            <SectionLabel C={C}>O que fazer agora</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ActionPill
                C={C}
                filled
                accent="#A12626"
                icon={Icon.table(13)}
                onClick={() => router.push(`/manager/equipe/sobrecarga?slug=${tenantSlug}`)}
              >
                Realocar mesas críticas
              </ActionPill>
              <ActionPill
                C={C}
                icon={Icon.chat(13)}
                onClick={() => router.push(slugQs ? `/manager/mensagens?slug=${slugQs}` : '/manager/mensagens')}
              >
                Mensagem direta pros garçons das críticas
              </ActionPill>
            </div>
          </>
        )}

        <div style={{ height: 18 }} />
        <Formula C={C}>
          Mesas com pedido ou chamado que <b>passou da meta</b> · ATENÇÃO se &gt;80% da meta · CRÍTICA se &gt;100%.
        </Formula>
      </div>

      <MBottomNav active="ops" dark={dark} onTo={(r) => router.push(r)} alerts={items.length} />
    </div>
  );
}

// ─── Local shared bits ───────────────────────────────────────────

function SectionLabel({ C, children }: { C: ReturnType<typeof useG>; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '18px 16px 8px',
        fontSize: 11,
        color: C.faint,
        fontWeight: 700,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        fontFamily: MONO_FONT,
      }}
    >
      {children}
    </div>
  );
}

function ActionPill({
  C,
  filled,
  accent,
  icon,
  children,
  onClick,
}: {
  C: ReturnType<typeof useG>;
  filled?: boolean;
  accent?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        width: '100%',
        padding: '12px 14px',
        borderRadius: 12,
        border: filled ? 'none' : `1px solid ${C.borderSoft}`,
        background: filled ? accent || C.ink : 'transparent',
        color: filled ? '#fff' : C.ink,
        fontSize: 13.5,
        fontWeight: 700,
        letterSpacing: -0.1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 10,
      }}
    >
      {icon && (
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: filled ? 'rgba(255,255,255,0.18)' : C.surface,
            color: filled ? '#fff' : C.ink,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}

function Formula({ C, children }: { C: ReturnType<typeof useG>; children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: '0 16px',
        padding: 14,
        borderRadius: 12,
        background: C.surface,
        border: `1px solid ${C.borderFaint}`,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: C.faint,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          fontFamily: MONO_FONT,
          marginBottom: 8,
        }}
      >
        Como esse número é calculado
      </div>
      <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

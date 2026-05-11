'use client';

// V9 drill-down — ATENÇÃO chip (/manager/operacoes/atencao).
//
// Canvas spec: docs/design-canvas/handoff/garcom/garcom-screens-e.jsx:669-769
// (variant `atencao`). Hero "N" mostarda + lista cada com 2 ações inline
// + ActionPill "Adiantar todos" + Fórmula.
//
// Backend wiring (Round 18 Onda 4):
//   • REAL: parcial via complaints / order-ratings list que estão a 80% da
//     meta. Sem endpoint dedicado pra "alerts.severity=med" ainda, mock
//     inline igual ao FALLBACK_ALERTS (sev=med) do ScreenManagerOps.
//     TODO(round19): wire GET /:slug/alerts?severity=med.
//   • STUB: ações inline + ActionPill "Adiantar todos" — toast stub.

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

interface AttentionAlert {
  id: string;
  msg: string;
  sub: string;
  ts: string;
  actions: [string, string];
}

export interface ScreenManagerOpsAtencaoProps {
  dark?: boolean;
  tenantSlug: string;
}

// Mock fallback mirror FALLBACK_ALERTS (sev=med) do ScreenManagerOps.
// TODO(round19): wire GET /:slug/alerts?severity=med.
const FALLBACK_ATTENTION: AttentionAlert[] = [
  {
    id: 'a1',
    msg: 'Mesa 6 sem garçom há 7 min',
    sub: 'Olivia atende · 5 mesas · ainda dentro',
    ts: '7 min',
    actions: ['Avisar Olivia', 'Realocar'],
  },
  {
    id: 'a2',
    msg: 'Filé da mesa 11 está há 9 min na pass',
    sub: 'meta cozinha 12 min · vai virar crítico',
    ts: '9 min',
    actions: ['Adiantar', 'Avisar cozinha'],
  },
];

export function ScreenManagerOpsAtencao({ dark, tenantSlug: _tenantSlug }: ScreenManagerOpsAtencaoProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const params = useSearchParams();
  const slugQs = params.get('slug');
  const backHref = slugQs ? `/manager/operacoes?slug=${slugQs}` : '/manager/operacoes';

  const items = FALLBACK_ATTENTION;
  const [stubMsg, setStubMsg] = useState<string | null>(null);

  const showStub = (action: string) => {
    setStubMsg(`${action} · em desenvolvimento (Onda 4 backend).`);
    setTimeout(() => setStubMsg(null), 2800);
  };

  const empty = items.length === 0;
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
        title="Atenção"
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
              color: empty ? C.ink : '#9A7212',
              marginTop: 6,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.05,
            }}
          >
            {items.length}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: empty ? C.faint : '#9A7212',
              marginTop: 4,
              fontFamily: MONO_FONT,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {empty ? '· NADA EM ATENÇÃO' : '· PRÓXIMOS 10 MIN'}
          </div>
          <div style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}>
            {empty
              ? 'Nenhum alerta em atenção. Volta aqui se algo se aproximar do limite.'
              : `${items.length} alertas vão virar críticos se não agir logo.`}
          </div>
        </div>

        {!empty && (
          <>
            <SectionLabel C={C}>O que está em atenção</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((a) => (
                <AlertCard
                  key={a.id}
                  C={C}
                  alert={a}
                  onAction0={() => showStub(a.actions[0])}
                  onAction1={() => showStub(a.actions[1])}
                />
              ))}
            </div>

            <SectionLabel C={C}>O que fazer agora</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ActionPill C={C} icon={Icon.clock(13)} onClick={() => showStub('Adiantar todos')}>
                Adiantar todos
              </ActionPill>
            </div>
          </>
        )}

        <div style={{ height: 18 }} />
        <Formula C={C}>
          Pedidos ou chamados a <b>80% da meta</b> de tempo · vai virar crítico em ~10 min se não agir.
        </Formula>
      </div>

      <MBottomNav active="ops" dark={dark} onTo={(r) => router.push(r)} alerts={items.length} />

      {stubMsg && <StubToast C={C}>{stubMsg}</StubToast>}
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

function AlertCard({
  C,
  alert,
  onAction0,
  onAction1,
}: {
  C: ReturnType<typeof useG>;
  alert: AttentionAlert;
  onAction0: () => void;
  onAction1: () => void;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        padding: '10px 12px',
        position: 'relative',
        border: '1px solid #F0DCB6',
        background: C.bg,
        borderLeft: '3px solid #D98E2B',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: '#D98E2B',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {Icon.clock(12)}
        </div>
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: 0.7,
            textTransform: 'uppercase',
            color: '#7A4D10',
            fontFamily: MONO_FONT,
          }}
        >
          ATENÇÃO · há {alert.ts}
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, lineHeight: 1.25, marginTop: 6 }}>
        {alert.msg}
      </div>
      <div style={{ fontSize: 11, color: C.faint, fontWeight: 500, marginTop: 1 }}>{alert.sub}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button
          type="button"
          onClick={onAction0}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '0 10px',
            height: 30,
            borderRadius: 7,
            background: C.ink,
            color: C.bg,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: -0.1,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {alert.actions[0]}
        </button>
        <button
          type="button"
          onClick={onAction1}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '0 10px',
            height: 30,
            borderRadius: 7,
            background: 'transparent',
            color: C.ink,
            border: `1px solid ${C.borderSoft}`,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: -0.1,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {alert.actions[1]}
        </button>
      </div>
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

function StubToast({ C, children }: { C: ReturnType<typeof useG>; children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  );
}

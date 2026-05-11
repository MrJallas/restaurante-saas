'use client';

// V9 drill-down — MESAS ATIVAS chip (/manager/operacoes/mesas-ativas).
//
// Canvas spec: docs/design-canvas/handoff/garcom/garcom-screens-e.jsx:771-884
// (variant `mesas-ativas`). Hero "occ/total" + 1 livres + lista por seção
// (Salão · Varanda) cada com avatar do garçom + tempo aberta + R$ + Ver
// arrow. ActionPill "Ver no Mapa →" + Fórmula.
//
// Backend wiring (Round 18 Onda 4):
//   • REAL (parcial): cada row → tap em mesa abre `/manager/mesa/N` (real
//     endpoint). A LISTA inteira de mesas com sessão aberta precisa de
//     endpoint dedicado `/tables/open` que não existe ainda.
//     TODO(round19): wire GET /:slug/tables/open com tempo aberta + R$.
//   • STUB: nenhum (a single ActionPill é navegação real pro mapa).

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

interface ActiveTable {
  n: number;
  waiter: { init: string; color: string };
  t: string;
  val: number;
}

interface TableSection {
  name: string;
  tables: ActiveTable[];
}

export interface ScreenManagerOpsMesasAtivasProps {
  dark?: boolean;
  tenantSlug: string;
}

// Mock canvas spec — TODO(round19) substituir por GET /:slug/tables/open.
const FALLBACK_SECTIONS: TableSection[] = [
  {
    name: 'Salão',
    tables: [
      { n: 1, waiter: { init: 'CS', color: '#4F6BFF' }, t: '1h 12', val: 142 },
      { n: 2, waiter: { init: 'CS', color: '#4F6BFF' }, t: '0h 38', val: 88 },
      { n: 3, waiter: { init: 'HL', color: '#7A4FBE' }, t: '1h 47', val: 312 },
      { n: 4, waiter: { init: 'OM', color: '#E37D2F' }, t: '0h 52', val: 64 },
      { n: 6, waiter: { init: 'OM', color: '#E37D2F' }, t: '1h 22', val: 184 },
      { n: 7, waiter: { init: 'CS', color: '#4F6BFF' }, t: '0h 41', val: 96 },
      { n: 8, waiter: { init: 'HL', color: '#7A4FBE' }, t: '1h 04', val: 220 },
      { n: 9, waiter: { init: 'CS', color: '#4F6BFF' }, t: '2h 11', val: 412 },
    ],
  },
  {
    name: 'Varanda',
    tables: [
      { n: 11, waiter: { init: 'OM', color: '#E37D2F' }, t: '1h 38', val: 156 },
      { n: 12, waiter: { init: 'HL', color: '#7A4FBE' }, t: '0h 28', val: 78 },
      { n: 13, waiter: { init: 'CS', color: '#4F6BFF' }, t: '1h 14', val: 244 },
      { n: 14, waiter: { init: 'HL', color: '#7A4FBE' }, t: '2h 03', val: 168 },
      { n: 16, waiter: { init: 'OM', color: '#E37D2F' }, t: '0h 47', val: 110 },
    ],
  },
];
const TOTAL_TABLES = 16;

export function ScreenManagerOpsMesasAtivas({ dark, tenantSlug: _tenantSlug }: ScreenManagerOpsMesasAtivasProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const params = useSearchParams();
  const slugQs = params.get('slug');
  const backHref = slugQs ? `/manager/operacoes?slug=${slugQs}` : '/manager/operacoes';

  const sections = FALLBACK_SECTIONS;
  const [stubMsg, setStubMsg] = useState<string | null>(null);

  const showStub = (action: string) => {
    setStubMsg(`${action} · em desenvolvimento (Onda 4 backend).`);
    setTimeout(() => setStubMsg(null), 2800);
  };

  const occ = sections.reduce((s, sec) => s + sec.tables.length, 0);
  const free = TOTAL_TABLES - occ;

  // Render-time `new Date()` causa hydration mismatch (server em UTC,
  // client em Brasília). Renderiza placeholder no SSR e atualiza após
  // mount.
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
        title="Mesas ativas"
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
              color: C.ink,
              marginTop: 6,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.05,
            }}
          >
            {occ}
            <span style={{ fontSize: 20, color: C.faint, fontWeight: 600 }}>/{TOTAL_TABLES}</span>
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: C.faint,
              marginTop: 4,
              fontFamily: MONO_FONT,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            · {free} LIVRES
          </div>
          <div style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}>
            {occ} mesas com cliente sentado agora · {free} livres.
          </div>
        </div>

        {sections.map((sec) => (
          <div key={sec.name}>
            <SectionLabel C={C}>
              {sec.name} · {sec.tables.length} mesas
            </SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sec.tables.map((t) => (
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
                    border: `1px solid ${C.borderSoft}`,
                    background: C.bg,
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
                      background: C.surface,
                      color: C.ink,
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          background: t.waiter.color,
                          color: '#fff',
                          fontSize: 8.5,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {t.waiter.init}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: C.ink,
                          letterSpacing: -0.1,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {t.t} aberta
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: C.ink,
                      letterSpacing: -0.1,
                      fontFamily: MONO_FONT,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    R$ {t.val}
                  </div>
                  <span style={{ color: C.faint, opacity: 0.7, flexShrink: 0 }}>{Icon.arrow(14)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        <SectionLabel C={C}>O que fazer agora</SectionLabel>
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ActionPill
            C={C}
            icon={Icon.table(13)}
            onClick={() =>
              router.push(slugQs ? `/manager/operacoes?slug=${slugQs}&tab=map` : '/manager/operacoes?tab=map')
            }
          >
            Ver no Mapa →
          </ActionPill>
        </div>

        <div style={{ height: 18 }} />
        <Formula C={C}>
          Total de mesas com <b>sessão aberta</b> dividido pelo total de mesas configuradas no estabelecimento.
        </Formula>
      </div>

      <MBottomNav active="ops" dark={dark} onTo={(r) => router.push(r)} />

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

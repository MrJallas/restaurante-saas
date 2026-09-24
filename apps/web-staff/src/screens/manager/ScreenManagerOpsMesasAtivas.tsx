'use client';

// V9 drill-down — MESAS ATIVAS chip (/manager/operacoes/mesas-ativas).
//
// Canvas spec: docs/design/canvas/handoff/garcom/garcom-screens-e.jsx:771-884
// (variant `mesas-ativas`). Hero "occ/total" + livres + lista de mesas
// abertas + Ver arrow. ActionPill "Ver no Mapa →" + Fórmula.
//
// Backend wiring (anti-placebo):
//   • REAL: lista vem de GET /:slug/dashboard/active-tables (label, tempo
//     aberto, pessoas e conta reais). Total/livres vem do
//     GET /:slug/staff/tables-overview (mesmo endpoint do mapa do Ops).
//   • Seções Salão/Varanda e avatar do garçom por mesa saíram — não há
//     fonte de zona/atribuição por mesa; nada de dado fabricado.
//   • Tap em mesa abre `/manager/mesa/N` (real endpoint).

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
import { activeTablesApi, type ActiveTableRow } from '../../lib/api/manager';
import { listTablesOverview } from '../../lib/api/waiter';

export interface ScreenManagerOpsMesasAtivasProps {
  dark?: boolean;
  tenantSlug: string;
}

/** 72 min → "1h 12" · 38 min → "38 min". */
function fmtOpenTime(minutes: number): string {
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}`;
  }
  return `${minutes} min`;
}

/** Centavos → "R$ 1.234,56". */
function fmtBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ScreenManagerOpsMesasAtivas({
  dark,
  tenantSlug,
}: ScreenManagerOpsMesasAtivasProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const params = useSearchParams();
  const slugQs = params.get('slug');
  const backHref = slugQs ? `/manager/operacoes?slug=${slugQs}` : '/manager/operacoes';

  const [tables, setTables] = useState<ActiveTableRow[]>([]);
  const [totalTables, setTotalTables] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let stop = false;
    Promise.all([activeTablesApi(tenantSlug).get(), listTablesOverview(tenantSlug)])
      .then(([activeRes, overviewRows]) => {
        if (stop) return;
        setTables(activeRes.tables);
        setTotalTables(overviewRows.length > 0 ? overviewRows.length : null);
        setLoaded(true);
        setLoadError(false);
      })
      .catch(() => {
        if (stop) return;
        setLoaded(true);
        setLoadError(true);
      });
    return () => {
      stop = true;
    };
  }, [tenantSlug]);

  const occ = tables.length;
  const free = totalTables != null ? Math.max(0, totalTables - occ) : null;

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
            {loaded && !loadError ? occ : '—'}
            {loaded && !loadError && totalTables != null && (
              <span style={{ fontSize: 20, color: C.faint, fontWeight: 600 }}>/{totalTables}</span>
            )}
          </div>
          {loaded && !loadError && free != null && (
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
          )}
          <div
            style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}
          >
            {loadError
              ? 'Não foi possível carregar as mesas agora — tente de novo em instantes.'
              : !loaded
                ? 'Carregando mesas abertas…'
                : occ === 0
                  ? 'Nenhuma mesa com sessão aberta agora.'
                  : free != null
                    ? `${occ} ${occ === 1 ? 'mesa' : 'mesas'} com cliente sentado agora · ${free} livres.`
                    : `${occ} ${occ === 1 ? 'mesa' : 'mesas'} com cliente sentado agora.`}
          </div>
        </div>

        {loaded && !loadError && occ === 0 && (
          <div style={{ padding: '0 16px' }}>
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
              Nenhuma mesa aberta — a lista aparece quando um cliente sentar.
            </div>
          </div>
        )}

        {occ > 0 && (
          <div>
            <SectionLabel C={C}>
              Mesas abertas · {occ} {occ === 1 ? 'mesa' : 'mesas'}
            </SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tables.map((t) => (
                <button
                  key={t.sessionId}
                  type="button"
                  onClick={() => openTable(t.tableNumber)}
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
                    {t.tableNumber}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: C.ink,
                        letterSpacing: -0.1,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtOpenTime(t.openedMinutes)} aberta
                    </div>
                    <div style={{ fontSize: 11, color: C.faint, fontWeight: 500, marginTop: 1 }}>
                      {t.tableLabel} · {t.people} {t.people === 1 ? 'pessoa' : 'pessoas'}
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
                    {fmtBRL(t.subtotalCents)}
                  </div>
                  <span style={{ color: C.faint, opacity: 0.7, flexShrink: 0 }}>
                    {Icon.arrow(14)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <SectionLabel C={C}>O que fazer agora</SectionLabel>
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ActionPill
            C={C}
            icon={Icon.table(13)}
            onClick={() =>
              router.push(
                slugQs ? `/manager/operacoes?slug=${slugQs}&tab=map` : '/manager/operacoes?tab=map',
              )
            }
          >
            Ver no Mapa →
          </ActionPill>
        </div>

        <div style={{ height: 18 }} />
        <Formula C={C}>
          Total de mesas com <b>sessão aberta</b> dividido pelo total de mesas configuradas no
          estabelecimento.
        </Formula>
      </div>

      <MBottomNav active="ops" dark={dark} onTo={(r) => router.push(r)} />
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
      <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
}

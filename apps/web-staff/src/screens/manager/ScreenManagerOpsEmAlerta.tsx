'use client';

// V9 drill-down — EM ALERTA chip (/manager/operacoes/em-alerta).
//
// Canvas spec: docs/design-canvas/handoff/garcom/garcom-screens-e.jsx:886-987
// (variant `em-alerta`).
//
// Backend wiring (anti-placebo):
//   • REAL: lista vem dos `lateOrders` do GET /:slug/dashboard/active-tables
//     — pedidos em preparo há mais tempo que a meta da cozinha
//     (settings.kitchen_eta_max_minutes).
//   • Meta não configurada (kitchenEtaMaxMinutes null) → aviso pra
//     configurar em /cozinha/eu, nunca lista fabricada.
//   • Tap em pedido abre `/manager/mesa/N` (número extraído do label real).

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
import { activeTablesApi, type LateOrderRow } from '../../lib/api/manager';

export interface ScreenManagerOpsEmAlertaProps {
  dark?: boolean;
  tenantSlug: string;
}

const CRIT = { color: '#A12626', border: '#F4C7C7', bg: '#FFF1F1' };

export function ScreenManagerOpsEmAlerta({ dark, tenantSlug }: ScreenManagerOpsEmAlertaProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const params = useSearchParams();
  const slugQs = params.get('slug');
  const backHref = slugQs ? `/manager/operacoes?slug=${slugQs}` : '/manager/operacoes';

  const [items, setItems] = useState<LateOrderRow[]>([]);
  const [kitchenEta, setKitchenEta] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let stop = false;
    activeTablesApi(tenantSlug)
      .get()
      .then((res) => {
        if (stop) return;
        setItems(res.lateOrders);
        setKitchenEta(res.kitchenEtaMaxMinutes);
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

  const metaMissing = loaded && !loadError && kitchenEta == null;

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

  const openTableByLabel = (label: string) => {
    const digits = label.replace(/\D/g, '');
    if (!digits) return;
    router.push(slugQs ? `/manager/mesa/${digits}?slug=${slugQs}` : `/manager/mesa/${digits}`);
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
            {!loaded || loadError || metaMissing ? '—' : items.length}
          </div>
          {loaded && !loadError && !metaMissing && items.length > 0 && (
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 800,
                color: '#A12626',
                fontFamily: MONO_FONT,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                marginTop: 4,
              }}
            >
              · {items.length} {items.length === 1 ? 'PEDIDO' : 'PEDIDOS'} ACIMA DA META
            </div>
          )}
          <div
            style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}
          >
            {loadError
              ? 'Não foi possível carregar os alertas agora — tente de novo em instantes.'
              : !loaded
                ? 'Carregando alertas…'
                : metaMissing
                  ? 'Sem meta configurada não dá pra saber o que está atrasado.'
                  : items.length > 0
                    ? `${items.length} ${items.length === 1 ? 'pedido passou' : 'pedidos passaram'} da meta da cozinha (${kitchenEta} min).`
                    : `Nenhum pedido acima da meta da cozinha (${kitchenEta} min) agora.`}
          </div>
        </div>

        {metaMissing && (
          <div style={{ padding: '0 16px' }}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                border: '1px solid #F0DCB6',
                background: '#FFF7E6',
                fontSize: 13,
                color: '#7A4D10',
                fontWeight: 600,
                lineHeight: 1.5,
              }}
            >
              Meta da cozinha não configurada — defina em /cozinha/eu para acompanhar pedidos
              atrasados aqui.
            </div>
          </div>
        )}

        {loaded && !loadError && !metaMissing && items.length > 0 && (
          <>
            <SectionLabel C={C}>Pedidos acima da meta</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((o) => (
                <button
                  key={o.orderId}
                  type="button"
                  onClick={() => openTableByLabel(o.tableLabel)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${CRIT.border}`,
                    background: CRIT.bg,
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
                      color: CRIT.color,
                      border: `1px solid ${CRIT.border}`,
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
                    {o.tableLabel.replace(/\D/g, '') || '—'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        color: CRIT.color,
                        letterSpacing: 0.7,
                        textTransform: 'uppercase',
                        fontFamily: MONO_FONT,
                      }}
                    >
                      PASSOU DA META · {kitchenEta} MIN
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: CRIT.color,
                        letterSpacing: -0.1,
                        marginTop: 2,
                      }}
                    >
                      {o.tableLabel} · {o.minutesInPrep} min em preparo · {o.itemCount}{' '}
                      {o.itemCount === 1 ? 'item' : 'itens'}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: CRIT.color,
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
                onClick={() =>
                  router.push(
                    slugQs ? `/manager/kitchen-reorder?slug=${slugQs}` : '/manager/kitchen-reorder',
                  )
                }
              >
                Ver fila da cozinha
              </ActionPill>
              <ActionPill
                C={C}
                icon={Icon.chat(13)}
                onClick={() =>
                  router.push(slugQs ? `/manager/mensagens?slug=${slugQs}` : '/manager/mensagens')
                }
              >
                Mensagem direta pra equipe
              </ActionPill>
            </div>
          </>
        )}

        <div style={{ height: 18 }} />
        <Formula C={C}>
          Pedidos com status <b>em preparo</b> há mais tempo que a meta da cozinha
          {kitchenEta != null ? ` (${kitchenEta} min)` : ''} · meta configurada em /cozinha/eu.
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
      <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
}

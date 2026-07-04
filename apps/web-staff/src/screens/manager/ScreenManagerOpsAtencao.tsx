'use client';

// V9 drill-down — ATENÇÃO chip (/manager/operacoes/atencao).
//
// Canvas spec: docs/design-canvas/handoff/garcom/garcom-screens-e.jsx:669-769
// (variant `atencao`). Hero "N" mostarda + lista cada com 2 ações inline
// + Fórmula.
//
// Backend wiring (anti-placebo):
//   • REAL: alimentado pelos `lateOrders` do GET /:slug/dashboard/
//     active-tables — pedidos em preparo acima da meta da cozinha.
//   • Meta não configurada → aviso pra configurar em /cozinha/eu.

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

export function ScreenManagerOpsAtencao({ dark, tenantSlug }: ScreenManagerOpsAtencaoProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const params = useSearchParams();
  const slugQs = params.get('slug');
  const backHref = slugQs ? `/manager/operacoes?slug=${slugQs}` : '/manager/operacoes';

  const [lateOrders, setLateOrders] = useState<LateOrderRow[]>([]);
  const [kitchenEta, setKitchenEta] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let stop = false;
    activeTablesApi(tenantSlug)
      .get()
      .then((res) => {
        if (stop) return;
        setLateOrders(res.lateOrders);
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

  const items: AttentionAlert[] = metaMissing
    ? []
    : lateOrders.map((o) => ({
        id: o.orderId,
        msg: `${o.tableLabel} · pedido em preparo há ${o.minutesInPrep} min`,
        sub: `${o.itemCount} ${o.itemCount === 1 ? 'item' : 'itens'} · meta ${kitchenEta} min`,
        ts: `${o.minutesInPrep} min`,
        actions: ['Ver fila da cozinha', 'Ver operações'],
      }));

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
            {!loaded || loadError || metaMissing ? '—' : items.length}
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
            {metaMissing
              ? '· META NÃO CONFIGURADA'
              : empty
                ? '· NADA EM ATENÇÃO'
                : '· ACIMA DA META'}
          </div>
          <div
            style={{ fontSize: 14, color: C.mute, fontWeight: 500, marginTop: 10, lineHeight: 1.5 }}
          >
            {loadError
              ? 'Não foi possível carregar os alertas agora — tente de novo em instantes.'
              : !loaded
                ? 'Carregando alertas…'
                : metaMissing
                  ? 'Sem meta configurada não dá pra saber o que precisa de atenção.'
                  : empty
                    ? `Nenhum pedido acima da meta da cozinha (${kitchenEta} min). Volta aqui se algo passar do limite.`
                    : `${items.length} ${items.length === 1 ? 'pedido passou' : 'pedidos passaram'} da meta da cozinha.`}
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
              Meta da cozinha não configurada — defina em /cozinha/eu para acompanhar pedidos em
              atenção aqui.
            </div>
          </div>
        )}

        {!empty && (
          <>
            <SectionLabel C={C}>O que está em atenção</SectionLabel>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((a) => (
                <AlertCard
                  key={a.id}
                  C={C}
                  alert={a}
                  onAction0={() =>
                    router.push(
                      slugQs
                        ? `/manager/kitchen-reorder?slug=${slugQs}`
                        : '/manager/kitchen-reorder',
                    )
                  }
                  onAction1={() =>
                    router.push(slugQs ? `/manager/operacoes?slug=${slugQs}` : '/manager/operacoes')
                  }
                />
              ))}
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

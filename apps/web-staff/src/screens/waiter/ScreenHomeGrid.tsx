'use client';

// ScreenHomeGrid — Home do garçom (única vista, V3).
// Match com docs/design-canvas/handoff/garcom/garcom-screens-a.jsx ::
// ScreenHomeGrid. Grade 2-col + faixa de chamados ativos + banner
// zone-pause (per docs/features/zone-pause.md).
//
// WS: zone_pause.{started|ended} liga/desliga o banner em tempo real.

import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GBadge, GBottomNav, GIconBtn } from '../../components/waiter/Primitives';
import { useWaiterEvents } from '../../hooks/useWaiterEvents';
import {
  isDeliveryClaimedBy,
  isDeliveryForWaiter,
  listMyTables,
  listMyZonePauses,
  listPendingCalls,
  listPendingDeliveries,
  type ActiveTableSummary,
  type PendingDelivery,
  type WaiterCallSummary,
} from '../../lib/api/waiter';
import type { ZonePauseDto, WsEvent } from '@restaurant/shared-types';

interface ScreenHomeGridProps {
  tenantSlug: string;
  waiterId: string;
  dark?: boolean;
  waiterInitials?: string;
  onNewEntry?: () => void;
  onOpenCall?: (callId: string) => void;
  onOpenTable?: (tableNumber: number) => void;
  onTabChange?: (tab: string) => void;
  fab?: boolean;
}

const STATUS_MAP: Record<
  ActiveTableSummary['status'],
  { tone: 'warn' | 'info' | 'soft'; label: string }
> = {
  novo: { tone: 'warn', label: 'Novo' },
  'aguardando-prato': { tone: 'info', label: 'Aguardando' },
  'em-andamento': { tone: 'soft', label: 'Em andamento' },
  livre: { tone: 'soft', label: 'Livre' },
};

function fmtBRL(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

// "1414 min"/"16136 min" era vazamento de fixture pro operador (prompt 99,
// dados demo ruins) — acima de 1h humaniza pra h/d.
function fmtOpenedDuration(min: number): string {
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / (24 * 60))} d`;
}

// last_event vem do order_status_history.to_status — traduz o status
// técnico (ex.: `ready`) pra label de operador.
const LAST_EVENT_LABEL: Record<string, string> = {
  pending_confirmation: 'Pedido aguardando confirmação',
  received: 'Pedido recebido',
  in_progress: 'Pedido em preparo',
  ready: 'Pedido pronto p/ servir',
  in_transit: 'Pedido a caminho da mesa',
  delivered: 'Pedido entregue',
  cancelled: 'Pedido cancelado',
  // aliases legados
  open: 'Pedido aberto',
  confirmed: 'Pedido confirmado',
  preparing: 'Pedido em preparo',
};

function fmtTimeLeft(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return '00:00';
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  return hh === '00' ? `${mm} min` : `${hh}:${mm}`;
}

export const ScreenHomeGrid: React.FC<ScreenHomeGridProps> = ({
  tenantSlug,
  waiterId,
  dark = false,
  waiterInitials = 'EU',
  onNewEntry = () => {},
  onOpenCall = () => {},
  onOpenTable = () => {},
  onTabChange,
  fab = false,
}) => {
  const C = useG(dark);
  const router = useRouter();
  const [tables, setTables] = useState<ActiveTableSummary[]>([]);
  const [calls, setCalls] = useState<WaiterCallSummary[]>([]);
  const [pauses, setPauses] = useState<ZonePauseDto[]>([]);
  const [deliveries, setDeliveries] = useState<PendingDelivery[]>([]);

  const { on } = useWaiterEvents({ tenantSlug, waiterId });

  // Initial load + 5s polling fallback (in addition to WS)
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [t, c, p, d] = await Promise.all([
          listMyTables(tenantSlug).catch(() => []),
          listPendingCalls(tenantSlug).catch(() => []),
          listMyZonePauses(tenantSlug, waiterId).catch(() => []),
          listPendingDeliveries(tenantSlug).catch(() => [] as PendingDelivery[]),
        ]);
        if (!alive) return;
        setTables(t);
        setCalls(c);
        setPauses(p);
        // Entregas relevantes pra mim: pendentes broadcast/direcionadas
        // ou já claimed por mim (em trânsito) — predicados canônicos de
        // lib/api/waiter (code-review: variantes locais divergiam).
        setDeliveries(
          d.filter(
            (row) =>
              isDeliveryForWaiter(row, waiterId || null) ||
              isDeliveryClaimedBy(row, waiterId || null),
          ),
        );
      } catch {
        /* noop · screen renders empty */
      }
    }
    load();
    const tid = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(tid);
    };
  }, [tenantSlug, waiterId]);

  // WS hooks for banner toggling
  useEffect(() => {
    const off = on((event: WsEvent) => {
      if (event.event === 'zone_pause.started' && event.payload.waiterId === waiterId) {
        setPauses((prev) => {
          if (prev.some((p) => p.id === event.payload.id)) return prev;
          return [
            ...prev,
            {
              id: event.payload.id,
              waiterId: event.payload.waiterId,
              waiterName: event.payload.waiterName,
              kind: 'orders',
              startedAt: new Date().toISOString(),
              endsAt: event.payload.endsAt,
              startedBy: event.payload.startedBy,
              startedByName: '',
              endedAt: null,
              endedBy: null,
              reason: event.payload.reason,
              active: true,
            },
          ];
        });
      } else if (event.event === 'zone_pause.ended') {
        setPauses((prev) => prev.filter((p) => p.id !== event.payload.id));
      }
    });
    return () => {
      off();
    };
  }, [on, waiterId]);

  const activePause = useMemo(
    () => pauses.find((p) => p.active && new Date(p.endsAt).getTime() > Date.now()),
    [pauses],
  );
  const firstUrgentCall = calls[0];
  const firstDelivery = deliveries[0];
  const callsCount = calls.length + deliveries.length;

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: C.bg,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <GAppHeader
        dark={dark}
        left={
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: C.ink,
              color: C.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {waiterInitials}
          </div>
        }
        title="Minhas mesas"
        sub={`${tables.filter((t) => t.status !== 'livre').length} ABERTAS · ${tables.filter((t) => t.status === 'livre').length} LIVRES`}
        right={
          <GIconBtn
            icon={Icon.bell(20)}
            dark={dark}
            badge={callsCount > 0 ? String(callsCount) : undefined}
            onClick={() => router.push('/waiter/notifications')}
            ariaLabel="Notificações"
          />
        }
      />

      {/* Zone-pause banner — per docs/features/zone-pause.md */}
      {activePause && (
        <div
          role="alert"
          style={{
            background: C.warnBg,
            color: C.warn,
            padding: '10px 16px',
            borderBottom: `1px solid ${C.warn}55`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: C.warn,
              animation: 'gPulse 1.4s infinite',
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1, minWidth: 0 }}>
            ZONA PAUSADA · comandas bloqueadas até {fmtTimeLeft(activePause.endsAt)}
          </span>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 16px' }}>
        {/* faixa de entrega pendente — handoff TV cozinha/bar */}
        {firstDelivery && (
          <button
            type="button"
            data-testid="home-delivery-strip"
            onClick={() =>
              router.push(`/waiter/entrega/${firstDelivery.order_id}?tenant=${tenantSlug}`)
            }
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              width: '100%',
              background: C.successBg,
              border: `1px solid ${C.success}`,
              borderRadius: 14,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 16,
              color: C.success,
            }}
          >
            {Icon.bell(20)}
            <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600, minWidth: 0 }}>
              {firstDelivery.table_label}
              {firstDelivery.zone_name ? ` · ${firstDelivery.zone_name}` : ''} · pronto na cozinha
              {deliveries.length > 1 ? ` · +${deliveries.length - 1}` : ''}
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              {firstDelivery.delivery_status === 'claimed' ? 'Confirmar →' : 'Entregar →'}
            </span>
          </button>
        )}

        {/* faixa de chamados ativos */}
        {firstUrgentCall && (
          <button
            type="button"
            onClick={() => onOpenCall(firstUrgentCall.id)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              width: '100%',
              background: C.dangerBg,
              border: `1px solid ${C.danger}`,
              borderRadius: 14,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 16,
              color: C.danger,
            }}
          >
            {Icon.hand(20)}
            <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>
              {firstUrgentCall.table_label}{' '}
              {firstUrgentCall.status === 'acknowledged' ? 'aguarda · a caminho' : 'chamou · agora'}
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              {/* Um chamado já acknowledged precisa levar o garçom ao detalhe
                  pra CONCLUIR ("Atendido"), não pra "Atender" de novo. */}
              {firstUrgentCall.status === 'acknowledged' ? 'Concluir →' : 'Atender →'}
            </span>
          </button>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {tables.map((t) => {
            const s = STATUS_MAP[t.status];
            const isLivre = t.status === 'livre';
            const isNovo = t.status === 'novo';
            const tableNumber = parseInt(t.label.replace(/[^0-9]/g, ''), 10) || 0;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpenTable(tableNumber)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  border: `1.5px solid ${isNovo ? C.warn : C.borderSoft}`,
                  borderRadius: 16,
                  padding: 14,
                  background: isLivre ? 'transparent' : C.bg,
                  opacity: isLivre ? 0.5 : 1,
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        color: C.mute,
                        fontWeight: 600,
                      }}
                    >
                      Mesa
                    </div>
                    <div
                      style={{
                        fontSize: 36,
                        fontWeight: 700,
                        letterSpacing: -1,
                        lineHeight: 1,
                        marginTop: 2,
                      }}
                    >
                      {String(tableNumber).padStart(2, '0')}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: C.mute,
                      textAlign: 'right',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {Icon.user(12)} {t.party_size}/{t.capacity}
                  </div>
                </div>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <GBadge tone={s.tone} dark={dark} dot pulse={isNovo}>
                    {s.label}
                  </GBadge>
                  {t.is_vip && (
                    <GBadge tone="warn" dark={dark}>
                      VIP
                    </GBadge>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: C.mute, marginTop: 8, lineHeight: 1.4 }}>
                  {t.last_event ? (LAST_EVENT_LABEL[t.last_event] ?? '—') : '—'}
                </div>
                {!isLivre && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: `1px dashed ${C.borderFaint}`,
                    }}
                  >
                    <span style={{ fontSize: 11, color: C.faint }}>
                      {fmtOpenedDuration(t.opened_min)}
                    </span>
                    <span
                      style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                    >
                      R$ {fmtBRL(t.ticket_total_cents)}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {fab && (
        <button
          type="button"
          onClick={onNewEntry}
          aria-label="Nova interação"
          style={{
            // P1 #20: o FAB tinha `bottom: 76` cru — ficava sobre o tab
            // bar em iOS Safari (que agora tem padding safe-area). O
            // calc + env mantem 76px acima da tab bar em qualquer device.
            position: 'fixed',
            right: 16,
            bottom: 'calc(76px + env(safe-area-inset-bottom))',
            width: 56,
            height: 56,
            borderRadius: 28,
            background: C.ink,
            color: C.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 24px -8px rgba(0,0,0,0.35)',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            zIndex: 3,
          }}
        >
          {Icon.qr(24)}
        </button>
      )}

      <GBottomNav
        active="home"
        dark={dark}
        onNewEntry={onNewEntry}
        callsBadge={callsCount}
        onTabChange={(id) => onTabChange?.(id)}
      />
    </div>
  );
};

export default ScreenHomeGrid;

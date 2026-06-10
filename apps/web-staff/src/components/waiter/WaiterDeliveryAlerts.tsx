'use client';

// WaiterDeliveryAlerts — banner in-app de entrega pendente pro garçom.
//
// Montado no layout de /waiter/* (todas as telas V20 do garçom). Quando a
// cozinha/bar chama garçom na TV (POST /:slug/orders/:id/call-waiter), o
// backend persiste `order_deliveries` e emite `order:handoff_called` pro
// garçom-alvo (room staff:{id}) ou broadcast waiter. Este componente:
//  - escuta o WS (order:handoff_called / order:claimed / order:status);
//  - faz polling de GET /:slug/deliveries/pending a cada 10s (fallback
//    se o socket cair — padrão das telas waiter);
//  - toca alerta sonoro quando entra entrega nova;
//  - mostra banner com mesa + zona (Varanda, Salão…) + itens e CTA
//    "Ver entrega" → /waiter/entrega/[orderId], onde o garçom marca
//    "Estou levando" e depois "Entregue".
//
// Só entrega `pending` direcionada a mim (target_waiter_id === staffId)
// ou broadcast (target null) vira banner. Entregas claimed por outro
// garçom não alertam aqui (aparecem na lista de chamados).

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useG, G_FONT, MONO_FONT } from './tokens';
import { Icon } from './Icons';
import { useWaiterEvents } from '../../hooks/useWaiterEvents';
import { listPendingDeliveries, type PendingDelivery } from '../../lib/api/waiter';
import type { WsEvent } from '@restaurant/shared-types';

function playDeliveryAlertSound() {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new Ctor();
    // Two-tone alert (mesmo timbre do legado /garcom/pedidos)
    [660, 880].forEach((freq, i) => {
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = freq;
      oscillator.type = 'sine';
      const start = audioCtx.currentTime + i * 0.2;
      gainNode.gain.setValueAtTime(0.3, start);
      gainNode.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      oscillator.start(start);
      oscillator.stop(start + 0.3);
    });
  } catch {
    // Audio not supported
  }
}

function relativeMinutes(iso: string | null): string {
  if (!iso) return 'agora';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return mins > 0 ? `há ${mins} min` : 'agora';
}

export interface WaiterDeliveryAlertsProps {
  tenantSlug: string;
  waiterId?: string | null;
  dark?: boolean;
}

export function WaiterDeliveryAlerts({ tenantSlug, waiterId, dark = false }: WaiterDeliveryAlertsProps) {
  const C = useG(dark);
  const router = useRouter();
  const pathname = usePathname();
  const [deliveries, setDeliveries] = useState<PendingDelivery[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const knownIdsRef = useRef<Set<string>>(new Set());

  const isMine = useCallback(
    (d: PendingDelivery) =>
      d.delivery_status === 'pending' &&
      (!d.target_waiter_id || !waiterId || d.target_waiter_id === waiterId),
    [waiterId],
  );

  const load = useCallback(async () => {
    try {
      const rows = await listPendingDeliveries(tenantSlug);
      const mine = rows.filter(isMine);
      const fresh = mine.filter((d) => !knownIdsRef.current.has(d.delivery_id));
      if (fresh.length > 0 && knownIdsRef.current.size > 0) {
        playDeliveryAlertSound();
      }
      knownIdsRef.current = new Set(mine.map((d) => d.delivery_id));
      setDeliveries(mine);
    } catch {
      // Mantém o último estado em falha de rede; o próximo tick re-tenta.
      // A lista completa (com erro visível) vive em /waiter/chamados.
    }
  }, [tenantSlug, isMine]);

  useEffect(() => {
    load();
    const tid = setInterval(load, 10_000);
    return () => clearInterval(tid);
  }, [load]);

  const { on } = useWaiterEvents({
    tenantSlug,
    waiterId: waiterId ?? undefined,
    events: ['order:handoff_called', 'order:claimed', 'order:status'],
  });

  useEffect(() => {
    const off = on((event: WsEvent) => {
      if (
        event.event === 'order:handoff_called' ||
        event.event === 'order:claimed' ||
        event.event === 'order:status'
      ) {
        load();
      }
    });
    return () => {
      off();
    };
  }, [on, load]);

  // No fluxo de entrega o banner é redundante (o garçom já está agindo).
  if (pathname?.startsWith('/waiter/entrega')) return null;

  const visible = deliveries.filter((d) => !dismissed.has(d.delivery_id));
  if (visible.length === 0) return null;

  return (
    <div
      role="alert"
      data-testid="waiter-delivery-alerts"
      style={{
        position: 'fixed',
        top: 'calc(8px + env(safe-area-inset-top))',
        left: 12,
        right: 12,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: G_FONT,
      }}
    >
      {visible.slice(0, 3).map((d) => {
        const itemsCount = d.items.reduce((sum, it) => sum + it.quantity, 0);
        return (
          <div
            key={d.delivery_id}
            style={{
              borderRadius: 14,
              border: `1.5px solid ${C.success}`,
              background: dark ? C.successBg : '#ffffff',
              boxShadow: '0 10px 28px -10px rgba(0,0,0,0.35)',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: C.success,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {Icon.bell(18)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  color: C.success,
                  fontFamily: MONO_FONT,
                }}
              >
                Pronto · levar na mesa · {relativeMinutes(d.called_at)}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: C.ink,
                  letterSpacing: -0.2,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {d.table_label}
                {d.zone_name ? ` · ${d.zone_name}` : ''}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: C.mute,
                  marginTop: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {itemsCount} {itemsCount === 1 ? 'item' : 'itens'}
                {d.items.length > 0
                  ? ` · ${d.items.map((it) => `${it.quantity}× ${it.name}`).join(' · ')}`
                  : ''}
              </div>
            </div>
            <button
              type="button"
              data-testid="delivery-alert-open"
              onClick={() =>
                router.push(`/waiter/entrega/${d.order_id}?tenant=${tenantSlug}`)
              }
              style={{
                all: 'unset',
                cursor: 'pointer',
                flexShrink: 0,
                padding: '9px 14px',
                borderRadius: 100,
                background: C.success,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Ver entrega
            </button>
            <button
              type="button"
              aria-label="Dispensar alerta"
              onClick={() =>
                setDismissed((prev) => new Set(prev).add(d.delivery_id))
              }
              style={{
                all: 'unset',
                cursor: 'pointer',
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: C.faint,
              }}
            >
              {Icon.x(16)}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default WaiterDeliveryAlerts;

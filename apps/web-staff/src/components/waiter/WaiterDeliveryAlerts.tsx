'use client';

// WaiterDeliveryAlerts — banner in-app de ENTREGA pendente + CHAMADO de
// cliente pro garçom, montado no layout de /waiter/* (todas as telas V20).
//
// Entregas: a cozinha/bar chama garçom na TV (POST call-waiter) → backend
// persiste order_deliveries e emite `order:handoff_called` → banner verde
// com mesa + zona + itens e CTA "Ver entrega" → /waiter/entrega/[orderId].
// Chamados: cliente toca "Chamar garçom" → `waiter:call` → banner âmbar
// com CTA "Atender" → /waiter/call/[id]. (Paridade com o WaiterAlerts
// legado removido — o code-review apontou que o som de chamado de cliente
// tinha sumido de todas as superfícies.)
//
// Som: duas notas quando entra item NOVO após a primeira carga — inclusive
// na transição 0→1 (o guard antigo silenciava exatamente o caso principal).
// AudioContext é singleton com resume() — criar um por alerta fora de
// gesto ficava 'suspended' (mudo) e vazava contextos até o cap da aba.
//
// Audiência via helpers canônicos de lib/api/waiter (code-review: quatro
// variantes divergentes). Sem staffId, só broadcast aparece — nunca a
// entrega direcionada de outro garçom.

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useG, G_FONT, MONO_FONT } from './tokens';
import { Icon } from './Icons';
import { useWaiterEvents } from '../../hooks/useWaiterEvents';
import {
  deliveryTimestamp,
  isDeliveryForWaiter,
  listPendingCalls,
  listPendingDeliveries,
  type PendingDelivery,
  type WaiterCallSummary,
} from '../../lib/api/waiter';
import type { WsEvent } from '@restaurant/shared-types';

let sharedAudioCtx: AudioContext | null = null;

function playAlertTones() {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctor();
    const audioCtx = sharedAudioCtx;
    const schedule = () => {
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
    };
    if (audioCtx.state === 'suspended') {
      // Autoplay policy: sem gesto prévio o resume() falha — toca assim
      // que o contexto destravar; engolir o reject mantém o catch externo.
      audioCtx
        .resume()
        .then(schedule)
        .catch(() => undefined);
    } else {
      schedule();
    }
  } catch {
    // Audio not supported
  }
}

function relativeMinutes(iso: string | null): string {
  if (!iso) return 'agora';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return mins > 0 ? `há ${mins} min` : 'agora';
}

const CALL_TYPE_BY_REASON: Record<string, string> = {
  ask_bill: 'pediu-conta',
  serve_drink: 'mais-bebida',
};

const CALL_REASON_LABEL: Record<string, string> = {
  bring_menu: 'Trazer cardápio',
  place_order: 'Anotar pedido',
  serve_drink: 'Trazer bebida',
  ask_bill: 'Pediu a conta',
  other: 'Chamou garçom',
};

export interface WaiterDeliveryAlertsProps {
  tenantSlug: string;
  waiterId?: string | null;
  dark?: boolean;
}

export function WaiterDeliveryAlerts({
  tenantSlug,
  waiterId,
  dark = false,
}: WaiterDeliveryAlertsProps) {
  const C = useG(dark);
  const router = useRouter();
  const pathname = usePathname();
  const [deliveries, setDeliveries] = useState<PendingDelivery[]>([]);
  const [calls, setCalls] = useState<WaiterCallSummary[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const loadSeqRef = useRef(0);
  // No fluxo de entrega o banner é redundante — também pausa o poll
  // (continuava buscando pra renderizar null, puro desperdício).
  const hidden = pathname?.startsWith('/waiter/entrega') ?? false;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  const load = useCallback(async () => {
    if (hiddenRef.current) return;
    const seq = ++loadSeqRef.current;
    try {
      const [deliveryRows, callRows] = await Promise.all([
        listPendingDeliveries(tenantSlug),
        listPendingCalls(tenantSlug).catch(() => [] as WaiterCallSummary[]),
      ]);
      // Guard de corrida: um fetch antigo (ex.: disparado antes do staffId
      // hidratar) não pode sobrescrever um resultado mais novo.
      if (seq !== loadSeqRef.current) return;
      const mine = deliveryRows.filter((d) => isDeliveryForWaiter(d, waiterId ?? null));
      const pendingCalls = callRows.filter((c) => c.status === 'pending');

      const ids = new Set<string>([
        ...mine.map((d) => `d:${d.delivery_id}`),
        ...pendingCalls.map((c) => `c:${c.id}`),
      ]);
      const hasFresh = Array.from(ids).some((id) => !knownIdsRef.current.has(id));
      // initializedRef (e não "lista anterior vazia"): o estado normal do
      // garçom é fila vazia, e o guard antigo silenciava o beep exatamente
      // na transição 0→1 — a primeira entrega chegava muda (code-review).
      if (initializedRef.current && hasFresh) {
        playAlertTones();
      }
      knownIdsRef.current = ids;
      initializedRef.current = true;
      setDeliveries(mine);
      setCalls(pendingCalls);
    } catch {
      // Mantém o último estado em falha de rede; o próximo tick re-tenta.
      // A lista completa (com erro visível) vive em /waiter/chamados.
    }
  }, [tenantSlug, waiterId]);

  useEffect(() => {
    load();
    const tid = setInterval(load, 10_000);
    return () => clearInterval(tid);
  }, [load]);

  // Saiu do fluxo de entrega → re-sincroniza na hora.
  useEffect(() => {
    if (!hidden) load();
  }, [hidden, load]);

  const { on } = useWaiterEvents({
    tenantSlug,
    waiterId: waiterId ?? undefined,
    events: [
      'order:handoff_called',
      'order:claimed',
      'order:status',
      'waiter:call',
      'waiter:acknowledged',
    ],
  });

  useEffect(() => {
    const off = on((_event: WsEvent) => {
      load();
    });
    return () => {
      off();
    };
  }, [on, load]);

  if (hidden) return null;

  const visibleDeliveries = deliveries.filter((d) => !dismissed.has(`d:${d.delivery_id}`));
  const visibleCalls = calls.filter((c) => !dismissed.has(`c:${c.id}`));
  const total = visibleDeliveries.length + visibleCalls.length;
  if (total === 0) return null;

  const cards: Array<
    { kind: 'delivery'; delivery: PendingDelivery } | { kind: 'call'; call: WaiterCallSummary }
  > = [
    ...visibleDeliveries.map((delivery) => ({ kind: 'delivery' as const, delivery })),
    ...visibleCalls.map((call) => ({ kind: 'call' as const, call })),
  ];
  const shown = cards.slice(0, 3);
  const overflow = total - shown.length;

  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));

  return (
    <div
      role="alert"
      data-testid="waiter-delivery-alerts"
      style={{
        position: 'fixed',
        // Abaixo do GAppHeader (~56px) — o banner cobria o botão voltar e o
        // sino de TODAS as telas enquanto houvesse entrega (code-review).
        top: 'calc(60px + env(safe-area-inset-top))',
        left: 12,
        right: 12,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: G_FONT,
        pointerEvents: 'none',
      }}
    >
      {shown.map((card) => {
        if (card.kind === 'delivery') {
          const d = card.delivery;
          const itemsCount = d.items.reduce((sum, it) => sum + it.quantity, 0);
          return (
            <div
              key={`d:${d.delivery_id}`}
              style={{
                borderRadius: 14,
                border: `1.5px solid ${C.success}`,
                background: dark ? C.successBg : '#ffffff',
                boxShadow: '0 10px 28px -10px rgba(0,0,0,0.35)',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                pointerEvents: 'auto',
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
                  Pronto · levar na mesa · {relativeMinutes(deliveryTimestamp(d))}
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
                onClick={() => router.push(`/waiter/entrega/${d.order_id}?tenant=${tenantSlug}`)}
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
                onClick={() => dismiss(`d:${d.delivery_id}`)}
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
        }

        const call = card.call;
        const reasonLabel =
          call.note || CALL_REASON_LABEL[call.reason ?? 'other'] || 'Chamou garçom';
        const callType = CALL_TYPE_BY_REASON[call.reason ?? ''] ?? 'chamou-garcom';
        return (
          <div
            key={`c:${call.id}`}
            data-testid="waiter-call-alert"
            style={{
              borderRadius: 14,
              border: `1.5px solid ${C.warn}`,
              background: dark ? C.warnBg : '#ffffff',
              boxShadow: '0 10px 28px -10px rgba(0,0,0,0.35)',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              pointerEvents: 'auto',
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: C.warn,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {Icon.hand(18)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  color: C.warn,
                  fontFamily: MONO_FONT,
                }}
              >
                Chamado · {relativeMinutes(call.created_at)}
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
                {call.table_label ?? call.table_code ?? 'Mesa'}
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
                {reasonLabel}
              </div>
            </div>
            <button
              type="button"
              data-testid="call-alert-open"
              onClick={() =>
                router.push(`/waiter/call/${call.id}?tenant=${tenantSlug}&type=${callType}`)
              }
              style={{
                all: 'unset',
                cursor: 'pointer',
                flexShrink: 0,
                padding: '9px 14px',
                borderRadius: 100,
                background: C.warn,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Atender
            </button>
            <button
              type="button"
              aria-label="Dispensar alerta"
              onClick={() => dismiss(`c:${call.id}`)}
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
      {overflow > 0 && (
        <div
          style={{
            alignSelf: 'center',
            padding: '5px 12px',
            borderRadius: 100,
            background: C.ink,
            color: C.bg,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.4,
            pointerEvents: 'auto',
            boxShadow: '0 8px 20px -8px rgba(0,0,0,0.4)',
          }}
        >
          +{overflow} {overflow === 1 ? 'alerta' : 'alertas'} em /waiter/chamados
        </div>
      )}
    </div>
  );
}

export default WaiterDeliveryAlerts;

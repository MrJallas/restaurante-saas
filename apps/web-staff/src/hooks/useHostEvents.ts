'use client';

// WebSocket subscription for host (recepcionista) events.
// Default subscription set:
//  - late_arrival.created     · novo pedido caiu na fila do staff
//  - late_arrival.approved    · pra refresh do feed
//  - late_arrival.rejected    · idem
//  - table_merge.created      · host approval pendente (lado walkin)
//  - escalation.advanced      · cascata avançou (host ainda em janela)
//  - session.flag_changed     · VIP foi trocado
//
// Conexão simétrica ao useWaiterEvents — mantém o contrato fechado em
// torno do mesmo gateway. role=host pra filtragem server-side.

import { useEffect, useRef, useState } from 'react';
import type { WsEvent, WsEventName } from '@restaurant/shared-types';

type Listener = (event: WsEvent) => void;

interface UseHostEventsOptions {
  tenantSlug: string;
  hostId?: string;
  events?: WsEventName[];
}

const DEFAULT_HOST_EVENTS: WsEventName[] = [
  'late_arrival.created',
  'late_arrival.approved',
  'late_arrival.rejected',
  'late_arrival.expired',
  'table_merge.created',
  'table_merge.approved',
  'table_merge.rejected',
  'escalation.created',
  'escalation.advanced',
  'escalation.completed',
  'session.flag_changed',
];

export function useHostEvents({
  tenantSlug,
  hostId,
  events = DEFAULT_HOST_EVENTS,
}: UseHostEventsOptions) {
  const [connected, setConnected] = useState(false);
  const listeners = useRef<Set<Listener>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!tenantSlug) return;
    const baseUrl =
      (typeof window !== 'undefined' && (window as { __WS_URL__?: string }).__WS_URL__) ||
      process.env.NEXT_PUBLIC_WS_URL ||
      `ws://localhost:3001/ws`;
    const params = new URLSearchParams({
      tenant: tenantSlug,
      role: 'host',
      ...(hostId ? { hostId } : {}),
      events: events.join(','),
    });
    const url = `${baseUrl}?${params.toString()}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as WsEvent;
        if (!parsed || typeof parsed !== 'object' || !('event' in parsed)) return;
        listeners.current.forEach((fn) => {
          try {
            fn(parsed);
          } catch {
            /* noop */
          }
        });
      } catch {
        /* malformed frame */
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [tenantSlug, hostId, events]);

  function on(listener: Listener) {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }

  return { connected, on };
}

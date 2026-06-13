'use client';

// WebSocket subscription for host (recepcionista) events.
// Default subscription set:
//  - late_arrival.created     · novo pedido caiu na fila do staff
//  - late_arrival.approved    · pra refresh do feed
//  - late_arrival.rejected    · idem
//  - late_arrival.expired     · idem
//  - table_merge.created      · host approval pendente (lado walkin)
//  - table_merge.approved
//  - table_merge.rejected
//  - escalation.created
//  - escalation.advanced      · cascata avançou (host ainda em janela)
//  - escalation.completed
//  - session.flag_changed     · VIP foi trocado
//
// Conexão simétrica ao useWaiterEvents — mantém o contrato fechado em
// torno do mesmo gateway. role=host pra filtragem server-side.
//
// Migração P0 #2: antes era raw WebSocket pra `/ws` (404). Agora usa
// `socket.io-client` falando com `/socket.io/` (vide events.gateway.ts).

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { WsEvent, WsEventName } from '@restaurant/shared-types';

type Listener = (event: WsEvent) => void;

interface UseHostEventsOptions {
  tenantSlug: string;
  hostId?: string;
  events?: WsEventName[];
}

const DEFAULT_HOST_EVENTS: WsEventName[] = [
  // Mesa pediu a recepção (room tenant:slug:host) — prompt 100 §5.5:
  // a superfície do host mostra "Mesa X pediu a recepção" em tempo real.
  'host.assist_requested',
  'late_arrival.created',
  'late_arrival.approved',
  'late_arrival.rejected',
  'late_arrival.expired',
  'scan_verification.created',
  'scan_verification.escalated',
  'scan_verification.resolved',
  'table_merge.created',
  'table_merge.approved',
  'table_merge.rejected',
  'escalation.created',
  'escalation.advanced',
  'escalation.completed',
  'session.flag_changed',
  'staff_message.received',
  'staff_message.read',
];

function resolveWsUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const explicit = (window as { __WS_URL__?: string }).__WS_URL__ || process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) return apiUrl.replace(/\/?api\/?$/, '');
  return 'http://localhost:3001';
}

function readStaffId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem('staffId') ?? undefined;
  } catch {
    return undefined;
  }
}

export function useHostEvents({
  tenantSlug,
  hostId,
  events = DEFAULT_HOST_EVENTS,
}: UseHostEventsOptions): {
  /** @deprecated alias kept for backwards compatibility with existing call-sites. */
  connected: boolean;
  /** Boolean reflecting current Socket.IO connection state. */
  isConnected: boolean;
  on: (listener: Listener) => () => void;
} {
  const [connected, setConnected] = useState(false);
  const listeners = useRef<Set<Listener>>(new Set());
  const socketRef = useRef<Socket | null>(null);
  const eventsKey = (events ?? DEFAULT_HOST_EVENTS).join(',');
  const eventsRef = useRef<WsEventName[]>(events ?? DEFAULT_HOST_EVENTS);
  eventsRef.current = events ?? DEFAULT_HOST_EVENTS;

  useEffect(() => {
    if (!tenantSlug) return;
    if (typeof window === 'undefined') return;
    const wsUrl = resolveWsUrl();
    if (!wsUrl) return;

    const staffKey = process.env.NEXT_PUBLIC_STAFF_API_KEY ?? undefined;
    const staffId = hostId ?? readStaffId();

    let socket: Socket;
    try {
      socket = io(wsUrl, {
        path: '/socket.io/',
        transports: ['websocket'],
        reconnection: true,
        autoConnect: false,
        auth: {
          staffKey,
          staffId,
          tenantSlug,
          staffRole: 'host',
          role: 'host',
        },
      });
    } catch {
      return;
    }
    socketRef.current = socket;

    const handleConnect = () => {
      setConnected(true);
      socket.emit('join:tenant', { slug: tenantSlug, role: 'host' });
      if (staffId) socket.emit('join:staff', { staffId });
    };
    socket.on('connect', handleConnect);
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.connect();
    if (socket.connected) {
      handleConnect();
    }

    const subscribed =
      eventsRef.current && eventsRef.current.length > 0 ? eventsRef.current : DEFAULT_HOST_EVENTS;
    for (const name of subscribed) {
      socket.on(name, (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return;
        const evt = { event: name, payload } as WsEvent;
        listeners.current.forEach((fn) => {
          try {
            fn(evt);
          } catch {
            /* noop */
          }
        });
      });
    }

    return () => {
      try {
        socket.disconnect();
      } catch {
        /* ignore */
      }
      socketRef.current = null;
    };
  }, [tenantSlug, hostId, eventsKey]);

  function on(listener: Listener) {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }

  return { connected, isConnected: connected, on };
}

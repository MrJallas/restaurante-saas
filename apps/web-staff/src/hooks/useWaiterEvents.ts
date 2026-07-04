'use client';

// WebSocket subscription for waiter-relevant events.
// Subscribes to (server-side filtered):
//  - waiter_call.created      · push a chamou-garcom card
//  - waiter_call.acknowledged · refresh badge counts
//  - order.ready              · pronto na cozinha / no bar
//  - order:status/claimed     · reconciliação de entregas (handoff)
//  - zone_pause.started       · banner ON
//  - zone_pause.ended         · banner OFF
//  - staff_message.received   · inbox unread + push
//  - staff_message.read       · inbox flips to read on counterpart device
//  - complaint.received       · only when manager forwards to waiter
//  - escalation.advanced      · qr-issue / late-arrival / table-merge fallout
//
// The hook is intentionally thin: it manages the Socket.IO connection
// lifecycle and exposes (a) connection state, (b) a typed event stream the
// screen listens to. Each screen (home, calls, messages) subscribes to the
// events it cares about.
//
// SOCKET COMPARTILHADO (code-review): cada chamada do hook abria a PRÓPRIA
// conexão — layout (banner) + tela = 2 sockets por device, e o gateway
// rate-limita handshakes em 30/60s POR IP (o IP do NAT do restaurante,
// compartilhado por todos os devices). Pior: rejeição do servidor vem como
// 'io server disconnect', que o socket.io-client NÃO re-tenta — realtime
// morria até reload. Agora um registry module-level compartilha 1 socket
// por (url|tenant|staffId) com refcount, re-tenta com backoff quando o
// servidor derruba, e o hook NEM conecta sem staffId (o gateway rejeitaria
// — e com remember=false o staffId mora em sessionStorage, que o reader
// antigo ignorava).

import { useEffect, useRef, useState } from 'react';
import type { WsEvent, WsEventName } from '@restaurant/shared-types';
import {
  acquireStaffSocket,
  readStaffId,
  releaseStaffSocket,
  resolveWsUrl,
} from '../lib/staffSocket';

type Listener = (event: WsEvent) => void;

interface UseWaiterEventsOptions {
  /** Tenant slug used for connection scoping. */
  tenantSlug: string;
  /** Waiter identifier so the gateway can filter to this waiter's room. */
  waiterId?: string;
  /** Optional: subset of events the caller wants. Defaults to a sensible waiter set. */
  events?: WsEventName[];
}

const DEFAULT_WAITER_EVENTS: WsEventName[] = [
  'waiter:call',
  'waiter:acknowledged',
  'order:ready',
  'order:status',
  'order:claimed',
  'order:handoff_called',
  'zone_pause.started',
  'zone_pause.ended',
  'staff_message.received',
  'staff_message.read',
  'complaint.received',
  'complaint.responded',
  'escalation.created',
  'escalation.advanced',
  'escalation.completed',
  'scan_verification.created',
  'scan_verification.escalated',
  'scan_verification.resolved',
  'session.flag_changed',
];

export function useWaiterEvents({
  tenantSlug,
  waiterId,
  events = DEFAULT_WAITER_EVENTS,
}: UseWaiterEventsOptions): {
  /** @deprecated alias kept for backwards compatibility with existing call-sites. */
  connected: boolean;
  /** Boolean reflecting current Socket.IO connection state. */
  isConnected: boolean;
  on: (listener: Listener) => () => void;
} {
  const [connected, setConnected] = useState(false);
  const listeners = useRef<Set<Listener>>(new Set());
  // Stable join-key so re-renders that recreate the `events` literal don't
  // tear down/re-establish the socket.
  const eventsKey = (events ?? DEFAULT_WAITER_EVENTS).join(',');
  const eventsRef = useRef<WsEventName[]>(events ?? DEFAULT_WAITER_EVENTS);
  eventsRef.current = events ?? DEFAULT_WAITER_EVENTS;

  useEffect(() => {
    if (!tenantSlug) return;
    if (typeof window === 'undefined') return;
    const wsUrl = resolveWsUrl();
    if (!wsUrl) return;

    const staffId = waiterId ?? readStaffId();
    // Sem identidade o gateway rejeita o handshake staff de qualquer forma
    // — não conectar evita queimar o budget compartilhado de 30/60s por IP.
    if (!staffId) return;

    const entry = acquireStaffSocket(wsUrl, tenantSlug, staffId, 'waiter');
    if (!entry) return;
    const socket = entry.socket;

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleDisconnect);
    if (socket.connected) setConnected(true);

    // Caller-selectable subset (defaults cover the waiter set above).
    const subscribed =
      eventsRef.current && eventsRef.current.length > 0 ? eventsRef.current : DEFAULT_WAITER_EVENTS;
    const handlers: Array<[string, (payload: unknown) => void]> = [];
    for (const name of subscribed) {
      const handler = (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return;
        const evt = { event: name, payload } as WsEvent;
        listeners.current.forEach((fn) => {
          try {
            fn(evt);
          } catch {
            /* noop · isolate listener errors */
          }
        });
      };
      socket.on(name, handler);
      handlers.push([name, handler]);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleDisconnect);
      for (const [name, handler] of handlers) {
        socket.off(name, handler);
      }
      releaseStaffSocket(wsUrl, tenantSlug, staffId, 'waiter');
    };
  }, [tenantSlug, waiterId, eventsKey]);

  function on(listener: Listener) {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }

  return { connected, isConnected: connected, on };
}

'use client';

// WebSocket subscription for waiter-relevant events.
// Subscribes to (server-side filtered):
//  - waiter_call.created      · push a chamou-garcom card
//  - waiter_call.acknowledged · refresh badge counts
//  - order.ready              · pronto na cozinha / no bar
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
// Implementation note: previous version used a raw `WebSocket` against
// `ws://...:3001/ws` which 404'd against the API (only Socket.IO at
// `/socket.io/` is served — see events.gateway.ts). We now use the
// `socket.io-client` so reconnection backoff, heartbeat and namespace
// routing all match the server contract.

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { WsEvent, WsEventName } from '@restaurant/shared-types';

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

function resolveWsUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const explicit =
    (window as { __WS_URL__?: string }).__WS_URL__ ||
    process.env.NEXT_PUBLIC_WS_URL;
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
  const socketRef = useRef<Socket | null>(null);
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

    const staffKey = process.env.NEXT_PUBLIC_STAFF_API_KEY ?? undefined;
    const staffId = waiterId ?? readStaffId();

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
          staffRole: 'waiter',
          role: 'waiter',
        },
      });
    } catch {
      return;
    }
    socketRef.current = socket;

    const handleConnect = () => {
      setConnected(true);
      socket.emit('join:tenant', { slug: tenantSlug, role: 'waiter' });
      if (staffId) socket.emit('join:staff', { staffId });
    };
    socket.on('connect', handleConnect);
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.connect();
    if (socket.connected) {
      handleConnect();
    }

    // Caller-selectable subset (defaults cover the waiter set above).
    const subscribed =
      eventsRef.current && eventsRef.current.length > 0
        ? eventsRef.current
        : DEFAULT_WAITER_EVENTS;
    for (const name of subscribed) {
      socket.on(name, (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return;
        const evt = { event: name, payload } as WsEvent;
        listeners.current.forEach((fn) => {
          try {
            fn(evt);
          } catch {
            /* noop · isolate listener errors */
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
  }, [tenantSlug, waiterId, eventsKey]);

  function on(listener: Listener) {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }

  return { connected, isConnected: connected, on };
}

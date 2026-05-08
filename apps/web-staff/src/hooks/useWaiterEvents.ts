'use client';

// WebSocket subscription for waiter-relevant events.
// Subscribes to (server-side filtered):
//  - waiter_call.created      · push a chamou-garcom card
//  - waiter_call.acknowledged · refresh badge counts
//  - order.ready              · pronto na cozinha / no bar
//  - zone_pause.started       · banner ON
//  - zone_pause.ended         · banner OFF
//  - staff_message.received   · inbox unread + push
//  - complaint.created        · only when manager forwards to waiter
//  - escalation.advanced      · qr-issue / late-arrival / table-merge fallout
//
// The hook is intentionally thin: it manages the WS connection lifecycle
// and exposes (a) connection state, (b) a typed event stream the screen
// listens to. Each screen (home, calls, messages) subscribes to the
// events it cares about.

import { useEffect, useRef, useState } from 'react';
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
  'zone_pause.started',
  'zone_pause.ended',
  'staff_message.received',
  'complaint.created',
  'complaint.responded',
  'escalation.created',
  'escalation.advanced',
  'escalation.completed',
  'session.flag_changed',
];

export function useWaiterEvents({
  tenantSlug,
  waiterId,
  events = DEFAULT_WAITER_EVENTS,
}: UseWaiterEventsOptions) {
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
      role: 'waiter',
      ...(waiterId ? { waiterId } : {}),
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
            /* noop · isolate listener errors */
          }
        });
      } catch {
        /* malformed frame · drop silently */
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [tenantSlug, waiterId, events]);

  function on(listener: Listener) {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }

  return { connected, on };
}

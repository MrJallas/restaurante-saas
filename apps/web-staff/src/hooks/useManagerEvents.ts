// WebSocket subscription hook for manager screens.
//
// Manager-relevant events (ws-events.ts shape):
//   • escalation.created / .advanced / .completed
//   • late_arrival.created / .approved / .rejected / .expired
//   • table_merge.created / .approved / .rejected
//   • merge.cooldown_started / .cooldown_expired
//   • lgpd.request_fulfilled
//   • complaint.created / .responded / .read / .resolved
//   • staff_message.received
//   • zone_pause.started / .ended
//   • session.flag_changed
//
// Implementation: a single auto-reconnecting WebSocket talking to
// `${API_BASE}/ws?slug=...&role=manager`. The gateway routes manager-relevant
// events to subscribers in this room. Falls back to a no-op when the env var
// `NEXT_PUBLIC_WS_URL` is not set so dev / Storybook still render.
//
// Usage:
//   useManagerEvents(slug, (e) => {
//     if (e.event === 'complaint.created') refresh();
//   });
//
// `useManagerEventsSelective` consumes a record `{ eventName: handler }` so a
// screen can subscribe to a subset without writing a switch statement.

'use client';

import { useEffect, useRef } from 'react';
import type { WsEvent, WsEventName, WsEventByName } from '@restaurant/shared-types';

const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  process.env.NEXT_PUBLIC_API_URL?.replace(/^http/, 'ws') ||
  'ws://localhost:3001';

/**
 * Subscribe to all manager-relevant events for a given tenant slug. The
 * `onEvent` callback receives the strongly-typed `WsEvent` and can switch on
 * `event.event`. Returns nothing — cleanup is handled in `useEffect`.
 */
export function useManagerEvents(
  tenantSlug: string,
  onEvent: (event: WsEvent) => void,
  options: { enabled?: boolean } = {},
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (options.enabled === false) return;
    if (!tenantSlug) return;
    if (typeof window === 'undefined') return;

    let ws: WebSocket | null = null;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      const url = `${WS_BASE_URL}/ws?slug=${encodeURIComponent(tenantSlug)}&role=manager`;
      try {
        ws = new WebSocket(url);
      } catch {
        // Non-browser env or invalid URL — nothing to do.
        return;
      }
      ws.onmessage = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data) as Partial<WsEvent>;
          if (data && typeof data === 'object' && 'event' in data) {
            onEventRef.current(data as WsEvent);
          }
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        if (cancelled) return;
        // Exponential backoff with cap at 8s.
        reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          // ignore
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        // ignore
      }
    };
  }, [tenantSlug, options.enabled]);
}

/**
 * Selective variant — pass a record `{ event_name: handler }`. Only the listed
 * events trigger handlers (the others are dropped silently).
 */
export function useManagerEventsSelective(
  tenantSlug: string,
  handlers: Partial<{
    [K in WsEventName]: (payload: WsEventByName<K>['payload']) => void;
  }>,
  options: { enabled?: boolean } = {},
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useManagerEvents(
    tenantSlug,
    (event) => {
      const h = handlersRef.current as Record<string, ((p: unknown) => void) | undefined>;
      const handler = h[event.event];
      if (handler) {
        handler(event.payload as unknown);
      }
    },
    options,
  );
}

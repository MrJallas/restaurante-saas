// WebSocket subscription hook for manager screens.
//
// Manager-relevant events (ws-events.ts shape):
//   • escalation.created / .advanced / .completed
//   • late_arrival.created / .approved / .rejected / .expired
//   • table_merge.created / .approved / .rejected
//   • merge.cooldown_started / .cooldown_expired
//   • lgpd.request_fulfilled
//   • complaint.received / .responded / .read / .resolved
//   • staff_message.received / .read
//   • staff_messages.customer_replied
//   • alert.created
//   • zone_pause.started / .ended
//   • session.flag_changed
//
// Implementation: a single auto-reconnecting socket.io connection talking to
// the API gateway at `/socket.io/`. The previous raw `WebSocket` against
// `ws://...:3001/ws` 404'd because the API only exposes the Socket.IO
// transport — see `apps/api/src/modules/websocket/events.gateway.ts`. We now
// connect with the same handshake the customer hooks use (`auth.staffKey`
// + `auth.staffId`/`auth.staffRole`), then `emit('join:tenant', { slug,
// role: 'manager' })` so the gateway routes manager-relevant events here.
// Reconnection backoff uses socket.io defaults (sane exponential w/ cap).
// Falls back to a no-op when the env var `NEXT_PUBLIC_WS_URL` (or the
// derived `NEXT_PUBLIC_API_URL`) is not set so dev / Storybook still render.
//
// Usage:
//   useManagerEvents(slug, (e) => {
//     if (e.event === 'complaint.received') refresh();
//   });
//
// `useManagerEventsSelective` consumes a record `{ eventName: handler }` so a
// screen can subscribe to a subset without writing a switch statement.

'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { WsEvent, WsEventName, WsEventByName } from '@restaurant/shared-types';

/**
 * Resolve the Socket.IO endpoint. Mirrors the customer hooks: prefer the
 * explicit `NEXT_PUBLIC_WS_URL`, fall back to the API URL with the
 * `/api` path stripped (Socket.IO is mounted on the root namespace), then
 * default to localhost in dev.
 */
function resolveWsUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    // strip trailing /api so io() lands on the root namespace served by
    // the gateway (`@WebSocketGateway({ namespace: '/' })`).
    return apiUrl.replace(/\/?api\/?$/, '');
  }
  return 'http://localhost:3001';
}

/** Names this hook subscribes to — kept in sync with the gateway emit list. */
const MANAGER_EVENT_NAMES: WsEventName[] = [
  'escalation.created',
  'escalation.advanced',
  'escalation.completed',
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
  'merge.cooldown_started',
  'merge.cooldown_expired',
  'lgpd.request_fulfilled',
  'complaint.received',
  'complaint.responded',
  'complaint.read',
  'complaint.resolved',
  'staff_message.received',
  'staff_message.read',
  'staff_messages.customer_replied',
  'alert.created',
  'zone_pause.started',
  'zone_pause.ended',
  'session.flag_changed',
];

/**
 * Read the current staff id from localStorage in an SSR-safe way. The id is
 * forwarded as `auth.staffId` so the gateway can validate room joins.
 */
function readStaffId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem('staffId') ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Subscribe to all manager-relevant events for a given tenant slug. The
 * `onEvent` callback receives the strongly-typed `WsEvent` and can switch on
 * `event.event`. Returns `{ isConnected }` for opt-in connection indicators —
 * existing call-sites that ignore the return value remain backwards-compat.
 */
export function useManagerEvents(
  tenantSlug: string,
  onEvent: (event: WsEvent) => void,
  options: { enabled?: boolean; staffId?: string } = {},
): { isConnected: boolean } {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (options.enabled === false) return;
    if (!tenantSlug) return;
    if (typeof window === 'undefined') return;

    const wsUrl = resolveWsUrl();
    if (!wsUrl) return;

    const staffKey = process.env.NEXT_PUBLIC_STAFF_API_KEY ?? undefined;
    const staffId = options.staffId || readStaffId();

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
          staffRole: 'manager',
          role: 'manager',
        },
      });
    } catch {
      // Non-browser env or invalid URL — fall back silently.
      return;
    }

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit('join:tenant', { slug: tenantSlug, role: 'manager' });
      if (staffId) {
        socket.emit('join:staff', { staffId });
        socket.emit('join:manager', { managerId: staffId });
      }
    };
    const handleDisconnect = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.connect();
    if (socket.connected) {
      handleConnect();
    }

    // Subscribe to every event name the manager cares about. The gateway
    // emits the typed payload directly (no envelope), so we wrap it in the
    // discriminated-union shape the callback expects.
    for (const name of MANAGER_EVENT_NAMES) {
      socket.on(name, (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return;
        onEventRef.current({ event: name, payload } as WsEvent);
      });
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      try {
        socket.disconnect();
      } catch {
        // ignore
      }
    };
  }, [tenantSlug, options.enabled, options.staffId]);

  return { isConnected };
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
): { isConnected: boolean } {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  return useManagerEvents(
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

// WebSocket subscription hook for manager screens.
//
// Manager-relevant events (ws-events.ts shape):
//   • escalation.created / .advanced / .completed
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
import type { WsEvent, WsEventName, WsEventByName } from '@restaurant/shared-types';
import {
  acquireStaffSocket,
  readStaffId,
  releaseStaffSocket,
  resolveWsUrl,
} from '../lib/staffSocket';

/**
 * Resolve the Socket.IO endpoint. Mirrors the customer hooks: prefer the
 * explicit `NEXT_PUBLIC_WS_URL`, fall back to the API URL with the
 * `/api` path stripped (Socket.IO is mounted on the root namespace), then
 * default to localhost in dev.
 */
/** Names this hook subscribes to — kept in sync with the gateway emit list. */
const MANAGER_EVENT_NAMES: WsEventName[] = [
  'escalation.created',
  'escalation.advanced',
  'escalation.completed',
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

    // Sem identidade o gateway rejeita o handshake staff de qualquer forma
    // — não conectar evita queimar a cota compartilhada de 30/60s por IP.
    const staffId = options.staffId || readStaffId();
    if (!staffId) return;

    // Socket COMPARTILHADO por (url|tenant|staff|role) com retry — antes
    // cada tela abria o próprio socket e rejeição do gateway matava o
    // realtime até reload (auditoria 2026-07-03).
    const entry = acquireStaffSocket(wsUrl, tenantSlug, staffId, 'manager');
    if (!entry) return;
    const socket = entry.socket;

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleDisconnect);
    if (socket.connected) setIsConnected(true);

    const handlers: Array<[string, (payload: unknown) => void]> = [];
    for (const name of MANAGER_EVENT_NAMES) {
      const handler = (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return;
        onEventRef.current({ event: name, payload } as WsEvent);
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
      releaseStaffSocket(wsUrl, tenantSlug, staffId, 'manager');
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

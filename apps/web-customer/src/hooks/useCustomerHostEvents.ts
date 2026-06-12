'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  WsLateArrivalCreated,
  WsLateArrivalApproved,
  WsLateArrivalRejected,
  WsLateArrivalExpired,
  WsTableMergeCreated,
  WsTableMergeApproved,
  WsTableMergeRejected,
  WsMergeCooldownStarted,
  WsMergeCooldownExpired,
  WsEscalationAdvanced,
} from '@restaurant/shared-types';
import { getSessionToken } from '../lib/storage';

/**
 * Customer-host WS events the customer app listens to. Per
 * `apps/api/src/modules/websocket/events.gateway.ts`. We subscribe to the
 * customer's own room (`customer:<id>`) and the table session room
 * (`session:<id>`) — that covers every fan-out the backend does for these
 * features.
 *
 * Sister hook to `useTableSocket` but scoped to the customer-host model so
 * non-host screens (e.g. the cardapio) don't pay for the extra subscriptions.
 */

export type CustomerHostEvent =
  | { type: 'late_arrival.created'; payload: WsLateArrivalCreated['payload'] }
  | { type: 'late_arrival.approved'; payload: WsLateArrivalApproved['payload'] }
  | { type: 'late_arrival.rejected'; payload: WsLateArrivalRejected['payload'] }
  | { type: 'late_arrival.expired'; payload: WsLateArrivalExpired['payload'] }
  | { type: 'table_merge.created'; payload: WsTableMergeCreated['payload'] }
  | { type: 'table_merge.approved'; payload: WsTableMergeApproved['payload'] }
  | { type: 'table_merge.rejected'; payload: WsTableMergeRejected['payload'] }
  | { type: 'merge.cooldown_started'; payload: WsMergeCooldownStarted['payload'] }
  | { type: 'merge.cooldown_expired'; payload: WsMergeCooldownExpired['payload'] }
  /** Informational only — customer just sees the visible message change. */
  | { type: 'escalation.advanced'; payload: WsEscalationAdvanced['payload'] };

interface UseCustomerHostEventsParams {
  /** Session room to subscribe (`session:<id>`). */
  sessionId: string | null;
  /** Customer-scoped room (`customer:<id>`); pass null when not yet identified. */
  customerId: string | null;
  /** Single dispatcher; refs swapped on each render so deps stay stable. */
  onEvent: (event: CustomerHostEvent) => void;
}

const EVENTS = [
  'late_arrival.created',
  'late_arrival.approved',
  'late_arrival.rejected',
  'late_arrival.expired',
  'table_merge.created',
  'table_merge.approved',
  'table_merge.rejected',
  'merge.cooldown_started',
  'merge.cooldown_expired',
  'escalation.advanced',
] as const;

export function useCustomerHostEvents({
  sessionId,
  customerId,
  onEvent,
}: UseCustomerHostEventsParams): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!sessionId && !customerId) return;

    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL ||
      `${window.location.protocol}//${window.location.hostname}:3001`;

    // Pass the session token in the handshake auth so the gateway can verify
    // the join before letting us into rooms — same pattern as useTableSocket.
    const sessionToken = getSessionToken();

    const socket: Socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 10_000,
      auth: sessionToken ? { sessionToken } : undefined,
    });

    socket.on('connect', () => {
      if (sessionId) {
        socket.emit('join:session', { sessionId });
      }
      if (customerId) {
        socket.emit('join:customer', { customerId });
      }
    });

    for (const ev of EVENTS) {
      socket.on(ev, (payload: unknown) => {
        // Guard against malformed events; ws-events.ts pins the shape on the
        // server side, but a runtime check costs nothing and protects the UI.
        if (!payload || typeof payload !== 'object') return;
        onEventRef.current({
          type: ev,
          payload,
        } as CustomerHostEvent);
      });
    }

    return () => {
      // Mesmo cuidado do useTableSocket: não fechar WS em pleno handshake
      // (console.error no WebKit + badge do dev overlay — prompt 100 §6).
      if (socket.connected) {
        socket.disconnect();
        return;
      }
      socket.io.opts.reconnection = false;
      socket.removeAllListeners();
      socket.once('connect', () => socket.disconnect());
      socket.io.once('error', () => socket.disconnect());
    };
  }, [sessionId, customerId]);
}

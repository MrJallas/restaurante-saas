'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  WsComplaintResponded,
  WsComplaintResolved,
} from '@restaurant/shared-types';

export type ComplaintEvent =
  | WsComplaintResponded
  | WsComplaintResolved;

/**
 * Subscribes to complaint lifecycle events for the current customer/session
 * pair. The customer's complaint thread updates live via:
 *
 *   - `complaint.responded` — manager replied; bubble appears in the chat /
 *     waiting screen with `chipAction` inset (`on-the-way` | `kitchen-check`
 *     | `courtesy` | `custom`).
 *   - `complaint.resolved`  — manager closed the loop; FE auto-acks and
 *     removes the "waiting" UI.
 *
 * Disconnect on unmount; reconnect handled by socket.io. Same-origin WS URL
 * resolution mirrors `useTableSocket` so both hooks behave identically on
 * the LAN-with-iPhone scenario.
 */
export function useComplaintEvents(
  sessionId: string | null,
  onEvent: (event: ComplaintEvent) => void,
): void {
  const onEventRef = useRef(onEvent);
  // Keep the ref in sync without resetting the socket every render.
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!sessionId) return;
    if (typeof window === 'undefined') return;

    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL ||
      `${window.location.protocol}//${window.location.hostname}:3001`;

    const socket: Socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 10_000,
    });

    socket.on('connect', () => {
      socket.emit('join:session', { sessionId });
    });

    socket.on('complaint.responded', (payload: WsComplaintResponded['payload']) => {
      onEventRef.current({ event: 'complaint.responded', payload });
    });
    socket.on('complaint.resolved', (payload: WsComplaintResolved['payload']) => {
      onEventRef.current({ event: 'complaint.resolved', payload });
    });

    return () => {
      socket.disconnect();
    };
  }, [sessionId]);
}

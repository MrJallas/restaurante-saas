'use client';

import { useEffect, useRef } from 'react';
import type { WsComplaintResponded, WsComplaintResolved } from '@restaurant/shared-types';
import {
  acquireCustomerSocket,
  joinCustomerRoom,
  joinSessionRoom,
  releaseCustomerSocket,
} from '../lib/customerSocket';

export type ComplaintEvent = WsComplaintResponded | WsComplaintResolved;

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
 *
 * P1 (re-scan): a tela de espera pós-reclamação não re-hidratava ao vivo
 * depois de um reload. O BE emite `complaint.responded`/`complaint.resolved`
 * pro room `customer:<id>` (events-emitter.service.ts), MAS este hook só
 * entrava no `session:<id>` — então após um reload (nova conexão) o evento
 * fanned-out pro customer NUNCA chegava e a tela ficava congelada. Fix: entrar
 * TAMBÉM no `customer:<id>` (mesma dupla-inscrição do useCustomerHostEvents).
 */
export function useComplaintEvents(
  sessionId: string | null,
  onEvent: (event: ComplaintEvent) => void,
  customerId?: string | null,
): void {
  const onEventRef = useRef(onEvent);
  // Keep the ref in sync without resetting the socket every render.
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!sessionId && !customerId) return;
    if (typeof window === 'undefined') return;

    // Socket COMPARTILHADO (lib/customerSocket). Bônus: a versão antiga
    // conectava SEM sessionToken — o gateway rejeitava o handshake e o
    // hook nunca recebia nada, só queimava o rate-limit de 30/60s por IP.
    const entry = acquireCustomerSocket();
    if (!entry) return;
    if (sessionId) joinSessionRoom(entry, sessionId);
    // Room autoritativo dos eventos de complaint (o BE fan-out vai pra cá).
    if (customerId) joinCustomerRoom(entry, customerId);

    const onResponded = (payload: WsComplaintResponded['payload']) => {
      onEventRef.current({ event: 'complaint.responded', payload });
    };
    const onResolved = (payload: WsComplaintResolved['payload']) => {
      onEventRef.current({ event: 'complaint.resolved', payload });
    };
    entry.socket.on('complaint.responded', onResponded);
    entry.socket.on('complaint.resolved', onResolved);

    return () => {
      entry.socket.off('complaint.responded', onResponded);
      entry.socket.off('complaint.resolved', onResolved);
      releaseCustomerSocket(entry);
    };
  }, [sessionId, customerId]);
}

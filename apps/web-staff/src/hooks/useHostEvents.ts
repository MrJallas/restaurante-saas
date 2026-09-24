'use client';

// WebSocket subscription for host (recepcionista) events.
// Default subscription set:
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
import type { WsEvent, WsEventName } from '@restaurant/shared-types';
import {
  acquireStaffSocket,
  readStaffId,
  releaseStaffSocket,
  resolveWsUrl,
} from '../lib/staffSocket';

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
  const eventsKey = (events ?? DEFAULT_HOST_EVENTS).join(',');
  const eventsRef = useRef<WsEventName[]>(events ?? DEFAULT_HOST_EVENTS);
  eventsRef.current = events ?? DEFAULT_HOST_EVENTS;

  useEffect(() => {
    if (!tenantSlug) return;
    if (typeof window === 'undefined') return;
    const wsUrl = resolveWsUrl();
    if (!wsUrl) return;

    // Sem identidade o gateway rejeita o handshake staff de qualquer forma
    // — não conectar evita queimar a cota compartilhada de 30/60s por IP.
    const staffId = hostId ?? readStaffId();
    if (!staffId) return;

    // Socket COMPARTILHADO por (url|tenant|staff|role) com retry — antes
    // cada tela abria o próprio socket sem retry pós-rejeição do gateway
    // (auditoria 2026-07-03).
    const entry = acquireStaffSocket(wsUrl, tenantSlug, staffId, 'host');
    if (!entry) return;
    const socket = entry.socket;

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleDisconnect);
    if (socket.connected) setConnected(true);

    const subscribed =
      eventsRef.current && eventsRef.current.length > 0 ? eventsRef.current : DEFAULT_HOST_EVENTS;
    const handlers: Array<[string, (payload: unknown) => void]> = [];
    for (const name of subscribed) {
      const handler = (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return;
        const evt = { event: name, payload } as WsEvent;
        listeners.current.forEach((fn) => {
          try {
            fn(evt);
          } catch {
            /* noop */
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
      releaseStaffSocket(wsUrl, tenantSlug, staffId, 'host');
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

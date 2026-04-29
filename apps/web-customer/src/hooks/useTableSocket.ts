'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

/**
 * Hook que conecta o customer ao WebSocket do servidor e entra na sala
 * `session:${sessionId}`. O backend emite eventos de pedido (`order:created`,
 * `order:status`) pra essa sala em cada mutacao — todos os customers da
 * mesma mesa vem em real-time. Antes era polling de 15s, multi-user nunca
 * coordenava (P1-A do bug-hunt).
 *
 * Uso:
 *   useTableSocket(sessionId, (event, data) => {
 *     if (event === 'order:status') refetchOrders();
 *   });
 *
 * - `sessionId` null: nao conecta (custos zero antes do welcome).
 * - Reconnect automatico do socket.io ja cobre flicker de rede iOS.
 * - Same-origin: usa o proprio host do customer (3003) — o Next nao
 *   proxya WebSocket pra :3001 hoje, entao apontamos direto pra
 *   NEXT_PUBLIC_WS_URL (configurado pelo docker-compose pra
 *   localhost:3001). Em prod com cloudflare/cdn vai virar mesmo host.
 */
export function useTableSocket(
  sessionId: string | null,
  onEvent: (event: string, data: unknown) => void,
): void {
  const onEventRef = useRef(onEvent);
  // Sempre atualiza o ref pra a callback mais recente sem reconectar.
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!sessionId) return;
    if (typeof window === 'undefined') return;

    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL ||
      (typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.hostname}:3001`
        : '');

    const socket: Socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      // 4h cobre uma sessao de mesa inteira; depois disso o customer ja
      // tera reabrido o QR e teremos sessionId novo.
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 10_000,
    });

    socket.on('connect', () => {
      socket.emit('join:session', { sessionId });
    });

    // Eventos que importam pro customer.
    const events = [
      'order:created',
      'order:status',
      'waiter:acknowledged',
    ] as const;
    for (const ev of events) {
      socket.on(ev, (data: unknown) => onEventRef.current(ev, data));
    }

    return () => {
      socket.disconnect();
    };
  }, [sessionId]);
}

'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getSessionToken } from '../lib/storage';

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
 * - `customerId` (opcional): tambem entra no room `customer:<id>` — usado
 *   pelo assistente pra receber `assistant.staff_message_received`, que
 *   desde 2026-06-11 e PRIVADO do destinatario (nao vai mais pro session
 *   room). Outros callers seguem com a assinatura de 2 argumentos.
 * - Reconnect automatico do socket.io ja cobre flicker de rede iOS.
 * - Same-origin: usa o proprio host do customer (3003) — o Next nao
 *   proxya WebSocket pra :3001 hoje, entao apontamos direto pra
 *   NEXT_PUBLIC_WS_URL (configurado pelo docker-compose pra
 *   localhost:3001). Em prod com cloudflare/cdn vai virar mesmo host.
 */
export function useTableSocket(
  sessionId: string | null,
  onEvent: (event: string, data: unknown) => void,
  customerId?: string | null,
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

    const sessionToken = getSessionToken();
    const socket: Socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      auth: sessionToken ? { sessionToken } : undefined,
      // 4h cobre uma sessao de mesa inteira; depois disso o customer ja
      // tera reabrido o QR e teremos sessionId novo.
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 10_000,
    });

    socket.on('connect', () => {
      socket.emit('join:session', { sessionId });
      if (customerId) {
        socket.emit('join:customer', { customerId });
      }
    });

    // Eventos que importam pro customer. Round 19 — adicionados
    // `participant:join_request` (host vê quando alguém pediu pra
    // entrar) e `participant:decision` (joiner vê quando host
    // aprovou/rejeitou). Antes esses eventos chegavam pela conexão WS
    // mas o handler ignorava (lista hardcoded), e a UI dependia de
    // refetch manual — modal só aparecia se mounting timing acertasse.
    const events = [
      'order:created',
      'order:status',
      'waiter:acknowledged',
      'participant:join_request',
      'participant:decision',
      'assistant.staff_message_received',
      'courtesy.created',
      'courtesy.updated',
      'table_merge.created',
      'table_merge.approved',
      'table_merge.rejected',
      'merge.cooldown_started',
      'merge.cooldown_expired',
    ] as const;
    for (const ev of events) {
      socket.on(ev, (data: unknown) => onEventRef.current(ev, data));
    }

    return () => {
      // Fechar um WebSocket ainda em handshake faz o WebKit logar
      // "WebSocket is closed before the connection is established"
      // (console.error → badge "N errors" do dev overlay; prompt 100 §6).
      // Se ainda está conectando, esperamos o connect/erro pra encerrar
      // limpo; reconnection desligada pra não renascer depois do unmount.
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

'use client';

import { useEffect, useRef } from 'react';
import {
  acquireCustomerSocket,
  joinCustomerRoom,
  joinSessionRoom,
  releaseCustomerSocket,
} from '../lib/customerSocket';

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
 * - O socket por baixo e COMPARTILHADO por sessionToken (lib/customerSocket)
 *   com linger pos-unmount — navegar entre paginas nao derruba/recria a
 *   conexao (o gateway rate-limita 30 handshakes/60s por IP do restaurante,
 *   e fechar WS em pleno handshake logava console.error no WebKit).
 * - `onResync` (opcional, 4o arg): chamado a cada RECONNECT do socket (nao
 *   no primeiro connect). Use pra refetchar o estado que pode ter sido
 *   perdido enquanto offline — ex.: pedido/page passa `() => reload()`.
 */
export function useTableSocket(
  sessionId: string | null,
  onEvent: (event: string, data: unknown) => void,
  customerId?: string | null,
  onResync?: () => void,
): void {
  const onEventRef = useRef(onEvent);
  // Sempre atualiza o ref pra a callback mais recente sem reconectar.
  onEventRef.current = onEvent;
  const onResyncRef = useRef(onResync);
  onResyncRef.current = onResync;

  useEffect(() => {
    if (!sessionId) return;
    if (typeof window === 'undefined') return;

    const entry = acquireCustomerSocket();
    if (!entry) return;
    joinSessionRoom(entry, sessionId);
    if (customerId) {
      joinCustomerRoom(entry, customerId);
    }

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
    const handlers = events.map((ev) => {
      const handler = (data: unknown) => onEventRef.current(ev, data);
      entry.socket.on(ev, handler);
      return [ev, handler] as const;
    });

    // Resync no RECONNECT (nao no primeiro connect): depois de uma queda de
    // rede o socket.io reemite 'connect', e ai o consumidor deve refetchar
    // o estado perdido enquanto offline (eventos emitidos durante o gap nao
    // chegam). Se o socket COMPARTILHADO ja estava conectado no mount, o
    // proximo 'connect' ja conta como reconnect.
    let isFirstConnect = !entry.socket.connected;
    const onConnect = () => {
      if (isFirstConnect) {
        isFirstConnect = false;
        return;
      }
      onResyncRef.current?.();
    };
    entry.socket.on('connect', onConnect);

    return () => {
      for (const [ev, handler] of handlers) {
        entry.socket.off(ev, handler);
      }
      entry.socket.off('connect', onConnect);
      releaseCustomerSocket(entry);
    };
  }, [sessionId, customerId]);
}

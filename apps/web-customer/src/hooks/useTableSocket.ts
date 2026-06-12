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

    return () => {
      for (const [ev, handler] of handlers) {
        entry.socket.off(ev, handler);
      }
      releaseCustomerSocket(entry);
    };
  }, [sessionId, customerId]);
}

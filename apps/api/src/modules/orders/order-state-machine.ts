import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * FASE 2 · 2A (plano de reestruturação): a máquina de estados de pedido
 * extraída do orders.service (2363 linhas) pra um módulo PURO — quem
 * define o que pode virar o quê mora aqui, num lugar só, testável sem
 * banco. Comportamento preservado 1:1 (characterization em
 * orders.service.transitions.test.ts + orders.service.cancel.test.ts).
 */
export const VALID_TRANSITIONS: Record<string, string[]> = {
  pending_confirmation: ['received', 'cancelled'],
  received: ['in_progress', 'cancelled'],
  in_progress: ['ready', 'cancelled'],
  ready: ['in_transit', 'delivered', 'cancelled'],
  in_transit: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
  open: ['confirmed', 'received', 'cancelled'], // legacy
  confirmed: ['preparing', 'in_progress', 'cancelled'],
  preparing: ['ready', 'cancelled'],
};

/** Origens de onde o CLIENTE ainda pode cancelar (janela de confirmação). */
export const CUSTOMER_CANCELLABLE_STATUSES = ['pending_confirmation', 'open'];

export interface TransitionActor {
  actorType: 'staff' | 'session';
  sessionTableId: string | null;
}

/**
 * Valida a transição pedida e devolve o plano: `idempotent: true` quando o
 * pedido já está no status alvo (o caller retorna sem CAS/history). Lança
 * os MESMOS erros (tipo e mensagem) que o updateStatus sempre lançou.
 */
export function planTransition(input: {
  currentStatus: string;
  newStatus: string;
  orderTableSessionId: string;
  actor?: TransitionActor;
}): { idempotent: boolean } {
  const { currentStatus, newStatus, orderTableSessionId, actor } = input;

  // Round 7 (B-NEW-24): branch session vs staff. Customer só pode
  // transicionar pra `cancelled` E só em ordens da sua própria mesa.
  if (actor?.actorType === 'session') {
    if (newStatus !== 'cancelled') {
      throw new ForbiddenException(
        'Customer só pode cancelar pedido. Mude de status só permitido pra staff.',
      );
    }
    if (!actor.sessionTableId || actor.sessionTableId !== orderTableSessionId) {
      throw new ForbiddenException('Pedido não pertence à sua mesa.');
    }
    // Mesma regra de ORIGEM do cancelOrder dedicado (auditoria 2026-07-03):
    // cliente só cancela dentro da janela de confirmação.
    if (currentStatus !== 'cancelled' && !CUSTOMER_CANCELLABLE_STATUSES.includes(currentStatus)) {
      throw new BadRequestException(
        'Pedido ja foi enviado para a cozinha e nao pode ser cancelado aqui.',
      );
    }
  }

  if (currentStatus === newStatus) {
    return { idempotent: true };
  }

  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new BadRequestException(
      `Transicao invalida: ${currentStatus} -> ${newStatus}. Permitidos: ${allowed.join(', ')}`,
    );
  }
  return { idempotent: false };
}

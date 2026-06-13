/**
 * Canon de status de pedido do customer — labels e cores idênticos aos da
 * tela Meu pedido (`/[slug]/pedido`). Extraído pra cá (prompt 100, bloco 1)
 * pra que a eyebrow do assistente use EXATAMENTE o mesmo vocabulário, sem
 * duplicar o mapa em dois arquivos.
 */

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_confirmation: 'Aguardando confirmação',
  received: 'Recebido pela cozinha',
  in_progress: 'Em preparo',
  ready: 'Pronto para servir',
  in_transit: 'A caminho da mesa',
  delivered: 'Entregue',
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  pending_confirmation: 'bg-mute',
  received: 'bg-success',
  in_progress: 'bg-success',
  ready: 'bg-success',
  in_transit: 'bg-success',
  delivered: 'bg-mute',
};

/**
 * Statuses considerados "pedido ativo" pra eyebrow do assistente (decisão
 * Caleb 2026-06-11): tudo entre a confirmação pendente e a entrega.
 * Entregue/cancelado → eyebrow volta ao padrão.
 */
export const ACTIVE_ORDER_STATUSES = [
  'pending_confirmation',
  'received',
  'in_progress',
  'ready',
  'in_transit',
] as const;

export interface OrderEtaFields {
  eta_minutes_min?: number | null;
  eta_minutes_max?: number | null;
}

/**
 * Formato compacto da ETA dinâmica pra eyebrow: `14–23 min`, ou `~3 min`
 * quando max ≤ 3 (prompt 100 §1). Null quando o backend não devolveu range.
 */
export function formatEtaCompact(order: OrderEtaFields): string | null {
  const min = order.eta_minutes_min;
  const max = order.eta_minutes_max;
  if (min == null || max == null) return null;
  if (max <= 3) return `~${max} min`;
  return `${min}–${max} min`;
}

export type KdsStation = 'kitchen' | 'bar';

export type KdsOrderStatus =
  | 'received'
  | 'in_progress'
  | 'ready'
  // legacy aliases ainda em pedidos antigos
  | 'open'
  | 'confirmed'
  | 'preparing';

export type DerivedStatus = 'novo' | 'preparando' | 'pronto' | 'atrasado';

export interface KdsOrderItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  notes: string | null;
  categoryName: string | null;
}

export interface KdsOrder {
  id: string;
  status: KdsOrderStatus;
  total_cents: number;
  notes: string | null;
  visit_id: string | null;
  created_at: string;
  updated_at: string;
  table_label: string;
  items: KdsOrderItem[];
}

export interface KdsResponse {
  station: KdsStation;
  orders: KdsOrder[];
}

// Threshold em minutos a partir do qual um pedido entra em estado
// "atrasado" visualmente. Mantido em sincronia com o handoff (12 min).
export const LATE_THRESHOLD_MIN = 12;

export function deriveStatus(order: KdsOrder, elapsedMin: number): DerivedStatus {
  if (order.status === 'ready') return 'pronto';
  if (
    order.status === 'in_progress' ||
    order.status === 'preparing' ||
    order.status === 'confirmed'
  ) {
    return elapsedMin >= LATE_THRESHOLD_MIN ? 'atrasado' : 'preparando';
  }
  // received | open
  return elapsedMin >= LATE_THRESHOLD_MIN ? 'atrasado' : 'novo';
}

/**
 * Total de bebidas no header do board (so faz sentido pra station=bar).
 * Conta items em orders ainda em preparo — exclui 'ready' (ja saiu da
 * fila) e o que o backend ja remove (delivered/cancelled). Antes,
 * orders 'ready' inflavam o numero indefinidamente ate o garcom
 * entregar, dando uma sensacao falsa de fila grande.
 */
export function countActiveDrinks(orders: KdsOrder[]): number {
  return orders
    .filter((o) => o.status !== 'ready')
    .reduce((sum, o) => sum + o.items.reduce((a, b) => a + b.quantity, 0), 0);
}

/**
 * Label de quantidade no header do card. Bar mostra '<n> bebida[s] · há',
 * kitchen so 'há'. Plural correto pra qty=1 evita o "1 drinks" (que era
 * o texto literal antes — copy era ingles solto + sem pluralizacao).
 */
export function getQuantityLabel(qty: number, variant: KdsStation): string {
  if (variant !== 'bar') return 'há';
  return `${qty} ${qty === 1 ? 'bebida' : 'bebidas'} · há`;
}

/**
 * Label do botao primario do card. Derivada do `status` raw, NAO de
 * deriveStatus (que mistura received+late em 'atrasado'). Antes a label
 * caia no else generico "Marcar pronto" pra um pedido received atrasado,
 * apesar de a acao real ser received -> in_progress.
 */
export function getPrimaryActionLabel(status: KdsOrderStatus, variant: KdsStation): string {
  if (status === 'ready') {
    return 'Chamar garçom';
  }
  if (status === 'received' || status === 'open') {
    return variant === 'kitchen' ? '▶  Iniciar preparo' : '▶  Preparar';
  }
  // in_progress | preparing | confirmed -> proximo passo e marcar pronto
  return 'Marcar pronto';
}

/**
 * Detecta observacao de alergia/contraindicacao pra destacar em vermelho.
 * Heuristica: presence de keywords obvias. Bug-hunters podem driblar mas
 * vale como first-pass — uma flag explicita no DB seria o ideal.
 */
export function isAlertNote(note: string | null | undefined): boolean {
  if (!note) return false;
  // Normalize NFD + strip combining marks (U+0300 a U+036F) pra que
  // 'alergico' case com 'alérgico', 'glúten' com 'gluten', etc. JS regex
  // /i e case-insensitive em ASCII apenas — sem normalize, observacoes
  // acentuadas escapariam do destaque vermelho.
  const norm = note.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /(\ball?erg|\bsem .*por favor|\bintoleranc|\bgluten|\blactose|\bcuidado|⚠)/i.test(norm);
}

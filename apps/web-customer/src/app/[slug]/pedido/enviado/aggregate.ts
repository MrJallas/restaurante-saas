/**
 * Lógica pura da tela /pedido/enviado, num módulo separado do `page.tsx` porque
 * o Next 14 proíbe named exports fora do contrato de rota num arquivo de página.
 */

export interface EnviadoOrderItem {
  id: string;
  name: string;
  quantity: number;
  priceCents: number;
}

export interface EnviadoOrder {
  id: string;
  status: string;
  totalCents: number;
  items: EnviadoOrderItem[];
  etaMinutesMin?: number | null;
  etaMinutesMax?: number | null;
  queueAhead?: number;
  createdAt?: string;
}

export const ENVIADO_STATUS_INDEX: Record<string, number> = {
  received: 0,
  in_progress: 1,
  ready: 2,
  in_transit: 3,
  delivered: 4,
};

const VERIFIED_SENT_STATUSES = new Set(Object.keys(ENVIADO_STATUS_INDEX));

export class EnviadoOrdersLoadError extends Error {
  constructor(readonly code: 'missing_order_ids' | 'invalid_order_response' | 'order_not_sent') {
    super(code);
    this.name = 'EnviadoOrdersLoadError';
  }
}

function isEnviadoOrder(value: unknown): value is EnviadoOrder {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const order = value as Record<string, unknown>;
  if (
    typeof order.id !== 'string' ||
    !order.id ||
    typeof order.status !== 'string' ||
    !order.status ||
    typeof order.totalCents !== 'number' ||
    !Number.isFinite(order.totalCents) ||
    !Array.isArray(order.items)
  ) {
    return false;
  }
  return order.items.every((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    return (
      typeof row.id === 'string' &&
      typeof row.name === 'string' &&
      typeof row.quantity === 'number' &&
      Number.isFinite(row.quantity) &&
      typeof row.priceCents === 'number' &&
      Number.isFinite(row.priceCents)
    );
  });
}

/**
 * Load every order named by the route, validate the runtime payloads, and only
 * then return the aggregate used by the success screen. Missing ids, one
 * failed GET, or one malformed response must keep the UI out of success state.
 */
export async function loadEnviadoOrders(
  orderIds: string[],
  load: (orderId: string) => Promise<unknown>,
): Promise<EnviadoOrder> {
  const ids = [...new Set(orderIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) throw new EnviadoOrdersLoadError('missing_order_ids');

  const orders = await Promise.all(
    ids.map(async (id) => {
      const value = await load(id);
      if (!isEnviadoOrder(value) || value.id !== id) {
        throw new EnviadoOrdersLoadError('invalid_order_response');
      }
      if (!VERIFIED_SENT_STATUSES.has(value.status)) {
        throw new EnviadoOrdersLoadError('order_not_sent');
      }
      return value;
    }),
  );
  const aggregate = aggregateOrders(orders);
  if (!aggregate) throw new EnviadoOrdersLoadError('invalid_order_response');
  return aggregate;
}

/**
 * Lê os ids de pedido da query da rota /pedido/enviado. Aceita o novo
 * `orderIds=a,b` (carrinho misto — um order por billingMode) e cai no
 * `orderId=a` legado do carrinho de modo único. `sp` é qualquer coisa com
 * `.get(key)` (o `useSearchParams()` do Next satisfaz).
 */
export function parseEnviadoOrderIds(sp: { get(key: string): string | null }): string[] {
  const many = sp.get('orderIds');
  const raw = many ? many.split(',') : [sp.get('orderId') ?? ''];
  return raw.map((id) => id.trim()).filter(Boolean);
}

/**
 * Agrega vários pedidos do carrinho misto numa visão única pra tela "Enviado".
 *
 * BUGFIX (P2 re-scan): o carrinho misto cria 2+ orders (um por billingMode) e a
 * tela só carregava/mostrava o 1º id — o cliente via o total, os itens e o ETA
 * de UM pedido, escondendo o resto do que enviou. Aqui juntamos:
 *  - itens: concatenados na ordem dos pedidos;
 *  - total: soma de todos os `totalCents`;
 *  - ETA: a MAIOR janela (o pedido mais lento manda quando comer);
 *  - status/progresso: o MENOS avançado (o pedido mais atrás define o estágio).
 *
 * Um único pedido volta equivalente ao comportamento antigo. Lista vazia (nada
 * carregado ainda) → null.
 */
export function aggregateOrders(orders: EnviadoOrder[]): EnviadoOrder | null {
  if (orders.length === 0) return null;
  if (orders.length === 1) return orders[0];

  const items = orders.flatMap((o) => o.items ?? []);
  const totalCents = orders.reduce((sum, o) => sum + (o.totalCents ?? 0), 0);

  const mins = orders.map((o) => o.etaMinutesMin).filter((v): v is number => v != null);
  const maxs = orders.map((o) => o.etaMinutesMax).filter((v): v is number => v != null);
  const etaMinutesMin = mins.length > 0 ? Math.max(...mins) : null;
  const etaMinutesMax = maxs.length > 0 ? Math.max(...maxs) : null;

  // Menos avançado = menor índice de status. Desconhecido cai em 0 (received).
  const slowest = orders.reduce(
    (acc, o) => {
      const idx = ENVIADO_STATUS_INDEX[o.status] ?? 0;
      return idx < acc.idx ? { idx, status: o.status } : acc;
    },
    { idx: Number.POSITIVE_INFINITY, status: orders[0].status },
  );

  return {
    id: orders.map((o) => o.id).join(','),
    status: slowest.status,
    totalCents,
    items,
    etaMinutesMin,
    etaMinutesMax,
  };
}

export interface TableSplitOrderItem {
  id: string;
  name: string;
  quantity: number;
  subtotalCents: number;
  customerId?: string | null;
}

export interface TableSplitOrder {
  id: string;
  status: string;
  billing_mode: string;
  items: TableSplitOrderItem[];
}

export interface TableSplitScope {
  items: TableSplitOrderItem[];
  excludedIndividualItemCount: number;
}

const isBillable = (order: TableSplitOrder): boolean =>
  order.status !== 'cancelled' && order.status !== 'pending_confirmation';

/**
 * Espelha a cerca financeira do backend de split: apenas pedidos
 * `billing_mode='table'` compõem o rateio. Comandas individuais podem vir no
 * payload de `GET /orders?scope=table`, mas nunca podem aparecer como se o
 * rateio fosse quitá-las.
 */
export function tableSplitScope(orders: TableSplitOrder[]): TableSplitScope {
  const billableOrders = orders.filter(isBillable);
  return {
    items: billableOrders
      .filter((order) => order.billing_mode === 'table')
      .flatMap((order) => order.items),
    excludedIndividualItemCount: billableOrders
      .filter((order) => order.billing_mode === 'individual')
      .reduce((count, order) => count + order.items.length, 0),
  };
}

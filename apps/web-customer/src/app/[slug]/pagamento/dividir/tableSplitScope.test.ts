import { tableSplitScope, type TableSplitOrder } from './tableSplitScope';

const item = (id: string, name: string) => ({
  id,
  name,
  quantity: 1,
  subtotalCents: 1_000,
  customerId: null,
});

describe('tableSplitScope', () => {
  it('keeps only table-bill items when the API payload mixes table and individual orders', () => {
    const orders: TableSplitOrder[] = [
      {
        id: 'table-order',
        status: 'delivered',
        billing_mode: 'table',
        items: [item('table-item', 'Item da mesa')],
      },
      {
        id: 'individual-order',
        status: 'delivered',
        billing_mode: 'individual',
        items: [item('individual-item-1', 'Comanda A'), item('individual-item-2', 'Comanda B')],
      },
    ];

    expect(tableSplitScope(orders)).toEqual({
      items: [item('table-item', 'Item da mesa')],
      excludedIndividualItemCount: 2,
    });
  });

  it('excludes cancelled and pending-confirmation orders from both display buckets', () => {
    const orders: TableSplitOrder[] = [
      {
        id: 'cancelled-table',
        status: 'cancelled',
        billing_mode: 'table',
        items: [item('cancelled-item', 'Cancelado')],
      },
      {
        id: 'pending-individual',
        status: 'pending_confirmation',
        billing_mode: 'individual',
        items: [item('pending-item', 'Ainda não confirmado')],
      },
    ];

    expect(tableSplitScope(orders)).toEqual({ items: [], excludedIndividualItemCount: 0 });
  });
});

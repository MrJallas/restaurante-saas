/** Destino canonico do QR/picker da aba Novo: lancar pedido na mesa. */
export function waiterDirectOrderPath(
  tenantSlug: string,
  tableRef: string,
  tableNumber?: number,
): string {
  const qs = new URLSearchParams({ tenant: tenantSlug, table: tableRef });
  if (Number.isFinite(tableNumber) && (tableNumber ?? 0) > 0) {
    qs.set('tableNumber', String(tableNumber));
  }
  return `/waiter/order-direct?${qs.toString()}`;
}

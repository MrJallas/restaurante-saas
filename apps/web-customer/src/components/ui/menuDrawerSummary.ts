export interface DrawerOrderSummary {
  items: number;
  totalCents: number;
}

/**
 * `undefined` significa que AppShell não carregou resumo nesta tela;
 * `null` significa vazio conhecido. Não colapsar os dois estados.
 */
export function orderSummarySubtitle(summary?: DrawerOrderSummary | null): string {
  if (summary === undefined) return 'Abra para conferir seu pedido';
  if (summary === null || summary.items <= 0) return 'Nenhum item no pedido';
  const total = (summary.totalCents / 100).toFixed(2).replace('.', ',');
  return `${summary.items} itens · R$ ${total}`;
}

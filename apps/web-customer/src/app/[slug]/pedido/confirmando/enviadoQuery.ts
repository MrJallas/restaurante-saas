/**
 * Monta a query da rota /pedido/enviado a partir dos ids criados no checkout.
 *
 * BUGFIX (P2 re-scan): o carrinho misto (food+drink) cria UM order por
 * billingMode, então o checkout redirecionava a /confirmando com
 * `orderId=orderIds[0]` — a tela "Enviado" mostrava só o resumo/total/ETA do
 * PRIMEIRO pedido, escondendo o resto do que o cliente enviou (e pagará).
 *
 * Agora todos os ids seguem: `orderIds=a,b` no carrinho misto (a tela agrega
 * os dois) e `orderId=a` no carrinho de modo único (compat com a rota antiga).
 * Ids vazios/em branco são descartados antes de montar.
 *
 * Mora num módulo separado do `page.tsx` porque o Next 14 proíbe named exports
 * fora do contrato de rota (`default`/`metadata`/...) num arquivo de página.
 */
export function buildEnviadoQuery(orderIds: string[]): string {
  const ids = orderIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) return '';
  if (ids.length === 1) return `orderId=${ids[0]}`;
  return `orderIds=${ids.join(',')}`;
}

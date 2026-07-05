/**
 * Comparador puro do beep de "pedido novo" da /cozinha.
 *
 * Bug P2 (re-scan 2026-07-05): o beep usava DELTA DE CONTAGEM
 * (`activeOrders.length > prevCount`). Se no mesmo poll um pedido saía
 * (delivered/cancelled) e outro entrava, a contagem ficava constante → o beep
 * NÃO tocava → a cozinha perdia o pedido novo. O TvKdsBoard já detecta certo
 * por DIFF DE CONJUNTO de ids; esta função é o mesmo predicado, isolado aqui.
 *
 * Vive num módulo IRMÃO (não no page.tsx) porque Next.js proíbe named exports
 * fora do allowlist num route `page.tsx` — o validador `.next/types` reprova o
 * build. O page importa daqui, então há UMA fonte da verdade (sem cópia
 * divergente) e a lógica fica testável (RED→GREEN em new-order-beep.test.ts).
 *
 * `true` quando algum id de `nextIds` não existia em `prevIds`. Conjunto
 * anterior vazio → tudo é novo (o guard de primeira carga é do caller).
 */
export function hasNewOrderIds(prevIds: Set<string>, nextIds: Iterable<string>): boolean {
  for (const id of nextIds) {
    if (!prevIds.has(id)) return true;
  }
  return false;
}

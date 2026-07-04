/**
 * Monta o item do payload de POST /orders a partir de um item do rascunho.
 *
 * BUGFIX (P1-N re-scan): as preferências de bebida ('sem gelo', 'sem açúcar')
 * escolhidas no item detail apareciam no carrinho mas NÃO iam para o POST — o
 * payload só mandava menuItemId/quantity/notes(=note original). Resultado: o
 * cliente via "confirmado" e a COZINHA NUNCA RECEBIA a preferência.
 *
 * Menor caminho que faz a preferência CHEGAR à cozinha: dobrar as preferências
 * DENTRO do `notes` do item, já que:
 *  - `order_items.notes` já existe e `OrdersService.createOrder` já o persiste;
 *  - o KDS (kds-query.service `oi.notes` → `KdsOrderCard`/`cozinha`) já renderiza
 *    `notes`, então a preferência fica VISÍVEL na TV da cozinha sem migration.
 *
 * Formato: `[sem gelo · sem açúcar] nota original`. O prefixo entre colchetes
 * distingue preferência estruturada de observação livre. Se não há nota livre,
 * fica só `[sem gelo · sem açúcar]`. Se não há preferências, mantém a nota
 * original (ou omite via `undefined`, como antes).
 *
 * NOTA de alerta: o KDS destaca notas de alergia via `isAlertNote`
 * (web-staff/components/tv/types.ts). O regex de "sem" exige "por favor" depois
 * (`\bsem .*por favor`), então "[sem gelo]" NÃO dispara falso alerta vermelho —
 * preferências aparecem como observação normal, que é o comportamento correto.
 */

/** Formato do item consumido pelo POST /orders. */
export interface OrderItemPayload {
  menuItemId: string;
  quantity: number;
  notes?: string;
  customerId: string | null;
}

/** Subconjunto do DraftItem necessário para montar o payload. */
export interface DraftItemForPayload {
  menuItemId: string;
  quantity: number;
  note?: string;
  commandMode: 'individual' | 'table';
  preferences?: string[];
}

/**
 * Junta preferências estruturadas com a observação livre num único `notes`.
 * `[pref1 · pref2] nota` — retorna `undefined` quando não há nem preferência
 * nem nota (preserva o comportamento de omitir `notes` do payload antigo).
 */
export function mergePreferencesIntoNotes(
  preferences: string[] | undefined,
  note: string | undefined,
): string | undefined {
  const cleanPrefs = (preferences ?? []).map((p) => p.trim()).filter((p) => p.length > 0);
  const cleanNote = (note ?? '').trim();

  if (cleanPrefs.length === 0) {
    return cleanNote.length > 0 ? cleanNote : undefined;
  }

  const prefix = `[${cleanPrefs.join(' · ')}]`;
  return cleanNote.length > 0 ? `${prefix} ${cleanNote}` : prefix;
}

/**
 * Monta o item do payload para `POST /:slug/orders`.
 *
 * `orderCustomerId` é o customerId do caller (usado quando o item é da comanda
 * individual); itens da comanda da mesa vão com `customerId: null`.
 */
export function buildOrderItemPayload(
  item: DraftItemForPayload,
  orderCustomerId: string | null,
): OrderItemPayload {
  return {
    menuItemId: item.menuItemId,
    quantity: item.quantity,
    notes: mergePreferencesIntoNotes(item.preferences, item.note),
    customerId: item.commandMode === 'individual' ? orderCustomerId : null,
  };
}

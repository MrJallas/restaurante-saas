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

/**
 * IDEMPOTÊNCIA DO CHECKOUT (P1 re-scan #7 — pedido duplicado / dupla cobrança).
 *
 * O backend construiu o mecanismo COMPLETO de dedup no `POST /:slug/orders`
 * (Redis SETNX + poll, `order_idem:${tableSessionId}:${idempotencyKey}`,
 * TTL 5min) EXPLICITAMENTE contra "double-tap do Confirmar virando 2 pedidos".
 * Mas o customer nunca mandava a chave, então o backend setava idemKey=null e
 * PULAVA todo o dedup.
 *
 * O buraco real não é o double-tap síncrono (o `submitting` já cobre esse), é o
 * RETRY pós-erro: o POST cria o order server-side (tx commita) mas a resposta
 * dá timeout (>15s) / a rede cai → o api client aborta e lança, o handleSubmit
 * cai no catch, reseta `submitting=false` SEM limpar o draft, e o cliente toca
 * "Confirmar" de novo → 2º INSERT idêntico → 2 comandas na cozinha + cobrança
 * dobrada. A chave precisa SOBREVIVER ao catch+retry (mesma tentativa reusa a
 * MESMA chave → o backend dedup) mas ser NOVA quando o cliente monta um pedido
 * novo depois de um sucesso.
 *
 * Contrato do DTO (apps/api orders.controller.ts:123-125): o campo é
 * `idempotencyKey` e é validado com `@IsUUID()` — TEM que ser um UUID canônico.
 * Por isso NÃO dá pra usar uma string composta `${checkoutKey}:${billingMode}`:
 * o backend rejeitaria (400). O backend já namespaceia por `tableSessionId`,
 * então basta UMA chave UUID DISTINTA por grupo de billingMode, estável por
 * tentativa. No carrinho misto (um POST por billingMode), grupos diferentes
 * recebem UUIDs diferentes (não colidem no dedup) e o retry do MESMO grupo
 * reusa o mesmo UUID (dedupa).
 */
export interface CheckoutIdempotency {
  /** Um UUID canônico por billingMode. Estável por tentativa de checkout. */
  keyByMode: Record<'individual' | 'table', string>;
}

/** Gera um UUID (usa crypto.randomUUID; fallback manual pra ambientes sem ele). */
function randomUuid(): string {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback RFC-4122 v4 (jsdom antigo / ambiente sem WebCrypto).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Cria um bundle de idempotência NOVO para uma tentativa de checkout — uma
 * chave UUID por billingMode. Chame UMA vez por tentativa (memoizado num
 * useRef/state do checkout) e renove só em sucesso ou limpeza explícita do
 * draft. O retry pós-erro DEVE reusar o mesmo bundle pra o backend dedupar.
 */
export function createCheckoutIdempotency(): CheckoutIdempotency {
  return { keyByMode: { individual: randomUuid(), table: randomUuid() } };
}

/**
 * Resolve a idempotencyKey (UUID) do billingMode dentro de um bundle de
 * checkout. Grupos diferentes → chaves diferentes; mesmo grupo no retry →
 * mesma chave.
 */
export function idempotencyKeyForMode(
  bundle: CheckoutIdempotency,
  billingMode: 'individual' | 'table',
): string {
  return bundle.keyByMode[billingMode];
}

/** Formato do item consumido pelo POST /orders. */
export interface OrderItemPayload {
  menuItemId: string;
  quantity: number;
  notes?: string;
  customerId: string | null;
  /**
   * Rótulo do tamanho escolhido (ex.: 'Grande'). O backend usa esse label
   * pra achar o preço do tamanho em `menu_items.sizes` e cobrar o valor
   * certo — o preço NUNCA vem do cliente. Omitido quando o item não tem
   * tamanhos.
   */
  size?: string;
}

/** Subconjunto do DraftItem necessário para montar o payload. */
export interface DraftItemForPayload {
  menuItemId: string;
  quantity: number;
  note?: string;
  commandMode: 'individual' | 'table';
  preferences?: string[];
  /** Rótulo do tamanho escolhido no item detail (ex.: 'Pequeno'/'Médio'/'Grande'). */
  size?: string;
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
    // Manda o rótulo do tamanho pro backend precificar. Só inclui quando há
    // size — item sem tamanhos mantém o payload antigo (chave ausente).
    ...(item.size ? { size: item.size } : {}),
  };
}

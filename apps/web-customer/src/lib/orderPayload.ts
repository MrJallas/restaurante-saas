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
 * Dois buracos reais (o `submitting` síncrono cobre só o double-tap na MESMA
 * montagem):
 *
 *  1. RETRY pós-erro na MESMA tela: o POST cria o order server-side (tx
 *     commita) mas a resposta dá timeout / a rede cai → o handleSubmit cai no
 *     catch, reseta `submitting=false`, o cliente toca "Enviar" de novo → 2º
 *     INSERT idêntico.
 *
 *  2. RE-MOUNT / REABERTURA (o furo que o useRef NÃO cobre): cliente envia o
 *     pedido → vai pra /confirmando → SAI antes de tocar nada → o pedido
 *     auto-confirma (>15s, sweepAutoConfirm) e cai na cozinha → cliente reabre
 *     /revisar (o draft SOBREVIVE no localStorage `draft:<sessionId>`) → uma
 *     MONTAGEM NOVA nasce com um useRef fresco → idem-key NOVA → toca "Enviar"
 *     → 2º pedido idêntico. O useRef é POR MONTAGEM; a chave precisa
 *     SOBREVIVER ao re-mount enquanto o DRAFT for o mesmo.
 *
 * ESTRATÉGIA: a idem-key é persistida em `sessionStorage`, chaveada por um HASH
 * do conteúdo do draft (billingMode + itens). A MESMA tentativa de checkout (=
 * mesmo draft) reusa a MESMA key através de re-mounts e retries; muda quando o
 * draft muda (pedido legítimo diferente → key nova → não dedupa) e some no
 * sucesso (a próxima montagem com aquele conteúdo geraria uma key nova, mas o
 * draft também é limpo no sucesso — reforço (b)).
 *
 * Contrato do DTO (apps/api orders.controller.ts:123-125): o campo é
 * `idempotencyKey` e é validado com `@IsUUID()` — TEM que ser um UUID canônico.
 * Por isso NÃO dá pra usar uma string composta `${hash}:${billingMode}`: o
 * backend rejeitaria (400). O backend já namespaceia por `tableSessionId`,
 * então basta UMA chave UUID DISTINTA por grupo de billingMode, estável pelo
 * hash do draft. No carrinho misto (um POST por billingMode), grupos diferentes
 * recebem UUIDs diferentes (não colidem no dedup) e o retry/re-mount do MESMO
 * grupo reusa o mesmo UUID (dedupa).
 */
export interface CheckoutIdempotency {
  /** Um UUID canônico por billingMode. Estável pelo hash do draft. */
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
 * Cria um bundle de idempotência NOVO — uma chave UUID por billingMode. Uso
 * interno de `resolveCheckoutIdempotency` (e exposto pros testes de shape); no
 * fluxo real prefira `resolveCheckoutIdempotency`, que persiste o bundle
 * chaveado pelo hash do draft para sobreviver a re-mounts.
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

/**
 * Campos de um item de draft que DEFINEM o pedido enviado — o que o backend
 * insere. Mudança em qualquer um => é outro pedido => idem-key nova. `name`,
 * `priceCents` e `draftId` NÃO entram: o preço vem do backend e o draftId é um
 * id de UI volátil (muda a cada add), não faz parte do conteúdo enviado.
 */
export interface DraftFingerprintItem {
  menuItemId: string;
  quantity: number;
  commandMode: 'individual' | 'table';
  note?: string;
  size?: string;
  preferences?: string[];
}

/**
 * Hash estável e determinístico do conteúdo do draft. Duas montagens com o
 * MESMO carrinho produzem o MESMO hash (→ mesma idem-key persistida); qualquer
 * mudança de conteúdo (item, quantidade, nota, preferência, tamanho, modo)
 * muda o hash. A ordem dos itens é normalizada (sort) pra que reordenar o mesmo
 * carrinho não vire um "pedido diferente".
 *
 * djb2 (32-bit) — não é criptográfico. Uma colisão aqui significaria reusar uma
 * idem-key entre dois drafts DIFERENTES da mesma sessão (o backend dedupa só
 * por key, não por conteúdo), mas o espaço 2^32 + o namespacing por sessão + a
 * janela curta de TTL (5min) tornam isso praticamente impossível para um
 * carrinho humano.
 */
export function draftFingerprint(items: DraftFingerprintItem[]): string {
  const canonical = items
    .map((it) => {
      const prefs = (it.preferences ?? [])
        .map((p) => p.trim())
        .filter(Boolean)
        .sort()
        .join(',');
      return [
        it.menuItemId,
        String(it.quantity),
        it.commandMode,
        (it.note ?? '').trim(),
        (it.size ?? '').trim(),
        prefs,
      ].join('|');
    })
    .sort()
    .join('\n');

  let hash = 5381;
  for (let i = 0; i < canonical.length; i++) {
    hash = (hash * 33) ^ canonical.charCodeAt(i);
  }
  // >>> 0 → unsigned; base36 mantém a chave curta.
  return (hash >>> 0).toString(36);
}

const CHECKOUT_IDEM_STORAGE_PREFIX = 'checkout-idem:';

function checkoutIdemStorageKey(draftHash: string): string {
  return `${CHECKOUT_IDEM_STORAGE_PREFIX}${draftHash}`;
}

function safeSessionStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isValidBundle(value: unknown): value is CheckoutIdempotency {
  if (!value || typeof value !== 'object') return false;
  const byMode = (value as { keyByMode?: unknown }).keyByMode;
  if (!byMode || typeof byMode !== 'object') return false;
  const { individual, table } = byMode as Record<string, unknown>;
  return typeof individual === 'string' && typeof table === 'string';
}

/**
 * Resolve o bundle de idempotência de UMA tentativa de checkout, persistido em
 * `sessionStorage` chaveado pelo HASH do draft. É o ponto único que faz a
 * idem-key SOBREVIVER a re-mounts (reabrir /revisar depois de sair da
 * /confirmando) e a retries pós-erro:
 *
 *  - Mesmo draft (mesmo hash) → devolve o bundle já persistido (mesmas keys) →
 *    o backend dedupa o 2º POST em vez de criar um 2º pedido.
 *  - Draft diferente → hash diferente → não acha bundle → cria e persiste um
 *    novo (pedido legítimo distinto não é dedupado contra o anterior).
 *
 * Sem sessionStorage (SSR / modo restrito) cai num bundle efêmero — degrada pro
 * comportamento anterior (proteção só dentro da montagem), sem quebrar.
 */
export function resolveCheckoutIdempotency(draftHash: string): CheckoutIdempotency {
  const storage = safeSessionStorage();
  const key = checkoutIdemStorageKey(draftHash);
  if (storage) {
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isValidBundle(parsed)) return parsed;
      }
    } catch {
      /* corrompido / indisponível → recria abaixo */
    }
  }
  const bundle = createCheckoutIdempotency();
  if (storage) {
    try {
      storage.setItem(key, JSON.stringify(bundle));
    } catch {
      /* quota / modo privado → segue com o bundle efêmero */
    }
  }
  return bundle;
}

/**
 * Descarta o bundle persistido de uma tentativa de checkout. Chamado no SUCESSO
 * do envio: a próxima montagem com o mesmo conteúdo geraria uma key nova (e o
 * draft também é limpo — reforço (b)), então um pedido legítimo idêntico depois
 * NÃO é dedupado contra o que já foi pra cozinha.
 */
export function clearCheckoutIdempotency(draftHash: string): void {
  const storage = safeSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(checkoutIdemStorageKey(draftHash));
  } catch {
    /* ignore */
  }
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

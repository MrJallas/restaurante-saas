/**
 * FASE framework (fatia table-merge): máquina de estados de consentimento
 * dual do table-merge extraída do table-merge.service.ts pra um módulo
 * PURO — sem DI, sem Nest, sem banco — no padrão de
 * orders/order-state-machine.ts. Comportamento preservado 1:1
 * (characterization em table-merge.consent.test.ts, escrito e provado
 * verde ANTES desta extração).
 *
 * ATENÇÃO — o que mora aqui e o que NÃO mora:
 *  - Mora aqui: resolução de lado (host da origem = 'a', host do alvo =
 *    'b'), constantes de TTL/cooldown e as mensagens de erro canônicas.
 *  - NÃO mora aqui: a transição pending→approved REAL. Ela vive no UPDATE
 *    SQL com COALESCE/CASE dentro do service (approve), de propósito, por
 *    ATOMICIDADE contra race cross-side — os dois hosts podem aprovar ao
 *    mesmo tempo e o banco resolve. Não mover a decision-table pra cá.
 */

/** Default merge request TTL: 60s (host has to react). */
export const REQUEST_TTL_SECONDS = 60;

/**
 * Cooldown applied after a rejection or timeout to throttle the requester so
 * the target table is not spammed. 10 min keeps things calm without locking
 * the requester out of the whole night.
 */
export const COOLDOWN_MINUTES = 10;

/**
 * Mensagens canônicas do fluxo de consentimento. As variantes approve vs
 * reject NÃO são idênticas byte a byte (verbo e complemento divergem) —
 * por isso cada call-site lança a SUA, e este módulo só centraliza os
 * textos. Congeladas pelo characterization; mudar texto aqui é decisão de
 * produto, não de engenharia.
 */
export const MERGE_CONSENT_MESSAGES = {
  /** Guard 400 do approve — decidedByCustomerId ausente. */
  deciderRequiredApprove: 'decidedByCustomerId obrigatorio para identificar o lado da junçao.',
  /** Guard 400 do reject — decidedByCustomerId ausente. */
  deciderRequiredReject: 'decidedByCustomerId obrigatorio para identificar o host.',
  /** 403 do approve — decisor não é host de nenhum dos lados. */
  onlyHostCanApprove: 'Apenas o host de cada mesa pode aprovar a juncao.',
  /** 403 do reject — decisor não é host de nenhum dos lados. */
  onlyHostCanReject: 'Apenas o host de cada mesa pode rejeitar a juncao.',
} as const;

/** Lado do consentimento: 'a' = sessão de origem, 'b' = sessão alvo. */
export type ConsentSide = 'a' | 'b';

/**
 * Resolve a qual lado do merge o decisor pertence, comparando com o
 * `host_customer_id` de cada sessão (wiring setado por
 * table-session.service.upsertParticipant). Devolve `null` quando o
 * decisor não é host de lado nenhum — o call-site decide o erro (as
 * mensagens 403 de approve/reject divergem, então o throw fica lá).
 *
 * Lógica idêntica à que estava duplicada em approve (~L512-523) e reject
 * (~L621-632) do service; `===` é simétrico, então a ordem dos operandos
 * (que divergia entre os dois trechos) não muda nada.
 */
export function resolveConsentSide(
  srcHost: string | null,
  tgtHost: string | null,
  decidedByCustomerId: string,
): ConsentSide | null {
  if (srcHost && srcHost === decidedByCustomerId) {
    return 'a';
  }
  if (tgtHost && tgtHost === decidedByCustomerId) {
    return 'b';
  }
  return null;
}

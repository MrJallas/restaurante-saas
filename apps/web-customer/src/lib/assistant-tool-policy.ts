/**
 * Tools whose result and side effect are completed by the AI service/API.
 * Their response is already rendered as the assistant's primary bubble, so
 * dispatching them again in the browser would duplicate or fake feedback.
 */
const SERVER_RESOLVED_ASSISTANT_TOOLS = new Set([
  'ask_about_restaurant',
  'search_dish',
  'check_allergens',
  'compare_dishes',
  'delete_chat',
  'delete_all_chats',
]);

export function isServerResolvedAssistantTool(name: string): boolean {
  return SERVER_RESOLVED_ASSISTANT_TOOLS.has(name);
}

/**
 * `add_to_order` pode voltar pedindo desambiguação em vez de ter adicionado
 * algo: quando o cliente diz um nome que casa mais de um item do cardápio, a
 * tool devolve "temos X, Y e Z — qual você quer?" com os chips dos candidatos
 * e, de propósito, NÃO resolve o item (política 2C: nunca chutar, porque
 * lançar o prato errado na conta de quem vai pagar é pior que uma pergunta a
 * mais).
 *
 * Essa call carrega o NOME cru em `itemId` — não um UUID. Se ela fosse tratada
 * como um add_to_order comum, o browser tentaria buscar `/menu/items/<nome>`,
 * falharia, e a pergunta seria substituída pela mensagem genérica de falha,
 * deixando os chips dos candidatos órfãos embaixo de um erro.
 */
export function isDisambiguationAsk(actionPayload: Record<string, unknown>): boolean {
  return actionPayload.needsDisambiguation === true;
}

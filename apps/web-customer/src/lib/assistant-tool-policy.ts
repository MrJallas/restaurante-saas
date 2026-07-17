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

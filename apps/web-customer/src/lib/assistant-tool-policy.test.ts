import { isServerResolvedAssistantTool } from './assistant-tool-policy';

describe('assistant tool dispatch policy', () => {
  it.each([
    'ask_about_restaurant',
    'search_dish',
    'check_allergens',
    'compare_dishes',
    'delete_chat',
    'delete_all_chats',
  ])('does not dispatch %s a second time in the browser', (name) => {
    expect(isServerResolvedAssistantTool(name)).toBe(true);
  });

  it.each(['view_menu', 'open_payment_screen', 'call_waiter', 'request_table_merge'])(
    'keeps the browser-owned effect for %s',
    (name) => {
      expect(isServerResolvedAssistantTool(name)).toBe(false);
    },
  );
});

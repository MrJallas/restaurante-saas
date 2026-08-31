import { isDisambiguationAsk, isServerResolvedAssistantTool } from './assistant-tool-policy';

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

describe('isDisambiguationAsk', () => {
  it('reconhece a pergunta de desambiguação do add_to_order', () => {
    expect(
      isDisambiguationAsk({
        needsDisambiguation: true,
        query: 'suco',
        candidates: [
          { id: 'uuid-1', name: 'Suco de Laranja' },
          { id: 'uuid-2', name: 'Suco de Uva' },
        ],
      }),
    ).toBe(true);
  });

  it('um add_to_order que de fato adicionou não é pergunta', () => {
    expect(
      isDisambiguationAsk({
        itemId: '11111111-1111-4111-8111-111111111111',
        quantity: 1,
        orderUpdated: true,
      }),
    ).toBe(false);
  });

  it('payload vazio não é pergunta', () => {
    expect(isDisambiguationAsk({})).toBe(false);
  });

  it('não aceita valor truthy que não seja o booleano — evita falso positivo', () => {
    expect(isDisambiguationAsk({ needsDisambiguation: 'sim' })).toBe(false);
  });
});

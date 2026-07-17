import { enrichComparisonToolCalls } from './assistant.service';

type MenuItems = Parameters<typeof enrichComparisonToolCalls>[2];

describe('enrichComparisonToolCalls', () => {
  it('substitui preço inventado pelo valor canônico do tenant', () => {
    const menuItems = [
      {
        id: 'picanha',
        name: 'Picanha',
        price_cents: 7900,
        image_url: null,
        category_name: 'Principais',
        allergens: [],
        tags: [],
        short_description: null,
      },
      {
        id: 'bruschetta',
        name: 'Bruschetta',
        price_cents: 1890,
        image_url: null,
        category_name: 'Entradas',
        allergens: ['gluten'],
        tags: [],
        short_description: null,
      },
    ] as MenuItems;
    const toolCalls = [
      {
        name: 'compare_dishes',
        arguments: { itemIds: ['picanha', 'bruschetta'] },
        result: {
          message: 'Comparando: Picanha R$ 0.00; Bruschetta R$ 0.00',
          actionPayload: {
            items: [
              { id: 'picanha', price_cents: 7900 },
              { id: 'bruschetta', price_cents: 1890 },
            ],
          },
        },
      },
    ];

    const result = enrichComparisonToolCalls('R$ 0.00', toolCalls, menuItems);

    expect(result.response).toContain('Picanha: R$ 79,00');
    expect(result.response).toContain('Bruschetta: R$ 18,90');
    expect(result.response).not.toContain('R$ 0');
    expect(result.toolCalls[0].actionPayload).toMatchObject({
      items: [
        { id: 'picanha', priceCents: 7900 },
        { id: 'bruschetta', priceCents: 1890 },
      ],
    });
  });
});

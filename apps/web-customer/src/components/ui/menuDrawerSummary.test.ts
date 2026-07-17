import { orderSummarySubtitle } from './menuDrawerSummary';

describe('orderSummarySubtitle', () => {
  it('não chama resumo desconhecido de pedido vazio', () => {
    expect(orderSummarySubtitle(undefined)).toBe('Abra para conferir seu pedido');
  });

  it('só afirma vazio quando o estado carregado é explicitamente vazio', () => {
    expect(orderSummarySubtitle(null)).toBe('Nenhum item no pedido');
    expect(orderSummarySubtitle({ items: 0, totalCents: 0 })).toBe('Nenhum item no pedido');
  });

  it('formata um resumo realmente carregado', () => {
    expect(orderSummarySubtitle({ items: 2, totalCents: 12345 })).toBe('2 itens · R$ 123,45');
  });
});

/**
 * Smoke test do harness Jest do web-staff.
 *
 * Alvo: funções PURAS de `components/tv/types.ts` (KDS derivations) — sem DOM,
 * sem React, sem rede. Prova que o runner `next/jest` roda TS no web-staff.
 * Testes de componente/hook (RTL) ficam pra depois; aqui é só o harness.
 */
import {
  deriveStatus,
  countActiveDrinks,
  getQuantityLabel,
  getPrimaryActionLabel,
  isAlertNote,
  LATE_THRESHOLD_MIN,
  type KdsOrder,
} from './types';

function makeOrder(overrides: Partial<KdsOrder> = {}): KdsOrder {
  return {
    id: 'o-1',
    status: 'received',
    total_cents: 0,
    notes: null,
    visit_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    table_label: 'Mesa 1',
    items: [],
    ...overrides,
  };
}

describe('deriveStatus', () => {
  it('mapeia ready -> pronto independente do tempo', () => {
    expect(deriveStatus(makeOrder({ status: 'ready' }), 999)).toBe('pronto');
  });

  it('recém-recebido vira novo; passa do threshold vira atrasado', () => {
    expect(deriveStatus(makeOrder({ status: 'received' }), 0)).toBe('novo');
    expect(deriveStatus(makeOrder({ status: 'received' }), LATE_THRESHOLD_MIN)).toBe('atrasado');
  });

  it('em preparo vira preparando; passa do threshold vira atrasado', () => {
    expect(deriveStatus(makeOrder({ status: 'in_progress' }), 1)).toBe('preparando');
    expect(deriveStatus(makeOrder({ status: 'in_progress' }), LATE_THRESHOLD_MIN + 1)).toBe(
      'atrasado',
    );
  });
});

describe('countActiveDrinks', () => {
  it('soma quantities de orders não-ready e exclui ready', () => {
    const orders = [
      makeOrder({ status: 'in_progress', items: [drink(2), drink(1)] }),
      makeOrder({ status: 'ready', items: [drink(5)] }),
    ];
    expect(countActiveDrinks(orders)).toBe(3);
  });
});

describe('getQuantityLabel', () => {
  it('pluraliza bebida só no bar; kitchen fica só "há"', () => {
    expect(getQuantityLabel(1, 'bar')).toBe('1 bebida · há');
    expect(getQuantityLabel(2, 'bar')).toBe('2 bebidas · há');
    expect(getQuantityLabel(3, 'kitchen')).toBe('há');
  });
});

describe('getPrimaryActionLabel', () => {
  it('deriva a ação do status raw, não do derivado', () => {
    expect(getPrimaryActionLabel('received', 'kitchen')).toBe('▶  Iniciar preparo');
    expect(getPrimaryActionLabel('received', 'bar')).toBe('▶  Preparar');
    expect(getPrimaryActionLabel('in_progress', 'kitchen')).toBe('Marcar pronto');
    expect(getPrimaryActionLabel('ready', 'kitchen')).toBe('Chamar garçom');
  });
});

describe('isAlertNote', () => {
  it('destaca alergia mesmo acentuada e ignora observação comum', () => {
    expect(isAlertNote('cliente alérgico a amendoim')).toBe(true);
    expect(isAlertNote('sem glúten, por favor')).toBe(true);
    expect(isAlertNote('bem gelada')).toBe(false);
    expect(isAlertNote(null)).toBe(false);
  });
});

function drink(quantity: number): KdsOrder['items'][number] {
  return {
    id: `i-${quantity}`,
    menuItemId: 'mi-1',
    name: 'Bebida',
    quantity,
    notes: null,
    categoryName: 'Bebidas',
  };
}

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
  nextKdsAction,
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

describe('nextKdsAction', () => {
  // O mapa DEVE bater com VALID_TRANSITIONS do backend
  // (apps/api/src/modules/orders/order-state-machine.ts). Transições que o
  // backend rejeita com 400 (open->in_progress, confirmed->ready) NÃO podem
  // sair daqui, senão o botão "Iniciar preparo" / "Marcar pronto" da TV
  // dispara um PATCH que o backend nega e o card fica travado.
  it('avança received/in_progress pelo caminho moderno válido', () => {
    expect(nextKdsAction('received')).toEqual({ kind: 'status', status: 'in_progress' });
    expect(nextKdsAction('in_progress')).toEqual({ kind: 'status', status: 'ready' });
  });

  it('ready chama garçom (não é transição de status)', () => {
    expect(nextKdsAction('ready')).toEqual({ kind: 'call_waiter' });
  });

  it('legacy open avança para received (NUNCA in_progress — backend rejeita)', () => {
    // VALID_TRANSITIONS.open = ['confirmed', 'received', 'cancelled']
    expect(nextKdsAction('open')).toEqual({ kind: 'status', status: 'received' });
  });

  it('legacy confirmed avança para in_progress (NUNCA ready — backend rejeita)', () => {
    // VALID_TRANSITIONS.confirmed = ['preparing', 'in_progress', 'cancelled']
    expect(nextKdsAction('confirmed')).toEqual({ kind: 'status', status: 'in_progress' });
  });

  it('legacy preparing avança para ready (transição válida)', () => {
    // VALID_TRANSITIONS.preparing = ['ready', 'cancelled']
    expect(nextKdsAction('preparing')).toEqual({ kind: 'status', status: 'ready' });
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

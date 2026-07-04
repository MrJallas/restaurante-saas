import {
  buildOrderItemPayload,
  mergePreferencesIntoNotes,
  type DraftItemForPayload,
} from './orderPayload';

describe('mergePreferencesIntoNotes', () => {
  it('dobra preferências dentro de notes quando não há nota livre', () => {
    expect(mergePreferencesIntoNotes(['sem gelo', 'sem açúcar'], undefined)).toBe(
      '[sem gelo · sem açúcar]',
    );
  });

  it('prefixa a nota livre com as preferências', () => {
    expect(mergePreferencesIntoNotes(['sem gelo'], 'bem gelada, por favor')).toBe(
      '[sem gelo] bem gelada, por favor',
    );
  });

  it('mantém só a nota livre quando não há preferências', () => {
    expect(mergePreferencesIntoNotes([], 'sem cebola')).toBe('sem cebola');
    expect(mergePreferencesIntoNotes(undefined, 'sem cebola')).toBe('sem cebola');
  });

  it('retorna undefined quando não há preferência nem nota (payload omite notes)', () => {
    expect(mergePreferencesIntoNotes(undefined, undefined)).toBeUndefined();
    expect(mergePreferencesIntoNotes([], '')).toBeUndefined();
    expect(mergePreferencesIntoNotes([], '   ')).toBeUndefined();
  });

  it('ignora preferências e notas em branco', () => {
    expect(mergePreferencesIntoNotes(['  ', 'sem gelo', ''], '  ')).toBe('[sem gelo]');
  });
});

describe('buildOrderItemPayload', () => {
  const base: DraftItemForPayload = {
    menuItemId: 'mi-1',
    quantity: 2,
    commandMode: 'individual',
  };

  it('REGRESSÃO P1-N: preferências de bebida chegam ao POST dentro de notes', () => {
    const payload = buildOrderItemPayload(
      { ...base, preferences: ['sem gelo', 'sem açúcar'] },
      'cust-123',
    );
    // Antes do fix, notes vinha undefined e a cozinha nunca recebia a preferência.
    expect(payload.notes).toBe('[sem gelo · sem açúcar]');
    expect(payload).toEqual({
      menuItemId: 'mi-1',
      quantity: 2,
      notes: '[sem gelo · sem açúcar]',
      customerId: 'cust-123',
    });
  });

  it('combina preferência + observação livre no notes', () => {
    const payload = buildOrderItemPayload(
      { ...base, preferences: ['sem gelo'], note: 'copo pequeno' },
      'cust-123',
    );
    expect(payload.notes).toBe('[sem gelo] copo pequeno');
  });

  it('item da comanda da mesa vai com customerId null', () => {
    const payload = buildOrderItemPayload(
      { ...base, commandMode: 'table', preferences: ['sem gelo'] },
      'cust-123',
    );
    expect(payload.customerId).toBeNull();
    expect(payload.notes).toBe('[sem gelo]');
  });

  it('item da comanda individual usa o customerId do caller', () => {
    const payload = buildOrderItemPayload({ ...base, commandMode: 'individual' }, 'cust-123');
    expect(payload.customerId).toBe('cust-123');
  });

  it('sem preferências nem nota, notes fica undefined (comportamento antigo preservado)', () => {
    const payload = buildOrderItemPayload(base, 'cust-123');
    expect(payload.notes).toBeUndefined();
  });

  it('P1 re-scan: o tamanho escolhido (size) vai no payload pro backend precificar', () => {
    const payload = buildOrderItemPayload({ ...base, size: 'Grande' }, 'cust-123');
    // Antes do fix, size ficava só no rascunho/UI: o cliente escolhia Grande,
    // via R$12, mas o POST não mandava o size e o backend cobrava o preço-base.
    expect(payload.size).toBe('Grande');
  });

  it('item sem tamanho não inclui size no payload (comportamento antigo preservado)', () => {
    const payload = buildOrderItemPayload(base, 'cust-123');
    expect(payload.size).toBeUndefined();
  });
});

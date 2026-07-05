import {
  buildOrderItemPayload,
  createCheckoutIdempotency,
  idempotencyKeyForMode,
  mergePreferencesIntoNotes,
  type DraftItemForPayload,
} from './orderPayload';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

describe('idempotência do checkout (P1 re-scan #7: pedido duplicado / dupla cobrança)', () => {
  it('a chave é um UUID canônico (contrato @IsUUID do DTO idempotencyKey)', () => {
    const bundle = createCheckoutIdempotency();
    expect(idempotencyKeyForMode(bundle, 'individual')).toMatch(UUID_RE);
    expect(idempotencyKeyForMode(bundle, 'table')).toMatch(UUID_RE);
  });

  it('RETRY da mesma tentativa reusa a mesma chave por modo (backend dedupa)', () => {
    // Mesma tentativa de checkout = mesmo bundle preservado no ref através do
    // catch. Ler a chave de novo (retry) devolve exatamente o mesmo UUID.
    const bundle = createCheckoutIdempotency();
    expect(idempotencyKeyForMode(bundle, 'individual')).toBe(
      idempotencyKeyForMode(bundle, 'individual'),
    );
    expect(idempotencyKeyForMode(bundle, 'table')).toBe(idempotencyKeyForMode(bundle, 'table'));
  });

  it('um checkout NOVO gera chaves diferentes (pedido legítimo distinto não é dedupado)', () => {
    const first = createCheckoutIdempotency();
    const second = createCheckoutIdempotency();
    expect(idempotencyKeyForMode(second, 'individual')).not.toBe(
      idempotencyKeyForMode(first, 'individual'),
    );
    expect(idempotencyKeyForMode(second, 'table')).not.toBe(idempotencyKeyForMode(first, 'table'));
  });

  it('carrinho misto: UMA chave por billingMode, e grupos diferentes não colidem', () => {
    // Um POST por grupo billingMode. Cada grupo tem sua própria chave, senão o
    // dedup do backend faria o 2º grupo (mesma session) devolver o order do 1º.
    const bundle = createCheckoutIdempotency();
    expect(idempotencyKeyForMode(bundle, 'individual')).not.toBe(
      idempotencyKeyForMode(bundle, 'table'),
    );
  });
});

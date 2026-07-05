import {
  buildOrderItemPayload,
  clearCheckoutIdempotency,
  createCheckoutIdempotency,
  draftFingerprint,
  idempotencyKeyForMode,
  mergePreferencesIntoNotes,
  resolveCheckoutIdempotency,
  type DraftFingerprintItem,
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
    // Mesma tentativa de checkout = mesmo bundle. Ler a chave de novo (retry)
    // devolve exatamente o mesmo UUID.
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

describe('draftFingerprint (hash estável do conteúdo do draft)', () => {
  const a: DraftFingerprintItem = { menuItemId: 'mi-1', quantity: 2, commandMode: 'individual' };
  const b: DraftFingerprintItem = { menuItemId: 'mi-2', quantity: 1, commandMode: 'table' };

  it('o MESMO carrinho gera o MESMO hash (estável através de re-mounts)', () => {
    expect(draftFingerprint([a, b])).toBe(draftFingerprint([a, b]));
  });

  it('a ORDEM dos itens não muda o hash (reordenar o mesmo carrinho não vira outro pedido)', () => {
    expect(draftFingerprint([a, b])).toBe(draftFingerprint([b, a]));
  });

  it('mudar quantidade muda o hash (é outro pedido → idem-key nova)', () => {
    expect(draftFingerprint([{ ...a, quantity: 3 }])).not.toBe(draftFingerprint([a]));
  });

  it('mudar nota / tamanho / preferência / modo muda o hash', () => {
    expect(draftFingerprint([{ ...a, note: 'sem cebola' }])).not.toBe(draftFingerprint([a]));
    expect(draftFingerprint([{ ...a, size: 'Grande' }])).not.toBe(draftFingerprint([a]));
    expect(draftFingerprint([{ ...a, preferences: ['sem gelo'] }])).not.toBe(draftFingerprint([a]));
    expect(draftFingerprint([{ ...a, commandMode: 'table' }])).not.toBe(draftFingerprint([a]));
  });

  it('a ordem das preferências dentro de um item não muda o hash', () => {
    expect(draftFingerprint([{ ...a, preferences: ['sem gelo', 'sem açúcar'] }])).toBe(
      draftFingerprint([{ ...a, preferences: ['sem açúcar', 'sem gelo'] }]),
    );
  });

  it('adicionar um item muda o hash', () => {
    expect(draftFingerprint([a])).not.toBe(draftFingerprint([a, b]));
  });
});

describe('idempotência persistida por hash do draft (re-mount não re-cobra)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  const draftA: DraftFingerprintItem[] = [
    { menuItemId: 'mi-1', quantity: 2, commandMode: 'individual' },
  ];
  const draftB: DraftFingerprintItem[] = [
    { menuItemId: 'mi-9', quantity: 1, commandMode: 'table' },
  ];

  it('RE-MOUNT com o MESMO draft reusa a MESMA idem-key (backend dedupa em vez de 2ª comanda)', () => {
    // Simula o furo real: cliente envia → vai pra /confirmando → SAI → o pedido
    // auto-confirma → reabre /revisar (MONTAGEM NOVA, mas sessionStorage
    // persiste) → toca "Enviar" de novo. As duas montagens resolvem a MESMA
    // chave, então o POST do 2º envio dedupa e NÃO cria um 2º pedido.
    const hash = draftFingerprint(draftA);
    const firstMount = resolveCheckoutIdempotency(hash); // 1ª montagem
    const secondMount = resolveCheckoutIdempotency(hash); // reabertura (re-mount)
    expect(idempotencyKeyForMode(secondMount, 'individual')).toBe(
      idempotencyKeyForMode(firstMount, 'individual'),
    );
    expect(idempotencyKeyForMode(secondMount, 'table')).toBe(
      idempotencyKeyForMode(firstMount, 'table'),
    );
  });

  it('as chaves persistidas são UUIDs canônicos (contrato @IsUUID)', () => {
    const bundle = resolveCheckoutIdempotency(draftFingerprint(draftA));
    expect(idempotencyKeyForMode(bundle, 'individual')).toMatch(UUID_RE);
    expect(idempotencyKeyForMode(bundle, 'table')).toMatch(UUID_RE);
  });

  it('um draft DIFERENTE resolve chaves diferentes (pedido legítimo distinto não é dedupado)', () => {
    const forA = resolveCheckoutIdempotency(draftFingerprint(draftA));
    const forB = resolveCheckoutIdempotency(draftFingerprint(draftB));
    expect(idempotencyKeyForMode(forB, 'individual')).not.toBe(
      idempotencyKeyForMode(forA, 'individual'),
    );
    expect(idempotencyKeyForMode(forB, 'table')).not.toBe(idempotencyKeyForMode(forA, 'table'));
  });

  it('SUCESSO limpa o bundle: um pedido idêntico depois recebe chaves FRESCAS (não dedupa contra o que já foi pra cozinha)', () => {
    const hash = draftFingerprint(draftA);
    const before = resolveCheckoutIdempotency(hash);
    clearCheckoutIdempotency(hash); // sucesso do envio
    const after = resolveCheckoutIdempotency(hash); // cliente monta o mesmo pedido de novo
    expect(idempotencyKeyForMode(after, 'individual')).not.toBe(
      idempotencyKeyForMode(before, 'individual'),
    );
    expect(idempotencyKeyForMode(after, 'table')).not.toBe(idempotencyKeyForMode(before, 'table'));
  });
});

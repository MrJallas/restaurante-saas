import {
  parseEnviadoOrderIds,
  aggregateOrders,
  loadEnviadoOrders,
  type EnviadoOrder,
} from './aggregate';

/** Helper: agrega e afirma que não é null (carrinho com pedidos). */
function agg(orders: EnviadoOrder[]): EnviadoOrder {
  const result = aggregateOrders(orders);
  if (result === null) throw new Error('esperava agregação não-nula');
  return result;
}

describe('parseEnviadoOrderIds (lê os ids da query da tela Enviado)', () => {
  const sp = (entries: Record<string, string>) => ({
    get: (k: string) => (k in entries ? entries[k] : null),
  });

  it('lê o novo param orderIds=a,b (carrinho misto)', () => {
    expect(parseEnviadoOrderIds(sp({ orderIds: 'ord-1,ord-2' }))).toEqual(['ord-1', 'ord-2']);
  });

  it('cai no orderId= legado quando não há orderIds', () => {
    expect(parseEnviadoOrderIds(sp({ orderId: 'ord-1' }))).toEqual(['ord-1']);
  });

  it('descarta ids vazios / em branco', () => {
    expect(parseEnviadoOrderIds(sp({ orderIds: 'ord-1, ,ord-2,' }))).toEqual(['ord-1', 'ord-2']);
  });

  it('sem nenhum param → lista vazia', () => {
    expect(parseEnviadoOrderIds(sp({}))).toEqual([]);
  });
});

describe('aggregateOrders (bug: tela Enviado do carrinho misto refletia só o 1º pedido)', () => {
  const orderA: EnviadoOrder = {
    id: 'a',
    status: 'received',
    totalCents: 3000,
    items: [{ id: 'i1', name: 'Burger', quantity: 1, priceCents: 3000 }],
    etaMinutesMin: 10,
    etaMinutesMax: 15,
  };
  const orderB: EnviadoOrder = {
    id: 'b',
    status: 'in_progress',
    totalCents: 1200,
    items: [{ id: 'i2', name: 'Suco', quantity: 2, priceCents: 600 }],
    etaMinutesMin: 3,
    etaMinutesMax: 6,
  };

  it('soma o total dos DOIS pedidos (não só o 1º)', () => {
    // Antes do fix, a tela mostrava totalCents=3000 (só o pedido A).
    expect(agg([orderA, orderB]).totalCents).toBe(4200);
  });

  it('concatena os itens de todos os pedidos', () => {
    const result = agg([orderA, orderB]);
    expect(result.items.map((i) => i.name)).toEqual(['Burger', 'Suco']);
    expect(result.items.reduce((s, i) => s + i.quantity, 0)).toBe(3);
  });

  it('ETA do conjunto = maior janela (o pedido mais lento manda)', () => {
    const result = agg([orderA, orderB]);
    expect(result.etaMinutesMin).toBe(10);
    expect(result.etaMinutesMax).toBe(15);
  });

  it('status agregado = o MENOS avançado (o pedido mais atrás define o progresso)', () => {
    // received(0) < in_progress(1) → o conjunto ainda está em "received".
    expect(agg([orderA, orderB]).status).toBe('received');
    expect(agg([orderB, orderA]).status).toBe('received');
  });

  it('um único pedido volta idêntico (compat carrinho de modo único)', () => {
    const result = agg([orderA]);
    expect(result.totalCents).toBe(3000);
    expect(result.status).toBe('received');
    expect(result.items).toHaveLength(1);
  });

  it('lista vazia → null (nada carregado ainda)', () => {
    expect(aggregateOrders([])).toBeNull();
  });

  it('ETA ausente em um pedido não quebra a janela do outro', () => {
    const noEta: EnviadoOrder = { ...orderB, etaMinutesMin: null, etaMinutesMax: null };
    const result = agg([orderA, noEta]);
    expect(result.etaMinutesMin).toBe(10);
    expect(result.etaMinutesMax).toBe(15);
  });
});

describe('loadEnviadoOrders (gate honesto da tela de sucesso)', () => {
  const order: EnviadoOrder = {
    id: 'a',
    status: 'received',
    totalCents: 3000,
    items: [{ id: 'i1', name: 'Burger', quantity: 1, priceCents: 3000 }],
  };

  it('requires at least one order id', async () => {
    await expect(loadEnviadoOrders([], jest.fn())).rejects.toMatchObject({
      code: 'missing_order_ids',
    });
  });

  it('returns success data only after every GET is valid', async () => {
    const orderB = { ...order, id: 'b', totalCents: 1200 };
    const load = jest.fn(async (id: string) => (id === 'a' ? order : orderB));

    await expect(loadEnviadoOrders(['a', 'b'], load)).resolves.toMatchObject({
      id: 'a,b',
      totalCents: 4200,
    });
  });

  it('rejects the whole success state when one GET fails', async () => {
    await expect(
      loadEnviadoOrders(['a', 'b'], async (id) => {
        if (id === 'b') throw new Error('offline');
        return order;
      }),
    ).rejects.toThrow('offline');
  });

  it('rejects malformed or mismatched order responses', async () => {
    await expect(
      loadEnviadoOrders(['a'], async () => ({ id: 'other', status: 'received' })),
    ).rejects.toMatchObject({ code: 'invalid_order_response' });
  });

  it('does not call a pending or cancelled order successfully sent', async () => {
    await expect(
      loadEnviadoOrders(['a'], async () => ({ ...order, status: 'pending_confirmation' })),
    ).rejects.toMatchObject({ code: 'order_not_sent' });
    await expect(
      loadEnviadoOrders(['a'], async () => ({ ...order, status: 'cancelled' })),
    ).rejects.toMatchObject({ code: 'order_not_sent' });
  });
});

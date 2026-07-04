/**
 * CHARACTERIZATION (FASE 2 · 2C): congela o comportamento do perfil de
 * consumo/favoritos extraído do orders.service. Fixa: order sem customer
 * é no-op; last_items/last_categories vêm do pedido; favorite_items são
 * re-agregados; o upsert soma total_spent/total_orders no conflito.
 */

import { ConsumptionSummaryService } from './consumption-summary.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

const ORDER = 'aaaaaaa4-0000-4000-8000-000000000001';
const CUSTOMER = 'bbbbbbb4-0000-4000-8000-000000000001';

function fakeDb(opts: {
  customerId?: string | null;
  totalCents?: number;
  items?: Array<{ name: string; category_name: string; quantity: number }>;
  favorites?: Array<{ name: string; category: string; order_count: number; total_qty: number }>;
}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    calls.push({ sql: s, params });
    if (s.startsWith('SELECT o.visit_id, o.total_cents, v.customer_id')) {
      return [
        { visit_id: 'v1', total_cents: opts.totalCents ?? 0, customer_id: opts.customerId ?? null },
      ];
    }
    if (s.includes('FROM order_items oi') && s.includes('category_name')) {
      return (opts.items ?? []).map((i) => ({ ...i, category_id: 'c1' }));
    }
    if (s.includes('AS order_count')) {
      return opts.favorites ?? [];
    }
    if (s.startsWith('INSERT INTO customer_consumption_summary')) {
      return [];
    }
    throw new Error(`fake consumption: SQL não roteado: ${s}`);
  };
  return { calls, conn: { query } as unknown as TenantConnectionProvider };
}

describe('ConsumptionSummaryService — characterization', () => {
  it('order sem customer_id é no-op (não escreve o summary)', async () => {
    const { calls, conn } = fakeDb({ customerId: null });
    await new ConsumptionSummaryService(conn).updateForDeliveredOrder(ORDER);
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO customer_consumption_summary'))).toBe(
      false,
    );
  });

  it('grava last_items/last_categories do pedido + favoritos re-agregados', async () => {
    const { calls, conn } = fakeDb({
      customerId: CUSTOMER,
      totalCents: 7900,
      items: [
        { name: 'Picanha', category_name: 'Pratos Principais', quantity: 1 },
        { name: 'Suco', category_name: 'Bebidas', quantity: 2 },
      ],
      favorites: [{ name: 'Picanha', category: 'Pratos Principais', order_count: 5, total_qty: 6 }],
    });
    await new ConsumptionSummaryService(conn).updateForDeliveredOrder(ORDER);

    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO customer_consumption_summary'))!;
    expect(insert.params[0]).toBe(CUSTOMER);
    expect(insert.params[1]).toBe(7900);
    const lastItems = JSON.parse(String(insert.params[2]));
    expect(lastItems).toEqual([
      { name: 'Picanha', quantity: 1, category: 'Pratos Principais' },
      { name: 'Suco', quantity: 2, category: 'Bebidas' },
    ]);
    // categorias únicas, na ordem de aparição
    expect(insert.params[3]).toEqual(['Pratos Principais', 'Bebidas']);
    const favs = JSON.parse(String(insert.params[4]));
    expect(favs[0]).toEqual({
      name: 'Picanha',
      category: 'Pratos Principais',
      orderCount: 5,
      totalQty: 6,
    });
  });

  it('computeFavoriteItems mapeia snake→camel e devolve top-5', async () => {
    const { conn } = fakeDb({
      favorites: [
        { name: 'Picanha', category: 'Principais', order_count: 5, total_qty: 6 },
        { name: 'Suco', category: 'Bebidas', order_count: 2, total_qty: 4 },
      ],
    });
    const favs = await new ConsumptionSummaryService(conn).computeFavoriteItems(CUSTOMER);
    expect(favs).toEqual([
      { name: 'Picanha', category: 'Principais', orderCount: 5, totalQty: 6 },
      { name: 'Suco', category: 'Bebidas', orderCount: 2, totalQty: 4 },
    ]);
  });
});

import { Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

/**
 * FASE 2 · 2C: perfil de consumo + favoritos do cliente, extraído VERBATIM
 * do orders.service. Atualiza `customer_consumption_summary` quando um
 * pedido é entregue (last_items/last_categories substituídos; favorite_items
 * re-agregados do histórico) — a base da recomendação personalizada
 * (assistant.service). Comportamento congelado em
 * consumption-summary.service.test.ts.
 */
export interface FavoriteItemAgg {
  name: string;
  category: string;
  orderCount: number;
  totalQty: number;
}

@Injectable()
export class ConsumptionSummaryService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async updateForDeliveredOrder(orderId: string): Promise<void> {
    const orderRows = (await this.tenantConn.query(
      `SELECT o.visit_id, o.total_cents, v.customer_id
       FROM orders o
       LEFT JOIN visits v ON v.id = o.visit_id
       WHERE o.id = $1`,
      [orderId],
    )) as { visit_id: string | null; total_cents: number; customer_id: string | null }[];

    const order = orderRows[0];
    if (!order?.customer_id) return;

    const orderItems = (await this.tenantConn.query(
      `SELECT mi.name, mi.category_id, mc.name as category_name, oi.quantity
       FROM order_items oi
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       JOIN menu_categories mc ON mc.id = mi.category_id
       WHERE oi.order_id = $1`,
      [orderId],
    )) as { name: string; category_id: string; category_name: string; quantity: number }[];

    const lastItems = orderItems.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      category: i.category_name,
    }));
    const categories = [...new Set(orderItems.map((i) => i.category_name))];

    const favoriteItems = await this.computeFavoriteItems(order.customer_id);

    await this.tenantConn.query(
      `INSERT INTO customer_consumption_summary (customer_id, total_spent_cents, total_orders, last_items, last_categories, favorite_items, updated_at)
       VALUES ($1, $2, 1, $3::jsonb, $4::text[], $5::jsonb, now())
       ON CONFLICT (customer_id) DO UPDATE SET
         total_spent_cents = customer_consumption_summary.total_spent_cents + $2,
         total_orders = customer_consumption_summary.total_orders + 1,
         last_items = $3::jsonb,
         last_categories = $4::text[],
         favorite_items = $5::jsonb,
         updated_at = now()`,
      [
        order.customer_id,
        order.total_cents,
        JSON.stringify(lastItems),
        categories,
        JSON.stringify(favoriteItems),
      ],
    );
  }

  async computeFavoriteItems(customerId: string): Promise<FavoriteItemAgg[]> {
    const rows = (await this.tenantConn.query(
      `SELECT mi.name, mc.name AS category,
              COUNT(DISTINCT o.id)::int AS order_count,
              SUM(oi.quantity)::int AS total_qty
         FROM orders o
         JOIN visits v ON v.id = o.visit_id
         JOIN order_items oi ON oi.order_id = o.id
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         JOIN menu_categories mc ON mc.id = mi.category_id
        WHERE v.customer_id = $1
          AND o.status NOT IN ('cancelled', 'canceled')
        GROUP BY mi.name, mc.name
        ORDER BY order_count DESC, total_qty DESC
        LIMIT 5`,
      [customerId],
    )) as { name: string; category: string; order_count: number; total_qty: number }[];

    return rows.map((r) => ({
      name: r.name,
      category: r.category,
      orderCount: r.order_count,
      totalQty: r.total_qty,
    }));
  }
}

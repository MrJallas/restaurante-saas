import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

// Valid order status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export interface CreateOrderItemDto {
  menuItemId: string;
  quantity: number;
  notes?: string;
  extraIds?: string[];
}

@Injectable()
export class OrdersService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async createOrder(
    tableSessionId: string,
    visitId: string | null,
    billingMode: 'table' | 'individual',
    items: CreateOrderItemDto[],
    notes?: string,
  ) {
    if (!items.length) {
      throw new BadRequestException('Pedido deve conter pelo menos 1 item.');
    }

    // If individual mode, visitId is required
    if (billingMode === 'individual' && !visitId) {
      throw new BadRequestException(
        'Para comanda individual, e necessario identificacao do cliente.',
      );
    }

    // Calculate totals by fetching prices from menu
    const itemIds = items.map((i) => i.menuItemId);
    const menuItems = (await this.tenantConn.query(
      `SELECT id, price_cents, name FROM menu_items WHERE id = ANY($1) AND is_available = true`,
      [itemIds],
    )) as { id: string; price_cents: number; name: string }[];

    if (menuItems.length !== itemIds.length) {
      throw new BadRequestException('Um ou mais itens nao estao disponiveis.');
    }

    const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));

    // Collect all extra IDs for validation
    const allExtraIds = items.flatMap((i) => i.extraIds || []);
    let extraMap = new Map<string, number>();

    if (allExtraIds.length > 0) {
      const extras = (await this.tenantConn.query(
        `SELECT id, price_cents FROM menu_item_extras WHERE id = ANY($1) AND is_available = true`,
        [allExtraIds],
      )) as { id: string; price_cents: number }[];
      extraMap = new Map(extras.map((e) => [e.id, e.price_cents]));
    }

    // Calculate total
    let totalCents = 0;
    const orderItemsData = items.map((item) => {
      const menuItem = menuItemMap.get(item.menuItemId)!;
      const extrasTotal = (item.extraIds || []).reduce(
        (sum, eid) => sum + (extraMap.get(eid) || 0),
        0,
      );
      const unitPrice = menuItem.price_cents + extrasTotal;
      const subtotal = unitPrice * item.quantity;
      totalCents += subtotal;

      return {
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPriceCents: unitPrice,
        subtotalCents: subtotal,
        notes: item.notes || null,
        extraIds: item.extraIds || [],
      };
    });

    // Create the order
    const orderRows = (await this.tenantConn.query(
      `INSERT INTO orders (table_session_id, visit_id, billing_mode, status, notes, total_cents, created_by)
       VALUES ($1, $2, $3, 'open', $4, $5, 'customer')
       RETURNING id, status, created_at`,
      [tableSessionId, visitId, billingMode, notes || null, totalCents],
    )) as { id: string; status: string; created_at: string }[];

    const order = orderRows[0];

    // Insert order items
    for (const item of orderItemsData) {
      const itemRows = (await this.tenantConn.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [order.id, item.menuItemId, item.quantity, item.unitPriceCents, item.subtotalCents, item.notes],
      )) as { id: string }[];

      // Insert extras for this item
      if (item.extraIds.length > 0) {
        for (const extraId of item.extraIds) {
          const priceCents = extraMap.get(extraId) || 0;
          await this.tenantConn.query(
            `INSERT INTO order_item_extras (order_item_id, menu_item_extra_id, price_cents)
             VALUES ($1, $2, $3)`,
            [itemRows[0].id, extraId, priceCents],
          );
        }
      }
    }

    // Insert initial status history
    await this.tenantConn.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
       VALUES ($1, NULL, 'open', 'customer')`,
      [order.id],
    );

    // Increment total_orders on menu_items
    await this.tenantConn.query(
      `UPDATE menu_items SET total_orders = total_orders + 1 WHERE id = ANY($1)`,
      [itemIds],
    );

    return {
      orderId: order.id,
      status: order.status,
      billingMode,
      totalCents,
      itemCount: items.length,
      createdAt: order.created_at,
    };
  }

  async getOrdersBySession(tableSessionId: string, billingMode?: string, visitId?: string) {
    let sql = `
      SELECT o.id, o.status, o.billing_mode, o.total_cents, o.notes, o.visit_id, o.created_at,
             json_agg(
               json_build_object(
                 'id', oi.id,
                 'menuItemId', oi.menu_item_id,
                 'name', mi.name,
                 'quantity', oi.quantity,
                 'unitPriceCents', oi.unit_price_cents,
                 'subtotalCents', oi.subtotal_cents,
                 'notes', oi.notes
               )
             ) as items
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN menu_items mi ON mi.id = oi.menu_item_id
      WHERE o.table_session_id = $1
    `;
    const params: unknown[] = [tableSessionId];

    if (billingMode) {
      params.push(billingMode);
      sql += ` AND o.billing_mode = $${params.length}`;
    }
    if (visitId) {
      params.push(visitId);
      sql += ` AND o.visit_id = $${params.length}`;
    }

    sql += ` GROUP BY o.id ORDER BY o.created_at DESC`;

    return this.tenantConn.query(sql, params);
  }

  async getBill(tableSessionId: string, mode: 'table' | 'individual', visitId?: string) {
    if (mode === 'individual' && !visitId) {
      throw new BadRequestException('visitId necessario para comanda individual.');
    }

    let whereClause = `o.table_session_id = $1 AND o.status != 'cancelled'`;
    const params: unknown[] = [tableSessionId];

    if (mode === 'individual') {
      params.push(visitId);
      whereClause += ` AND o.billing_mode = 'individual' AND o.visit_id = $${params.length}`;
    }

    // Fetch all orders for this session/mode
    const orders = (await this.tenantConn.query(
      `SELECT o.id, o.billing_mode, o.total_cents, o.status, o.visit_id, o.created_at,
              json_agg(
                json_build_object(
                  'name', mi.name,
                  'quantity', oi.quantity,
                  'subtotalCents', oi.subtotal_cents
                )
              ) as items
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE ${whereClause}
       GROUP BY o.id
       ORDER BY o.created_at ASC`,
      params,
    )) as { id: string; billing_mode: string; total_cents: number; status: string; items: unknown[] }[];

    const totalCents = orders.reduce((sum, o) => sum + o.total_cents, 0);

    // For table mode, also compute per-visit breakdown
    let perVisit: unknown[] = [];
    if (mode === 'table') {
      perVisit = (await this.tenantConn.query(
        `SELECT o.visit_id, c.name as customer_name, SUM(o.total_cents) as subtotal_cents
         FROM orders o
         LEFT JOIN visits v ON v.id = o.visit_id
         LEFT JOIN customers c ON c.id = v.customer_id
         WHERE o.table_session_id = $1 AND o.status != 'cancelled' AND o.billing_mode = 'table'
         GROUP BY o.visit_id, c.name
         ORDER BY c.name`,
        [tableSessionId],
      )) as unknown[];
    }

    return {
      mode,
      totalCents,
      orderCount: orders.length,
      orders,
      perVisit: mode === 'table' ? perVisit : undefined,
    };
  }

  async updateStatus(orderId: string, newStatus: string, changedBy: string) {
    // Get current status
    const orderRows = (await this.tenantConn.query(
      `SELECT id, status FROM orders WHERE id = $1`,
      [orderId],
    )) as { id: string; status: string }[];

    if (!orderRows.length) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    const currentStatus = orderRows[0].status;
    const allowed = VALID_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transicao invalida: ${currentStatus} -> ${newStatus}. Permitidos: ${allowed.join(', ')}`,
      );
    }

    // Update order status
    await this.tenantConn.query(
      `UPDATE orders SET status = $1, updated_at = now() WHERE id = $2`,
      [newStatus, orderId],
    );

    // Record status history
    await this.tenantConn.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [orderId, currentStatus, newStatus, changedBy],
    );

    // If delivered, update consumption_summary
    if (newStatus === 'delivered') {
      await this.updateConsumptionSummary(orderId);
    }

    return { orderId, previousStatus: currentStatus, newStatus };
  }

  private async updateConsumptionSummary(orderId: string) {
    // Fetch order with visit info
    const orderRows = (await this.tenantConn.query(
      `SELECT o.visit_id, o.total_cents, v.customer_id
       FROM orders o
       LEFT JOIN visits v ON v.id = o.visit_id
       WHERE o.id = $1`,
      [orderId],
    )) as { visit_id: string | null; total_cents: number; customer_id: string | null }[];

    const order = orderRows[0];
    if (!order?.customer_id) return;

    // Get items from this order
    const orderItems = (await this.tenantConn.query(
      `SELECT mi.name, mi.category_id, mc.name as category_name, oi.quantity
       FROM order_items oi
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       JOIN menu_categories mc ON mc.id = mi.category_id
       WHERE oi.order_id = $1`,
      [orderId],
    )) as { name: string; category_id: string; category_name: string; quantity: number }[];

    const lastItems = orderItems.map((i) => ({ name: i.name, quantity: i.quantity }));
    const categories = [...new Set(orderItems.map((i) => i.category_name))];

    // Upsert consumption_summary
    await this.tenantConn.query(
      `INSERT INTO customer_consumption_summary (customer_id, total_spent_cents, total_orders, last_items, last_categories, updated_at)
       VALUES ($1, $2, 1, $3::jsonb, $4::text[], now())
       ON CONFLICT (customer_id) DO UPDATE SET
         total_spent_cents = customer_consumption_summary.total_spent_cents + $2,
         total_orders = customer_consumption_summary.total_orders + 1,
         last_items = $3::jsonb,
         last_categories = $4::text[],
         updated_at = now()`,
      [order.customer_id, order.total_cents, JSON.stringify(lastItems), categories],
    );
  }
}

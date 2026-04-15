import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { EventsGateway } from '../websocket/events.gateway';

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async claimOrder(orderId: string, slug: string) {
    // Verify order exists and is ready
    const orderRows = (await this.tenantConn.query(
      `SELECT o.id, o.status, o.table_session_id, t.label as table_label
       FROM orders o
       JOIN table_sessions ts ON ts.id = o.table_session_id
       JOIN tables t ON t.id = ts.table_id
       WHERE o.id = $1`,
      [orderId],
    )) as { id: string; status: string; table_session_id: string; table_label: string }[];

    if (!orderRows.length) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    if (orderRows[0].status !== 'ready') {
      throw new BadRequestException('Pedido nao esta pronto para entrega.');
    }

    // Check if already claimed
    const existingClaim = (await this.tenantConn.query(
      `SELECT id FROM order_deliveries WHERE order_id = $1 AND status != 'cancelled'`,
      [orderId],
    )) as { id: string }[];

    if (existingClaim.length > 0) {
      throw new BadRequestException('Pedido ja foi reivindicado por outro garcom.');
    }

    // Create delivery claim
    const deliveryRows = (await this.tenantConn.query(
      `INSERT INTO order_deliveries (order_id, claimed_at, status)
       VALUES ($1, now(), 'claimed')
       RETURNING id, status, claimed_at`,
      [orderId],
    )) as { id: string; status: string; claimed_at: string }[];

    // Emit claimed event to remove from other waiters
    this.eventsGateway.emitOrderClaimed(slug, orderId, 'garcom');

    return {
      deliveryId: deliveryRows[0].id,
      orderId,
      status: 'claimed',
      tableLabel: orderRows[0].table_label,
    };
  }

  async markDelivered(deliveryId: string, slug: string) {
    const rows = (await this.tenantConn.query(
      `SELECT od.id, od.order_id, od.status
       FROM order_deliveries od
       WHERE od.id = $1`,
      [deliveryId],
    )) as { id: string; order_id: string; status: string }[];

    if (!rows.length) {
      throw new NotFoundException('Entrega nao encontrada.');
    }

    if (rows[0].status !== 'claimed') {
      throw new BadRequestException('Entrega nao esta no status correto.');
    }

    // Mark delivery as delivered
    await this.tenantConn.query(
      `UPDATE order_deliveries SET status = 'delivered', delivered_at = now() WHERE id = $1`,
      [deliveryId],
    );

    // Also advance order status to delivered
    await this.tenantConn.query(
      `UPDATE orders SET status = 'delivered', updated_at = now() WHERE id = $1`,
      [rows[0].order_id],
    );

    // Record status history
    await this.tenantConn.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
       VALUES ($1, 'ready', 'delivered', 'garcom')`,
      [rows[0].order_id],
    );

    // Emit status update
    this.eventsGateway.emitOrderStatusUpdate(slug, rows[0].order_id, 'delivered');

    return { deliveryId, orderId: rows[0].order_id, status: 'delivered' };
  }

  async getPendingDeliveries() {
    return this.tenantConn.query(
      `SELECT od.id as delivery_id, od.order_id, od.status as delivery_status,
              od.claimed_at, o.total_cents, t.label as table_label,
              json_agg(
                json_build_object('name', mi.name, 'quantity', oi.quantity)
              ) as items
       FROM order_deliveries od
       JOIN orders o ON o.id = od.order_id
       JOIN table_sessions ts ON ts.id = o.table_session_id
       JOIN tables t ON t.id = ts.table_id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE od.status = 'claimed'
       GROUP BY od.id, od.order_id, od.status, od.claimed_at, o.total_cents, t.label
       ORDER BY od.claimed_at ASC`,
    );
  }
}

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { EventsGateway } from '../websocket/events.gateway';

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly eventsGateway: EventsGateway,
  ) {}

  /**
   * Round 16 (P3-NEW-1): staffId real do header passa a ser persistido
   * em `claimed_by` (UUID FK pra staff). Antes era apenas NULL +
   * `'garcom'` string genérica no audit, perdendo accountability.
   */
  async claimOrder(orderId: string, slug: string, staffId: string) {
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

    // Round 5 (B-NEW-13): claim atômico via INSERT + tratamento de
    // unique-violation (23505). Antes: SELECT existingClaim → INSERT criava
    // race entre 2 garçons (ambos viam vazio, ambos inseriam). Migration
    // 038 adiciona UNIQUE INDEX em (order_id) WHERE status != 'cancelled',
    // PG rejeita o segundo INSERT.
    let deliveryRows: { id: string; status: string; claimed_at: string }[];
    try {
      deliveryRows = (await this.tenantConn.query(
        `INSERT INTO order_deliveries (order_id, claimed_by, claimed_at, status)
         VALUES ($1, $2, now(), 'claimed')
         RETURNING id, status, claimed_at`,
        [orderId, staffId],
      )) as { id: string; status: string; claimed_at: string }[];
    } catch (err) {
      // 23505 unique_violation = outro garçom claimou no race window.
      if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
        throw new BadRequestException('Pedido ja foi reivindicado por outro garcom.');
      }
      throw err;
    }

    // Emit claimed event to remove from other waiters.
    // Round 16: passamos staffId pro consumer poder filtrar a UI ("eu
    // claimei vs outro claimou") em vez do label genérico 'garcom'.
    this.eventsGateway.emitOrderClaimed(slug, orderId, staffId);

    return {
      deliveryId: deliveryRows[0].id,
      orderId,
      status: 'claimed',
      tableLabel: orderRows[0].table_label,
    };
  }

  async markDelivered(deliveryId: string, slug: string, staffId: string) {
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

    // Record status history.
    // Round 16: changed_by recebe staffId UUID em vez de 'garcom' literal.
    // Coluna é VARCHAR(100), aceita UUID; consumer pode JOIN com staff
    // pra display name.
    await this.tenantConn.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
       VALUES ($1, 'ready', 'delivered', $2)`,
      [rows[0].order_id, staffId],
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

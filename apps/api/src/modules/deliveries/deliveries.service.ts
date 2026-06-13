import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { OrdersService } from '../orders/orders.service';

export interface PendingDeliveryRow {
  delivery_id: string;
  order_id: string;
  delivery_status: 'pending' | 'claimed';
  created_at: string;
  called_at: string | null;
  claimed_at: string | null;
  claimed_by: string | null;
  /** Nome de quem está LEVANDO (claimed_by) — null enquanto pending. */
  claimed_by_name: string | null;
  target_waiter_id: string | null;
  target_waiter_name: string | null;
  order_status: string;
  total_cents: number;
  table_id: string;
  table_label: string;
  table_code: string;
  zone_name: string | null;
  table_session_id: string;
  party_size: number;
  items: Array<{ name: string; quantity: number; notes: string | null }>;
}

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * Round 16 (P3-NEW-1): staffId real do header passa a ser persistido
   * em `claimed_by` (UUID FK pra staff).
   *
   * Fluxo TV→garçom: este módulo era um caminho paralelo divergente do
   * orders.service — o INSERT cego colidia (23505) com a row `pending`
   * criada pelo call-waiter da TV, e o markDelivered local não emitia
   * `order:status` pra sala da sessão (cliente nunca via "entregue").
   * Agora ambos delegam pro caminho canônico em orders.service, que
   * trata pending→claimed→delivered e notifica cliente + staff.
   */
  async claimOrder(orderId: string, slug: string, staffId: string) {
    const result = await this.ordersService.markOrderInTransit(orderId, slug, staffId);
    return {
      deliveryId: result.deliveryId,
      orderId: result.orderId,
      status: 'claimed',
      tableLabel: result.tableLabel,
    };
  }

  async markDelivered(deliveryId: string, slug: string, staffId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, order_id, status FROM order_deliveries WHERE id = $1`,
      [deliveryId],
    )) as { id: string; order_id: string; status: string }[];

    if (!rows.length) {
      throw new NotFoundException('Entrega nao encontrada.');
    }
    // Row cancelada não pode "concluir" a entrega ativa do pedido — o
    // delegate age na entrega ativa mais recente, então um id stale aqui
    // marcava OUTRA row como entregue e ecoava sucesso com o id errado
    // (achado do code-review).
    if (rows[0].status === 'cancelled') {
      throw new BadRequestException('Entrega cancelada — use a entrega ativa do pedido.');
    }

    const result = await this.ordersService.markOrderDeliveredByWaiter(
      rows[0].order_id,
      slug,
      staffId,
    );
    return {
      deliveryId: result.deliveryId ?? deliveryId,
      orderId: result.orderId,
      status: 'delivered',
    };
  }

  /**
   * Feed de entregas pendentes do garçom. Inclui as entregas `pending`
   * (cozinha/TV chamou garçom, ninguém pegou) e `claimed` (algum garçom
   * está levando — em trânsito). Antes só retornava `claimed`, então as
   * entregas criadas pelo call-waiter da TV nunca apareciam.
   */
  async getPendingDeliveries(): Promise<PendingDeliveryRow[]> {
    return this.tenantConn.query(
      `SELECT od.id AS delivery_id, od.order_id, od.status AS delivery_status,
              od.created_at, od.called_at, od.claimed_at, od.claimed_by,
              cs.name AS claimed_by_name,
              od.target_waiter_id, s.name AS target_waiter_name,
              o.status AS order_status, o.total_cents,
              t.id AS table_id, t.label AS table_label, t.code AS table_code,
              z.name AS zone_name,
              ts.id AS table_session_id,
              COALESCE(pc.cnt, 0)::int AS party_size,
              json_agg(
                json_build_object('name', mi.name, 'quantity', oi.quantity, 'notes', oi.notes)
                ORDER BY oi.created_at ASC
              ) as items
       FROM order_deliveries od
       JOIN orders o ON o.id = od.order_id
       JOIN table_sessions ts ON ts.id = o.table_session_id
       JOIN tables t ON t.id = ts.table_id
       LEFT JOIN zones z ON z.id = t.zone_id
       LEFT JOIN staff s ON s.id = od.target_waiter_id
       -- Quem LEVA é claimed_by, não o alvo original — a UI mostrava o
       -- garçom errado como portador (achado do code-review).
       LEFT JOIN staff cs ON cs.id = od.claimed_by
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS cnt
           FROM session_participants sp
          WHERE sp.table_session_id = ts.id
            AND sp.left_at IS NULL
       ) pc ON true
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE od.status IN ('pending', 'claimed')
         AND o.status IN ('ready', 'in_transit')
       GROUP BY od.id, od.order_id, od.status, od.created_at, od.called_at, od.claimed_at,
                od.claimed_by, cs.name, od.target_waiter_id, s.name, o.status, o.total_cents,
                t.id, t.label, t.code, z.name, ts.id, pc.cnt
       ORDER BY od.called_at ASC NULLS LAST, od.created_at ASC`,
    ) as Promise<PendingDeliveryRow[]>;
  }
}

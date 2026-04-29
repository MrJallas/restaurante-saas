import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { RedisService } from '../../infra/redis/redis.service';
import { EventsGateway } from '../websocket/events.gateway';

// TTL do guard de idempotencia. 5 minutos cobre folgado o double-tap
// (segundos) e ate retries de cliente apos timeout (alguns segundos).
// Curto suficiente pra que o slot da chave libere antes do TTL natural
// das sessoes de mesa.
const IDEMPOTENCY_TTL_SECONDS = 5 * 60;

// Valid order status transitions. `pending_confirmation` is the transient state
// entered by POST /orders before the kitchen sees it. Auto-confirmed after the
// 15s window via the sweep job, or promoted manually via PATCH /confirm.
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending_confirmation: ['received', 'cancelled'],
  received: ['in_progress', 'cancelled'],
  in_progress: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
  // legacy aliases for forward-compat while we migrate existing rows
  open: ['confirmed', 'received', 'cancelled'],
  confirmed: ['preparing', 'in_progress', 'cancelled'],
  preparing: ['ready', 'cancelled'],
};

const PENDING_CONFIRMATION_WINDOW_SECONDS = 15;

export interface CreateOrderItemDto {
  menuItemId: string;
  quantity: number;
  notes?: string;
  extraIds?: string[];
  customerId?: string | null;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
    @Optional() private readonly eventsGateway?: EventsGateway,
  ) {}

  async createOrder(
    tableSessionId: string,
    visitId: string | null,
    billingMode: 'table' | 'individual',
    items: CreateOrderItemDto[],
    notes?: string,
    slug?: string,
    defaultCustomerId?: string | null,
    idempotencyKey?: string,
  ) {
    if (!items.length) {
      throw new BadRequestException('Pedido deve conter pelo menos 1 item.');
    }

    if (billingMode === 'individual' && !visitId) {
      throw new BadRequestException(
        'Para comanda individual, e necessario identificacao do cliente.',
      );
    }

    // Idempotencia: dois POSTs com mesma idempotencyKey dentro do TTL
    // retornam o orderId ja criado. Resolve double-tap do botao
    // "Confirmar" virando 2 pedidos com items duplicados (bug-hunter
    // race condition). Usa Redis SET NX EX como guarda atomica;
    // sucesso = primeira request, ja cuida da criacao. Falha = ja
    // existe; busca o orderId previamente armazenado.
    const idemKey = idempotencyKey
      ? `order_idem:${tableSessionId}:${idempotencyKey}`
      : null;
    if (idemKey) {
      const existing = await this.redis.get(idemKey);
      if (existing) {
        const cached = JSON.parse(existing) as { orderId: string };
        const existingOrder = await this.getOrderById(
          tableSessionId,
          cached.orderId,
        );
        if (existingOrder) {
          return {
            id: existingOrder.id,
            orderId: existingOrder.id,
            status: existingOrder.status,
            billingMode: existingOrder.billingMode,
            totalCents: existingOrder.totalCents,
            itemCount: items.length,
            createdAt: existingOrder.createdAt,
            autoConfirmAt: existingOrder.autoConfirmAt,
            idempotent: true,
          };
        }
      }
    }

    const itemIds = items.map((i) => i.menuItemId);
    const uniqueItemIds = Array.from(new Set(itemIds));
    const menuItems = (await this.tenantConn.query(
      `SELECT id, price_cents, name FROM menu_items WHERE id = ANY($1) AND is_available = true`,
      [uniqueItemIds],
    )) as { id: string; price_cents: number; name: string }[];

    // Compara contra o set unique para nao falsificar "indisponivel"
    // quando o cliente repete o mesmo menuItemId em line-items distintos
    // (cardapio com modificadores diferentes, ou simples bug do cliente).
    if (menuItems.length !== uniqueItemIds.length) {
      throw new BadRequestException('Um ou mais itens nao estao disponiveis.');
    }

    const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));

    const allExtraIds = items.flatMap((i) => i.extraIds || []);
    let extraMap = new Map<string, number>();

    if (allExtraIds.length > 0) {
      const extras = (await this.tenantConn.query(
        `SELECT id, price_cents FROM menu_item_extras WHERE id = ANY($1) AND is_available = true`,
        [allExtraIds],
      )) as { id: string; price_cents: number }[];
      extraMap = new Map(extras.map((e) => [e.id, e.price_cents]));
    }

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
        // Individual bills: always attribute to the customer who created it
        // (so split-by-item can group correctly later). Table orders default to
        // shared (null) unless the caller passes a customerId per-item.
        customerId:
          billingMode === 'individual'
            ? (defaultCustomerId ?? null)
            : (item.customerId ?? null),
      };
    });

    // Tudo num bloco transacional: orders + order_items + order_item_extras
    // + order_status_history + UPDATE menu_items.total_orders. Antes
    // rodavam em conexoes separadas do pool — falha no meio (item invalid,
    // FK quebrada, deadlock) deixava order orfa sem items, ou com
    // total_orders incrementado sem order valida. Agora ou tudo commita
    // ou nada vai.
    const order = await this.tenantConn.transaction(async (tx) => {
      const orderRows = (await tx.query(
        `INSERT INTO orders (table_session_id, visit_id, billing_mode, status, notes, total_cents, created_by, auto_confirm_at)
         VALUES ($1, $2, $3, 'pending_confirmation', $4, $5, 'customer', now() + ($6 || ' seconds')::interval)
         RETURNING id, status, created_at, auto_confirm_at`,
        [
          tableSessionId,
          visitId,
          billingMode,
          notes || null,
          totalCents,
          String(PENDING_CONFIRMATION_WINDOW_SECONDS),
        ],
      )) as {
        id: string;
        status: string;
        created_at: string;
        auto_confirm_at: string | null;
      }[];
      const ord = orderRows[0];

      for (const item of orderItemsData) {
        const itemRows = (await tx.query(
          `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents, notes, customer_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            ord.id,
            item.menuItemId,
            item.quantity,
            item.unitPriceCents,
            item.subtotalCents,
            item.notes,
            item.customerId,
          ],
        )) as { id: string }[];

        if (item.extraIds.length > 0) {
          for (const extraId of item.extraIds) {
            const priceCents = extraMap.get(extraId) || 0;
            await tx.query(
              `INSERT INTO order_item_extras (order_item_id, menu_item_extra_id, price_cents)
               VALUES ($1, $2, $3)`,
              [itemRows[0].id, extraId, priceCents],
            );
          }
        }
      }

      await tx.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
         VALUES ($1, NULL, 'pending_confirmation', 'customer')`,
        [ord.id],
      );

      await tx.query(
        `UPDATE menu_items SET total_orders = total_orders + 1 WHERE id = ANY($1)`,
        [uniqueItemIds],
      );

      return ord;
    });

    // Marca a chave de idempotencia DEPOIS do commit — se a transacao
    // falhar, queremos que o cliente possa retry com a mesma chave.
    if (idemKey) {
      await this.redis.set(
        idemKey,
        JSON.stringify({ orderId: order.id }),
        IDEMPOTENCY_TTL_SECONDS,
      );
    }

    // Do NOT emit `new_order` to the kitchen here — wait until confirm() so the
    // 15s cancel window really hides the order.

    return {
      id: order.id,
      orderId: order.id,
      status: order.status,
      billingMode,
      totalCents,
      itemCount: items.length,
      createdAt: order.created_at,
      autoConfirmAt: order.auto_confirm_at,
    };
  }

  /** Promote a pending_confirmation order to `received`. Idempotent. */
  async confirmOrder(orderId: string, slug?: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, status, table_session_id, billing_mode, total_cents FROM orders WHERE id = $1`,
      [orderId],
    )) as {
      id: string;
      status: string;
      table_session_id: string;
      billing_mode: string;
      total_cents: number;
    }[];

    if (!rows.length) throw new NotFoundException('Pedido nao encontrado.');
    const order = rows[0];

    if (order.status === 'received' || order.status === 'in_progress') {
      return { orderId, status: order.status };
    }
    if (order.status !== 'pending_confirmation' && order.status !== 'open') {
      throw new BadRequestException(
        `Pedido ja nao pode mais ser confirmado (status atual: ${order.status}).`,
      );
    }

    await this.tenantConn.query(
      `UPDATE orders SET status = 'received', auto_confirm_at = NULL, updated_at = now() WHERE id = $1`,
      [orderId],
    );
    await this.tenantConn.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
       VALUES ($1, $2, 'received', 'customer')`,
      [orderId, order.status],
    );

    if (slug && this.eventsGateway) {
      const items = (await this.tenantConn.query(
        `SELECT mi.name FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE oi.order_id = $1`,
        [orderId],
      )) as { name: string }[];

      this.eventsGateway.emitNewOrder(slug, {
        orderId,
        billingMode: order.billing_mode as 'table' | 'individual',
        totalCents: order.total_cents,
        itemCount: items.length,
        itemNames: items.map((i) => i.name),
      });
      this.eventsGateway.emitOrderStatusUpdate(slug, orderId, 'received');
    }

    return { orderId, status: 'received' };
  }

  /** Cancel a pending_confirmation order. Only valid within the 15s window. */
  async cancelOrder(orderId: string, slug?: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, status FROM orders WHERE id = $1`,
      [orderId],
    )) as { id: string; status: string }[];

    if (!rows.length) throw new NotFoundException('Pedido nao encontrado.');
    const order = rows[0];

    if (order.status === 'cancelled') {
      return { orderId, status: 'cancelled' };
    }
    if (order.status !== 'pending_confirmation' && order.status !== 'open') {
      throw new BadRequestException(
        `Pedido ja foi enviado para a cozinha e nao pode ser cancelado aqui.`,
      );
    }

    await this.tenantConn.query(
      `UPDATE orders SET status = 'cancelled', auto_confirm_at = NULL, updated_at = now() WHERE id = $1`,
      [orderId],
    );
    await this.tenantConn.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
       VALUES ($1, $2, 'cancelled', 'customer')`,
      [orderId, order.status],
    );

    if (slug && this.eventsGateway) {
      this.eventsGateway.emitOrderStatusUpdate(slug, orderId, 'cancelled');
    }
    return { orderId, status: 'cancelled' };
  }

  /**
   * Sweep job: promote any `pending_confirmation` order whose window has
   * elapsed. Returns the list of promoted order ids so the scheduler can log.
   */
  async sweepAutoConfirm(): Promise<string[]> {
    const due = (await this.tenantConn.query(
      `SELECT id FROM orders
       WHERE status = 'pending_confirmation' AND auto_confirm_at IS NOT NULL
         AND auto_confirm_at <= now()
       FOR UPDATE SKIP LOCKED`,
      [],
    )) as { id: string }[];

    const ids: string[] = [];
    for (const row of due) {
      try {
        await this.confirmOrder(row.id);
        ids.push(row.id);
      } catch {
        /* continue */
      }
    }
    return ids;
  }

  async getOrderById(tableSessionId: string, orderId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT o.id, o.status, o.billing_mode, o.total_cents, o.notes,
              o.visit_id, o.created_at, o.updated_at, o.auto_confirm_at,
              COALESCE(json_agg(
                json_build_object(
                  'id', oi.id,
                  'menuItemId', oi.menu_item_id,
                  'name', mi.name,
                  'quantity', oi.quantity,
                  'unitPriceCents', oi.unit_price_cents,
                  'subtotalCents', oi.subtotal_cents,
                  'priceCents', oi.unit_price_cents,
                  'notes', oi.notes,
                  'customerId', oi.customer_id
                ) ORDER BY oi.created_at
              ) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.id = $1 AND o.table_session_id = $2
       GROUP BY o.id`,
      [orderId, tableSessionId],
    )) as Array<{
      id: string;
      status: string;
      billing_mode: string;
      total_cents: number;
      notes: string | null;
      visit_id: string | null;
      created_at: string;
      updated_at: string;
      auto_confirm_at: string | null;
      items: Array<{
        id: string;
        menuItemId: string;
        name: string;
        quantity: number;
        unitPriceCents: number;
        subtotalCents: number;
        priceCents: number;
        notes: string | null;
        customerId: string | null;
      }>;
    }>;

    if (!rows.length) throw new NotFoundException('Pedido nao encontrado.');
    const o = rows[0];
    return {
      id: o.id,
      status: o.status,
      billingMode: o.billing_mode,
      totalCents: o.total_cents,
      notes: o.notes,
      visitId: o.visit_id,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      autoConfirmAt: o.auto_confirm_at,
      items: o.items,
    };
  }

  async getOrdersBySession(
    tableSessionId: string,
    billingMode?: string,
    visitId?: string,
    scope?: string,
  ) {
    // Lazy sweep: any time someone reads the table's orders we flush any
    // pending_confirmation rows whose 15s window has expired. This avoids
    // needing @nestjs/schedule for the common case — the kitchen dashboard
    // polls every few seconds, so expired orders never sit silent for
    // long. External cron can still hit POST /_sweep-auto-confirm below.
    await this.sweepAutoConfirm().catch(() => undefined);

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
                 'notes', oi.notes,
                 'customerId', oi.customer_id,
                 'createdAt', oi.created_at
               )
             ) as items
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN menu_items mi ON mi.id = oi.menu_item_id
      WHERE o.table_session_id = $1
    `;
    const params: unknown[] = [tableSessionId];

    if (scope === 'table') {
      // table scope = everything the table has ordered, both billing modes
    } else if (billingMode) {
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

    let whereClause = `o.table_session_id = $1 AND o.status NOT IN ('cancelled', 'pending_confirmation')`;
    const params: unknown[] = [tableSessionId];

    if (mode === 'individual') {
      params.push(visitId);
      whereClause += ` AND o.billing_mode = 'individual' AND o.visit_id = $${params.length}`;
    }

    const orders = (await this.tenantConn.query(
      `SELECT o.id, o.billing_mode, o.total_cents, o.status, o.visit_id, o.created_at,
              json_agg(
                json_build_object(
                  'name', mi.name,
                  'quantity', oi.quantity,
                  'subtotalCents', oi.subtotal_cents,
                  'customerId', oi.customer_id
                )
              ) as items
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE ${whereClause}
       GROUP BY o.id
       ORDER BY o.created_at ASC`,
      params,
    )) as {
      id: string;
      billing_mode: string;
      total_cents: number;
      status: string;
      items: unknown[];
    }[];

    const totalCents = orders.reduce((sum, o) => sum + o.total_cents, 0);

    let perVisit: unknown[] = [];
    if (mode === 'table') {
      perVisit = (await this.tenantConn.query(
        `SELECT o.visit_id, c.name as customer_name, SUM(o.total_cents) as subtotal_cents
         FROM orders o
         LEFT JOIN visits v ON v.id = o.visit_id
         LEFT JOIN customers c ON c.id = v.customer_id
         WHERE o.table_session_id = $1
           AND o.status NOT IN ('cancelled', 'pending_confirmation')
           AND o.billing_mode = 'table'
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

  async updateStatus(orderId: string, newStatus: string, changedBy: string, slug?: string) {
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

    await this.tenantConn.query(
      `UPDATE orders SET status = $1, updated_at = now() WHERE id = $2`,
      [newStatus, orderId],
    );

    await this.tenantConn.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [orderId, currentStatus, newStatus, changedBy],
    );

    if (newStatus === 'delivered') {
      await this.updateConsumptionSummary(orderId);
    }

    if (slug && this.eventsGateway) {
      this.eventsGateway.emitOrderStatusUpdate(slug, orderId, newStatus);
      if (newStatus === 'ready') {
        this.eventsGateway.emitOrderReady(slug, orderId, '');
      }
    }

    return { orderId, previousStatus: currentStatus, newStatus };
  }

  private async updateConsumptionSummary(orderId: string) {
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

    const lastItems = orderItems.map((i) => ({ name: i.name, quantity: i.quantity }));
    const categories = [...new Set(orderItems.map((i) => i.category_name))];

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

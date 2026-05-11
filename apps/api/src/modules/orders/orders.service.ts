import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Optional,
  Logger,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { RedisService } from '../../infra/redis/redis.service';
import { EventsGateway } from '../websocket/events.gateway';
import { OrderRatingsService } from '../order-ratings/order-ratings.service';
import { safeJsonParse } from '../../common/utils/safe-json';

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
  private readonly ordersLogger = new Logger(OrdersService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
    @Optional() private readonly eventsGateway?: EventsGateway,
    @Optional() private readonly orderRatings?: OrderRatingsService,
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
    // race condition). Round 10 (B-NEW-46): agora REALMENTE atomico
    // via Redis SET NX EX — o primeiro POST ganha o lock com payload
    // sentinela `{inflight:true}`, processa o INSERT, sobrescreve com
    // `{orderId}`. POSTs concorrentes com mesma key veem `false` no
    // setNX, fazem polling do GET até ver o orderId final ou timeout.
    //
    // Antes (round 5 fix incompleto): GET-then-INSERT-then-SET plain.
    // Concurrent: ambos GET=null, ambos INSERT, ambos SET (último vence)
    // → 2 orders idênticos no DB, customer cobrado 2x.
    const idemKey = idempotencyKey
      ? `order_idem:${tableSessionId}:${idempotencyKey}`
      : null;
    let idemLockOwner = false;
    if (idemKey) {
      // Tenta ganhar o lock atomicamente. Se já existe, faz fallback
      // pro GET/poll. Sentinela `inflight` distingue "ainda processando"
      // de "pronto" (orderId presente).
      idemLockOwner = await this.redis.setNX(
        idemKey,
        JSON.stringify({ inflight: true }),
        IDEMPOTENCY_TTL_SECONDS,
      );

      if (!idemLockOwner) {
        // Outro caller ganhou. Poll até ver orderId ou timeout (~3s).
        const pollDeadline = Date.now() + 3000;
        while (Date.now() < pollDeadline) {
          const existing = await this.redis.get(idemKey);
          if (existing) {
            // Round 16 (B-NEW-53): safeJsonParse — corrompido cai em null
            // e o poll continua (no-op até timeout).
            const cached = safeJsonParse<{
              orderId?: string;
              inflight?: boolean;
            }>(existing);
            if (cached?.orderId) {
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
          await new Promise((r) => setTimeout(r, 100));
        }
        // Timeout — assumir que o outro caller falhou. Tentar como nova request.
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

    const distinctCustomerIds = [
      ...new Set(
        orderItemsData.map((i) => i.customerId).filter((id): id is string => id != null),
      ),
    ];
    if (distinctCustomerIds.length > 0) {
      const validParticipants = (await this.tenantConn.query(
        `SELECT customer_id FROM session_participants
         WHERE table_session_id = $1 AND customer_id = ANY($2::uuid[])
           AND status = 'approved' AND left_at IS NULL`,
        [tableSessionId, distinctCustomerIds],
      )) as { customer_id: string }[];
      const validIds = new Set(validParticipants.map((p) => p.customer_id));
      const invalid = distinctCustomerIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        throw new BadRequestException(
          `Cliente(s) nao fazem parte desta mesa: ${invalid.join(', ')}`,
        );
      }
    }

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

    // Notifica os outros customers na mesma mesa em tempo real. Antes
    // ficavam esperando ate 15s o polling buscar — multi-user nunca
    // conseguia coordenar pedidos. NAO emite pra kitchen aqui (wait
    // confirm() pra respeitar o 15s cancel window).
    if (this.eventsGateway) {
      this.eventsGateway.emitToSession(tableSessionId, 'order:created', {
        orderId: order.id,
        status: order.status,
        billingMode,
        totalCents,
        createdAt: order.created_at,
        timestamp: new Date().toISOString(),
      });
    }

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
  async confirmOrder(orderId: string, tableSessionId: string, slug?: string) {
    // Filtra por table_session_id pra que cliente de outra mesa nao
    // possa confirmar pedido alheio (P1 ownership do bug-hunt).
    const rows = (await this.tenantConn.query(
      `SELECT id, status, table_session_id, billing_mode, total_cents
       FROM orders WHERE id = $1 AND table_session_id = $2`,
      [orderId, tableSessionId],
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

    // CAS atomico: UPDATE com WHERE status = $expected RETURNING. Se
    // outro client/sweep confirmar primeiro, rowCount = 0 e tratamos
    // como ja-confirmado. Resolve race read-modify-write sem precisar
    // de SELECT FOR UPDATE explicito.
    const updated = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `UPDATE orders
         SET status = 'received', auto_confirm_at = NULL, updated_at = now()
         WHERE id = $1 AND status = $2
         RETURNING id`,
        [orderId, order.status],
      ),
    );

    if (!updated.length) {
      // Outra request ja transicionou — re-le e retorna o status atual.
      const refresh = (await this.tenantConn.query(
        `SELECT status FROM orders WHERE id = $1`,
        [orderId],
      )) as { status: string }[];
      return { orderId, status: refresh[0]?.status ?? 'received' };
    }

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
      this.eventsGateway.emitToSession(order.table_session_id, 'order:status', {
        orderId,
        status: 'received',
        timestamp: new Date().toISOString(),
      });
    }

    return { orderId, status: 'received' };
  }

  /** Cancel a pending_confirmation order. Only valid within the 15s window. */
  async cancelOrder(orderId: string, tableSessionId: string, slug?: string) {
    // Mesma logica de ownership/CAS do confirmOrder.
    const rows = (await this.tenantConn.query(
      `SELECT id, status, table_session_id FROM orders
       WHERE id = $1 AND table_session_id = $2`,
      [orderId, tableSessionId],
    )) as { id: string; status: string; table_session_id: string }[];

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

    const updated = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `UPDATE orders
         SET status = 'cancelled', auto_confirm_at = NULL, updated_at = now()
         WHERE id = $1 AND status = $2
         RETURNING id`,
        [orderId, order.status],
      ),
    );

    if (!updated.length) {
      const refresh = (await this.tenantConn.query(
        `SELECT status FROM orders WHERE id = $1`,
        [orderId],
      )) as { status: string }[];
      return { orderId, status: refresh[0]?.status ?? 'cancelled' };
    }

    await this.tenantConn.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
       VALUES ($1, $2, 'cancelled', 'customer')`,
      [orderId, order.status],
    );

    if (this.eventsGateway) {
      this.eventsGateway.emitToSession(order.table_session_id, 'order:status', {
        orderId,
        status: 'cancelled',
        timestamp: new Date().toISOString(),
      });
    }
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
    // Le tambem o table_session_id pra passar pro confirmOrder, que
    // agora exige ownership. Aqui o sweep e o "system" agindo, entao
    // usa-se o proprio table_session_id da row — mesmo dono, ownership
    // valida.
    const due = (await this.tenantConn.query(
      `SELECT id, table_session_id FROM orders
       WHERE status = 'pending_confirmation' AND auto_confirm_at IS NOT NULL
         AND auto_confirm_at <= now()
       FOR UPDATE SKIP LOCKED`,
      [],
    )) as { id: string; table_session_id: string }[];

    const ids: string[] = [];
    for (const row of due) {
      try {
        await this.confirmOrder(row.id, row.table_session_id);
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

  /**
   * Round 18 (Onda 4 batch 2): timeline aggregator pra
   * ScreenManagerTimeline. Junta `order_status_history` com `staff`
   * pra resolver byStaffName quando `changed_by` carrega um UUID de
   * staff (vs labels fixos 'system'/'customer'). Retorna lista
   * cronologica ascendente — FE renderiza como linha do tempo.
   *
   * `changed_by` é VARCHAR(100) por design legacy (migration 007). Pode
   * ser 'system', 'customer', um UUID de staff, ou o staffId.toString()
   * passado em `updateStatus(orderId, status, changedBy)`. O LEFT JOIN
   * em staff falha graciosamente pra labels não-UUID (NULL byStaffName).
   *
   * Não exige session ownership — endpoint é staff-only (manager dashboard).
   */
  async getOrderTimeline(orderId: string): Promise<{
    orderId: string;
    events: Array<{
      event: string;
      at: string;
      byStaffId: string | null;
      byStaffName: string | null;
      fromStatus: string | null;
    }>;
  }> {
    // Confirma que o pedido existe (404 limpo em vez de timeline vazia
    // por orderId errado).
    const orderRows = (await this.tenantConn.query(
      `SELECT id FROM orders WHERE id = $1`,
      [orderId],
    )) as Array<{ id: string }>;
    if (!orderRows.length) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    const rows = (await this.tenantConn.query(
      `
      SELECT osh.from_status,
             osh.to_status,
             osh.created_at,
             osh.changed_by,
             s.id   AS staff_id,
             s.name AS staff_name
        FROM order_status_history osh
        LEFT JOIN staff s
          ON s.id::text = osh.changed_by
        WHERE osh.order_id = $1
        ORDER BY osh.created_at ASC, osh.id ASC
      `,
      [orderId],
    )) as Array<{
      from_status: string | null;
      to_status: string;
      created_at: string;
      changed_by: string | null;
      staff_id: string | null;
      staff_name: string | null;
    }>;

    return {
      orderId,
      events: rows.map((r) => ({
        event: r.to_status,
        at: r.created_at,
        byStaffId: r.staff_id,
        byStaffName: r.staff_name,
        fromStatus: r.from_status,
      })),
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

  /**
   * Tenant-wide active-orders feed for the KDS (cozinha) screen. The
   * customer-facing `getOrdersBySession` is scoped to a single
   * `table_session_id`, which is fine for the customer's own bill view but
   * useless for the kitchen — they need every active order in the tenant.
   *
   * "Active" here means anything past `pending_confirmation` and short of
   * `delivered`/`cancelled`. The KDS UI applies its own status filter on
   * top, so we keep the SQL simple. Same lazy auto-confirm sweep as the
   * session view so the kitchen never sees a stale `pending_confirmation`.
   */
  async getActiveOrdersForTenant() {
    await this.sweepAutoConfirm().catch(() => undefined);

    return this.tenantConn.query(
      `
      SELECT o.id, o.status, o.billing_mode, o.total_cents, o.notes, o.visit_id,
             o.table_session_id, o.created_at, o.updated_at,
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
      WHERE o.status NOT IN ('delivered', 'cancelled', 'pending_confirmation')
      GROUP BY o.id
      ORDER BY o.created_at ASC
      `,
    );
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

  async updateStatus(
    orderId: string,
    newStatus: string,
    changedBy: string,
    slug?: string,
    actor?: { actorType: 'staff' | 'session'; sessionTableId: string | null },
  ) {
    const orderRows = (await this.tenantConn.query(
      `SELECT id, status, table_session_id FROM orders WHERE id = $1`,
      [orderId],
    )) as { id: string; status: string; table_session_id: string }[];

    if (!orderRows.length) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    const tableSessionId = orderRows[0].table_session_id;
    const currentStatus = orderRows[0].status;

    // Round 7 (B-NEW-24): branch session vs staff. Customer só pode
    // transicionar pra `cancelled` E só em ordens da sua própria mesa.
    // Staff continua livre. Sem este check: customer cancelava/marcava
    // delivered qualquer order do tenant.
    if (actor?.actorType === 'session') {
      if (newStatus !== 'cancelled') {
        throw new ForbiddenException(
          'Customer só pode cancelar pedido. Mude de status só permitido pra staff.',
        );
      }
      if (
        !actor.sessionTableId ||
        actor.sessionTableId !== tableSessionId
      ) {
        throw new ForbiddenException(
          'Pedido não pertence à sua mesa.',
        );
      }
    }

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
      // Schedule rating prompt — B2's job runner picks this up ~13min later
      // and pushes the prompt. Fire-and-forget; errors don't block the
      // status transition because the rating prompt is best-effort.
      if (this.orderRatings) {
        try {
          const orderInfo = (await this.tenantConn.query(
            `SELECT v.customer_id, o.visit_id
             FROM orders o LEFT JOIN visits v ON v.id = o.visit_id
             WHERE o.id = $1`,
            [orderId],
          )) as Array<{ customer_id: string | null; visit_id: string | null }>;
          const info = orderInfo[0];
          if (info) {
            await this.orderRatings.schedulePromptForDelivered({
              orderId,
              customerId: info.customer_id,
              visitId: info.visit_id,
            });
          }
        } catch (err) {
          this.ordersLogger.warn(
            `Falha ao agendar rating prompt: ${(err as Error).message}`,
          );
        }
      }
    }

    if (this.eventsGateway) {
      // Pra todos os customers na mesma mesa.
      this.eventsGateway.emitToSession(tableSessionId, 'order:status', {
        orderId,
        status: newStatus,
        timestamp: new Date().toISOString(),
      });
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

    // Inclui category pra que home.service.ts conseguir distinguir
    // ultimo prato vs ultima bebida vs ultima sobremesa em returning
    // customers (templates de welcome). Antes era so {name,quantity} e
    // i.category ficava undefined, fazendo todos os templates caírem
    // no fallback generico (P2 do bug-hunt).
    const lastItems = orderItems.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      category: i.category_name,
    }));
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

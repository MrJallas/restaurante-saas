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
  ready: ['in_transit', 'delivered', 'cancelled'],
  in_transit: ['delivered', 'cancelled'],
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

export interface KitchenQueueItem {
  id: string;
  status: string;
  billing_mode: string;
  total_cents: number;
  notes: string | null;
  visit_id: string | null;
  table_session_id: string;
  table_label: string;
  table_number: number;
  created_at: string;
  updated_at: string;
  wait_minutes: number;
  meta_minutes: number;
  priority_rank: string;
  priority_reason: string | null;
  priority_requested_by: string | null;
  priority_updated_at: string | null;
  delivery_id: string | null;
  delivery_status: string | null;
  delivery_called_at: string | null;
  delivery_claimed_at: string | null;
  delivery_target_waiter_id: string | null;
  delivery_target_waiter_name: string | null;
  items: unknown[];
}

export interface KitchenReorderRequestSummary {
  id: string;
  order_ids: string[];
  reason: string | null;
  requested_by_staff_id: string | null;
  requested_by_name: string | null;
  status: 'pending' | 'accepted' | 'next' | 'cancelled';
  response: 'accept' | 'next' | null;
  protected_order_ids: string[];
  response_note: string | null;
  created_at: string;
  responded_at: string | null;
  orders: KitchenQueueItem[];
}

export interface OrderTimelineEvent {
  event: string;
  at: string;
  byStaffId: string | null;
  byStaffName: string | null;
  fromStatus: string | null;
}

export interface OrderTimelineResponse {
  orderId: string;
  tableNumber?: number | null;
  tableLabel?: string | null;
  totalCents?: number | null;
  currentStatus?: string | null;
  assignedStaffName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  events: OrderTimelineEvent[];
}

type QueryExecutor = {
  query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORDER_NOT_FOUND_RESPONSE = {
  message: 'Pedido não encontrado.',
  message_user: 'Pedido não encontrado.',
  code: 'ORDER_NOT_FOUND',
};

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
    const idemKey = idempotencyKey ? `order_idem:${tableSessionId}:${idempotencyKey}` : null;
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
              const existingOrder = await this.getOrderById(tableSessionId, cached.orderId);
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

    let effectiveDefaultCustomerId = defaultCustomerId ?? null;
    if (!effectiveDefaultCustomerId && visitId) {
      const visitRows = (await this.tenantConn.query(
        `SELECT customer_id
           FROM visits
          WHERE id = $1
            AND table_session_id = $2
          LIMIT 1`,
        [visitId, tableSessionId],
      )) as Array<{ customer_id: string | null }>;
      effectiveDefaultCustomerId = visitRows[0]?.customer_id ?? null;
    }

    if (billingMode === 'individual' && !effectiveDefaultCustomerId) {
      throw new BadRequestException(
        'Nao foi possivel identificar o cliente desta comanda individual.',
      );
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
          billingMode === 'individual' ? effectiveDefaultCustomerId : (item.customerId ?? null),
      };
    });

    const distinctCustomerIds = [
      ...new Set(orderItemsData.map((i) => i.customerId).filter((id): id is string => id != null)),
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
        throw new BadRequestException({
          message: `Cliente(s) nao fazem parte desta mesa: ${invalid.join(', ')}`,
          message_user:
            'Sua entrada nesta mesa ainda nao esta aprovada. Volte para a tela da mesa ou peca ajuda ao garcom.',
          error_code: 'CUSTOMER_NOT_APPROVED_FOR_TABLE',
        });
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

      await tx.query(`UPDATE menu_items SET total_orders = total_orders + 1 WHERE id = ANY($1)`, [
        uniqueItemIds,
      ]);

      return ord;
    });

    // Marca a chave de idempotencia DEPOIS do commit — se a transacao
    // falhar, queremos que o cliente possa retry com a mesma chave.
    if (idemKey) {
      await this.redis.set(idemKey, JSON.stringify({ orderId: order.id }), IDEMPOTENCY_TTL_SECONDS);
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

  async createStaffDirectOrder(input: {
    tableRef: string;
    billingMode: 'table' | 'individual';
    items: CreateOrderItemDto[];
    notes?: string;
    slug?: string;
    staffId: string;
  }) {
    if (input.billingMode !== 'table') {
      throw new BadRequestException('Pedido direto do garçom usa comanda da mesa.');
    }
    if (!input.items.length) {
      throw new BadRequestException('Pedido deve conter pelo menos 1 item.');
    }

    const staffRows = (await this.tenantConn.query(
      `SELECT id, role, name FROM staff WHERE id = $1 AND is_active = true`,
      [input.staffId],
    )) as Array<{ id: string; role: string; name: string }>;
    const staff = staffRows[0];
    if (!staff) {
      throw new ForbiddenException('Sessão de equipe inválida.');
    }
    if (staff.role !== 'waiter' && staff.role !== 'manager') {
      throw new ForbiddenException('Apenas garçom pode lançar pedido direto.');
    }

    const session = await this.resolveActiveTableSession(input.tableRef);

    const itemIds = input.items.map((i) => i.menuItemId);
    const uniqueItemIds = Array.from(new Set(itemIds));
    const menuItems = (await this.tenantConn.query(
      `SELECT id, price_cents, name FROM menu_items WHERE id = ANY($1) AND is_available = true`,
      [uniqueItemIds],
    )) as { id: string; price_cents: number; name: string }[];

    if (menuItems.length !== uniqueItemIds.length) {
      throw new BadRequestException('Um ou mais itens nao estao disponiveis.');
    }

    const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));
    const allExtraIds = input.items.flatMap((i) => i.extraIds || []);
    let extraMap = new Map<string, number>();

    if (allExtraIds.length > 0) {
      const extras = (await this.tenantConn.query(
        `SELECT id, price_cents FROM menu_item_extras WHERE id = ANY($1) AND is_available = true`,
        [allExtraIds],
      )) as { id: string; price_cents: number }[];
      extraMap = new Map(extras.map((e) => [e.id, e.price_cents]));
    }

    let totalCents = 0;
    const orderItemsData = input.items.map((item) => {
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

    const order = await this.tenantConn.transaction(async (tx) => {
      const orderRows = (await tx.query(
        `INSERT INTO orders (table_session_id, visit_id, billing_mode, status, notes, total_cents, created_by, auto_confirm_at)
         VALUES ($1, NULL, 'table', 'received', $2, $3, $4, NULL)
         RETURNING id, status, created_at, updated_at`,
        [session.id, input.notes || null, totalCents, input.staffId],
      )) as Array<{
        id: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>;
      const ord = orderRows[0];

      for (const item of orderItemsData) {
        const itemRows = (await tx.query(
          `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents, notes, customer_id)
           VALUES ($1, $2, $3, $4, $5, $6, NULL)
           RETURNING id`,
          [
            ord.id,
            item.menuItemId,
            item.quantity,
            item.unitPriceCents,
            item.subtotalCents,
            item.notes,
          ],
        )) as { id: string }[];

        for (const extraId of item.extraIds) {
          const priceCents = extraMap.get(extraId) || 0;
          await tx.query(
            `INSERT INTO order_item_extras (order_item_id, menu_item_extra_id, price_cents)
             VALUES ($1, $2, $3)`,
            [itemRows[0].id, extraId, priceCents],
          );
        }
      }

      await tx.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
         VALUES ($1, NULL, 'received', $2)`,
        [ord.id, input.staffId],
      );

      await tx.query(`UPDATE menu_items SET total_orders = total_orders + 1 WHERE id = ANY($1)`, [
        uniqueItemIds,
      ]);

      return ord;
    });

    if (this.eventsGateway) {
      this.eventsGateway.emitToSession(session.id, 'order:created', {
        orderId: order.id,
        status: order.status,
        billingMode: 'table',
        totalCents,
        createdAt: order.created_at,
        timestamp: new Date().toISOString(),
      });
    }

    if (input.slug && this.eventsGateway) {
      this.eventsGateway.emitNewOrder(input.slug, {
        orderId: order.id,
        billingMode: 'table',
        totalCents,
        itemCount: input.items.length,
        itemNames: input.items.map((i) => menuItemMap.get(i.menuItemId)?.name ?? 'Item'),
      });
      this.eventsGateway.emitOrderStatusUpdate(input.slug, order.id, 'received');
    }

    return {
      id: order.id,
      orderId: order.id,
      status: order.status,
      billingMode: 'table',
      totalCents,
      itemCount: input.items.length,
      tableSessionId: session.id,
      tableCode: session.table_code,
      tableLabel: session.table_label,
      createdAt: order.created_at,
    };
  }

  private async resolveActiveTableSession(tableRef: string): Promise<{
    id: string;
    table_code: string;
    table_label: string;
  }> {
    const ref = tableRef.trim();
    if (!ref) {
      throw new BadRequestException('Mesa obrigatoria.');
    }
    const isUuid = /^[0-9a-f-]{36}$/i.test(ref);
    const numeric = /^\d+$/.test(ref) ? Number(ref) : null;

    const params: unknown[] = [ref];
    let where = `ts.id::text = $1 OR t.code = $1 OR t.label = $1`;
    if (isUuid) {
      where = `ts.id = $1::uuid OR t.id = $1::uuid OR t.code = $1::text OR t.label = $1::text`;
    }
    if (numeric !== null) {
      params.push(numeric);
      where += ` OR CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) = $2
                 OR CAST(NULLIF(regexp_replace(t.label, '[^0-9]', '', 'g'), '') AS INT) = $2`;
    }

    const rows = (await this.tenantConn.query(
      `
      SELECT ts.id, t.code AS table_code, t.label AS table_label
        FROM table_sessions ts
        JOIN tables t ON t.id = ts.table_id
       WHERE (${where})
         AND ts.status = 'active'
         AND ts.closed_at IS NULL
       ORDER BY ts.created_at DESC
       LIMIT 1
      `,
      params,
    )) as Array<{ id: string; table_code: string; table_label: string }>;

    if (!rows.length) {
      throw new NotFoundException('Mesa ativa nao encontrada.');
    }
    return rows[0];
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
      const refresh = (await this.tenantConn.query(`SELECT status FROM orders WHERE id = $1`, [
        orderId,
      ])) as { status: string }[];
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
      const refresh = (await this.tenantConn.query(`SELECT status FROM orders WHERE id = $1`, [
        orderId,
      ])) as { status: string }[];
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
   * Não exige session ownership porque o controller protege a rota com
   * StaffOnlyGuard + ManagerOnlyGuard.
   */
  async getOrderTimeline(orderId: string): Promise<OrderTimelineResponse> {
    // Confirma que o pedido existe com 404 estruturado. O check de UUID evita
    // vazar `invalid input syntax for type uuid` para a UI.
    if (!UUID_RE.test(orderId)) {
      throw new NotFoundException(ORDER_NOT_FOUND_RESPONSE);
    }

    const orderRows = (await this.tenantConn.query(
      `
      SELECT o.id,
             o.status,
             o.total_cents,
             o.created_at,
             o.updated_at,
             t.label AS table_label,
             COALESCE(
               CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT),
               CAST(NULLIF(regexp_replace(t.label, '[^0-9]', '', 'g'), '') AS INT)
             ) AS table_number,
             COALESCE(
               delivery.target_waiter_name,
               delivery.claimed_by_name,
               last_staff.staff_name,
               created_staff.name
             ) AS assigned_staff_name
        FROM orders o
        JOIN table_sessions ts ON ts.id = o.table_session_id
        JOIN tables t ON t.id = ts.table_id
        LEFT JOIN staff created_staff
          ON created_staff.id::text = o.created_by
        LEFT JOIN LATERAL (
          SELECT target_staff.name AS target_waiter_name,
                 claimed_staff.name AS claimed_by_name
            FROM order_deliveries od
            LEFT JOIN staff target_staff ON target_staff.id = od.target_waiter_id
            LEFT JOIN staff claimed_staff ON claimed_staff.id = od.claimed_by
           WHERE od.order_id = o.id
             AND od.status != 'cancelled'
           ORDER BY od.created_at DESC, od.id DESC
           LIMIT 1
        ) delivery ON true
        LEFT JOIN LATERAL (
          SELECT s.name AS staff_name
            FROM order_status_history osh
            JOIN staff s ON s.id::text = osh.changed_by
           WHERE osh.order_id = o.id
           ORDER BY osh.created_at DESC, osh.id DESC
           LIMIT 1
        ) last_staff ON true
       WHERE o.id = $1
      `,
      [orderId],
    )) as Array<{
      id: string;
      status: string;
      total_cents: number;
      created_at: string;
      updated_at: string;
      table_label: string | null;
      table_number: number | null;
      assigned_staff_name: string | null;
    }>;
    if (!orderRows.length) {
      throw new NotFoundException(ORDER_NOT_FOUND_RESPONSE);
    }
    const order = orderRows[0];

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
      tableNumber: order.table_number,
      tableLabel: order.table_label,
      totalCents: order.total_cents,
      currentStatus: order.status,
      assignedStaffName: order.assigned_staff_name,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
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
             o.priority_rank, o.priority_reason, o.priority_requested_by,
             o.priority_updated_at, t.label AS table_label,
             delivery.id AS delivery_id,
             delivery.status AS delivery_status,
             delivery.called_at AS delivery_called_at,
             delivery.claimed_at AS delivery_claimed_at,
             delivery.target_waiter_id AS delivery_target_waiter_id,
             delivery.target_waiter_name AS delivery_target_waiter_name,
             CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) AS table_number,
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
      JOIN table_sessions ts ON ts.id = o.table_session_id
      JOIN tables t ON t.id = ts.table_id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN LATERAL (
        SELECT od.id, od.status, od.called_at, od.claimed_at,
               od.target_waiter_id, s.name AS target_waiter_name
          FROM order_deliveries od
          LEFT JOIN staff s ON s.id = od.target_waiter_id
         WHERE od.order_id = o.id
           AND od.status != 'cancelled'
         ORDER BY od.created_at DESC
         LIMIT 1
      ) delivery ON true
      WHERE o.status NOT IN ('delivered', 'cancelled', 'pending_confirmation')
      GROUP BY o.id, t.label, t.code, delivery.id, delivery.status,
               delivery.called_at, delivery.claimed_at,
               delivery.target_waiter_id, delivery.target_waiter_name
      ORDER BY o.priority_rank DESC, o.created_at ASC
      `,
    );
  }

  /**
   * Feed das TVs de cozinha e bar. Diferente da fila operacional principal,
   * este endpoint separa os itens por estação usando a categoria do cardápio.
   * Pedidos prontos continuam visíveis até alguém chamar o garçom; depois a
   * entrega ativa remove o pedido da TV para evitar chamada duplicada.
   */
  async getActiveOrdersForKds(station: 'kitchen' | 'bar') {
    await this.sweepAutoConfirm().catch(() => undefined);

    const normalizedCategoryName = 'LOWER(TRIM(mc.name))';
    const itemPredicate =
      station === 'bar'
        ? `${normalizedCategoryName} = 'bebidas'`
        : `${normalizedCategoryName} <> 'bebidas'`;

    return this.tenantConn.query(
      `
      SELECT
        o.id,
        o.status,
        o.total_cents,
        o.notes,
        o.visit_id,
        o.created_at,
        o.updated_at,
        t.label AS table_label,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'menuItemId', oi.menu_item_id,
              'name', mi.name,
              'quantity', oi.quantity,
              'notes', oi.notes,
              'categoryName', mc.name
            )
            ORDER BY oi.created_at ASC
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'
        ) AS items
      FROM orders o
      JOIN table_sessions ts ON ts.id = o.table_session_id
      JOIN tables t ON t.id = ts.table_id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN menu_items mi ON mi.id = oi.menu_item_id
      JOIN menu_categories mc ON mc.id = mi.category_id
      LEFT JOIN LATERAL (
        SELECT od.status
          FROM order_deliveries od
         WHERE od.order_id = o.id
           AND od.status != 'cancelled'
         ORDER BY od.created_at DESC
         LIMIT 1
      ) delivery ON true
      WHERE o.status NOT IN ('delivered', 'cancelled', 'pending_confirmation', 'in_transit')
        AND (ts.status = 'active' OR o.status IN ('in_progress', 'ready'))
        AND o.created_at > now() - interval '8 hours'
        AND o.created_at <= now()
        AND ${itemPredicate}
        AND (
          o.status != 'ready'
          -- Pronto continua na TV até chamarem o garçom; entrega ativa
          -- (pending/claimed) tira do feed pra evitar chamada duplicada.
          -- COALESCE: sem row de entrega o predicado antigo virava NULL e
          -- o WHERE descartava TODO pedido ready sem delivery — a coluna
          -- "Prontos" da TV ficava sempre vazia com dados reais (achado
          -- do E2E tv-delivery-flow). Os statuses reais de order_deliveries
          -- são pending/claimed/delivered/cancelled — 'called'/'in_transit'
          -- do filtro antigo nunca existiram.
          OR COALESCE(delivery.status, '') NOT IN ('pending', 'claimed')
        )
      GROUP BY o.id, t.label, delivery.status
      ORDER BY o.created_at ASC
      LIMIT 100
      `,
    );
  }

  async getKitchenQueue(): Promise<KitchenQueueItem[]> {
    await this.sweepAutoConfirm().catch(() => undefined);

    return this.tenantConn.query(
      `
      SELECT o.id, o.status, o.billing_mode, o.total_cents, o.notes, o.visit_id,
             o.table_session_id, o.created_at, o.updated_at,
             EXTRACT(EPOCH FROM (now() - o.created_at))::int / 60 AS wait_minutes,
             12 AS meta_minutes,
             o.priority_rank::text AS priority_rank,
             o.priority_reason,
             o.priority_requested_by,
             o.priority_updated_at,
             delivery.id AS delivery_id,
             delivery.status AS delivery_status,
             delivery.called_at AS delivery_called_at,
             delivery.claimed_at AS delivery_claimed_at,
             delivery.target_waiter_id AS delivery_target_waiter_id,
             delivery.target_waiter_name AS delivery_target_waiter_name,
             t.label AS table_label,
             COALESCE(
               CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT),
               CAST(NULLIF(regexp_replace(t.label, '[^0-9]', '', 'g'), '') AS INT),
               0
             ) AS table_number,
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
               ORDER BY oi.created_at ASC
             ) AS items
      FROM orders o
      JOIN table_sessions ts ON ts.id = o.table_session_id
      JOIN tables t ON t.id = ts.table_id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN LATERAL (
        SELECT od.id, od.status, od.called_at, od.claimed_at,
               od.target_waiter_id, s.name AS target_waiter_name
          FROM order_deliveries od
          LEFT JOIN staff s ON s.id = od.target_waiter_id
         WHERE od.order_id = o.id
           AND od.status != 'cancelled'
         ORDER BY od.created_at DESC
         LIMIT 1
      ) delivery ON true
      WHERE o.status NOT IN ('delivered', 'cancelled', 'pending_confirmation')
      GROUP BY o.id, t.label, t.code, delivery.id, delivery.status,
               delivery.called_at, delivery.claimed_at,
               delivery.target_waiter_id, delivery.target_waiter_name
      ORDER BY o.priority_rank DESC, o.created_at ASC
      LIMIT 100
      `,
    ) as Promise<KitchenQueueItem[]>;
  }

  async callWaiterForOrder(orderId: string, slug: string, staffId: string) {
    const orderRows = (await this.tenantConn.query(
      `SELECT o.id, o.status, o.table_session_id, t.label AS table_label, t.code AS table_code,
              z.name AS zone_name
         FROM orders o
         JOIN table_sessions ts ON ts.id = o.table_session_id
         JOIN tables t ON t.id = ts.table_id
         LEFT JOIN zones z ON z.id = t.zone_id
        WHERE o.id = $1`,
      [orderId],
    )) as Array<{
      id: string;
      status: string;
      table_session_id: string;
      table_label: string;
      table_code: string;
      zone_name: string | null;
    }>;

    if (!orderRows.length) {
      throw new NotFoundException('Pedido nao encontrado.');
    }
    const order = orderRows[0];
    if (order.status !== 'ready') {
      throw new BadRequestException('Pedido precisa estar pronto para chamar garcom.');
    }

    const target = await this.resolveTargetWaiter(order.table_session_id);
    const deliveryRows = (await this.tenantConn.query(
      `INSERT INTO order_deliveries
         (order_id, status, called_by, called_at, target_waiter_id)
       VALUES ($1, 'pending', $2, now(), $3)
       ON CONFLICT (order_id) WHERE status != 'cancelled'
       DO UPDATE SET
         called_by = COALESCE(order_deliveries.called_by, EXCLUDED.called_by),
         called_at = COALESCE(order_deliveries.called_at, EXCLUDED.called_at),
         target_waiter_id = COALESCE(order_deliveries.target_waiter_id, EXCLUDED.target_waiter_id)
       RETURNING id, status, called_at, target_waiter_id`,
      [orderId, staffId, target.id],
    )) as Array<{
      id: string;
      status: string;
      called_at: string;
      target_waiter_id: string | null;
    }>;
    const delivery = deliveryRows[0];

    this.eventsGateway?.emitOrderHandoffCalled(slug, {
      orderId,
      deliveryId: delivery.id,
      tableLabel: order.table_label,
      tableCode: order.table_code,
      zoneName: order.zone_name,
      targetWaiterId: delivery.target_waiter_id,
      targetWaiterName: target.name,
    });
    this.eventsGateway?.emitOrderStatusUpdate(slug, orderId, 'ready', order.table_label);

    return {
      orderId,
      deliveryId: delivery.id,
      deliveryStatus: delivery.status,
      calledAt: delivery.called_at,
      zoneName: order.zone_name,
      targetWaiterId: delivery.target_waiter_id,
      targetWaiterName: target.name,
    };
  }

  async markOrderInTransit(orderId: string, slug: string, staffId: string) {
    const result = await this.tenantConn.transaction(async (tx) => {
      const orderRows = (await tx.query(
        `SELECT o.id, o.status, o.table_session_id, t.label AS table_label
           FROM orders o
           JOIN table_sessions ts ON ts.id = o.table_session_id
           JOIN tables t ON t.id = ts.table_id
          WHERE o.id = $1
          FOR UPDATE`,
        [orderId],
      )) as Array<{
        id: string;
        status: string;
        table_session_id: string;
        table_label: string;
      }>;
      if (!orderRows.length) {
        throw new NotFoundException('Pedido nao encontrado.');
      }
      const order = orderRows[0];
      if (!['ready', 'in_transit'].includes(order.status)) {
        throw new BadRequestException('Pedido precisa estar pronto para entrar em transito.');
      }

      const existing = (await tx.query(
        `SELECT id, status, claimed_by
           FROM order_deliveries
          WHERE order_id = $1
            AND status != 'cancelled'
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE`,
        [orderId],
      )) as Array<{ id: string; status: string; claimed_by: string | null }>;

      let delivery: { id: string; status: string; claimed_by: string | null };
      if (!existing.length) {
        const inserted = (await tx.query(
          `INSERT INTO order_deliveries
             (order_id, status, claimed_by, claimed_at, called_at, target_waiter_id)
           VALUES ($1, 'claimed', $2, now(), now(), $2)
           RETURNING id, status, claimed_by`,
          [orderId, staffId],
        )) as Array<{ id: string; status: string; claimed_by: string | null }>;
        delivery = inserted[0];
      } else {
        const current = existing[0];
        if (current.status === 'claimed' && current.claimed_by && current.claimed_by !== staffId) {
          throw new BadRequestException('Pedido ja esta sendo levado por outro garcom.');
        }
        if (current.status === 'delivered') {
          throw new BadRequestException('Pedido ja foi entregue.');
        }
        const updated = unwrapRows<{ id: string; status: string; claimed_by: string | null }>(
          await tx.query(
            `UPDATE order_deliveries
                SET status = 'claimed',
                    claimed_by = COALESCE(claimed_by, $2),
                    claimed_at = COALESCE(claimed_at, now()),
                    target_waiter_id = COALESCE(target_waiter_id, $2)
              WHERE id = $1
              RETURNING id, status, claimed_by`,
            [current.id, staffId],
          ),
        );
        delivery = updated[0];
      }

      if (order.status !== 'in_transit') {
        await tx.query(
          `UPDATE orders SET status = 'in_transit', updated_at = now() WHERE id = $1`,
          [orderId],
        );
        await tx.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
           VALUES ($1, $2, 'in_transit', $3)`,
          [orderId, order.status, staffId],
        );
      }

      return {
        orderId,
        deliveryId: delivery.id,
        tableSessionId: order.table_session_id,
        tableLabel: order.table_label,
        status: 'in_transit' as const,
      };
    });

    this.eventsGateway?.emitOrderClaimed(slug, orderId, staffId);
    this.eventsGateway?.emitOrderStatusUpdate(slug, orderId, 'in_transit', result.tableLabel);
    this.eventsGateway?.emitToSession(result.tableSessionId, 'order:status', {
      orderId,
      status: 'in_transit',
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  async markOrderDeliveredByWaiter(orderId: string, slug: string, staffId: string) {
    const result = await this.tenantConn.transaction(async (tx) => {
      const orderRows = (await tx.query(
        `SELECT o.id, o.status, o.table_session_id, t.label AS table_label
           FROM orders o
           JOIN table_sessions ts ON ts.id = o.table_session_id
           JOIN tables t ON t.id = ts.table_id
          WHERE o.id = $1
          FOR UPDATE`,
        [orderId],
      )) as Array<{
        id: string;
        status: string;
        table_session_id: string;
        table_label: string;
      }>;
      if (!orderRows.length) {
        throw new NotFoundException('Pedido nao encontrado.');
      }
      const order = orderRows[0];
      if (order.status === 'delivered') {
        return {
          orderId,
          tableSessionId: order.table_session_id,
          tableLabel: order.table_label,
          status: 'delivered' as const,
        };
      }

      const deliveryRows = (await tx.query(
        `SELECT id, status, claimed_by
           FROM order_deliveries
          WHERE order_id = $1
            AND status != 'cancelled'
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE`,
        [orderId],
      )) as Array<{ id: string; status: string; claimed_by: string | null }>;
      const delivery = deliveryRows[0];
      if (!delivery || delivery.status !== 'claimed') {
        throw new BadRequestException('Pedido ainda nao esta em transito.');
      }
      if (delivery.claimed_by && delivery.claimed_by !== staffId) {
        throw new BadRequestException('Pedido esta em transito com outro garcom.');
      }

      await tx.query(
        `UPDATE order_deliveries
            SET status = 'delivered', delivered_at = now()
          WHERE id = $1`,
        [delivery.id],
      );
      await tx.query(`UPDATE orders SET status = 'delivered', updated_at = now() WHERE id = $1`, [
        orderId,
      ]);
      await tx.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
         VALUES ($1, $2, 'delivered', $3)`,
        [orderId, order.status, staffId],
      );

      return {
        orderId,
        deliveryId: delivery.id,
        tableSessionId: order.table_session_id,
        tableLabel: order.table_label,
        status: 'delivered' as const,
      };
    });

    await this.updateConsumptionSummary(orderId);
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
        this.ordersLogger.warn(`Falha ao agendar rating prompt: ${(err as Error).message}`);
      }
    }

    this.eventsGateway?.emitOrderStatusUpdate(slug, orderId, 'delivered', result.tableLabel);
    this.eventsGateway?.emitToSession(result.tableSessionId, 'order:status', {
      orderId,
      status: 'delivered',
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  async requestKitchenReorder(
    orderIds: string[],
    reason: string | null,
    staffId: string,
    slug?: string,
  ) {
    const uniqueIds = Array.from(new Set(orderIds));
    if (!uniqueIds.length) {
      throw new BadRequestException('Selecione pelo menos um pedido.');
    }
    const active = (await this.tenantConn.query(
      `SELECT id
         FROM orders
        WHERE id = ANY($1::uuid[])
          AND status NOT IN ('delivered', 'cancelled', 'pending_confirmation')`,
      [uniqueIds],
    )) as Array<{ id: string }>;
    if (!active.length) {
      throw new NotFoundException('Nenhum pedido ativo encontrado para reordenar.');
    }
    const requestRows = (await this.tenantConn.query(
      `INSERT INTO kitchen_reorder_requests
         (order_ids, reason, requested_by_staff_id)
       VALUES ($1::uuid[], $2, $3)
       RETURNING id`,
      [active.map((r) => r.id), reason, staffId],
    )) as Array<{ id: string }>;
    const requestId = requestRows[0].id;

    if (slug && this.eventsGateway) {
      this.eventsGateway.emitKitchenPriorityRequest(slug, {
        requestId,
        orderIds: active.map((r) => r.id),
        reason,
        requestedBy: staffId,
      });
    }

    return this.getKitchenReorderRequest(requestId);
  }

  async getPendingKitchenReorderRequests(): Promise<KitchenReorderRequestSummary[]> {
    const rows = (await this.tenantConn.query(
      `SELECT kr.id, kr.order_ids, kr.reason, kr.requested_by_staff_id,
              requester.name AS requested_by_name,
              kr.status, kr.response, kr.protected_order_ids, kr.response_note,
              kr.created_at, kr.responded_at
         FROM kitchen_reorder_requests kr
         LEFT JOIN staff requester ON requester.id = kr.requested_by_staff_id
        WHERE kr.status = 'pending'
        ORDER BY kr.created_at ASC
        LIMIT 10`,
    )) as Array<Omit<KitchenReorderRequestSummary, 'orders'>>;
    return this.hydrateKitchenReorderRequests(rows);
  }

  async getKitchenReorderRequest(requestId: string): Promise<KitchenReorderRequestSummary> {
    const rows = (await this.tenantConn.query(
      `SELECT kr.id, kr.order_ids, kr.reason, kr.requested_by_staff_id,
              requester.name AS requested_by_name,
              kr.status, kr.response, kr.protected_order_ids, kr.response_note,
              kr.created_at, kr.responded_at
         FROM kitchen_reorder_requests kr
         LEFT JOIN staff requester ON requester.id = kr.requested_by_staff_id
        WHERE kr.id = $1`,
      [requestId],
    )) as Array<Omit<KitchenReorderRequestSummary, 'orders'>>;
    if (!rows.length) {
      throw new NotFoundException('Pedido de reordenacao nao encontrado.');
    }
    const hydrated = await this.hydrateKitchenReorderRequests(rows);
    return hydrated[0];
  }

  async respondKitchenReorderRequest(
    requestId: string,
    response: 'accept' | 'next',
    protectedOrderIds: string[],
    staffId: string,
    slug?: string,
  ) {
    const result = await this.tenantConn.transaction(async (tx) => {
      const requestRows = (await tx.query(
        `SELECT id, order_ids, reason, status
           FROM kitchen_reorder_requests
          WHERE id = $1
          FOR UPDATE`,
        [requestId],
      )) as Array<{
        id: string;
        order_ids: string[];
        reason: string | null;
        status: string;
      }>;
      if (!requestRows.length) {
        throw new NotFoundException('Pedido de reordenacao nao encontrado.');
      }
      const request = requestRows[0];
      if (request.status !== 'pending') {
        return {
          orderIds: request.order_ids,
          status: request.status as 'accepted' | 'next',
          protectedOrderIds: [] as string[],
        };
      }

      const protectedUnique =
        response === 'next'
          ? Array.from(new Set(protectedOrderIds)).filter((id) => !request.order_ids.includes(id))
          : [];
      await this.applyKitchenRanksInTx(
        tx,
        request.order_ids,
        request.reason,
        staffId,
        protectedUnique,
      );

      const nextStatus = response === 'accept' ? 'accepted' : 'next';
      await tx.query(
        `UPDATE kitchen_reorder_requests
            SET status = $2,
                response = $3,
                protected_order_ids = $4::uuid[],
                responded_by_staff_id = $5,
                responded_at = now(),
                updated_at = now(),
                response_note = $6
          WHERE id = $1`,
        [
          requestId,
          nextStatus,
          response,
          protectedUnique,
          staffId,
          response === 'accept'
            ? 'Cozinha aceitou — pedidos no topo.'
            : 'Cozinha vai pegar logo apos os pedidos em preparo selecionados.',
        ],
      );

      return {
        orderIds: request.order_ids,
        status: nextStatus as 'accepted' | 'next',
        protectedOrderIds: protectedUnique,
      };
    });

    if (slug && this.eventsGateway) {
      this.eventsGateway.emitKitchenPriorityResponse(slug, {
        requestId,
        orderIds: result.orderIds,
        status: result.status,
        protectedOrderIds: result.protectedOrderIds,
        respondedBy: staffId,
      });
      this.eventsGateway.emitKitchenReorder(slug, {
        orderIds: [...result.protectedOrderIds, ...result.orderIds],
        reason:
          result.status === 'accepted'
            ? 'Cozinha aceitou prioridade da gerencia.'
            : 'Cozinha priorizou apos pedidos ja em preparo.',
        requestedBy: staffId,
      });
    }

    return this.getKitchenReorderRequest(requestId);
  }

  async reorderKitchenQueue(
    orderIds: string[],
    reason: string | null,
    staffId: string,
    slug?: string,
  ) {
    const uniqueIds = Array.from(new Set(orderIds));
    if (!uniqueIds.length) {
      throw new BadRequestException('Selecione pelo menos um pedido.');
    }

    const updated = await this.tenantConn.transaction(async (tx) => {
      return this.applyKitchenRanksInTx(tx, uniqueIds, reason, staffId);
    });

    if (!updated.length) {
      throw new NotFoundException('Nenhum pedido ativo encontrado para reordenar.');
    }

    if (slug && this.eventsGateway) {
      this.eventsGateway.emitKitchenReorder(slug, {
        orderIds: updated.map((r) => r.id),
        reason,
        requestedBy: staffId,
      });
    }

    return {
      ok: true,
      updatedOrderIds: updated.map((r) => r.id),
      reason,
      updatedAt: new Date().toISOString(),
    };
  }

  private async resolveTargetWaiter(
    tableSessionId: string,
  ): Promise<{ id: string | null; name: string | null }> {
    const recentWaiter = (await this.tenantConn.query(
      `SELECT wc.acknowledged_by AS id,
              COALESCE(s.name, wc.assigned_waiter_name) AS name
         FROM waiter_calls wc
         LEFT JOIN staff s ON s.id = wc.acknowledged_by
        WHERE wc.table_session_id = $1
          AND wc.acknowledged_by IS NOT NULL
        ORDER BY wc.acknowledged_at DESC NULLS LAST, wc.created_at DESC
        LIMIT 1`,
      [tableSessionId],
    )) as Array<{ id: string | null; name: string | null }>;
    if (recentWaiter[0]?.id) {
      return recentWaiter[0];
    }

    const fallback = (await this.tenantConn.query(
      `SELECT id, name
         FROM staff
        WHERE role = 'waiter'
          AND is_active = true
        ORDER BY name ASC
        LIMIT 1`,
    )) as Array<{ id: string; name: string }>;
    if (fallback[0]) {
      return fallback[0];
    }
    return { id: null, name: null };
  }

  private async applyKitchenRanksInTx(
    tx: QueryExecutor,
    orderIds: string[],
    reason: string | null,
    staffId: string,
    protectedOrderIds: string[] = [],
  ): Promise<Array<{ id: string; priority_rank: string }>> {
    const sequence = [
      ...Array.from(new Set(protectedOrderIds)),
      ...Array.from(new Set(orderIds)).filter((id) => !protectedOrderIds.includes(id)),
    ];
    const baseRank = BigInt(Date.now()) * 1000n;
    const rows: Array<{ id: string; priority_rank: string }> = [];
    for (let i = 0; i < sequence.length; i += 1) {
      const rank = (baseRank + BigInt(sequence.length - i)).toString();
      const result = await tx.query(
        `UPDATE orders
            SET priority_rank = $1,
                priority_reason = $2,
                priority_requested_by = $3,
                priority_updated_at = now(),
                updated_at = now()
          WHERE id = $4
            AND status NOT IN ('delivered', 'cancelled', 'pending_confirmation')
          RETURNING id, priority_rank::text`,
        [rank, reason, staffId, sequence[i]],
      );
      const returned = unwrapRows<{ id: string; priority_rank: string }>(result);
      if (returned[0]) rows.push(returned[0]);
    }
    return rows;
  }

  private async hydrateKitchenReorderRequests(
    rows: Array<Omit<KitchenReorderRequestSummary, 'orders'>>,
  ): Promise<KitchenReorderRequestSummary[]> {
    if (!rows.length) return [];
    const queue = await this.getKitchenQueue();
    const byId = new Map(queue.map((order) => [order.id, order]));
    return rows.map((row) => ({
      ...row,
      order_ids: row.order_ids ?? [],
      protected_order_ids: row.protected_order_ids ?? [],
      orders: (row.order_ids ?? [])
        .map((id) => byId.get(id))
        .filter((order): order is KitchenQueueItem => Boolean(order)),
    }));
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
      if (!actor.sessionTableId || actor.sessionTableId !== tableSessionId) {
        throw new ForbiddenException('Pedido não pertence à sua mesa.');
      }
    }

    const allowed = VALID_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transicao invalida: ${currentStatus} -> ${newStatus}. Permitidos: ${allowed.join(', ')}`,
      );
    }

    await this.tenantConn.query(`UPDATE orders SET status = $1, updated_at = now() WHERE id = $2`, [
      newStatus,
      orderId,
    ]);

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
          this.ordersLogger.warn(`Falha ao agendar rating prompt: ${(err as Error).message}`);
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

import { Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { KitchenQueueItem } from './orders.service';

/**
 * Leituras da fila da cozinha (KDS/TV + fila do /cozinha), extraídas do
 * orders.service (FASE 2 · decomposição). Puro read: só depende do
 * `TenantConnectionProvider`. O sweep-throttled de auto-confirm NÃO vive
 * aqui — fica no wrapper do orders.service, que o dispara antes de delegar,
 * porque o sweep é transversal (usado por reads não-KDS e tem endpoint
 * próprio) e depende do confirmOrder do orders.service.
 *
 * SQL e mapeamento movidos verbatim — characterization em
 * kds-query.service.test.ts fixa o predicado de estação e o mapa
 * priority_bucket → label.
 */
@Injectable()
export class KdsQueryService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async getActiveOrdersForKds(
    station: 'kitchen' | 'bar',
  ): Promise<Array<Record<string, unknown> & { priority: string }>> {
    // Roteamento bar × cozinha pelo FLAG autoritativo `menu_items.kind`
    // (migration 016: VARCHAR(10) NOT NULL DEFAULT 'food', indexado por
    // idx_menu_items_kind). Valores canônicos = 'drink' | 'food'
    // (shared-types MenuItemKind). NÃO rotear pelo NOME da categoria:
    // o antigo `LOWER(TRIM(mc.name)) = 'bebidas'` mandava toda bebida de
    // categoria "Cervejas"/"Vinhos"/"Drinks" pra cozinha (o seed usa a
    // categoria literal "Bebidas", o que MASCARAVA o bug). Cozinha recebe
    // tudo que NÃO é bebida — incluindo kind default 'food' e qualquer
    // valor legacy inesperado (`<> 'drink'`).
    const itemPredicate =
      station === 'bar' ? `mi.kind = 'drink'` : `mi.kind <> 'drink'`;

    // Três filas/prioridades canônicas (decisão 2026-06-10, prompt 99 §6):
    // 1. urgência (priority_rank > 0 — reorder/urgência da cozinha),
    // 2. VIP (flag 'vip' da sessão OU customer is_vip da visita),
    // 3. normal. Dentro de cada fila, FIFO por created_at.
    const PRIORITY_BY_BUCKET = ['urgent', 'vip', 'normal'] as const;
    const rows = (await this.tenantConn.query(
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
        -- Bucket numérico calculado UMA vez (0=urgência, 1=VIP, 2=normal);
        -- ORDER BY referencia o alias e o label string deriva no TS abaixo
        -- — CASE duplicado em SELECT e ORDER BY era armadilha de divergência
        -- (badge ≠ ordem, code-review).
        CASE
          WHEN o.priority_rank > 0 THEN 0
          WHEN ('vip' = ANY(COALESCE(ts.flags, '{}'::text[])))
            OR COALESCE(vip_customer.is_vip, false) THEN 1
          ELSE 2
        END AS priority_bucket,
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
      LEFT JOIN visits vip_visit ON vip_visit.id = o.visit_id
      LEFT JOIN customers vip_customer ON vip_customer.id = vip_visit.customer_id
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
      GROUP BY o.id, t.label, ts.flags, vip_customer.is_vip, delivery.status
      ORDER BY
        priority_bucket ASC,
        o.priority_rank DESC,
        o.created_at ASC
      LIMIT 100
      `,
    )) as Array<Record<string, unknown> & { priority_bucket: number }>;
    return rows.map(({ priority_bucket, ...row }) => ({
      ...row,
      priority: PRIORITY_BY_BUCKET[priority_bucket] ?? 'normal',
    }));
  }

  async getKitchenQueue(): Promise<KitchenQueueItem[]> {
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
}

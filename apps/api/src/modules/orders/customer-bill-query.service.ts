import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { BillingService } from '../billing/billing.service';

/**
 * Conta do cliente (`GET /orders/bill`), extraída do orders.service
 * (FASE 2 · decomposição). Puro read: depende do TenantConnectionProvider
 * e do BillingService — a taxa de serviço (settings.service_fee_pct) sai
 * do MESMO BillingService que o POST /payments usa pra cobrar.
 *
 * SQL e mapeamento movidos verbatim — characterization em
 * orders.service.bill.test.ts fixa subtotal/taxa/total server-side (P1 da
 * auditoria 2026-07-03) e a cerca `billing_mode = 'table'` da conta da mesa.
 */
@Injectable()
export class CustomerBillQueryService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly billing: BillingService,
  ) {}

  async getBill(tableSessionId: string, mode: 'table' | 'individual', visitId?: string) {
    if (mode === 'individual' && !visitId) {
      throw new BadRequestException('visitId necessario para comanda individual.');
    }

    let whereClause = `o.table_session_id = $1 AND o.status NOT IN ('cancelled', 'pending_confirmation')`;
    const params: unknown[] = [tableSessionId];

    if (mode === 'individual') {
      params.push(visitId);
      whereClause += ` AND o.billing_mode = 'individual' AND o.visit_id = $${params.length}`;
    } else {
      // Mesma cerca do POST /payments (e do perVisit logo abaixo): a
      // "conta da mesa" são os pedidos em comanda de mesa — sem isto a
      // tela somava pedidos de comanda individual que o Pix não cobra.
      whereClause += ` AND o.billing_mode = 'table'`;
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

    // A conta exibida sai TODA do backend: mesma taxa (settings.
    // service_fee_pct via BillingService) que o POST /payments cobra.
    // `totalCents` passa a ser o total COM taxa — o número que se paga.
    const totals = await this.billing.computeTotals(totalCents);

    return {
      mode,
      totalCents: totals.totalCents,
      subtotalCents: totals.subtotalCents,
      // Promoção ativa (migration 014) aplicada server-side pelo BillingService:
      // o mesmo desconto que o POST /payments cobra. 0/null quando nenhuma
      // promoção qualifica. `discountLabel` é o rótulo pra UI ("Terça 20% off").
      discountCents: totals.discountCents,
      discountLabel: totals.discountLabel,
      serviceFeePct: totals.serviceFeePct,
      serviceFeeCents: totals.serviceFeeCents,
      orderCount: orders.length,
      orders,
      perVisit: mode === 'table' ? perVisit : undefined,
    };
  }
}

/**
 * P1 da auditoria 2026-07-03 (taxa só no FE): o `GET /orders/bill` devolvia
 * SUM(total_cents) sem taxa e o FE somava 10% hardcoded por cima — número
 * que o backend não cobrava. Agora a conta exibida vem TODA do backend:
 * subtotal + serviceFee (settings.service_fee_pct) + total, do mesmo
 * BillingService que o POST /payments usa pra cobrar.
 */

import { OrdersService } from './orders.service';
import { BillingService } from '../billing/billing.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const SESSION = '11111111-1111-4111-8111-111111111111';

function fakeBillDb(opts: { serviceFeePct?: string; orderTotals: number[] }) {
  const query = async (sql: string): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('SELECT service_fee_pct FROM settings')) {
      return [{ service_fee_pct: opts.serviceFeePct ?? '10.00' }];
    }
    if (s.includes('json_agg')) {
      return opts.orderTotals.map((total, i) => ({
        id: `order-${i}`,
        billing_mode: 'table',
        total_cents: total,
        status: 'delivered',
        visit_id: null,
        created_at: '2026-07-04T00:00:00Z',
        items: [],
      }));
    }
    if (s.includes('GROUP BY o.visit_id')) {
      return [];
    }
    throw new Error(`fake bill: SQL não roteado: ${s}`);
  };
  return { query } as unknown as TenantConnectionProvider;
}

function makeService(opts: Parameters<typeof fakeBillDb>[0]) {
  const conn = fakeBillDb(opts);
  return new OrdersService(conn, {} as unknown as RedisService, new BillingService(conn));
}

describe('OrdersService.getBill — conta com taxa server-side', () => {
  it('devolve subtotal, taxa e total calculados no backend', async () => {
    const service = makeService({ orderTotals: [6_000, 4_000], serviceFeePct: '10.00' });
    const bill = await service.getBill(SESSION, 'table');
    expect(bill.subtotalCents).toBe(10_000);
    expect(bill.serviceFeePct).toBe(10);
    expect(bill.serviceFeeCents).toBe(1_000);
    expect(bill.totalCents).toBe(11_000); // o que se paga = o que se exibe
  });

  it('taxa configurada (12.50) reflete na conta exibida', async () => {
    const service = makeService({ orderTotals: [8_000], serviceFeePct: '12.50' });
    const bill = await service.getBill(SESSION, 'table');
    expect(bill.serviceFeeCents).toBe(1_000);
    expect(bill.totalCents).toBe(9_000);
  });

  it('conta vazia não inventa taxa', async () => {
    const service = makeService({ orderTotals: [] });
    const bill = await service.getBill(SESSION, 'table');
    expect(bill.subtotalCents).toBe(0);
    expect(bill.serviceFeeCents).toBe(0);
    expect(bill.totalCents).toBe(0);
  });
});

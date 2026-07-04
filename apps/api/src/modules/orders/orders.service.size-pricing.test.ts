/**
 * P1 (re-scan) · MESMA CLASSE do P1-N (preferências de bebida), mas pro
 * `size` (tamanho: Pequeno/Médio/Grande). O cliente escolhe Grande (R$12),
 * vê R$12 em toda a UI, mas o backend precificava `unit_price = price_cents`
 * base (R$8) — undercharge silencioso.
 *
 * Regra fixada: quando o item traz `size`, o backend resolve o preço do
 * TAMANHO em `menu_items.sizes` (JSONB `[{label, price_cents}]`) e cobra esse
 * valor — o preço NUNCA vem do cliente, sempre do banco (mesmo trust model
 * dos extras). Item sem `size`, ou size que não casa com nenhum label, cai
 * no `price_cents` base (comportamento antigo preservado).
 */

import { OrdersService } from './orders.service';
import { EtaDecoratorService } from './eta-decorator.service';
import { BillingService } from '../billing/billing.service';
import { ConsumptionSummaryService } from './consumption-summary.service';
import { KdsQueryService } from './kds-query.service';
import { OrderDeliveryService } from './order-delivery.service';
import { CustomerBillQueryService } from './customer-bill-query.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';
import type { CreateOrderItemDto } from './orders.service';

const SESSION = 'aaaaaaa5-0000-4000-8000-000000000001';
const ITEM = 'ddddddd5-0000-4000-8000-000000000001';
const ORDER = 'eeeeeee5-0000-4000-8000-000000000001';
const ORDER_ITEM = 'fffffff5-0000-4000-8000-000000000001';

const BASE_PRICE = 800; // R$8,00 — tamanho-base
const SIZES = [
  { label: 'Pequeno', price_cents: 600 },
  { label: 'Médio', price_cents: 800 },
  { label: 'Grande', price_cents: 1200 }, // R$12,00
];

/**
 * Fake mínimo do createOrder path (billingMode 'table', sem extras, sem
 * idempotencyKey). Captura o que foi persistido em order_items pra assertar
 * unit_price/subtotal. `hasSizes=false` simula item sem tamanhos (JSONB null).
 */
function fakeDb(hasSizes: boolean) {
  const captured = {
    orderTotalCents: null as number | null,
    items: [] as Array<{ unit_price_cents: number; subtotal_cents: number }>,
  };

  const run = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('SELECT id, price_cents')) {
      // menu_items lookup — devolve o base + sizes JSONB (ou null).
      return [
        {
          id: ITEM,
          price_cents: BASE_PRICE,
          name: 'Suco de laranja',
          sizes: hasSizes ? SIZES : null,
        },
      ];
    }
    if (s.startsWith('INSERT INTO orders')) {
      captured.orderTotalCents = params[4] as number; // total_cents
      return [
        { id: ORDER, status: 'pending_confirmation', created_at: 'now', auto_confirm_at: null },
      ];
    }
    if (s.startsWith('INSERT INTO order_items')) {
      captured.items.push({
        unit_price_cents: params[3] as number,
        subtotal_cents: params[4] as number,
      });
      return [{ id: ORDER_ITEM }];
    }
    if (s.startsWith('INSERT INTO order_status_history')) return [];
    if (s.startsWith('UPDATE menu_items SET total_orders')) return [];
    throw new Error(`fake db: SQL não roteado: ${s}`);
  };

  const conn = {
    query: run,
    transaction: async <T>(fn: (tx: { query: typeof run }) => Promise<T>): Promise<T> =>
      fn({ query: run }),
  } as unknown as TenantConnectionProvider;

  return { captured, conn };
}

function makeService(hasSizes: boolean) {
  const db = fakeDb(hasSizes);
  const service = new OrdersService(
    db.conn,
    {} as unknown as RedisService,
    new BillingService(db.conn),
    new ConsumptionSummaryService(db.conn),
    new KdsQueryService(db.conn),
    new OrderDeliveryService(db.conn, new ConsumptionSummaryService(db.conn)),
    new CustomerBillQueryService(db.conn, new BillingService(db.conn)),
    new EtaDecoratorService(db.conn),
  );
  return { service, db };
}

async function order(service: OrdersService, item: CreateOrderItemDto) {
  return service.createOrder(SESSION, null, 'table', [item]);
}

describe('OrdersService.createOrder — precifica pelo TAMANHO escolhido', () => {
  it('P1: item com size Grande cobra o preço do Grande, não o base', async () => {
    const { service, db } = makeService(true);
    await order(service, { menuItemId: ITEM, quantity: 2, size: 'Grande' });
    // 2 × R$12 = R$24 — antes do fix cobrava 2 × R$8 = R$16 (undercharge).
    expect(db.captured.items[0].unit_price_cents).toBe(1200);
    expect(db.captured.items[0].subtotal_cents).toBe(2400);
    expect(db.captured.orderTotalCents).toBe(2400);
  });

  it('size Pequeno usa o preço do Pequeno', async () => {
    const { service, db } = makeService(true);
    await order(service, { menuItemId: ITEM, quantity: 1, size: 'Pequeno' });
    expect(db.captured.items[0].unit_price_cents).toBe(600);
  });

  it('sem size, mantém o preço-base (comportamento antigo preservado)', async () => {
    const { service, db } = makeService(true);
    await order(service, { menuItemId: ITEM, quantity: 1 });
    expect(db.captured.items[0].unit_price_cents).toBe(BASE_PRICE);
  });

  it('size que não casa com nenhum label cai no base — não confia no cliente', async () => {
    const { service, db } = makeService(true);
    await order(service, { menuItemId: ITEM, quantity: 1, size: 'Gigante' });
    expect(db.captured.items[0].unit_price_cents).toBe(BASE_PRICE);
  });

  it('item sem tamanhos (sizes null) + size no payload cai no base', async () => {
    const { service, db } = makeService(false);
    await order(service, { menuItemId: ITEM, quantity: 1, size: 'Grande' });
    expect(db.captured.items[0].unit_price_cents).toBe(BASE_PRICE);
  });
});

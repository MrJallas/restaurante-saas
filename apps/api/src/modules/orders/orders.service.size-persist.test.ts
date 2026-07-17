/**
 * P2 (re-scan · KDS drink size) WRITE-SIDE — follow-up do dc00ace + migration
 * 070. O read-side já lê `oi.size` e o card do KDS/bar renderiza o badge; falta
 * o write-side GRAVAR a coluna. Aqui a prova de que os DOIS paths de criação
 * (createOrder do cliente + createStaffDirectOrder do garçom) persistem o
 * tamanho escolhido em `order_items.size`.
 *
 * Trust model (mesmo do preço, P1): o LABEL persistido é o CANÔNICO de
 * `menu_items.sizes` que casou — nunca o texto cru do cliente. Sem match (size
 * desconhecido, item sem tamanhos, ou sem size) → NULL. O badge do KDS reflete
 * exatamente o tamanho COBRADO, nunca um "Gigante" que o cardápio não tem.
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

const SESSION = 'aaaaaaa6-0000-4000-8000-000000000001';
const ITEM = 'ddddddd6-0000-4000-8000-000000000001';
const ORDER = 'eeeeeee6-0000-4000-8000-000000000001';
const ORDER_ITEM = 'fffffff6-0000-4000-8000-000000000001';
const STAFF = 'bbbbbbb6-0000-4000-8000-000000000001';

const BASE_PRICE = 800;
const SIZES = [
  { label: 'Pequeno', price_cents: 600 },
  { label: 'Médio', price_cents: 800 },
  { label: 'Grande', price_cents: 1200 },
];

// `size` é a ÚLTIMA coluna do INSERT INTO order_items nos dois paths:
//  customer: (..., notes, customer_id, size) → $8  → params[7]
//  staff:    (..., notes, customer_id=NULL, size) → $7 → params[6]
const SIZE_PARAM_INDEX = { customer: 7, staff: 6 } as const;

/**
 * Fake DB que roteia as queries dos dois paths de criação e captura o param
 * `size` gravado no INSERT INTO order_items. `hasSizes=false` simula item sem
 * tamanhos (JSONB null).
 */
function fakeDb(hasSizes: boolean, sizeParamIndex: number) {
  const captured = { sizes: [] as unknown[] };

  const run = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('SELECT id, role, name FROM staff')) {
      return [{ id: STAFF, role: 'waiter', name: 'Garçom' }];
    }
    if (s.startsWith('SELECT ts.id, t.code AS table_code')) {
      return [{ id: SESSION, table_code: 'M1', table_label: 'Mesa 1' }];
    }
    if (s.startsWith('SELECT id, price_cents')) {
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
      return [
        {
          id: ORDER,
          status: 'pending_confirmation',
          created_at: 'now',
          updated_at: 'now',
          auto_confirm_at: null,
        },
      ];
    }
    if (s.startsWith('INSERT INTO order_items')) {
      captured.sizes.push(params[sizeParamIndex]);
      return [{ id: ORDER_ITEM }];
    }
    if (s.startsWith('INSERT INTO order_status_history')) return [{ id: 'hist-1' }];
    if (s.startsWith('UPDATE menu_items SET total_orders')) return [];
    throw new Error(`fake db: SQL não roteado: ${s}`);
  };

  const conn = {
    query: run,
    transaction: async <T>(fn: (tx: { query: typeof run }) => Promise<T>): Promise<T> =>
      fn({ query: run }),
    getTenantSlug: () => 'tenant-test',
  } as unknown as TenantConnectionProvider;

  return { captured, conn };
}

function makeService(hasSizes: boolean, sizeParamIndex: number) {
  const db = fakeDb(hasSizes, sizeParamIndex);
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

describe('OrdersService.createOrder — persiste o TAMANHO no order_items.size', () => {
  const idx = SIZE_PARAM_INDEX.customer;
  const order = (service: OrdersService, item: CreateOrderItemDto) =>
    service.createOrder(SESSION, null, 'table', [item]);

  it('grava o label canônico do tamanho escolhido', async () => {
    const { service, db } = makeService(true, idx);
    await order(service, { menuItemId: ITEM, quantity: 1, size: 'Grande' });
    expect(db.captured.sizes[0]).toBe('Grande');
  });

  it('normaliza pro label canônico do cardápio, não o casing do cliente', async () => {
    const { service, db } = makeService(true, idx);
    await order(service, { menuItemId: ITEM, quantity: 1, size: '  grande ' });
    expect(db.captured.sizes[0]).toBe('Grande');
  });

  it('sem size, grava NULL', async () => {
    const { service, db } = makeService(true, idx);
    await order(service, { menuItemId: ITEM, quantity: 1 });
    expect(db.captured.sizes[0]).toBeNull();
  });

  it('size que não casa com nenhum label grava NULL (não confia no cliente)', async () => {
    const { service, db } = makeService(true, idx);
    await order(service, { menuItemId: ITEM, quantity: 1, size: 'Gigante' });
    expect(db.captured.sizes[0]).toBeNull();
  });

  it('item sem tamanhos (sizes null) + size no payload grava NULL', async () => {
    const { service, db } = makeService(false, idx);
    await order(service, { menuItemId: ITEM, quantity: 1, size: 'Grande' });
    expect(db.captured.sizes[0]).toBeNull();
  });
});

describe('OrdersService.createStaffDirectOrder — persiste o TAMANHO no order_items.size', () => {
  const idx = SIZE_PARAM_INDEX.staff;
  const direct = (service: OrdersService, item: CreateOrderItemDto) =>
    service.createStaffDirectOrder({
      tableRef: SESSION,
      billingMode: 'table',
      items: [item],
      staffId: STAFF,
    });

  it('grava o label canônico do tamanho escolhido', async () => {
    const { service, db } = makeService(true, idx);
    await direct(service, { menuItemId: ITEM, quantity: 1, size: 'Pequeno' });
    expect(db.captured.sizes[0]).toBe('Pequeno');
  });

  it('sem size, grava NULL', async () => {
    const { service, db } = makeService(true, idx);
    await direct(service, { menuItemId: ITEM, quantity: 1 });
    expect(db.captured.sizes[0]).toBeNull();
  });
});

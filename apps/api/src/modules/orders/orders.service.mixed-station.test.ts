/**
 * BUG P1 (re-scan OWASP · pedido MISTO comida+bebida): um pedido food+drink
 * compartilha UM status entre cozinha e bar. Repro: o bar marca a bebida
 * "Pronto" → o `orders.status` inteiro virava 'ready' → a comida DESAPARECIA
 * da cozinha sem ter sido preparada.
 *
 * FIX (status por ITEM, migration 071 · order_items.status): o avanço do KDS
 * passa a marcar os ITENS DA ESTAÇÃO (cozinha `mi.kind <> 'drink'` / bar
 * `mi.kind = 'drink'`), não o pedido inteiro. O `orders.status` só é
 * reconciliado pra 'ready' quando TODOS os itens estão 'ready'; enquanto
 * houver item não-pronto, o pedido segue na fila da(s) estação(ões) que ainda
 * têm trabalho.
 *
 * Este teste prova o invariante central: bar marca a bebida ready → a comida
 * CONTINUA não-pronta e o order NÃO vira 'ready'; só depois que a cozinha
 * termina a comida o order fecha em 'ready'.
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

const ORDER = 'aaaaaaa4-0000-4000-8000-000000000001';
const SESSION = 'bbbbbbb4-0000-4000-8000-000000000001';
const FOOD_ITEM = 'ccccccc4-0000-4000-8000-00000000f00d';
const DRINK_ITEM = 'ccccccc4-0000-4000-8000-000000000d21';

/**
 * Fake DB com estado por-item + por-order. Modela `order_items.status` e o
 * roteamento por estação (kind) via os itens conhecidos. As queries de
 * station-scoped write são reconhecidas pelo prefixo/keyword; as de
 * updateStatus (order-level) reusam o padrão do characterization existente.
 */
function fakeMixedDb() {
  const items: Record<string, { kind: 'food' | 'drink'; status: string }> = {
    [FOOD_ITEM]: { kind: 'food', status: 'received' },
    [DRINK_ITEM]: { kind: 'drink', status: 'received' },
  };
  const order = { status: 'received' as string, history: [] as string[] };

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    // Station-scoped write: UPDATE order_items SET status = $1 WHERE order_id
    // = $2 AND kind-of-station AND status = expected. O predicado de estação
    // chega via a keyword 'drink' no SQL ('mi.kind = ' pra bar, '<>' pra
    // cozinha). params: [newStatus, orderId, currentItemStatus].
    if (/^UPDATE order_items( oi)? SET status/.test(s)) {
      const newStatus = params[0] as string;
      const currentItemStatus = params[2] as string;
      const isBar = /kind\s*=\s*'drink'/.test(s);
      const kindWanted: 'food' | 'drink' = isBar ? 'drink' : 'food';
      const touched: Array<{ id: string }> = [];
      for (const [id, it] of Object.entries(items)) {
        if (it.kind === kindWanted && it.status === currentItemStatus) {
          it.status = newStatus;
          touched.push({ id });
        }
      }
      return touched;
    }

    // Agregado pra reconciliar o order: TODOS os itens ready? algum
    // in_progress? (checa COUNT antes da leitura de status per-item porque o
    // agregado também menciona oi.status no FILTER).
    if (s.startsWith('SELECT') && s.includes('order_items') && s.includes('COUNT')) {
      const all = Object.values(items);
      const total = all.length;
      const ready = all.filter((it) => it.status === 'ready').length;
      const inProgress = all.filter((it) => it.status === 'in_progress').length;
      return [{ total: String(total), ready: String(ready), in_progress: String(inProgress) }];
    }

    // --- order-level (updateStatus) ---
    if (s.startsWith('SELECT id, status, table_session_id FROM orders')) {
      return [{ id: ORDER, status: order.status, table_session_id: SESSION }];
    }
    if (s.startsWith('UPDATE orders SET status')) {
      if (order.status !== params[2]) return [];
      order.status = params[0] as string;
      return [{ id: ORDER }];
    }
    if (s.startsWith('SELECT status FROM orders')) {
      return [{ status: order.status }];
    }
    if (s.startsWith('INSERT INTO order_status_history')) {
      order.history.push(`${params[1]}->${params[2]}`);
      return [{ id: 'osh-1' }];
    }
    // lookup de tableLabel no ready-emit (best-effort) e outros SELECTs
    // laterais — devolvem vazio sem quebrar.
    if (s.startsWith('SELECT')) {
      return [];
    }
    throw new Error(`fake mixed: SQL não roteado: ${s}`);
  };

  return { items, order, conn: { query } as unknown as TenantConnectionProvider };
}

function makeService(conn: TenantConnectionProvider) {
  return new OrdersService(
    conn,
    {} as unknown as RedisService,
    new BillingService(conn),
    new ConsumptionSummaryService(conn),
    new KdsQueryService(conn),
    new OrderDeliveryService(conn, new ConsumptionSummaryService(conn)),
    new CustomerBillQueryService(conn, new BillingService(conn)),
    new EtaDecoratorService(conn),
  );
}

const staffActor = { actorType: 'staff' as const, sessionTableId: null };

describe('pedido MISTO comida+bebida — status por estação (não vaza entre cozinha e bar)', () => {
  it('bar avança a bebida até ready → a COMIDA continua não-pronta e o order NÃO vira ready', async () => {
    const db = fakeMixedDb();
    const service = makeService(db.conn);

    // Bar: received → in_progress → ready (só a bebida)
    await service.advanceStationItems(ORDER, 'bar', 'in_progress', 'bar', 'restaurant_dev', staffActor);
    await service.advanceStationItems(ORDER, 'bar', 'ready', 'bar', 'restaurant_dev', staffActor);

    // A bebida está pronta, a comida NÃO.
    expect(db.items[DRINK_ITEM].status).toBe('ready');
    expect(db.items[FOOD_ITEM].status).toBe('received');
    // O ORDER não pode ter virado 'ready' — a comida some da cozinha se virar.
    expect(db.order.status).not.toBe('ready');
  });

  it('só depois que a cozinha termina a comida o order fecha em ready (ambos prontos)', async () => {
    const db = fakeMixedDb();
    const service = makeService(db.conn);

    // Bar termina a bebida.
    await service.advanceStationItems(ORDER, 'bar', 'in_progress', 'bar', 'restaurant_dev', staffActor);
    await service.advanceStationItems(ORDER, 'bar', 'ready', 'bar', 'restaurant_dev', staffActor);
    expect(db.order.status).not.toBe('ready');

    // Cozinha termina a comida.
    await service.advanceStationItems(
      ORDER,
      'kitchen',
      'in_progress',
      'kitchen',
      'restaurant_dev',
      staffActor,
    );
    await service.advanceStationItems(ORDER, 'kitchen', 'ready', 'kitchen', 'restaurant_dev', staffActor);

    // Agora TODOS os itens estão ready → order fecha em 'ready'.
    expect(db.items[FOOD_ITEM].status).toBe('ready');
    expect(db.items[DRINK_ITEM].status).toBe('ready');
    expect(db.order.status).toBe('ready');
  });
});

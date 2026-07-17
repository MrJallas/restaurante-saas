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

import { BadRequestException } from '@nestjs/common';
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
function fakeMixedDb(initialOrderStatus = 'received') {
  const items: Record<
    string,
    { kind: 'food' | 'drink'; status: string; prepStartedAt: string | null }
  > = {
    [FOOD_ITEM]: { kind: 'food', status: 'received', prepStartedAt: null },
    [DRINK_ITEM]: { kind: 'drink', status: 'received', prepStartedAt: null },
  };
  const order = { status: initialOrderStatus, history: [] as string[] };

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    // Station-scoped write: UPDATE order_items SET status = $1 WHERE order_id
    // = $2 AND kind-of-station AND status = expected. O predicado de estação
    // chega via a keyword 'drink' no SQL ('mi.kind = ' pra bar, '<>' pra
    // cozinha). params: [newStatus, orderId, currentItemStatus].
    if (/^UPDATE order_items( oi)? SET status/.test(s)) {
      const newStatus = params[0] as string;
      const currentItemStatus = params[2] as string;
      const allStations = /AND TRUE AND oi\.status/.test(s);
      const isBar = /kind\s*=\s*'drink'/.test(s);
      const kindWanted: 'food' | 'drink' | null = allStations ? null : isBar ? 'drink' : 'food';
      const touched: Array<{ id: string }> = [];
      for (const [id, it] of Object.entries(items)) {
        if ((kindWanted === null || it.kind === kindWanted) && it.status === currentItemStatus) {
          it.status = newStatus;
          // Só modela o relógio se o SQL realmente o persiste. Assim a
          // regressão falha se o avanço voltar a atualizar apenas `status`.
          if (newStatus === 'in_progress' && s.includes('prep_started_at')) {
            it.prepStartedAt = `started:${kindWanted ?? 'all'}`;
          }
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
  it('tipa explicitamente o parâmetro de status reutilizado no CASE para o PostgreSQL', async () => {
    const db = fakeMixedDb();
    const originalQuery = (
      db.conn as unknown as { query: (sql: string, params?: unknown[]) => Promise<unknown[]> }
    ).query;
    let stationUpdateSql = '';
    (db.conn as unknown as { query: typeof originalQuery }).query = async (sql, params) => {
      if (/UPDATE\s+order_items/i.test(sql)) stationUpdateSql = sql;
      return originalQuery(sql, params);
    };

    await makeService(db.conn).advanceStationItems(
      ORDER,
      'kitchen',
      'in_progress',
      'kitchen',
      'restaurant_dev',
      staffActor,
    );

    expect(stationUpdateSql).toMatch(/SET status = \$1::varchar/i);
    expect(stationUpdateSql).toMatch(/WHEN \$1::varchar = 'in_progress'/i);
  });

  it('bar avança a bebida até ready → a COMIDA continua não-pronta e o order NÃO vira ready', async () => {
    const db = fakeMixedDb();
    const service = makeService(db.conn);

    // Bar: received → in_progress → ready (só a bebida)
    await service.advanceStationItems(
      ORDER,
      'bar',
      'in_progress',
      'bar',
      'restaurant_dev',
      staffActor,
    );
    await service.advanceStationItems(ORDER, 'bar', 'ready', 'bar', 'restaurant_dev', staffActor);

    // A bebida está pronta, a comida NÃO.
    expect(db.items[DRINK_ITEM].status).toBe('ready');
    expect(db.items[FOOD_ITEM].status).toBe('received');
    expect(db.items[DRINK_ITEM].prepStartedAt).toBe('started:drink');
    expect(db.items[FOOD_ITEM].prepStartedAt).toBeNull();
    // O ORDER não pode ter virado 'ready' — a comida some da cozinha se virar.
    expect(db.order.status).not.toBe('ready');
  });

  it('só depois que a cozinha termina a comida o order fecha em ready (ambos prontos)', async () => {
    const db = fakeMixedDb();
    const service = makeService(db.conn);

    // Bar termina a bebida.
    await service.advanceStationItems(
      ORDER,
      'bar',
      'in_progress',
      'bar',
      'restaurant_dev',
      staffActor,
    );
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
    await service.advanceStationItems(
      ORDER,
      'kitchen',
      'ready',
      'kitchen',
      'restaurant_dev',
      staffActor,
    );

    // Agora TODOS os itens estão ready → order fecha em 'ready'.
    expect(db.items[FOOD_ITEM].status).toBe('ready');
    expect(db.items[DRINK_ITEM].status).toBe('ready');
    expect(db.items[FOOD_ITEM].prepStartedAt).toBe('started:food');
    expect(db.items[DRINK_ITEM].prepStartedAt).toBe('started:drink');
    expect(db.order.status).toBe('ready');
  });

  it('caller legado sem station avança TODOS os itens sem divergir do pedido agregado', async () => {
    const db = fakeMixedDb();
    const service = makeService(db.conn);

    await service.advanceStationItems(
      ORDER,
      null,
      'in_progress',
      'manager',
      'restaurant_dev',
      staffActor,
    );
    expect(db.order.status).toBe('in_progress');
    expect(db.items[FOOD_ITEM].status).toBe('in_progress');
    expect(db.items[DRINK_ITEM].status).toBe('in_progress');
    expect(db.items[FOOD_ITEM].prepStartedAt).toBe('started:all');
    expect(db.items[DRINK_ITEM].prepStartedAt).toBe('started:all');

    await service.advanceStationItems(
      ORDER,
      null,
      'ready',
      'manager',
      'restaurant_dev',
      staffActor,
    );
    expect(db.order.status).toBe('ready');
    expect(db.items[FOOD_ITEM].status).toBe('ready');
    expect(db.items[DRINK_ITEM].status).toBe('ready');
  });

  it('alias legado confirmed -> preparing também sincroniza todos os itens', async () => {
    const db = fakeMixedDb('confirmed');
    const service = makeService(db.conn);

    await service.advanceStationItems(
      ORDER,
      null,
      'preparing',
      'manager',
      'restaurant_dev',
      staffActor,
    );
    expect(db.order.status).toBe('preparing');
    expect(db.items[FOOD_ITEM].status).toBe('in_progress');
    expect(db.items[DRINK_ITEM].status).toBe('in_progress');
  });

  it('valida a máquina global antes de tocar itens (open -> in_progress rejeitado)', async () => {
    const db = fakeMixedDb('open');
    const service = makeService(db.conn);

    await expect(
      service.advanceStationItems(
        ORDER,
        'kitchen',
        'in_progress',
        'cook',
        'restaurant_dev',
        staffActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.items[FOOD_ITEM].status).toBe('received');
    expect(db.items[DRINK_ITEM].status).toBe('received');
    expect(db.order.status).toBe('open');
  });
});

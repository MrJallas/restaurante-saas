/**
 * Regressões do read-model operacional de atraso.
 *
 * Contrato vigente:
 * - o único SLA configurável é o da cozinha (`kitchen_eta_max_minutes`);
 * - estação vem de `menu_items.kind` (`drink` = bar; demais = cozinha);
 * - somente itens de cozinha realmente `in_progress` entram no alerta;
 * - o relógio nasce em `order_items.prep_started_at`, não no pedido;
 * - carga exibida é a soma das quantidades ainda em preparo.
 *
 * Isso impede três falsos positivos importantes: pedido só de bebida, bar que
 * começou antes da cozinha num pedido misto e cozinha já pronta enquanto o bar
 * continua trabalhando.
 */

import { DashboardService } from './dashboard.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const noCacheRedis = {
  get: async () => null,
  set: async () => {},
} as unknown as RedisService;

type StationItem = {
  kind: 'food' | 'drink';
  status: 'received' | 'in_progress' | 'ready';
  quantity: number;
  prepStartedMinAgo: number | null;
};

type OrderModel = {
  order_id: string;
  table_label: string;
  table_number: number;
  items: StationItem[];
};

function fakeDb(opts: { orders: OrderModel[]; kitchenEtaMax: number | null }) {
  let lateQueryCount = 0;
  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('kitchen_eta_max_minutes')) {
      return [{ kitchen_eta_max_minutes: opts.kitchenEtaMax }];
    }
    if (s.includes('FROM table_sessions ts')) return [];
    if (s.includes('JOIN order_items oi')) {
      lateQueryCount += 1;
      // O fake recusa uma query que volte a usar o status/relógio agregado do
      // pedido. Assim os casos abaixo não passam apenas porque o fake devolveu
      // o resultado esperado independentemente do SQL.
      expect(s).toContain("oi.status = 'in_progress'");
      expect(s).toContain("mi.kind <> 'drink'");
      expect(s).toContain('oi.prep_started_at');
      expect(s).toMatch(/SUM\(oi\.quantity\)/i);
      expect(params).toEqual([opts.kitchenEtaMax]);

      const target = Number(params[0]);
      return opts.orders
        .flatMap((order) => {
          const activeFood = order.items.filter(
            (item) =>
              item.kind === 'food' &&
              item.status === 'in_progress' &&
              item.prepStartedMinAgo != null,
          );
          if (activeFood.length === 0) return [];
          const minutes = Math.max(...activeFood.map((item) => item.prepStartedMinAgo!));
          if (minutes <= target) return [];
          return [
            {
              order_id: order.order_id,
              table_label: order.table_label,
              table_number: String(order.table_number),
              station: 'kitchen',
              minutes_in_prep: String(minutes),
              item_count: String(activeFood.reduce((sum, item) => sum + item.quantity, 0)),
              target_minutes: String(target),
            },
          ];
        })
        .sort((a, b) => Number(b.minutes_in_prep) - Number(a.minutes_in_prep));
    }
    throw new Error(`fake dashboard: SQL não roteado: ${s}`);
  };
  return {
    conn: { query, getTenantSlug: () => 'restaurant_dev' } as unknown as TenantConnectionProvider,
    getLateQueryCount: () => lateQueryCount,
  };
}

function item(
  kind: StationItem['kind'],
  status: StationItem['status'],
  prepStartedMinAgo: number | null,
  quantity = 1,
): StationItem {
  return { kind, status, prepStartedMinAgo, quantity };
}

async function load(opts: { orders: OrderModel[]; kitchenEtaMax: number | null }) {
  const db = fakeDb(opts);
  const service = new DashboardService(db.conn, noCacheRedis);
  return { result: await service.getActiveTables(), db };
}

describe('DashboardService.getActiveTables — atraso real da estação cozinha', () => {
  it('inclui food em preparo além da meta e expõe target/estação/carga em unidades', async () => {
    const { result } = await load({
      kitchenEtaMax: 16,
      orders: [
        {
          order_id: 'food-late',
          table_label: 'Mesa 12',
          table_number: 12,
          items: [item('food', 'in_progress', 25, 3), item('food', 'in_progress', 20, 1)],
        },
      ],
    });

    expect(result.lateOrders).toEqual([
      {
        orderId: 'food-late',
        tableLabel: 'Mesa 12',
        tableNumber: 12,
        station: 'kitchen',
        minutesInPrep: 25,
        itemCount: 4,
        targetMinutes: 16,
      },
    ]);
  });

  it('não chama pedido somente de bebida de atraso da cozinha', async () => {
    const { result } = await load({
      kitchenEtaMax: 16,
      orders: [
        {
          order_id: 'bar-only',
          table_label: 'Mesa 2',
          table_number: 2,
          items: [item('drink', 'in_progress', 40, 6)],
        },
      ],
    });

    expect(result.lateOrders).toEqual([]);
  });

  it('pedido misto bar-first não inicia o relógio da cozinha antes de food entrar em preparo', async () => {
    const { result } = await load({
      kitchenEtaMax: 16,
      orders: [
        {
          order_id: 'mixed-bar-first',
          table_label: 'Mesa 3',
          table_number: 3,
          items: [item('drink', 'in_progress', 30, 2), item('food', 'received', null, 3)],
        },
      ],
    });

    expect(result.lateOrders).toEqual([]);
  });

  it('pedido misto usa o início real da cozinha, não o início mais antigo do bar', async () => {
    const { result } = await load({
      kitchenEtaMax: 16,
      orders: [
        {
          order_id: 'mixed-independent-clocks',
          table_label: 'Mesa 4',
          table_number: 4,
          items: [item('drink', 'in_progress', 30), item('food', 'in_progress', 5)],
        },
      ],
    });

    expect(result.lateOrders).toEqual([]);
  });

  it('cozinha pronta e bar em preparo não permanece como falso atraso da cozinha', async () => {
    const { result } = await load({
      kitchenEtaMax: 16,
      orders: [
        {
          order_id: 'food-ready-bar-working',
          table_label: 'Mesa 5',
          table_number: 5,
          items: [item('food', 'ready', 20, 2), item('drink', 'in_progress', 35, 2)],
        },
      ],
    });

    expect(result.lateOrders).toEqual([]);
  });

  it('exatamente na meta ainda não passou do limite', async () => {
    const { result } = await load({
      kitchenEtaMax: 16,
      orders: [
        {
          order_id: 'at-boundary',
          table_label: 'Mesa 6',
          table_number: 6,
          items: [item('food', 'in_progress', 16)],
        },
      ],
    });

    expect(result.lateOrders).toEqual([]);
  });

  it('sem meta não executa julgamento nem usa prep_time do cardápio como SLA implícito', async () => {
    const { result, db } = await load({
      kitchenEtaMax: null,
      orders: [
        {
          order_id: 'no-target',
          table_label: 'Mesa 7',
          table_number: 7,
          items: [item('food', 'in_progress', 90)],
        },
      ],
    });

    expect(result.lateOrders).toEqual([]);
    expect(result.kitchenEtaMaxMinutes).toBeNull();
    expect(db.getLateQueryCount()).toBe(0);
  });
});

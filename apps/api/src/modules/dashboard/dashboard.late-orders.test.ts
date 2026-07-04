/**
 * BUG P1 (re-scan · dashboard.service.ts): o KPI "Em alerta" / late-order e o
 * `minutes_in_prep` derivavam de `orders.updated_at`. Mas o reorder da cozinha
 * (applyKitchenRanksInTx) faz `SET priority_rank=..., updated_at = now()` em
 * pedidos in_progress. Resultado: toda vez que o gerente vê um pedido atrasado,
 * abre "Ver fila" e reordena, o `updated_at` é bumpado e TODOS os alertas somem
 * (minutes_in_prep → 0, e o pedido some do filtro `updated_at < now()-eta`). O
 * sinal central "o que está atrasado" quebrava logo depois de agir sobre ele.
 *
 * FIX: o "tempo em preparo" deriva do momento REAL em que o pedido entrou em
 * preparo — a transição pra `in_progress` gravada na order_status_history (a
 * MESMA fonte que a query irmã getOrderFunnel já usa) — NÃO de updated_at, que
 * qualquer UPDATE (inclusive reorder) bumpa.
 *
 * Estes testes modelam o banco com DUAS fontes independentes por pedido:
 *   - prepStartedMinAgo → order_status_history.created_at (to_status in_progress)
 *   - updatedMinAgo     → orders.updated_at (bumpado pelo reorder)
 * O fake resolve a query de late-order pela fonte que o SQL de fato referencia:
 * se o SQL toca order_status_history, usa prepStartedMinAgo (correto); se ainda
 * depende só de o.updated_at, usa updatedMinAgo (quebra sob reorder). Assim o
 * teste FALHA contra o código bugado e PASSA depois do fix.
 */

import { DashboardService } from './dashboard.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const noCacheRedis = {
  get: async () => null,
  set: async () => {},
} as unknown as RedisService;

type OrderModel = {
  order_id: string;
  table_label: string;
  item_count: number;
  /** Minutos desde a transição REAL pra in_progress (order_status_history). */
  prepStartedMinAgo: number;
  /** Minutos desde o último UPDATE em orders (bumpado pelo reorder). */
  updatedMinAgo: number;
};

/**
 * Banco fake ciente de SQL: modela orders + order_status_history e resolve a
 * query de late-order pela FONTE de tempo que o SQL referencia. O filtro de
 * "atrasado" (idade em preparo > eta) e o minutes_in_prep saem da MESMA fonte.
 */
function fakeDb(opts: { orders: OrderModel[]; kitchenEtaMax: number | null }) {
  const query = async (sql: string): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('kitchen_eta_max_minutes')) {
      return [{ kitchen_eta_max_minutes: opts.kitchenEtaMax }];
    }
    // active tables (não exercitado aqui)
    if (s.includes('FROM table_sessions') && !s.includes("status = 'in_progress'")) return [];
    // late-order query — identificável pelo filtro de status.
    if (s.includes("status = 'in_progress'")) {
      // Fonte CORRETA: se o SQL deriva o relógio da order_status_history
      // (transição pra in_progress), o minutes_in_prep = prepStartedMinAgo.
      // Fonte BUGADA (fallback): se ainda depende de o.updated_at, o relógio
      // = updatedMinAgo (que o reorder zera).
      const usesHistory = s.includes('order_status_history');
      const ageOf = (o: OrderModel) => (usesHistory ? o.prepStartedMinAgo : o.updatedMinAgo);
      const eta = opts.kitchenEtaMax ?? 0;
      return opts.orders
        .filter((o) => ageOf(o) > eta) // mesmo filtro do WHERE ... < now()-eta
        .sort((a, b) => ageOf(b) - ageOf(a)) // mais antigo primeiro
        .map((o) => ({
          order_id: o.order_id,
          table_label: o.table_label,
          minutes_in_prep: String(ageOf(o)),
          item_count: String(o.item_count),
        }));
    }
    throw new Error(`fake dashboard: SQL não roteado: ${s}`);
  };
  return { query, getTenantSlug: () => 'restaurant_dev' } as unknown as TenantConnectionProvider;
}

describe('DashboardService.getActiveTables — relógio de preparo à prova de reorder', () => {
  it('pedido em preparo há 25min cujo updated_at foi bumpado (reorder → 0min) continua contando 25min', async () => {
    const service = new DashboardService(
      fakeDb({
        kitchenEtaMax: 16,
        orders: [
          {
            order_id: 'o1',
            table_label: 'Mesa 12',
            item_count: 2,
            // Entrou em preparo há 25min (order_status_history) — está atrasado.
            prepStartedMinAgo: 25,
            // Gerente acabou de reordenar: updated_at bumpado → 0min atrás.
            updatedMinAgo: 0,
          },
        ],
      }),
      noCacheRedis,
    );

    const res = await service.getActiveTables();

    // O pedido NÃO pode sumir do alerta só porque foi reordenado.
    expect(res.lateOrders).toHaveLength(1);
    // O relógio conta desde o preparo real (25min), não desde o reorder (0min).
    expect(res.lateOrders[0]).toEqual({
      orderId: 'o1',
      tableLabel: 'Mesa 12',
      minutesInPrep: 25,
      itemCount: 2,
    });
  });

  it('pedido dentro da meta (prep há 5min) não aparece mesmo sem bump de updated_at', async () => {
    const service = new DashboardService(
      fakeDb({
        kitchenEtaMax: 16,
        orders: [
          {
            order_id: 'o2',
            table_label: 'Mesa 3',
            item_count: 1,
            prepStartedMinAgo: 5,
            updatedMinAgo: 5,
          },
        ],
      }),
      noCacheRedis,
    );
    const res = await service.getActiveTables();
    expect(res.lateOrders).toEqual([]);
  });
});

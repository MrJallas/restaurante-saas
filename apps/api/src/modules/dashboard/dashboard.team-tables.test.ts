/**
 * Decisão Caleb 2026-07-04 (gate 1D): KPIs por funcionário e mesas do
 * manager saem do fake. Fontes 100% reais:
 *   - waiter_calls.acknowledged_by/acknowledged_at (chamados + resposta)
 *   - order_deliveries.claimed_by/claimed_at (entregas)
 *   - table_sessions + orders (mesas ativas com conta e idade)
 *   - kitchen_eta_max (em-alerta: preparo acima da meta)
 * O que NÃO tem fonte (rating por funcionário, vendas por garçom) fica
 * FORA — selo DEMO na tela, nunca número inventado sobre nome real.
 */

import { DashboardService } from './dashboard.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

// Cache-aside transparente (FASE 3): estes testes exercitam a query, não o
// cache — Redis que sempre erra o get e ignora o set mantém cada chamada
// batendo no fakeDb.
const noCacheRedis = {
  get: async () => null,
  set: async () => {},
} as unknown as RedisService;

function fakeDb(opts: {
  teamRows?: Array<Record<string, unknown>>;
  activeRows?: Array<Record<string, unknown>>;
  lateRows?: Array<Record<string, unknown>>;
  kitchenEtaMax?: number | null;
}) {
  const query = async (sql: string): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('FROM staff') && s.includes('waiter_calls')) return opts.teamRows ?? [];
    if (s.includes('FROM table_sessions')) return opts.activeRows ?? [];
    if (s.includes("status = 'in_progress'")) return opts.lateRows ?? [];
    if (s.includes('kitchen_eta_max_minutes')) {
      return [{ kitchen_eta_max_minutes: opts.kitchenEtaMax ?? null }];
    }
    throw new Error(`fake dashboard: SQL não roteado: ${s}`);
  };
  return { query, getTenantSlug: () => 'restaurant_dev' } as unknown as TenantConnectionProvider;
}

describe('DashboardService.getTeamKpis — só métricas com fonte real', () => {
  it('coage agregados do pg (string) e calcula resposta média em minutos', async () => {
    const service = new DashboardService(
      fakeDb({
        teamRows: [
          {
            staff_id: 's1',
            name: 'Ana Garcom',
            role: 'waiter',
            calls_acknowledged: '7',
            avg_response_secs: '95.0',
            deliveries: '12',
            avg_rating: '4.60',
            ratings_count: '5',
          },
          {
            staff_id: 's2',
            name: 'Bruno Garcom',
            role: 'waiter',
            calls_acknowledged: '0',
            avg_response_secs: null,
            deliveries: '3',
            avg_rating: null,
            ratings_count: '0',
          },
        ],
      }),
      noCacheRedis,
    );
    const kpis = await service.getTeamKpis();
    expect(kpis.team).toHaveLength(2);
    expect(kpis.team[0]).toEqual({
      staffId: 's1',
      name: 'Ana Garcom',
      role: 'waiter',
      callsAcknowledged: 7,
      avgResponseMinutes: 1.6,
      deliveries: 12,
      // Decisão Caleb 2026-07-04: nota do pedido conta pro garçom que ENTREGOU.
      avgRating: 4.6,
      ratingsCount: 5,
    });
    expect(kpis.team[1].avgResponseMinutes).toBeNull(); // sem chamado, sem média inventada
    expect(kpis.team[1].avgRating).toBeNull(); // sem avaliação, sem nota inventada
  });
});

describe('DashboardService.getActiveTables — mesas com conta e alerta reais', () => {
  it('sessões ativas com conta somada; em-alerta só com meta configurada', async () => {
    const service = new DashboardService(
      fakeDb({
        kitchenEtaMax: 16,
        activeRows: [
          {
            session_id: 'sess-1',
            table_label: 'Mesa 12',
            table_number: '12',
            opened_minutes: '64.2',
            people: '3',
            subtotal_cents: '5060',
          },
        ],
        lateRows: [
          {
            order_id: 'o1',
            table_label: 'Mesa 12',
            table_number: '12',
            minutes_in_prep: '21.4',
            item_count: '2',
          },
        ],
      }),
      noCacheRedis,
    );
    const res = await service.getActiveTables();
    expect(res.tables[0]).toEqual({
      sessionId: 'sess-1',
      tableLabel: 'Mesa 12',
      tableNumber: 12,
      openedMinutes: 64,
      people: 3,
      subtotalCents: 5060,
    });
    expect(res.lateOrders[0]).toEqual({
      orderId: 'o1',
      tableLabel: 'Mesa 12',
      tableNumber: 12,
      station: 'kitchen',
      minutesInPrep: 21,
      itemCount: 2,
      targetMinutes: 16,
    });
    expect(res.kitchenEtaMaxMinutes).toBe(16);
  });

  it('sem meta configurada, lateOrders vem vazio (sem alerta inventado)', async () => {
    const service = new DashboardService(
      fakeDb({ kitchenEtaMax: null, activeRows: [], lateRows: [] }),
      noCacheRedis,
    );
    const res = await service.getActiveTables();
    expect(res.lateOrders).toEqual([]);
    expect(res.kitchenEtaMaxMinutes).toBeNull();
  });
});

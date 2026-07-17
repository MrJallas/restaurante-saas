import type { RedisService } from '../infra/redis/redis.service';
import type { MongoService } from '../infra/mongo/mongo.service';
import {
  RESTAURANT_LOCAL_DATE_SQL,
  RESTAURANT_LOCAL_NOW_SQL,
} from '../common/utils/restaurant-local-time';
import type { TenantConnectionProvider } from './tenant/tenant-connection.provider';
import { DashboardService } from './dashboard/dashboard.service';
import { ManagerAccountService } from './manager-account/manager-account.service';
import { StaffMessagesService } from './staff-messages/staff-messages.service';
import { ShiftsController } from './shifts/shifts.controller';
import type { ShiftsService } from './shifts/shifts.service';

const normalized = (value: string) => value.replace(/\s+/g, ' ').trim();
const localDateSql = normalized(RESTAURANT_LOCAL_DATE_SQL);
const localNowSql = normalized(RESTAURANT_LOCAL_NOW_SQL);

const noCacheRedis = {
  get: async () => null,
  set: async () => undefined,
} as unknown as RedisService;

describe('relógio civil configurável do tenant', () => {
  it('dashboard ancora todas as janelas civis em settings.timezone, sem CURRENT_DATE', async () => {
    const calls: string[] = [];
    const conn = {
      getTenantSlug: () => 'restaurant_dev',
      query: async (sql: string) => {
        const value = normalized(sql);
        calls.push(value);
        if (value.includes('FROM assistant_messages')) {
          return [
            {
              total_messages: '0',
              total_tokens: '0',
              total_cost_cents: '0',
              blocked_count: '0',
            },
          ];
        }
        if (value.includes('COUNT(DISTINCT customer_id)')) return [{ count: '0' }];
        if (value.includes('AVG(overall_rating)')) return [{ avg: null }];
        if (value.includes('COALESCE(SUM(amount_cents)')) return [{ revenue: '0' }];
        if (value.includes('COUNT(*) as count')) return [{ count: '0' }];
        return [];
      },
    } as unknown as TenantConnectionProvider;
    const service = new DashboardService(conn, noCacheRedis);

    await service.getOrderFunnel();
    await service.getTeamKpis();
    await service.getOverview();
    await service.getRevenueChart(7);
    await service.getTopItems(10, 30);
    await service.getAiUsage();

    const civilQueries = calls.filter((sql) =>
      /order_status_history|waiter_calls|payments|visits|feedbacks|assistant_messages|FROM order_items/.test(
        sql,
      ),
    );
    expect(civilQueries.length).toBeGreaterThanOrEqual(8);
    for (const sql of civilQueries) {
      expect(sql).toContain(localDateSql);
      expect(sql).toContain('JOIN pg_timezone_names');
      expect(sql).not.toMatch(/\bcurrent_date\b/i);
    }
  });

  it('endShift usa a data civil configurada nas métricas e no início do resumo', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const conn = {
      query: async (sql: string, params: unknown[] = []) => {
        const value = normalized(sql);
        calls.push({ sql: value, params });
        if (value.startsWith('SELECT name FROM staff WHERE id')) return [{ name: 'Dona Demo' }];
        if (value.includes('FROM orders')) return [{ orders: 0, sales_cents: 0 }];
        if (value.includes('FROM table_sessions')) return [{ tables_served: 0 }];
        if (value.includes('FROM complaints')) return [{ critical_alerts: 0 }];
        if (value.includes("role IN ('waiter'")) return [];
        if (value.startsWith('INSERT INTO manager_shift_logs')) {
          return [
            {
              id: 'log-1',
              staff_id: 'owner-1',
              staff_name: 'Dona Demo',
              shift_label: 'Turno atual',
              started_at: '2026-07-11T03:00:00.000Z',
              ended_at: '2026-07-11T12:00:00.000Z',
              sales_cents: 0,
              orders: 0,
              tables_served: 0,
              critical_alerts: 0,
              avg_ticket_cents: 0,
              waiters_on_shift: [],
              created_at: '2026-07-11T12:00:00.000Z',
            },
          ];
        }
        return [];
      },
    } as unknown as TenantConnectionProvider;
    const service = new ManagerAccountService({} as MongoService, conn, {} as RedisService);

    await service.endShift('restaurant_dev', 'owner-1');

    const civilQueries = calls.filter(({ sql }) =>
      /FROM orders|FROM table_sessions|FROM complaints|INSERT INTO manager_shift_logs/.test(sql),
    );
    for (const { sql } of civilQueries) {
      expect(sql).toContain(localDateSql);
      expect(sql).not.toMatch(/\bcurrent_date\b/i);
    }
    const insert = calls.find(({ sql }) => sql.startsWith('INSERT INTO manager_shift_logs'))!;
    expect(insert.sql).toContain('AT TIME ZONE');
  });

  it('grupos de turno usam data e hora civis do restaurante, inclusive overnight', async () => {
    const calls: string[] = [];
    const conn = {
      query: async (sql: string) => {
        calls.push(normalized(sql));
        return [];
      },
    } as unknown as TenantConnectionProvider;
    const service = new StaffMessagesService(conn);

    await service.listThreadsForStaff('staff-1');

    const lifecycleSql = calls.slice(0, 2).join('\n');
    expect(lifecycleSql).toContain(localDateSql);
    expect(lifecycleSql).toContain(localNowSql);
    expect(lifecycleSql).not.toMatch(/\bcurrent_date\b|\blocaltime\b/i);
  });

  it('GET /shifts sem date pede a data local ao serviço, não deriva em UTC no Node', async () => {
    const listForDate = jest.fn(async (date: string) => [{ date }]);
    const getRestaurantLocalDate = jest.fn(async () => '2026-07-10');
    const service = { listForDate, getRestaurantLocalDate } as unknown as ShiftsService;
    const controller = new ShiftsController(service);

    await expect(controller.list({})).resolves.toEqual([{ date: '2026-07-10' }]);
    expect(getRestaurantLocalDate).toHaveBeenCalledTimes(1);
    expect(listForDate).toHaveBeenCalledWith('2026-07-10');
  });
});

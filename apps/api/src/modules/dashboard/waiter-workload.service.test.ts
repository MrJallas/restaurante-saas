import { alertVisibleForRole, type AlertsService } from '../alerts/alerts.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import {
  ActiveSessionWorkSignal,
  buildWaiterWorkloadSnapshot,
  WaiterAvailabilitySignal,
  WAITER_WORKLOAD_ALERT_KIND,
  WaiterWorkloadService,
} from './waiter-workload.service';

function waiter(
  staffId: string,
  overrides: Partial<WaiterAvailabilitySignal> = {},
): WaiterAvailabilitySignal {
  return {
    staffId,
    name: `Garçom ${staffId}`,
    onShift: true,
    paused: false,
    zones: [{ zoneId: 'zone-1', zoneName: 'Salão' }],
    ...overrides,
  };
}

function session(
  tableNumber: number,
  overrides: Partial<ActiveSessionWorkSignal> = {},
): ActiveSessionWorkSignal {
  return {
    sessionId: `session-${tableNumber}`,
    tableId: `table-${tableNumber}`,
    tableCode: `M${tableNumber}`,
    tableLabel: `Mesa ${tableNumber}`,
    tableNumber,
    tableSortOrder: tableNumber,
    zoneId: 'zone-1',
    zoneName: 'Salão',
    zoneSortOrder: 1,
    people: 2,
    activeOrders: 1,
    lateOrders: 0,
    pendingWaiterCalls: 0,
    pendingDeliveries: 0,
    ...overrides,
  };
}

function assignmentsByWaiter(snapshot: ReturnType<typeof buildWaiterWorkloadSnapshot>) {
  return Object.fromEntries(
    snapshot.waiters.map((workload) => [
      workload.staffId,
      workload.assignedTables.map((table) => table.sessionId),
    ]),
  );
}

describe('buildWaiterWorkloadSnapshot', () => {
  it('distribui uma zona compartilhada sem duplicar mesas, pessoas ou sinais', () => {
    const waiters = [waiter('a'), waiter('b')];
    const sessions = [
      session(1, { people: 1 }),
      session(2, { people: 2 }),
      session(3, { people: 3 }),
      session(4, { people: 4 }),
    ];

    const snapshot = buildWaiterWorkloadSnapshot(waiters, sessions, '2026-07-11T12:00:00Z');
    const assigned = snapshot.waiters.flatMap((workload) => workload.assignedTables);

    expect(snapshot.activeSessions).toBe(4);
    expect(snapshot.assignedSessions).toBe(4);
    expect(snapshot.waiters.map((workload) => workload.tables).sort()).toEqual([2, 2]);
    expect(assigned).toHaveLength(4);
    expect(new Set(assigned.map((table) => table.sessionId)).size).toBe(4);
    expect(snapshot.waiters.reduce((sum, workload) => sum + workload.people, 0)).toBe(10);
    expect(assigned.every((table) => table.eligibilitySource === 'zone_on_shift')).toBe(true);

    const reversed = buildWaiterWorkloadSnapshot(
      [...waiters].reverse(),
      [...sessions].reverse(),
      '2026-07-11T12:00:00Z',
    );
    expect(assignmentsByWaiter(reversed)).toEqual(assignmentsByWaiter(snapshot));
  });

  it('detecta desequilíbrio material usando os sinais reais da sessão', () => {
    const snapshot = buildWaiterWorkloadSnapshot(
      [waiter('a'), waiter('b')],
      [
        session(1, {
          people: 6,
          activeOrders: 3,
          lateOrders: 1,
          pendingWaiterCalls: 1,
          pendingDeliveries: 1,
        }),
        session(2, { people: 1, activeOrders: 0 }),
      ],
    );

    expect(snapshot.imbalance).toMatchObject({
      reason: 'load_score_skew',
      severity: 'atenção',
      highestWaiterId: 'a',
      lowestWaiterId: 'b',
    });
    expect(snapshot.imbalance!.scoreDelta).toBeGreaterThanOrEqual(30);
  });

  it('não sinaliza uma distribuição operacional equilibrada', () => {
    const snapshot = buildWaiterWorkloadSnapshot(
      [waiter('a'), waiter('b')],
      [session(1), session(2), session(3), session(4)],
    );

    expect(snapshot.waiters.map((workload) => workload.loadScore).sort()).toEqual([36, 36]);
    expect(snapshot.imbalance).toBeNull();
  });

  it('marca sessões sem nenhum garçom elegível como críticas', () => {
    const snapshot = buildWaiterWorkloadSnapshot(
      [waiter('paused', { paused: true })],
      [session(1)],
    );

    expect(snapshot.assignedSessions).toBe(0);
    expect(snapshot.unassignedSessions).toHaveLength(1);
    expect(snapshot.imbalance).toMatchObject({
      reason: 'unassigned_sessions',
      severity: 'crítica',
      unassignedSessions: 1,
    });
  });
});

describe('WaiterWorkloadService — alerta gerencial', () => {
  const waiterRows = [
    {
      staff_id: 'a',
      staff_name: 'Ana',
      zone_id: 'zone-1',
      zone_name: 'Salão',
      on_shift: true,
      paused: false,
    },
    {
      staff_id: 'b',
      staff_name: 'Bruno',
      zone_id: 'zone-1',
      zone_name: 'Salão',
      on_shift: true,
      paused: false,
    },
  ];

  function sessionRow(input: ActiveSessionWorkSignal) {
    return {
      session_id: input.sessionId,
      table_id: input.tableId,
      table_code: input.tableCode,
      table_label: input.tableLabel,
      table_number: input.tableNumber,
      table_sort_order: input.tableSortOrder,
      zone_id: input.zoneId,
      zone_name: input.zoneName,
      zone_sort_order: input.zoneSortOrder,
      people: input.people,
      active_orders: input.activeOrders,
      late_orders: input.lateOrders,
      pending_waiter_calls: input.pendingWaiterCalls,
      pending_deliveries: input.pendingDeliveries,
    };
  }

  function makeService(sessions: ActiveSessionWorkSignal[]) {
    const sql: string[] = [];
    const conn = {
      query: async (query: string) => {
        sql.push(query.replace(/\s+/g, ' ').trim());
        if (query.includes('FROM staff s')) return waiterRows;
        if (query.includes('FROM table_sessions ts')) return sessions.map(sessionRow);
        throw new Error('SQL inesperado no fake de workload');
      },
    } as unknown as TenantConnectionProvider;
    const alerts = {
      createOrRefreshSingleton: jest.fn(async () => ({
        alert: {},
        created: true,
        suppressed: false,
      })),
      resolveOpenByKind: jest.fn(async () => 0),
    } as unknown as AlertsService;
    return { service: new WaiterWorkloadService(conn, alerts), alerts, sql };
  }

  it('cria/atualiza um único alerta quando há desequilíbrio material', async () => {
    const heavy = session(1, {
      people: 6,
      activeOrders: 3,
      lateOrders: 1,
      pendingWaiterCalls: 1,
      pendingDeliveries: 1,
    });
    const ctx = makeService([heavy, session(2, { people: 1, activeOrders: 0 })]);

    const snapshot = await ctx.service.getSnapshot();

    expect(snapshot.imbalance?.reason).toBe('load_score_skew');
    expect(ctx.alerts.createOrRefreshSingleton).toHaveBeenCalledTimes(1);
    expect(ctx.alerts.createOrRefreshSingleton).toHaveBeenCalledWith(
      expect.objectContaining({ kind: WAITER_WORKLOAD_ALERT_KIND }),
    );
    expect(ctx.alerts.resolveOpenByKind).not.toHaveBeenCalled();
    expect(ctx.sql[0]).toContain('waiter_zone_assignments');
    expect(ctx.sql[0]).toContain('staff_shift_assignments');
    expect(ctx.sql[0]).toContain('zone_pauses');
    expect(ctx.sql[1]).toContain('pending_waiter_calls');
    expect(ctx.sql[1]).toContain('pending_deliveries');
    expect(ctx.sql[1]).toContain("late_item.status = 'in_progress'");
    expect(ctx.sql[1]).toContain('late_item.prep_started_at');
    expect(ctx.sql[1]).toContain("late_menu.kind <> 'drink'");
    expect(ctx.sql[1]).not.toContain('order_status_history');
  });

  it('mantém o alerta de carga restrito a manager/owner no filtro role-aware', () => {
    const alert = {
      kind: WAITER_WORKLOAD_ALERT_KIND,
      title: 'Carga de garçons desequilibrada',
      sub: null,
    };
    expect(alertVisibleForRole(alert, 'manager')).toBe(true);
    expect(alertVisibleForRole(alert, 'owner')).toBe(true);
    expect(alertVisibleForRole(alert, 'waiter')).toBe(false);
    expect(alertVisibleForRole(alert, 'host')).toBe(false);
  });

  it('resolve o alerta aberto quando a distribuição volta ao normal', async () => {
    const ctx = makeService([session(1), session(2), session(3), session(4)]);

    const snapshot = await ctx.service.getSnapshot();

    expect(snapshot.imbalance).toBeNull();
    expect(ctx.alerts.resolveOpenByKind).toHaveBeenCalledTimes(1);
    expect(ctx.alerts.createOrRefreshSingleton).not.toHaveBeenCalled();
  });
});

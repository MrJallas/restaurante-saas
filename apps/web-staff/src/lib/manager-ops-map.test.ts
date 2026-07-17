import { buildManagerOpsMapTables } from './manager-ops-map';
import type { ActiveTablesResponse } from './api/manager';
import type { TableOverviewEntry } from './api/waiter';

function overview(number: number, occupied: boolean): TableOverviewEntry {
  return {
    id: `table-${number}`,
    code: `M${number}`,
    label: `Mesa ${number}`,
    number,
    capacity: 4,
    sort_order: number,
    map_x: null,
    map_y: null,
    zone_id: null,
    zone_name: null,
    zone_sort_order: number,
    occupied,
  };
}

describe('buildManagerOpsMapTables', () => {
  it('mostra mesas livres, ativas e atrasadas com severidade/subtotal reais', () => {
    const active: ActiveTablesResponse = {
      kitchenEtaMaxMinutes: 20,
      tables: [
        {
          sessionId: 'session-2',
          tableLabel: 'Mesa 2',
          tableNumber: 2,
          openedMinutes: 30,
          people: 3,
          subtotalCents: 12_550,
        },
        {
          sessionId: 'session-3',
          tableLabel: 'Mesa 3',
          tableNumber: 3,
          openedMinutes: 45,
          people: 4,
          subtotalCents: 8_000,
        },
        {
          sessionId: 'session-4',
          tableLabel: 'Mesa 4',
          tableNumber: 4,
          openedMinutes: 50,
          people: 2,
          subtotalCents: 6_000,
        },
      ],
      lateOrders: [
        {
          orderId: 'order-warn',
          tableLabel: 'Mesa 3',
          tableNumber: 3,
          station: 'kitchen',
          minutesInPrep: 24,
          itemCount: 2,
          targetMinutes: 20,
        },
        {
          orderId: 'order-crit',
          tableLabel: 'Mesa 4',
          tableNumber: 4,
          station: 'kitchen',
          minutesInPrep: 31,
          itemCount: 1,
          targetMinutes: 20,
        },
      ],
    };

    expect(
      buildManagerOpsMapTables(
        [overview(1, false), overview(2, true), overview(3, true), overview(4, true)],
        active,
      ),
    ).toEqual([
      { n: 1, st: 'free' },
      { n: 2, st: 'ok', val: 126 },
      { n: 3, st: 'warn', wait: 24, val: 80 },
      { n: 4, st: 'crit', wait: 31, val: 60 },
    ]);
  });

  it('considera sessao ativa mesmo se a planta chegou alguns milissegundos desatualizada', () => {
    const active: ActiveTablesResponse = {
      kitchenEtaMaxMinutes: null,
      tables: [
        {
          sessionId: 'session-8',
          tableLabel: 'Mesa 8',
          tableNumber: 8,
          openedMinutes: 1,
          people: 1,
          subtotalCents: 0,
        },
      ],
      lateOrders: [],
    };

    expect(buildManagerOpsMapTables([overview(8, false)], active)).toEqual([
      { n: 8, st: 'ok', val: 0 },
    ]);
  });

  it('normaliza BIGINT serializado como string antes de cruzar mapa, atraso e workload', () => {
    const active: ActiveTablesResponse = {
      kitchenEtaMaxMinutes: 10,
      tables: [
        {
          sessionId: 'session-7111',
          tableLabel: 'Mesa 7111',
          tableNumber: 7111,
          openedMinutes: 30,
          people: 2,
          subtotalCents: 5_400,
        },
      ],
      lateOrders: [
        {
          orderId: 'order-7111',
          tableLabel: 'Mesa 7111',
          tableNumber: 7111,
          station: 'kitchen',
          minutesInPrep: 30,
          itemCount: 1,
          targetMinutes: 10,
        },
      ],
    };
    const wireOverview = {
      ...overview(7111, true),
      number: '7111',
    } as unknown as TableOverviewEntry;

    expect(buildManagerOpsMapTables([wireOverview], active)).toEqual([
      { n: 7111, st: 'crit', wait: 30, val: 54 },
    ]);
  });

  it('projeta na mesa o único garçom atribuído pelo workload do backend', () => {
    const active: ActiveTablesResponse = {
      kitchenEtaMaxMinutes: 20,
      tables: [
        {
          sessionId: 'session-2',
          tableLabel: 'Mesa 2',
          tableNumber: 2,
          openedMinutes: 10,
          people: 2,
          subtotalCents: 1_000,
        },
      ],
      lateOrders: [],
    };

    expect(
      buildManagerOpsMapTables([overview(2, true)], active, {
        generatedAt: '2026-07-11T12:00:00Z',
        strategy: 'zone_candidate_round_robin_v1',
        weights: {
          table: 10,
          person: 2,
          activeOrder: 4,
          lateOrder: 12,
          pendingWaiterCall: 10,
          pendingDelivery: 8,
        },
        activeSessions: 1,
        assignedSessions: 1,
        unassignedSessions: [],
        totalLoadScore: 18,
        imbalance: null,
        waiters: [
          {
            staffId: 'waiter-1',
            name: 'Ana Souza',
            onShift: true,
            paused: false,
            availableForAssignment: true,
            zones: [{ zoneId: 'zone-1', zoneName: 'Salão' }],
            tables: 1,
            people: 2,
            activeOrders: 1,
            lateOrders: 0,
            pendingWaiterCalls: 0,
            pendingDeliveries: 0,
            loadScore: 18,
            assignedTables: [
              {
                sessionId: 'session-2',
                tableId: 'table-2',
                tableCode: 'M2',
                tableLabel: 'Mesa 2',
                tableNumber: 2,
                zoneId: 'zone-1',
                zoneName: 'Salão',
                people: 2,
                activeOrders: 1,
                lateOrders: 0,
                pendingWaiterCalls: 0,
                pendingDeliveries: 0,
                loadScore: 18,
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        n: 2,
        st: 'ok',
        val: 10,
        waiterId: 'waiter-1',
        waiterName: 'Ana Souza',
        waiterInitials: 'AS',
      },
    ]);
  });

  it('calcula severidade com o target da própria linha, não com o global da resposta', () => {
    const active: ActiveTablesResponse = {
      // Mantido por compatibilidade/meta-missing. Se o mapa ainda usar este
      // valor, 12/20 seria warn; a row foi classificada com target 8 e é crit.
      kitchenEtaMaxMinutes: 20,
      tables: [
        {
          sessionId: 'session-9',
          tableLabel: 'Mesa 9',
          tableNumber: 9,
          openedMinutes: 30,
          people: 2,
          subtotalCents: 2_000,
        },
      ],
      lateOrders: [
        {
          orderId: 'order-own-target',
          tableLabel: 'Mesa 9',
          tableNumber: 9,
          station: 'kitchen',
          minutesInPrep: 12,
          itemCount: 3,
          targetMinutes: 8,
        },
      ],
    };

    expect(buildManagerOpsMapTables([overview(9, true)], active)).toEqual([
      { n: 9, st: 'crit', wait: 12, val: 20 },
    ]);
  });
});

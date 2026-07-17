import type { WaiterWorkloadSnapshot } from './api/manager';
import { projectManagerWorkload, waitersOnShift } from './manager-waiter-workload';

function snapshot(): WaiterWorkloadSnapshot {
  const base = {
    onShift: true,
    paused: false,
    availableForAssignment: true,
    zones: [{ zoneId: 'zone-1', zoneName: 'Salão' }],
    lateOrders: 0,
    pendingDeliveries: 0,
  };
  return {
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
    activeSessions: 4,
    assignedSessions: 4,
    unassignedSessions: [],
    totalLoadScore: 92,
    imbalance: {
      reason: 'load_score_skew',
      severity: 'atenção',
      highestWaiterId: 'waiter-a',
      lowestWaiterId: 'waiter-b',
      scoreDelta: 44,
      tableDelta: 0,
      unassignedSessions: 0,
    },
    waiters: [
      {
        ...base,
        staffId: 'waiter-a',
        name: 'Ana',
        tables: 2,
        people: 3,
        activeOrders: 3,
        pendingWaiterCalls: 1,
        loadScore: 68,
        assignedTables: [1, 3].map((n) => ({
          sessionId: `session-${n}`,
          tableId: `table-${n}`,
          tableCode: `M${n}`,
          tableLabel: `Mesa ${n}`,
          tableNumber: n,
          zoneId: 'zone-1',
          zoneName: 'Salão',
          people: n === 1 ? 2 : 1,
          activeOrders: n === 1 ? 3 : 0,
          lateOrders: n === 1 ? 1 : 0,
          pendingWaiterCalls: n === 1 ? 1 : 0,
          pendingDeliveries: n === 1 ? 1 : 0,
          loadScore: n === 1 ? 56 : 12,
        })),
      },
      {
        ...base,
        staffId: 'waiter-b',
        name: 'Bruno',
        tables: 2,
        people: 2,
        activeOrders: 0,
        pendingWaiterCalls: 0,
        loadScore: 24,
        assignedTables: [2, 4].map((n) => ({
          sessionId: `session-${n}`,
          tableId: `table-${n}`,
          tableCode: `M${n}`,
          tableLabel: `Mesa ${n}`,
          tableNumber: n,
          zoneId: 'zone-1',
          zoneName: 'Salão',
          people: 1,
          activeOrders: 0,
          lateOrders: 0,
          pendingWaiterCalls: 0,
          pendingDeliveries: 0,
          loadScore: 12,
        })),
      },
      {
        ...base,
        staffId: 'waiter-off',
        name: 'Fora do turno',
        onShift: false,
        zones: [],
        tables: 0,
        people: 0,
        activeOrders: 0,
        pendingWaiterCalls: 0,
        loadScore: 0,
        assignedTables: [],
      },
    ],
  };
}

describe('manager waiter workload projection', () => {
  it('filtra quem está fora do turno na seção operacional', () => {
    expect(waitersOnShift(snapshot()).map((waiter) => waiter.staffId)).toEqual([
      'waiter-a',
      'waiter-b',
    ]);
  });

  it('usa as mesas já deduplicadas do snapshot e marca apenas a maior carga', () => {
    const projection = projectManagerWorkload(snapshot());
    const assigned = projection.rows.flatMap((waiter) => waiter.assignedTables);

    expect(projection.rows.map((waiter) => waiter.tables)).toEqual([2, 2]);
    expect(assigned).toHaveLength(4);
    expect(new Set(assigned.map((table) => table.sessionId)).size).toBe(4);
    expect(projection.overloaded.map((waiter) => waiter.staffId)).toEqual(['waiter-a']);
    expect(projection.overloaded[0].zoneRows).toEqual([
      expect.objectContaining({ zoneName: 'Salão', tables: 2, people: 3 }),
    ]);
  });
});

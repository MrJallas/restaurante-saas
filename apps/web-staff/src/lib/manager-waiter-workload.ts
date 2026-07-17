import type { WaiterWorkloadEntry, WaiterWorkloadSnapshot } from './api/manager';

export interface ManagerWorkloadZoneRow {
  zoneName: string;
  tables: number;
  people: number;
  activeOrders: number;
  lateOrders: number;
  pendingWaiterCalls: number;
  pendingDeliveries: number;
}

export interface ManagerWorkloadRow extends WaiterWorkloadEntry {
  colorIndex: number;
  overloaded: boolean;
  zoneRows: ManagerWorkloadZoneRow[];
}

/** O título da seção promete "em turno"; não renderize capacidade offline. */
export function waitersOnShift(
  snapshot: WaiterWorkloadSnapshot | null | undefined,
): WaiterWorkloadEntry[] {
  return (snapshot?.waiters ?? []).filter((waiter) => waiter.onShift);
}

/**
 * Projeção canônica do drill-down de sobrecarga. O backend já distribuiu cada
 * sessão uma única vez; esta função só agrupa as mesas atribuídas por zona e
 * marca o maior workload apontado pelo sinal material.
 */
export function projectManagerWorkload(snapshot: WaiterWorkloadSnapshot | null | undefined): {
  rows: ManagerWorkloadRow[];
  overloaded: ManagerWorkloadRow[];
  unassignedSessions: number;
} {
  const highestWaiterId =
    snapshot?.imbalance?.reason === 'load_score_skew' ? snapshot.imbalance.highestWaiterId : null;
  const rows = waitersOnShift(snapshot).map((waiter, colorIndex) => {
    const byZone = new Map<string, ManagerWorkloadZoneRow>();
    for (const table of waiter.assignedTables) {
      const zoneName = table.zoneName ?? 'Sem zona';
      const zone = byZone.get(zoneName) ?? {
        zoneName,
        tables: 0,
        people: 0,
        activeOrders: 0,
        lateOrders: 0,
        pendingWaiterCalls: 0,
        pendingDeliveries: 0,
      };
      zone.tables += 1;
      zone.people += table.people;
      zone.activeOrders += table.activeOrders;
      zone.lateOrders += table.lateOrders;
      zone.pendingWaiterCalls += table.pendingWaiterCalls;
      zone.pendingDeliveries += table.pendingDeliveries;
      byZone.set(zoneName, zone);
    }
    return {
      ...waiter,
      colorIndex,
      overloaded: waiter.staffId === highestWaiterId,
      zoneRows: Array.from(byZone.values()).sort((a, b) =>
        a.zoneName.localeCompare(b.zoneName, 'pt-BR'),
      ),
    };
  });
  return {
    rows,
    overloaded: rows.filter((waiter) => waiter.overloaded),
    unassignedSessions:
      snapshot?.imbalance?.reason === 'unassigned_sessions'
        ? snapshot.imbalance.unassignedSessions
        : 0,
  };
}

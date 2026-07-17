import type { ActiveTablesResponse, WaiterWorkloadSnapshot } from './api/manager';
import type { TableOverviewEntry } from './api/waiter';

export interface ManagerOpsMapTable {
  n: number;
  st: 'ok' | 'warn' | 'crit' | 'free';
  wait?: number;
  waiterId?: string;
  waiterName?: string;
  waiterInitials?: string;
  val?: number;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Une a planta do salao ao read model operacional. A planta diz quais mesas
 * existem; active-tables e a fonte de verdade para sessao, subtotal e atraso.
 */
export function buildManagerOpsMapTables(
  overview: TableOverviewEntry[],
  active: ActiveTablesResponse,
  workload: WaiterWorkloadSnapshot | null = null,
): ManagerOpsMapTable[] {
  const activeByTable = new Map(active.tables.map((table) => [table.tableNumber, table]));
  const lateByTable = new Map<
    number,
    { minutesInPrep: number; targetMinutes: number; targetRatio: number }
  >();
  const waiterByTable = new Map<
    number,
    { waiterId: string; waiterName: string; waiterInitials: string }
  >();

  for (const waiter of workload?.waiters ?? []) {
    for (const table of waiter.assignedTables) {
      waiterByTable.set(table.tableNumber, {
        waiterId: waiter.staffId,
        waiterName: waiter.name,
        waiterInitials: initials(waiter.name),
      });
    }
  }

  for (const order of active.lateOrders) {
    if (order.targetMinutes <= 0) continue;
    const candidate = {
      minutesInPrep: order.minutesInPrep,
      targetMinutes: order.targetMinutes,
      targetRatio: order.minutesInPrep / order.targetMinutes,
    };
    const previous = lateByTable.get(order.tableNumber);
    // Uma futura estação com SLA próprio deve poder tornar a mesa crítica
    // mesmo tendo menos minutos absolutos. A severidade é relativa à meta que
    // classificou a própria row, não ao kitchenEta global da resposta.
    if (
      !previous ||
      candidate.targetRatio > previous.targetRatio ||
      (candidate.targetRatio === previous.targetRatio &&
        candidate.minutesInPrep > previous.minutesInPrep)
    ) {
      lateByTable.set(order.tableNumber, candidate);
    }
  }

  return overview.map((table) => {
    // `number` nasce de BIGINT no PostgreSQL e o driver o serializa como
    // string. Normalize na fronteira antes de cruzar com os DTOs numéricos de
    // active-tables/workload; sem isso a mesa aparecia ocupada, porém perdia
    // atraso, subtotal e garçom no mapa.
    const tableNumber = Number(table.number) || 0;
    const live = activeByTable.get(tableNumber);
    const occupied = table.occupied || live != null;
    if (!occupied) return { n: tableNumber, st: 'free' as const };

    const late = lateByTable.get(tableNumber);
    const minutesInPrep = late?.minutesInPrep;
    const assignedWaiter = waiterByTable.get(tableNumber);
    const isCritical = late != null && late.minutesInPrep >= Math.ceil(late.targetMinutes * 1.5);

    return {
      n: tableNumber,
      st: minutesInPrep == null ? 'ok' : isCritical ? 'crit' : 'warn',
      ...(minutesInPrep == null ? {} : { wait: minutesInPrep }),
      ...(live == null ? {} : { val: Math.round(live.subtotalCents / 100) }),
      ...(assignedWaiter ?? {}),
    };
  });
}

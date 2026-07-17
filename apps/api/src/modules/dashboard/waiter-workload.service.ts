import { Injectable, Logger } from '@nestjs/common';
import {
  RESTAURANT_LOCAL_DATE_SQL,
  RESTAURANT_LOCAL_NOW_SQL,
} from '../../common/utils/restaurant-local-time';
import { AlertsService } from '../alerts/alerts.service';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

export const WAITER_WORKLOAD_STRATEGY = 'zone_candidate_round_robin_v1';
// Sem palavras-chave de papéis operacionais: o filtro role-aware de alerts
// entrega este sinal apenas para manager/owner, que sempre veem todos os kinds.
export const WAITER_WORKLOAD_ALERT_KIND = 'manager_staff_workload_imbalance';

const ALERT_COOLDOWN_SECONDS = 15 * 60;
const ALERT_TTL_MS = 15 * 60 * 1000;

/**
 * Pesos operacionais, não métricas financeiras. Mantê-los explícitos faz o
 * score auditável e preserva no DTO os sinais crus usados no cálculo.
 */
export const WAITER_WORKLOAD_WEIGHTS = {
  table: 10,
  person: 2,
  activeOrder: 4,
  lateOrder: 12,
  pendingWaiterCall: 10,
  pendingDelivery: 8,
} as const;

export type WaiterEligibilitySource =
  | 'zone_on_shift'
  | 'zone_fallback'
  | 'global_on_shift'
  | 'global_fallback';

export interface WaiterAvailabilitySignal {
  staffId: string;
  name: string;
  onShift: boolean;
  paused: boolean;
  zones: Array<{ zoneId: string; zoneName: string }>;
}

export interface ActiveSessionWorkSignal {
  sessionId: string;
  tableId: string;
  tableCode: string;
  tableLabel: string;
  tableNumber: number;
  tableSortOrder: number;
  zoneId: string | null;
  zoneName: string | null;
  zoneSortOrder: number;
  people: number;
  activeOrders: number;
  lateOrders: number;
  pendingWaiterCalls: number;
  pendingDeliveries: number;
}

export interface WaiterAssignedTableWorkloadDto extends ActiveSessionWorkSignal {
  loadScore: number;
  eligibilitySource: WaiterEligibilitySource;
}

export interface WaiterWorkloadDto {
  staffId: string;
  name: string;
  onShift: boolean;
  paused: boolean;
  availableForAssignment: boolean;
  zones: Array<{ zoneId: string; zoneName: string }>;
  tables: number;
  people: number;
  activeOrders: number;
  lateOrders: number;
  pendingWaiterCalls: number;
  pendingDeliveries: number;
  loadScore: number;
  assignedTables: WaiterAssignedTableWorkloadDto[];
}

export interface WaiterWorkloadImbalanceDto {
  reason: 'unassigned_sessions' | 'load_score_skew';
  severity: 'crítica' | 'atenção';
  unassignedSessions: number;
  highestWaiterId: string | null;
  highestWaiterName: string | null;
  highestLoadScore: number;
  lowestWaiterId: string | null;
  lowestWaiterName: string | null;
  lowestLoadScore: number;
  scoreDelta: number;
  scoreRatio: number | null;
  tableDelta: number;
}

export interface WaiterWorkloadSnapshotDto {
  generatedAt: string;
  strategy: typeof WAITER_WORKLOAD_STRATEGY;
  weights: typeof WAITER_WORKLOAD_WEIGHTS;
  activeSessions: number;
  assignedSessions: number;
  unassignedSessions: ActiveSessionWorkSignal[];
  totalLoadScore: number;
  waiters: WaiterWorkloadDto[];
  imbalance: WaiterWorkloadImbalanceDto | null;
}

interface WaiterAvailabilityRow {
  staff_id: string;
  staff_name: string;
  zone_id: string | null;
  zone_name: string | null;
  on_shift: boolean;
  paused: boolean;
}

interface ActiveSessionWorkRow {
  session_id: string;
  table_id: string;
  table_code: string;
  table_label: string;
  table_number: unknown;
  table_sort_order: unknown;
  zone_id: string | null;
  zone_name: string | null;
  zone_sort_order: unknown;
  people: unknown;
  active_orders: unknown;
  late_orders: unknown;
  pending_waiter_calls: unknown;
  pending_deliveries: unknown;
}

function finiteCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function scoreSessionWorkload(session: ActiveSessionWorkSignal): number {
  return (
    WAITER_WORKLOAD_WEIGHTS.table +
    session.people * WAITER_WORKLOAD_WEIGHTS.person +
    session.activeOrders * WAITER_WORKLOAD_WEIGHTS.activeOrder +
    session.lateOrders * WAITER_WORKLOAD_WEIGHTS.lateOrder +
    session.pendingWaiterCalls * WAITER_WORKLOAD_WEIGHTS.pendingWaiterCall +
    session.pendingDeliveries * WAITER_WORKLOAD_WEIGHTS.pendingDelivery
  );
}

function emptyWorkload(waiter: WaiterAvailabilitySignal): WaiterWorkloadDto {
  return {
    staffId: waiter.staffId,
    name: waiter.name,
    onShift: waiter.onShift,
    paused: waiter.paused,
    availableForAssignment: !waiter.paused,
    zones: [...waiter.zones].sort((a, b) => a.zoneName.localeCompare(b.zoneName, 'pt-BR')),
    tables: 0,
    people: 0,
    activeOrders: 0,
    lateOrders: 0,
    pendingWaiterCalls: 0,
    pendingDeliveries: 0,
    loadScore: 0,
    assignedTables: [],
  };
}

function waiterHasZone(waiter: WaiterAvailabilitySignal, zoneId: string | null): boolean {
  return zoneId != null && waiter.zones.some((zone) => zone.zoneId === zoneId);
}

function candidatesForSession(
  session: ActiveSessionWorkSignal,
  waiters: WaiterAvailabilitySignal[],
): { source: WaiterEligibilitySource; candidates: WaiterAvailabilitySignal[] } | null {
  const available = waiters.filter((waiter) => !waiter.paused);
  const pools: Array<{ source: WaiterEligibilitySource; candidates: WaiterAvailabilitySignal[] }> =
    [
      {
        source: 'zone_on_shift',
        candidates: available.filter(
          (waiter) => waiter.onShift && waiterHasZone(waiter, session.zoneId),
        ),
      },
      {
        source: 'zone_fallback',
        candidates: available.filter((waiter) => waiterHasZone(waiter, session.zoneId)),
      },
      {
        source: 'global_on_shift',
        candidates: available.filter((waiter) => waiter.onShift),
      },
      { source: 'global_fallback', candidates: available },
    ];
  const selected = pools.find((pool) => pool.candidates.length > 0);
  if (!selected) return null;
  return {
    source: selected.source,
    candidates: [...selected.candidates].sort((a, b) => a.staffId.localeCompare(b.staffId)),
  };
}

function sortSessions(sessions: ActiveSessionWorkSignal[]): ActiveSessionWorkSignal[] {
  return [...sessions].sort(
    (a, b) =>
      a.zoneSortOrder - b.zoneSortOrder ||
      a.tableSortOrder - b.tableSortOrder ||
      a.tableCode.localeCompare(b.tableCode) ||
      a.sessionId.localeCompare(b.sessionId),
  );
}

/**
 * Cada candidate-set mantém seu próprio cursor de round-robin. Como sessões e
 * candidatos têm ordenação canônica, a projeção é repetível sem gravar
 * ownership; e cada sessão aparece em exatamente um workload.
 */
export function buildWaiterWorkloadSnapshot(
  waitersInput: WaiterAvailabilitySignal[],
  sessionsInput: ActiveSessionWorkSignal[],
  generatedAt = new Date().toISOString(),
): WaiterWorkloadSnapshotDto {
  const waiters = [...waitersInput].sort((a, b) => a.staffId.localeCompare(b.staffId));
  const workloads = new Map(waiters.map((waiter) => [waiter.staffId, emptyWorkload(waiter)]));
  const poolCursors = new Map<string, number>();
  const unassignedSessions: ActiveSessionWorkSignal[] = [];

  for (const session of sortSessions(sessionsInput)) {
    const pool = candidatesForSession(session, waiters);
    if (!pool) {
      unassignedSessions.push(session);
      continue;
    }
    const poolKey = `${pool.source}:${pool.candidates.map((waiter) => waiter.staffId).join(',')}`;
    const cursor = poolCursors.get(poolKey) ?? 0;
    poolCursors.set(poolKey, cursor + 1);
    const selected = pool.candidates[cursor % pool.candidates.length];
    const workload = workloads.get(selected.staffId)!;
    const loadScore = scoreSessionWorkload(session);
    workload.assignedTables.push({ ...session, loadScore, eligibilitySource: pool.source });
    workload.tables += 1;
    workload.people += session.people;
    workload.activeOrders += session.activeOrders;
    workload.lateOrders += session.lateOrders;
    workload.pendingWaiterCalls += session.pendingWaiterCalls;
    workload.pendingDeliveries += session.pendingDeliveries;
    workload.loadScore += loadScore;
  }

  const waiterWorkloads = Array.from(workloads.values()).sort(
    (a, b) => b.loadScore - a.loadScore || a.name.localeCompare(b.name, 'pt-BR'),
  );
  const imbalance = detectMaterialWaiterImbalance(waiterWorkloads, unassignedSessions.length);
  return {
    generatedAt,
    strategy: WAITER_WORKLOAD_STRATEGY,
    weights: WAITER_WORKLOAD_WEIGHTS,
    activeSessions: sessionsInput.length,
    assignedSessions: sessionsInput.length - unassignedSessions.length,
    unassignedSessions,
    totalLoadScore: waiterWorkloads.reduce((sum, waiter) => sum + waiter.loadScore, 0),
    waiters: waiterWorkloads,
    imbalance,
  };
}

export function detectMaterialWaiterImbalance(
  workloads: WaiterWorkloadDto[],
  unassignedSessions: number,
): WaiterWorkloadImbalanceDto | null {
  if (unassignedSessions > 0) {
    return {
      reason: 'unassigned_sessions',
      severity: 'crítica',
      unassignedSessions,
      highestWaiterId: null,
      highestWaiterName: null,
      highestLoadScore: 0,
      lowestWaiterId: null,
      lowestWaiterName: null,
      lowestLoadScore: 0,
      scoreDelta: 0,
      scoreRatio: null,
      tableDelta: 0,
    };
  }

  // Waiters fora do turno e sem nenhuma mesa não são capacidade operacional
  // disponível; pausados nunca entram na distribuição.
  const comparable = workloads
    .filter((waiter) => !waiter.paused && (waiter.onShift || waiter.tables > 0))
    .sort((a, b) => b.loadScore - a.loadScore || a.staffId.localeCompare(b.staffId));
  if (comparable.length < 2) return null;

  const highest = comparable[0];
  const lowest = comparable[comparable.length - 1];
  const scoreDelta = highest.loadScore - lowest.loadScore;
  const tableDelta = highest.tables - lowest.tables;
  const ratio = lowest.loadScore === 0 ? null : highest.loadScore / lowest.loadScore;
  const scoreSkew = highest.loadScore >= 40 && scoreDelta >= 30 && (ratio == null || ratio >= 1.75);
  const tableSkew = tableDelta >= 3 && scoreDelta >= 20;
  if (!scoreSkew && !tableSkew) return null;

  return {
    reason: 'load_score_skew',
    severity: 'atenção',
    unassignedSessions: 0,
    highestWaiterId: highest.staffId,
    highestWaiterName: highest.name,
    highestLoadScore: highest.loadScore,
    lowestWaiterId: lowest.staffId,
    lowestWaiterName: lowest.name,
    lowestLoadScore: lowest.loadScore,
    scoreDelta,
    scoreRatio: ratio == null ? null : Math.round(ratio * 100) / 100,
    tableDelta,
  };
}

@Injectable()
export class WaiterWorkloadService {
  private readonly logger = new Logger(WaiterWorkloadService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly alerts: AlertsService,
  ) {}

  async getSnapshot(): Promise<WaiterWorkloadSnapshotDto> {
    const waiterRows = (await this.tenantConn.query(
      `WITH local_clock AS (
         SELECT ${RESTAURANT_LOCAL_NOW_SQL} AS ts
       )
       SELECT s.id AS staff_id, s.name AS staff_name,
              z.id AS zone_id, z.name AS zone_name,
              EXISTS (
                SELECT 1
                  FROM staff_shift_assignments sa
                  JOIN staff_shifts sh ON sh.id = sa.shift_id
                 CROSS JOIN local_clock lc2
                 WHERE sa.staff_id = s.id
                   AND sa.removed_at IS NULL
                   AND (
                     (sh.time_start <= sh.time_end
                       AND sa.work_date = lc2.ts::date
                       AND lc2.ts::time >= sh.time_start
                       AND lc2.ts::time < sh.time_end)
                     OR (sh.time_start > sh.time_end AND (
                       (sa.work_date = lc2.ts::date AND lc2.ts::time >= sh.time_start)
                       OR (sa.work_date = (lc2.ts - interval '1 day')::date
                         AND lc2.ts::time < sh.time_end)
                     ))
                   )
              ) AS on_shift,
              EXISTS (
                SELECT 1 FROM zone_pauses zp
                 WHERE zp.waiter_id = s.id
                   AND zp.ended_at IS NULL
                   AND (zp.ends_at IS NULL OR zp.ends_at > now())
              ) AS paused
         FROM staff s
         LEFT JOIN waiter_zone_assignments wza
                ON wza.staff_id = s.id
               AND wza.work_date = ${RESTAURANT_LOCAL_DATE_SQL}
               AND wza.removed_at IS NULL
         LEFT JOIN zones z ON z.id = wza.zone_id AND z.is_active = true
        WHERE s.role = 'waiter'
          AND s.is_active = true
        ORDER BY s.id, z.sort_order, z.name`,
    )) as WaiterAvailabilityRow[];

    const sessionRows = (await this.tenantConn.query(
      `WITH cfg AS (
         SELECT CASE
                  WHEN value.kitchen_eta_max_minutes > 0
                  THEN value.kitchen_eta_max_minutes
                  ELSE NULL
                END AS kitchen_eta_max_minutes
           FROM (
             SELECT (SELECT kitchen_eta_max_minutes FROM settings LIMIT 1)
                      AS kitchen_eta_max_minutes
           ) value
       )
       SELECT ts.id AS session_id, t.id AS table_id,
              t.code AS table_code, t.label AS table_label,
              COALESCE(NULLIF(regexp_replace(t.code, '\\D', '', 'g'), ''), '0')::int AS table_number,
              t.sort_order AS table_sort_order,
              z.id AS zone_id, z.name AS zone_name,
              COALESCE(z.sort_order, 2147483647) AS zone_sort_order,
              GREATEST(COALESCE(part.people, 0), COALESCE(vis.people, 0))::int AS people,
              COALESCE(ord.active_orders, 0)::int AS active_orders,
              COALESCE(ord.late_orders, 0)::int AS late_orders,
              COALESCE(calls.pending_waiter_calls, 0)::int AS pending_waiter_calls,
              COALESCE(deliveries.pending_deliveries, 0)::int AS pending_deliveries
         FROM table_sessions ts
         JOIN tables t ON t.id = ts.table_id
         LEFT JOIN zones z ON z.id = t.zone_id
         CROSS JOIN cfg
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS people
             FROM session_participants sp
            WHERE sp.table_session_id = ts.id
              AND sp.status = 'approved'
              AND sp.left_at IS NULL
         ) part ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS people
             FROM visits v
            WHERE v.table_session_id = ts.id
         ) vis ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*) FILTER (
                    WHERE o.status IN ('received', 'open', 'confirmed', 'in_progress',
                                       'preparing', 'ready', 'in_transit')
                  )::int AS active_orders,
                  COUNT(*) FILTER (
                    WHERE cfg.kitchen_eta_max_minutes IS NOT NULL
                      AND o.status NOT IN ('cancelled', 'delivered', 'ready', 'in_transit',
                                           'pending_confirmation')
                      AND EXISTS (
                        SELECT 1
                          FROM order_items late_item
                          JOIN menu_items late_menu
                            ON late_menu.id = late_item.menu_item_id
                         WHERE late_item.order_id = o.id
                           AND late_item.status = 'in_progress'
                           AND late_item.prep_started_at IS NOT NULL
                           AND late_menu.kind <> 'drink'
                        HAVING MIN(late_item.prep_started_at) < now()
                          - make_interval(mins => cfg.kitchen_eta_max_minutes)
                      )
                  )::int AS late_orders
             FROM orders o
            WHERE o.table_session_id = ts.id
         ) ord ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS pending_waiter_calls
             FROM waiter_calls wc
            WHERE wc.table_session_id = ts.id
              AND wc.status IN ('pending', 'acknowledged')
         ) calls ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS pending_deliveries
             FROM order_deliveries od
             JOIN orders delivery_order ON delivery_order.id = od.order_id
            WHERE delivery_order.table_session_id = ts.id
              AND od.status IN ('pending', 'claimed')
         ) deliveries ON true
        WHERE ts.status = 'active'
        ORDER BY zone_sort_order, table_sort_order, table_code, session_id`,
    )) as ActiveSessionWorkRow[];

    const waiters = this.mapWaiters(waiterRows);
    const sessions = sessionRows.map((row) => this.mapSession(row));
    const snapshot = buildWaiterWorkloadSnapshot(waiters, sessions);
    await this.reconcileManagerAlert(snapshot);
    return snapshot;
  }

  private mapWaiters(rows: WaiterAvailabilityRow[]): WaiterAvailabilitySignal[] {
    const byId = new Map<string, WaiterAvailabilitySignal>();
    for (const row of rows) {
      const waiter = byId.get(row.staff_id) ?? {
        staffId: row.staff_id,
        name: row.staff_name,
        onShift: row.on_shift === true,
        paused: row.paused === true,
        zones: [],
      };
      waiter.onShift = waiter.onShift || row.on_shift === true;
      waiter.paused = waiter.paused || row.paused === true;
      if (row.zone_id && row.zone_name && !waiter.zones.some((z) => z.zoneId === row.zone_id)) {
        waiter.zones.push({ zoneId: row.zone_id, zoneName: row.zone_name });
      }
      byId.set(row.staff_id, waiter);
    }
    return Array.from(byId.values());
  }

  private mapSession(row: ActiveSessionWorkRow): ActiveSessionWorkSignal {
    return {
      sessionId: row.session_id,
      tableId: row.table_id,
      tableCode: row.table_code,
      tableLabel: row.table_label,
      tableNumber: finiteCount(row.table_number),
      tableSortOrder: finiteCount(row.table_sort_order),
      zoneId: row.zone_id,
      zoneName: row.zone_name,
      zoneSortOrder: finiteCount(row.zone_sort_order),
      people: finiteCount(row.people),
      activeOrders: finiteCount(row.active_orders),
      lateOrders: finiteCount(row.late_orders),
      pendingWaiterCalls: finiteCount(row.pending_waiter_calls),
      pendingDeliveries: finiteCount(row.pending_deliveries),
    };
  }

  private async reconcileManagerAlert(snapshot: WaiterWorkloadSnapshotDto): Promise<void> {
    try {
      if (!snapshot.imbalance) {
        await this.alerts.resolveOpenByKind(WAITER_WORKLOAD_ALERT_KIND);
        return;
      }
      const imbalance = snapshot.imbalance;
      const sub =
        imbalance.reason === 'unassigned_sessions'
          ? `${imbalance.unassignedSessions} mesa(s) ativa(s) sem garçom elegível. Revise turno, pausa e zonas.`
          : `${imbalance.highestWaiterName ?? 'Maior carga'}: ${imbalance.highestLoadScore} pts · ${imbalance.lowestWaiterName ?? 'Menor carga'}: ${imbalance.lowestLoadScore} pts.`;
      await this.alerts.createOrRefreshSingleton({
        sev: imbalance.severity,
        kind: WAITER_WORKLOAD_ALERT_KIND,
        title: 'Carga de garçons desequilibrada',
        sub,
        ttlAt: new Date(Date.now() + ALERT_TTL_MS),
        cooldownSeconds: ALERT_COOLDOWN_SECONDS,
        actions: [
          { label: 'Ver sobrecarga', route: '/manager/equipe/sobrecarga', kind: 'primary' },
          { label: 'Rever zonas', route: '/manager/equipe', kind: 'ghost' },
        ],
      });
    } catch (error) {
      // O monitor continua útil mesmo se a tabela/evento de alerts estiver
      // temporariamente indisponível; nunca derruba o dashboard por side-effect.
      this.logger.warn(`Falha ao reconciliar alerta de carga: ${(error as Error).message}`);
    }
  }
}

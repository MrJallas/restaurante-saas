/**
 * Fatia M5 da timeline — fontes SQL do BACKFILL (session_timeline no Mongo).
 *
 * Cada fonte descreve: a tabela de origem, o SELECT com os JOINs que
 * resolvem os ctx dos mappers PUROS do M1 (nomes de staff/customer e o
 * sessionId pras fontes sem table_session_id) e o conversor puro
 * row-com-joins → TimelineEntry[]. NENHUM I/O aqui — o script
 * `apps/api/scripts/backfill-timeline.ts` é quem roda os SELECTs (pg cru)
 * e upserta no Mongo; este módulo existe pra que a montagem dos ctx/joins
 * seja testável por unit test e type-checkada pelo tsc do app.
 *
 * Regras herdadas do M1/M4:
 *  - ids derivados da fonte CONVERGEM com os do tap live — o backfill
 *    upserta no MESMO doc ($setOnInsert: o original vence).
 *  - fontes com âncora de sessão NULLABLE (complaints, courtesies)
 *    retornam [] quando a row não tem sessão —
 *    entrada sem âncora não entra (mesma regra do tap).
 *  - colunas legacy VARCHAR (created_by/changed_by/closed_by): o JOIN
 *    `staff ON id::text = <coluna>` só casa quando o label era UUID de
 *    staff; label 'customer' resolve o nome via visit→customer quando a
 *    fonte tem esse caminho (pickLegacyResolvedName).
 */

import type { TimelineEntry } from '@restaurant/shared-types';
import {
  mapComplaint,
  mapCourtesy,
  mapOrderCreated,
  mapOrderDelivery,
  mapOrderStatusHistory,
  mapPayment,
  mapSessionFlag,
  mapSessionParticipant,
  mapTableMergeRequest,
  mapTableSession,
  mapWaiterCall,
} from './timeline-mappers';
import type {
  ComplaintRow,
  CourtesyRow,
  OrderDeliveryRow,
  OrderRow,
  OrderStatusHistoryRow,
  PaymentRow,
  SessionFlagRow,
  SessionParticipantRow,
  TableMergeRequestRow,
  TableSessionRow,
  WaiterCallRow,
} from './timeline-mappers';

type SqlRow = Record<string, unknown>;

export interface BackfillSource {
  /** Tabela de origem (rótulo da linha no relatório do script). */
  table: string;
  /** SELECT com os JOINs que resolvem os ctx dos mappers do M1. */
  baseSql: string;
  /** Cláusula WHERE do modo --session ($1 = tableSessionId dono). */
  sessionWhere: string;
  /** Conversor puro row-com-joins → entries (0..n; [] = sem âncora). */
  toEntries: (row: SqlRow) => TimelineEntry[];
}

/** Único cast row-crua→row-tipada, centralizado (pg devolve SqlRow). */
function typedSource<R>(def: {
  table: string;
  baseSql: string;
  sessionWhere: string;
  toEntries: (row: R) => TimelineEntry[];
}): BackfillSource {
  return { ...def, toEntries: (row) => def.toEntries(row as unknown as R) };
}

/**
 * Nome resolvido pras colunas legacy VARCHAR (created_by/changed_by):
 * o JOIN de staff só casa quando o label era UUID (staffName vem do join);
 * label 'customer' usa o nome resolvido via visit→customer; qualquer outro
 * label (roles, 'system', labels compostos) fica sem nome — o mapper
 * preserva o label cru em payload.reason.
 */
export function pickLegacyResolvedName(
  label: string | null,
  staffName: string | null,
  customerName: string | null,
): string | null {
  if (staffName) return staffName;
  if (label === 'customer') return customerName;
  return null;
}

// ─── table_sessions → session.{opened,closed} ──────────────────────────────

export interface TableSessionJoinedRow extends TableSessionRow {
  host_name: string | null;
  closed_by_name: string | null;
}

export function tableSessionRowToEntries(row: TableSessionJoinedRow): TimelineEntry[] {
  return mapTableSession(row, {
    hostName: row.host_name,
    closedByName: pickLegacyResolvedName(row.closed_by, row.closed_by_name, null),
  });
}

// ─── session_participants → participant.{joined,approved} ──────────────────

export interface SessionParticipantJoinedRow extends SessionParticipantRow {
  customer_name: string | null;
  /** approved_by é FK de CUSTOMERS (migration 017) — nome resolvido lá. */
  approved_by_name: string | null;
}

export function sessionParticipantRowToEntries(row: SessionParticipantJoinedRow): TimelineEntry[] {
  return mapSessionParticipant(row, {
    customerName: row.customer_name,
    approvedByName: row.approved_by_name,
  });
}

// ─── orders → order.created ────────────────────────────────────────────────

export interface OrderJoinedRow extends OrderRow {
  /** JOIN staff ON id::text = created_by (só casa quando UUID de staff). */
  staff_name: string | null;
  /** visit→customer, pro caso created_by = 'customer'. */
  customer_name: string | null;
}

export function orderRowToEntries(row: OrderJoinedRow): TimelineEntry[] {
  return [
    mapOrderCreated(row, {
      resolvedName: pickLegacyResolvedName(row.created_by, row.staff_name, row.customer_name),
    }),
  ];
}

// ─── order_status_history → order.status_changed ───────────────────────────

export interface OrderStatusHistoryJoinedRow extends OrderStatusHistoryRow {
  /** orders.table_session_id via JOIN (osh não tem sessão própria). */
  session_id: string;
  staff_name: string | null;
  customer_name: string | null;
}

export function orderStatusHistoryRowToEntries(row: OrderStatusHistoryJoinedRow): TimelineEntry[] {
  return [
    mapOrderStatusHistory(row, {
      sessionId: row.session_id,
      resolvedName: pickLegacyResolvedName(row.changed_by, row.staff_name, row.customer_name),
    }),
  ];
}

// ─── order_deliveries → delivery.{called,claimed,delivered} ────────────────

export interface OrderDeliveryJoinedRow extends OrderDeliveryRow {
  session_id: string;
  called_by_name: string | null;
  claimed_by_name: string | null;
}

export function orderDeliveryRowToEntries(row: OrderDeliveryJoinedRow): TimelineEntry[] {
  return mapOrderDelivery(row, {
    sessionId: row.session_id,
    calledByName: row.called_by_name,
    claimedByName: row.claimed_by_name,
  });
}

// ─── waiter_calls → waiter.{called,acknowledged} ───────────────────────────

export interface WaiterCallJoinedRow extends WaiterCallRow {
  customer_name: string | null;
  acknowledged_by_name: string | null;
}

export function waiterCallRowToEntries(row: WaiterCallJoinedRow): TimelineEntry[] {
  return mapWaiterCall(row, {
    customerName: row.customer_name,
    acknowledgedByName: row.acknowledged_by_name,
  });
}

// ─── payments → payment.confirmed ──────────────────────────────────────────

export interface PaymentJoinedRow extends PaymentRow {
  /** payments não tem customer_id — resolvido via visit→customer. */
  visit_customer_id: string | null;
  customer_name: string | null;
}

export function paymentRowToEntries(row: PaymentJoinedRow): TimelineEntry[] {
  const entry = mapPayment(row, {
    customerId: row.visit_customer_id,
    customerName: row.customer_name,
  });
  return entry ? [entry] : [];
}

// ─── table_merge_requests → merge.{requested,approved,rejected} ────────────

export interface TableMergeJoinedRow extends TableMergeRequestRow {
  requester_name: string | null;
  decider_name: string | null;
}

export function tableMergeRowToEntries(row: TableMergeJoinedRow): TimelineEntry[] {
  return mapTableMergeRequest(row, {
    requesterName: row.requester_name,
    deciderName: row.decider_name,
  });
}

// ─── complaints → complaint.{received,resolved} ────────────────────────────

export interface ComplaintJoinedRow extends ComplaintRow {
  /** COALESCE(visit.table_session_id, order.table_session_id) — pode ser NULL. */
  session_id: string | null;
  customer_name: string | null;
  manager_name: string | null;
}

export function complaintRowToEntries(row: ComplaintJoinedRow): TimelineEntry[] {
  if (!row.session_id) return [];
  return mapComplaint(row, {
    sessionId: row.session_id,
    customerName: row.customer_name,
    managerName: row.manager_name,
  });
}

// ─── courtesies → courtesy.created ─────────────────────────────────────────

export interface CourtesyJoinedRow extends Omit<CourtesyRow, 'table_session_id'> {
  /** NULLABLE na tabela (ON DELETE SET NULL) — sem sessão não entra. */
  table_session_id: string | null;
  manager_name: string | null;
}

export function courtesyRowToEntries(row: CourtesyJoinedRow): TimelineEntry[] {
  if (!row.table_session_id) return [];
  return [
    mapCourtesy(
      { ...row, table_session_id: row.table_session_id },
      { managerName: row.manager_name },
    ),
  ];
}

// ─── session_flags → session.flag_changed ──────────────────────────────────

export interface SessionFlagJoinedRow extends SessionFlagRow {
  set_by_staff_name: string | null;
  set_by_customer_name: string | null;
  cleared_by_name: string | null;
}

export function sessionFlagRowToEntries(row: SessionFlagJoinedRow): TimelineEntry[] {
  return mapSessionFlag(row, {
    // Mesma prioridade do mapper: set_by_staff_id antes de set_by_customer_id.
    setByName: row.set_by_staff_name ?? row.set_by_customer_name,
    clearedByName: row.cleared_by_name,
  });
}

// ─── Registro das fontes ───────────────────────────────────────────────────

export const BACKFILL_SOURCES: readonly BackfillSource[] = [
  typedSource<TableSessionJoinedRow>({
    table: 'table_sessions',
    baseSql: `
      SELECT ts.*, host.name AS host_name, closer.name AS closed_by_name
        FROM table_sessions ts
        LEFT JOIN customers host ON host.id = ts.host_customer_id
        LEFT JOIN staff closer ON closer.id::text = ts.closed_by`,
    sessionWhere: 'WHERE ts.id = $1',
    toEntries: tableSessionRowToEntries,
  }),
  typedSource<SessionParticipantJoinedRow>({
    table: 'session_participants',
    baseSql: `
      SELECT sp.*, c.name AS customer_name, approver.name AS approved_by_name
        FROM session_participants sp
        LEFT JOIN customers c ON c.id = sp.customer_id
        LEFT JOIN customers approver ON approver.id = sp.approved_by`,
    sessionWhere: 'WHERE sp.table_session_id = $1',
    toEntries: sessionParticipantRowToEntries,
  }),
  typedSource<OrderJoinedRow>({
    table: 'orders',
    baseSql: `
      SELECT o.*, s.name AS staff_name, c.name AS customer_name
        FROM orders o
        LEFT JOIN staff s ON s.id::text = o.created_by
        LEFT JOIN visits v ON v.id = o.visit_id
        LEFT JOIN customers c ON c.id = v.customer_id`,
    sessionWhere: 'WHERE o.table_session_id = $1',
    toEntries: orderRowToEntries,
  }),
  typedSource<OrderStatusHistoryJoinedRow>({
    table: 'order_status_history',
    baseSql: `
      SELECT osh.*, o.table_session_id AS session_id,
             s.name AS staff_name, c.name AS customer_name
        FROM order_status_history osh
        JOIN orders o ON o.id = osh.order_id
        LEFT JOIN staff s ON s.id::text = osh.changed_by
        LEFT JOIN visits v ON v.id = o.visit_id
        LEFT JOIN customers c ON c.id = v.customer_id`,
    sessionWhere: 'WHERE o.table_session_id = $1',
    toEntries: orderStatusHistoryRowToEntries,
  }),
  typedSource<OrderDeliveryJoinedRow>({
    table: 'order_deliveries',
    baseSql: `
      SELECT od.*, o.table_session_id AS session_id,
             cb.name AS called_by_name, clb.name AS claimed_by_name
        FROM order_deliveries od
        JOIN orders o ON o.id = od.order_id
        LEFT JOIN staff cb ON cb.id = od.called_by
        LEFT JOIN staff clb ON clb.id = od.claimed_by`,
    sessionWhere: 'WHERE o.table_session_id = $1',
    toEntries: orderDeliveryRowToEntries,
  }),
  typedSource<WaiterCallJoinedRow>({
    table: 'waiter_calls',
    baseSql: `
      SELECT wc.*, c.name AS customer_name, s.name AS acknowledged_by_name
        FROM waiter_calls wc
        LEFT JOIN customers c ON c.id = wc.customer_id
        LEFT JOIN staff s ON s.id = wc.acknowledged_by`,
    sessionWhere: 'WHERE wc.table_session_id = $1',
    toEntries: waiterCallRowToEntries,
  }),
  typedSource<PaymentJoinedRow>({
    table: 'payments',
    baseSql: `
      SELECT p.*, v.customer_id AS visit_customer_id, c.name AS customer_name
        FROM payments p
        LEFT JOIN visits v ON v.id = p.visit_id
        LEFT JOIN customers c ON c.id = v.customer_id`,
    sessionWhere: 'WHERE p.table_session_id = $1',
    toEntries: paymentRowToEntries,
  }),
  typedSource<TableMergeJoinedRow>({
    table: 'table_merge_requests',
    baseSql: `
      SELECT tmr.*, rc.name AS requester_name, dc.name AS decider_name
        FROM table_merge_requests tmr
        LEFT JOIN customers rc ON rc.id = tmr.requesting_customer_id
        LEFT JOIN customers dc ON dc.id = tmr.decided_by_customer_id`,
    // Dono da timeline = sessão de ORIGEM (decisão M1).
    sessionWhere: 'WHERE tmr.source_table_session_id = $1',
    toEntries: tableMergeRowToEntries,
  }),
  typedSource<ComplaintJoinedRow>({
    table: 'complaints',
    baseSql: `
      SELECT cp.*, COALESCE(v.table_session_id, o.table_session_id) AS session_id,
             c.name AS customer_name, m.name AS manager_name
        FROM complaints cp
        LEFT JOIN visits v ON v.id = cp.visit_id
        LEFT JOIN orders o ON o.id = cp.order_id
        LEFT JOIN customers c ON c.id = cp.customer_id
        LEFT JOIN staff m ON m.id = cp.assigned_manager_id`,
    sessionWhere: 'WHERE COALESCE(v.table_session_id, o.table_session_id) = $1',
    toEntries: complaintRowToEntries,
  }),
  typedSource<CourtesyJoinedRow>({
    table: 'courtesies',
    baseSql: `
      SELECT ct.*, m.name AS manager_name
        FROM courtesies ct
        LEFT JOIN staff m ON m.id = ct.manager_staff_id`,
    sessionWhere: 'WHERE ct.table_session_id = $1',
    toEntries: courtesyRowToEntries,
  }),
  typedSource<SessionFlagJoinedRow>({
    table: 'session_flags',
    baseSql: `
      SELECT sf.*, ss.name AS set_by_staff_name, sc.name AS set_by_customer_name,
             cs.name AS cleared_by_name
        FROM session_flags sf
        LEFT JOIN staff ss ON ss.id = sf.set_by_staff_id
        LEFT JOIN customers sc ON sc.id = sf.set_by_customer_id
        LEFT JOIN staff cs ON cs.id = sf.cleared_by_staff_id`,
    sessionWhere: 'WHERE sf.table_session_id = $1',
    toEntries: sessionFlagRowToEntries,
  }),
];

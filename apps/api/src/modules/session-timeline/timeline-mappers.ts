/**
 * Fatia M1 da timeline de sessão — mappers PUROS row SQL → TimelineEntry.
 * Agnósticos ao event-store (decisão Caleb 2026-07-04: Mongo entra em M2+):
 * nenhum I/O aqui — joins de nome acontecem FORA e chegam via ctx
 * (`resolvedName` etc.). Ids são derivados da fonte ("<fonte>:<pk>"
 * [+ ":<fase>" em fontes multi-evento]) — reprocessar a mesma row produz o
 * mesmo id, então o upsert do store é idempotente.
 *
 * Timestamps: o driver pg devolve `Date`, mas fixtures/JSON trafegam string
 * — todo campo temporal aceita `Date | string` (lição do bug do inbox).
 */

import { TIMELINE_KINDS } from './timeline-kinds';
import type {
  TimelineActor,
  TimelineEntry,
  TimelineKind,
  WsEventName,
} from '@restaurant/shared-types';

// ─── Primitivas ────────────────────────────────────────────────────────────

type SqlTimestamp = Date | string;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toIso(value: SqlTimestamp): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

const systemActor = (): TimelineActor => ({ type: 'system', id: null, name: null });

const staffActor = (id: string | null, name?: string | null): TimelineActor => ({
  type: 'staff',
  id,
  name: name ?? null,
});

const customerActor = (id: string | null, name?: string | null): TimelineActor => ({
  type: 'customer',
  id,
  name: name ?? null,
});

export interface LegacyActorResolution {
  actor: TimelineActor;
  /** Label legacy cru (quando não era UUID) — vai pro `payload.reason`. */
  reason?: string;
}

/**
 * GOTCHA CENTRAL: `changed_by` / `closed_by` / `created_by` são VARCHAR
 * legacy misturando UUID de staff, 'system', 'customer', labels de role
 * ('cozinha', 'waiter') e labels compostos ('scan_verification:rejected',
 * 'system:ttl-4h', 'staff:manual_force') — valores REAIS coletados do banco
 * dev em 2026-07-04. Tradução:
 *  - UUID            → staff {id} (name só se o caller resolveu via join)
 *  - 'customer'      → customer sem id
 *  - role de staff   → staff sem id, label preservado em `reason`
 *  - todo o resto    → system, label preservado em `reason`
 */
export function actorFromLegacyLabel(
  label: string | null | undefined,
  resolvedName?: string | null,
): LegacyActorResolution {
  if (!label) return { actor: systemActor() };
  if (UUID_RE.test(label)) return { actor: staffActor(label, resolvedName) };
  if (label === 'customer') return { actor: customerActor(null, resolvedName) };

  const STAFF_ROLE_LABELS = new Set(['staff', 'waiter', 'garcom', 'kitchen', 'cozinha']);
  if (STAFF_ROLE_LABELS.has(label) || label.startsWith('staff:')) {
    return { actor: staffActor(null, resolvedName), reason: label };
  }
  return { actor: systemActor(), reason: label };
}

/** Omite chaves undefined pra manter payloads deep-equal-áveis e enxutos. */
function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

// ─── orders → order.created ────────────────────────────────────────────────

export interface OrderRow {
  id: string;
  table_session_id: string;
  billing_mode: string | null;
  total_cents: number | null;
  created_by: string | null;
  created_at: SqlTimestamp;
  // Colunas reais não usadas pelo mapper (rows completas passam direto).
  visit_id?: string | null;
  status?: string;
}

export function mapOrderCreated(
  row: OrderRow,
  ctx?: { resolvedName?: string | null },
): TimelineEntry {
  const { actor, reason } = actorFromLegacyLabel(row.created_by, ctx?.resolvedName);
  return {
    id: `ord:${row.id}`,
    kind: 'order.created',
    at: toIso(row.created_at),
    sessionId: row.table_session_id,
    actor,
    refs: { orderId: row.id },
    payload: compactPayload({
      totalCents: row.total_cents,
      billingMode: row.billing_mode,
      reason,
    }),
  };
}

// ─── order_status_history → order.status_changed ───────────────────────────

export interface OrderStatusHistoryRow {
  id: string;
  order_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  created_at: SqlTimestamp;
}

export function mapOrderStatusHistory(
  row: OrderStatusHistoryRow,
  ctx: { sessionId: string; resolvedName?: string | null },
): TimelineEntry {
  const { actor, reason } = actorFromLegacyLabel(row.changed_by, ctx.resolvedName);
  return {
    id: `osh:${row.id}`,
    kind: 'order.status_changed',
    at: toIso(row.created_at),
    sessionId: ctx.sessionId,
    actor,
    refs: { orderId: row.order_id },
    payload: compactPayload({
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reason,
    }),
  };
}

// ─── order_deliveries → delivery.{called,claimed,delivered} ────────────────

export interface OrderDeliveryRow {
  id: string;
  order_id: string;
  claimed_by: string | null;
  claimed_at: SqlTimestamp | null;
  delivered_at: SqlTimestamp | null;
  created_at: SqlTimestamp;
  called_by: string | null;
  called_at: SqlTimestamp | null;
  target_waiter_id: string | null;
  // Coluna real não usada pelo mapper.
  status?: string;
}

export function mapOrderDelivery(
  row: OrderDeliveryRow,
  ctx: { sessionId: string; calledByName?: string | null; claimedByName?: string | null },
): TimelineEntry[] {
  const refs = { orderId: row.order_id, deliveryId: row.id };
  const entries: TimelineEntry[] = [];

  entries.push({
    id: `odel:${row.id}:called`,
    kind: 'delivery.called',
    at: toIso(row.called_at ?? row.created_at),
    sessionId: ctx.sessionId,
    // called_by NULL nas chamadas automáticas (KDS marca pronto) — system.
    actor: row.called_by ? staffActor(row.called_by, ctx.calledByName) : systemActor(),
    refs,
    payload: compactPayload({ targetWaiterId: row.target_waiter_id ?? undefined }),
  });

  if (row.claimed_at) {
    entries.push({
      id: `odel:${row.id}:claimed`,
      kind: 'delivery.claimed',
      at: toIso(row.claimed_at),
      sessionId: ctx.sessionId,
      actor: row.claimed_by ? staffActor(row.claimed_by, ctx.claimedByName) : systemActor(),
      refs,
      payload: {},
    });
  }

  if (row.delivered_at) {
    entries.push({
      id: `odel:${row.id}:delivered`,
      kind: 'delivery.delivered',
      at: toIso(row.delivered_at),
      sessionId: ctx.sessionId,
      // Quem entregou é quem reivindicou ("Estou levando").
      actor: row.claimed_by ? staffActor(row.claimed_by, ctx.claimedByName) : systemActor(),
      refs,
      payload: {},
    });
  }

  return entries;
}

// ─── waiter_calls → waiter.{called,acknowledged} ───────────────────────────

export interface WaiterCallRow {
  id: string;
  table_session_id: string;
  acknowledged_by: string | null;
  acknowledged_at: SqlTimestamp | null;
  created_at: SqlTimestamp;
  reason: string | null;
  customer_id: string | null;
  eta_minutes: number | null;
  // Colunas reais não usadas pelo mapper.
  status?: string;
  visit_id?: string | null;
  resolved_at?: SqlTimestamp | null;
  cancelled_at?: SqlTimestamp | null;
  assigned_waiter_name?: string | null;
}

export function mapWaiterCall(
  row: WaiterCallRow,
  ctx?: { customerName?: string | null; acknowledgedByName?: string | null },
): TimelineEntry[] {
  const refs = { callId: row.id };
  const entries: TimelineEntry[] = [
    {
      id: `wcall:${row.id}`,
      kind: 'waiter.called',
      at: toIso(row.created_at),
      sessionId: row.table_session_id,
      // Só cliente chama garçom — customer_id NULL é chamada anônima da mesa.
      actor: customerActor(row.customer_id, ctx?.customerName),
      refs,
      payload: compactPayload({ reason: row.reason ?? undefined }),
    },
  ];

  if (row.acknowledged_at) {
    entries.push({
      id: `wcall:${row.id}:acknowledged`,
      kind: 'waiter.acknowledged',
      at: toIso(row.acknowledged_at),
      sessionId: row.table_session_id,
      actor: row.acknowledged_by
        ? staffActor(row.acknowledged_by, ctx?.acknowledgedByName)
        : systemActor(),
      refs,
      payload: compactPayload({ etaMinutes: row.eta_minutes ?? undefined }),
    });
  }

  return entries;
}

// ─── payments → payment.confirmed ──────────────────────────────────────────

export interface PaymentRow {
  id: string;
  table_session_id: string;
  amount_cents: number;
  status: string;
  method: string | null;
  paid_at: SqlTimestamp | null;
  created_at: SqlTimestamp;
  split_mode: string | null;
  // Colunas reais não usadas pelo mapper.
  visit_id?: string | null;
  cancelled_at?: SqlTimestamp | null;
}

/**
 * Só o ATO de pagar entra na timeline — status não-confirmado retorna null.
 * `payments` não tem customer_id (só visit_id): o customer chega resolvido
 * via ctx quando o caller fez o join visit→customer.
 */
export function mapPayment(
  row: PaymentRow,
  ctx?: { customerId?: string | null; customerName?: string | null },
): TimelineEntry | null {
  if (row.status !== 'confirmed') return null;
  return {
    id: `pay:${row.id}`,
    kind: 'payment.confirmed',
    at: toIso(row.paid_at ?? row.created_at),
    sessionId: row.table_session_id,
    actor: customerActor(ctx?.customerId ?? null, ctx?.customerName),
    refs: { paymentId: row.id },
    payload: compactPayload({
      amountCents: row.amount_cents,
      method: row.method,
      splitMode: row.split_mode ?? undefined,
    }),
  };
}

// ─── session_participants → participant.{joined,approved} ──────────────────

export interface SessionParticipantRow {
  id: string;
  table_session_id: string;
  customer_id: string;
  joined_at: SqlTimestamp;
  approved_at: SqlTimestamp | null;
  approved_by: string | null;
  // Colunas reais não usadas pelo mapper.
  visit_id?: string | null;
  left_at?: SqlTimestamp | null;
  status?: string;
  rejected_at?: SqlTimestamp | null;
}

export function mapSessionParticipant(
  row: SessionParticipantRow,
  ctx?: { customerName?: string | null; approvedByName?: string | null },
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      id: `part:${row.id}`,
      kind: 'participant.joined',
      at: toIso(row.joined_at),
      sessionId: row.table_session_id,
      actor: customerActor(row.customer_id, ctx?.customerName),
      refs: {},
      payload: {},
    },
  ];

  // approved_at NULL na maioria das rows reais (host auto-aprova o próprio
  // join) — só vira evento quando houve aprovação explícita.
  if (row.approved_at) {
    entries.push({
      id: `part:${row.id}:approved`,
      kind: 'participant.approved',
      at: toIso(row.approved_at),
      sessionId: row.table_session_id,
      actor: row.approved_by ? staffActor(row.approved_by, ctx?.approvedByName) : systemActor(),
      refs: {},
      payload: {},
    });
  }

  return entries;
}

// ─── table_merge_requests → merge.{requested,approved,rejected} ────────────

export interface TableMergeRequestRow {
  id: string;
  source_table_session_id: string;
  target_table_session_id: string;
  requesting_customer_id: string;
  decided_by_customer_id: string | null;
  status: string;
  message: string | null;
  decided_at: SqlTimestamp | null;
  created_at: SqlTimestamp;
  // Coluna real não usada pelo mapper.
  target_customer_id?: string | null;
}

/**
 * A timeline dona é a da sessão de ORIGEM (quem pediu a junção);
 * `payload.targetSessionId` aponta a outra ponta pra M2+ decidir espelhar.
 */
export function mapTableMergeRequest(
  row: TableMergeRequestRow,
  ctx?: { requesterName?: string | null; deciderName?: string | null },
): TimelineEntry[] {
  const refs = { requestId: row.id };
  const entries: TimelineEntry[] = [
    {
      id: `merge:${row.id}`,
      kind: 'merge.requested',
      at: toIso(row.created_at),
      sessionId: row.source_table_session_id,
      actor: customerActor(row.requesting_customer_id, ctx?.requesterName),
      refs,
      payload: compactPayload({
        targetSessionId: row.target_table_session_id,
        message: row.message ?? undefined,
      }),
    },
  ];

  const decided =
    row.decided_at &&
    (row.status === 'approved' || row.status === 'rejected' || row.status === 'expired');
  if (decided) {
    const approved = row.status === 'approved';
    entries.push({
      id: `merge:${row.id}:${approved ? 'approved' : 'rejected'}`,
      kind: approved ? 'merge.approved' : 'merge.rejected',
      at: toIso(row.decided_at as SqlTimestamp),
      sessionId: row.source_table_session_id,
      // Sem decided_by_customer_id = decisão de sistema (TTL, staff override).
      actor: row.decided_by_customer_id
        ? customerActor(row.decided_by_customer_id, ctx?.deciderName)
        : systemActor(),
      refs,
      payload: compactPayload({
        targetSessionId: row.target_table_session_id,
        reason: row.status === 'expired' ? 'expired' : undefined,
      }),
    });
  }

  return entries;
}

// ─── complaints → complaint.{received,resolved} ────────────────────────────

export interface ComplaintRow {
  id: string;
  order_id: string | null;
  customer_id: string;
  rating: number | null;
  text: string | null;
  assigned_manager_id: string | null;
  submitted_at: SqlTimestamp | null;
  closed_at: SqlTimestamp | null;
  created_at: SqlTimestamp;
  problem_type: string | null;
  resolved_at: SqlTimestamp | null;
  // Colunas reais não usadas pelo mapper.
  status?: string;
  visit_id?: string | null;
}

export function mapComplaint(
  row: ComplaintRow,
  ctx: { sessionId: string; customerName?: string | null; managerName?: string | null },
): TimelineEntry[] {
  const refs = row.order_id ? { orderId: row.order_id } : {};
  const entries: TimelineEntry[] = [
    {
      id: `comp:${row.id}`,
      kind: 'complaint.received',
      at: toIso(row.submitted_at ?? row.created_at),
      sessionId: ctx.sessionId,
      actor: customerActor(row.customer_id, ctx.customerName),
      refs,
      payload: { rating: row.rating, problemType: row.problem_type, text: row.text },
    },
  ];

  // resolved_at é o canônico; rows legacy só têm closed_at.
  const resolvedAt = row.resolved_at ?? row.closed_at;
  if (resolvedAt) {
    entries.push({
      id: `comp:${row.id}:resolved`,
      kind: 'complaint.resolved',
      at: toIso(resolvedAt),
      sessionId: ctx.sessionId,
      actor: row.assigned_manager_id
        ? staffActor(row.assigned_manager_id, ctx.managerName)
        : systemActor(),
      refs,
      payload: {},
    });
  }

  return entries;
}

// ─── courtesies → courtesy.created ─────────────────────────────────────────

export interface CourtesyRow {
  id: string;
  table_session_id: string;
  table_number: number | null;
  type: string | null;
  item: string | null;
  status: string | null;
  manager_staff_id: string | null;
  notes: string | null;
  created_at: SqlTimestamp;
}

export function mapCourtesy(
  row: CourtesyRow,
  ctx?: { managerName?: string | null },
): TimelineEntry {
  return {
    id: `court:${row.id}`,
    kind: 'courtesy.created',
    at: toIso(row.created_at),
    sessionId: row.table_session_id,
    actor: row.manager_staff_id
      ? staffActor(row.manager_staff_id, ctx?.managerName)
      : systemActor(),
    refs: {},
    payload: compactPayload({
      type: row.type,
      item: row.item,
      status: row.status,
      tableNumber: row.table_number ?? undefined,
      notes: row.notes ?? undefined,
    }),
  };
}

// ─── table_sessions → session.{opened,closed} ──────────────────────────────

export interface TableSessionRow {
  id: string;
  closed_by: string | null;
  created_at: SqlTimestamp;
  closed_at: SqlTimestamp | null;
  host_customer_id: string | null;
  // Colunas reais não usadas pelo mapper.
  table_id?: string;
  status?: string;
}

export function mapTableSession(
  row: TableSessionRow,
  ctx?: { hostName?: string | null; closedByName?: string | null },
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      id: `sess:${row.id}:opened`,
      kind: 'session.opened',
      at: toIso(row.created_at),
      sessionId: row.id,
      actor: row.host_customer_id
        ? customerActor(row.host_customer_id, ctx?.hostName)
        : systemActor(),
      refs: {},
      payload: {},
    },
  ];

  if (row.closed_at) {
    const { actor, reason } = actorFromLegacyLabel(row.closed_by, ctx?.closedByName);
    entries.push({
      id: `sess:${row.id}:closed`,
      kind: 'session.closed',
      at: toIso(row.closed_at),
      sessionId: row.id,
      actor,
      refs: {},
      payload: compactPayload({ reason }),
    });
  }

  return entries;
}

// ─── session_flags → session.flag_changed ──────────────────────────────────

export interface SessionFlagRow {
  id: string;
  table_session_id: string;
  flag: string;
  set_by_staff_id: string | null;
  set_by_customer_id: string | null;
  metadata: Record<string, unknown> | null;
  cleared_at: SqlTimestamp | null;
  cleared_by_staff_id: string | null;
  created_at: SqlTimestamp;
}

export function mapSessionFlag(
  row: SessionFlagRow,
  ctx?: { setByName?: string | null; clearedByName?: string | null },
): TimelineEntry[] {
  const setActor = row.set_by_staff_id
    ? staffActor(row.set_by_staff_id, ctx?.setByName)
    : row.set_by_customer_id
      ? customerActor(row.set_by_customer_id, ctx?.setByName)
      : systemActor();

  const entries: TimelineEntry[] = [
    {
      id: `flag:${row.id}`,
      kind: 'session.flag_changed',
      at: toIso(row.created_at),
      sessionId: row.table_session_id,
      actor: setActor,
      refs: {},
      payload: compactPayload({
        flag: row.flag,
        cleared: false,
        metadata: row.metadata ?? undefined,
      }),
    },
  ];

  if (row.cleared_at) {
    entries.push({
      id: `flag:${row.id}:cleared`,
      kind: 'session.flag_changed',
      at: toIso(row.cleared_at),
      sessionId: row.table_session_id,
      actor: row.cleared_by_staff_id
        ? staffActor(row.cleared_by_staff_id, ctx?.clearedByName)
        : systemActor(),
      refs: {},
      payload: { flag: row.flag, cleared: true },
    });
  }

  return entries;
}

// ─── Comparator (ordem total determinística) ───────────────────────────────

const KIND_PRIORITY = new Map<TimelineKind, number>(TIMELINE_KINDS.map((k, i) => [k, i]));

/**
 * Ordem total: at ASC → prioridade causal do kind (ordem canônica de
 * TIMELINE_KINDS: sessão abre antes de tudo, fecha por último) → id ASC.
 * Empates de timestamp acontecem de verdade (ex.: merge staff-override tem
 * created_at == decided_at) — sem o desempate a ordem oscilaria entre
 * execuções/stores.
 */
export function compareTimelineEntries(a: TimelineEntry, b: TimelineEntry): number {
  const at = Date.parse(a.at) - Date.parse(b.at);
  if (at !== 0) return at;
  const priority = (KIND_PRIORITY.get(a.kind) ?? 0) - (KIND_PRIORITY.get(b.kind) ?? 0);
  if (priority !== 0) return priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ─── Tabela wire→kind ──────────────────────────────────────────────────────

/**
 * Tradução dos WS wire names (ws-events.ts) pros kinds da timeline — M2 usa
 * isso pra dobrar eventos live no store sem re-consultar SQL. Parcial de
 * propósito: wire events sem kind correspondente no 1º corte ficam de fora
 * (e `order:ready` fica de fora porque `order:status` já carrega a mesma
 * transição — dois wire names pro mesmo ato duplicariam entries).
 */
export const WIRE_EVENT_TO_TIMELINE_KIND: Readonly<Partial<Record<WsEventName, TimelineKind>>> = {
  'order:status': 'order.status_changed',
  'order:handoff_called': 'delivery.called',
  'order:claimed': 'delivery.claimed',
  'waiter:call': 'waiter.called',
  'waiter:acknowledged': 'waiter.acknowledged',
  'table_merge.created': 'merge.requested',
  'table_merge.approved': 'merge.approved',
  'table_merge.rejected': 'merge.rejected',
  'complaint.received': 'complaint.received',
  'complaint.resolved': 'complaint.resolved',
  'courtesy.created': 'courtesy.created',
  'session.flag_changed': 'session.flag_changed',
  'host.table_liberated': 'session.closed',
  // M4: o wire nasceu no M3 (payments não emitia nada quando esta tabela
  // foi escrita) — entra agora que o tap dobra eventos live no store.
  'payment.confirmed': 'payment.confirmed',
};

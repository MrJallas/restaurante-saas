// REST helpers for the waiter screens (web-staff).
// Tenant slug is parameterised — caller plugs it in from the URL or session.
//
// Surface:
//  - waiter calls: pending list, acknowledge
//  - tables: list active tables in the waiter's zone
//  - orders: list orders by table
//  - QR issue: report
//  - zone-pause: read active pauses for the current waiter (for the home banner)
//  - staff-messages: thread list, single thread, send

import { staffApi, staffGet, staffPatch, staffPost } from '../api';
import type {
  StaffMessageDto,
  StaffMessageThreadDto,
  ZonePauseDto,
} from '@restaurant/shared-types';

export interface WaiterCallSummary {
  id: string;
  status: string;
  created_at: string;
  table_label: string | null;
  table_code: string | null;
  assigned_waiter_name?: string | null;
  /** UUID canônico de quem aceitou; ownership nunca deve depender do nome. */
  acknowledged_by?: string | null;
  /** Optional reason hint as the API exposes more channels. */
  reason?: string | null;
  note?: string | null;
}

export interface ActiveTableSummary {
  id: string;
  label: string;
  table_code: string;
  party_size: number;
  capacity: number;
  status: 'novo' | 'aguardando-prato' | 'em-andamento' | 'livre';
  ticket_total_cents: number;
  opened_min: number;
  last_event: string | null;
  /** VIP marker · signals "VIP" tile pin (per docs/features/vip-customer.md). */
  is_vip?: boolean;
}

export interface QrIssueReportDto {
  table_number?: number;
  description?: string;
  photo_url?: string;
}

export interface WaiterTableDetailItem {
  id: string;
  name: string;
  quantity: number;
  notes?: string | null;
  subtotalCents: number;
  createdAt: string;
}

export interface WaiterTableDetailOrder {
  id: string;
  status: string;
  billing_mode: string;
  total_cents: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  items: WaiterTableDetailItem[];
}

export interface WaiterTableDetail {
  session: {
    id: string;
    status: string;
    created_at: string;
    closed_at: string | null;
    table_id: string;
    table_code: string;
    table_label: string;
    capacity: number;
    party_size: number;
    total_cents: number;
    paid_cents: number;
    processing_cents: number;
    paid_count: number;
    processing_count: number;
  };
  orders: WaiterTableDetailOrder[];
}

export interface WaiterMenuItem {
  id: string;
  name: string;
  short_description?: string | null;
  price_cents: number;
  image_url?: string | null;
  tags?: string[] | null;
  category_id?: string | null;
}

export interface WaiterDirectOrderItem {
  menuItemId: string;
  quantity: number;
  notes?: string;
}

export interface WaiterDirectOrderResponse {
  id: string;
  orderId: string;
  status: string;
  billingMode: 'table';
  totalCents: number;
  itemCount: number;
  tableSessionId: string;
  tableCode: string;
  tableLabel: string;
  createdAt: string;
}

export interface WaiterShiftEndRequestResponse {
  requestId: string;
  status: 'pending';
  threadId: string | null;
  managerId: string;
}

// ─── Waiter calls ───
export function listPendingCalls(tenantSlug: string): Promise<WaiterCallSummary[]> {
  return staffGet<WaiterCallSummary[]>(`/${tenantSlug}/waiter-calls/pending`);
}

export interface WaiterCallStaffDetail {
  callId: string;
  status: string;
  reason: string;
  createdAt: string;
  acknowledgedAt: string | null;
  tableLabel: string;
  tableCode: string;
  bill: {
    subtotalCents: number;
    serviceFeePct: number;
    serviceFeeCents: number;
    totalCents: number;
  };
}

/** Detalhe REAL do chamado (mesa + conta com taxa) — mata o placebo R$612,40. */
export function getCallStaffDetail(
  tenantSlug: string,
  callId: string,
): Promise<WaiterCallStaffDetail> {
  return staffGet<WaiterCallStaffDetail>(`/${tenantSlug}/waiter-calls/${callId}/staff-detail`);
}

export function acknowledgeCall(
  tenantSlug: string,
  callId: string,
): Promise<{ callId: string; status: string; waiterName?: string; etaMinutes?: number }> {
  return staffPost(`/${tenantSlug}/waiter-calls/${callId}/acknowledge`, {});
}

/**
 * Conclui o chamado (garçom atendeu). Move pra 'resolved' (terminal) e o
 * backend emite `waiter:resolved` — a sheet do cliente destrava. Sem isto o
 * chamado morria em 'acknowledged' pra sempre (P1 re-scan 2026-07-04).
 */
export function resolveCall(
  tenantSlug: string,
  callId: string,
): Promise<{ callId: string; status: string }> {
  return staffPost(`/${tenantSlug}/waiter-calls/${callId}/resolve`, {});
}

// ─── Tables / sessions ───
export function listMyTables(tenantSlug: string): Promise<ActiveTableSummary[]> {
  return staffGet<ActiveTableSummary[]>(`/${tenantSlug}/staff/my-tables`);
}

export function getWaiterTableDetail(
  tenantSlug: string,
  tableRef: string,
): Promise<WaiterTableDetail> {
  return staffGet<WaiterTableDetail>(
    `/${tenantSlug}/staff/tables/${encodeURIComponent(tableRef)}/detail`,
  );
}

export function updateOrderStatus(
  tenantSlug: string,
  orderId: string,
  status: string,
): Promise<{ orderId: string; previousStatus: string; newStatus: string }> {
  return staffPatch(`/${tenantSlug}/orders/${orderId}/status`, {
    status,
    changedBy: 'waiter',
  });
}

export function markOrderInTransit(
  tenantSlug: string,
  orderId: string,
): Promise<{ orderId: string; deliveryId: string; status: 'in_transit' }> {
  return staffPost(`/${tenantSlug}/orders/${orderId}/in-transit`, {});
}

export function markOrderDelivered(
  tenantSlug: string,
  orderId: string,
): Promise<{ orderId: string; deliveryId: string; status: 'delivered' }> {
  return staffPost(`/${tenantSlug}/orders/${orderId}/delivered`, {});
}

// ─── Entregas (handoff cozinha/bar → garçom) ───

export interface PendingDeliveryItem {
  name: string;
  quantity: number;
  notes?: string | null;
}

export interface PendingDelivery {
  delivery_id: string;
  order_id: string;
  delivery_status: 'pending' | 'claimed';
  created_at: string;
  called_at: string | null;
  claimed_at: string | null;
  claimed_by: string | null;
  /** Nome de quem está LEVANDO (claimed_by) — null enquanto pending. */
  claimed_by_name: string | null;
  target_waiter_id: string | null;
  target_waiter_name: string | null;
  order_status: string;
  total_cents: number;
  table_id: string;
  table_label: string;
  table_code: string;
  zone_name: string | null;
  table_session_id: string;
  party_size: number;
  items: PendingDeliveryItem[];
}

export function listPendingDeliveries(tenantSlug: string): Promise<PendingDelivery[]> {
  return staffGet<PendingDelivery[]>(`/${tenantSlug}/deliveries/pending`);
}

/**
 * Predicados canônicos de audiência da entrega — o code-review achou 4
 * variantes divergentes espalhadas (banner alertava B pela entrega de A,
 * aba "Minhas mesas" discordava do banner). Regras:
 *  - pending direcionada a mim OU broadcast (target null) → é pra mim agir;
 *    SEM identidade (staffId null) só broadcast conta — nunca a dos outros.
 *  - claimed por mim → estou levando (estágio Confirmar entrega).
 */
export function isDeliveryForWaiter(d: PendingDelivery, staffId: string | null): boolean {
  if (d.delivery_status !== 'pending') return false;
  if (!d.target_waiter_id) return true;
  return staffId != null && d.target_waiter_id === staffId;
}

export function isDeliveryClaimedBy(d: PendingDelivery, staffId: string | null): boolean {
  return d.delivery_status === 'claimed' && staffId != null && d.claimed_by === staffId;
}

/** Timestamp de referência da entrega (chamada → claim → criação da row). */
export function deliveryTimestamp(d: PendingDelivery): string {
  return d.called_at ?? d.claimed_at ?? d.created_at;
}

export interface TableOverviewEntry {
  id: string;
  code: string;
  label: string;
  number: number;
  capacity: number;
  sort_order: number;
  /** Posição lógica na planta do salão (migration 055). NULL = sem posição → FE cai na grade por zona. */
  map_x: number | null;
  map_y: number | null;
  zone_id: string | null;
  zone_name: string | null;
  zone_sort_order: number;
  occupied: boolean;
}

export function listTablesOverview(tenantSlug: string): Promise<TableOverviewEntry[]> {
  return staffGet<{ tables: TableOverviewEntry[] }>(`/${tenantSlug}/staff/tables-overview`).then(
    (r) => r.tables ?? [],
  );
}

// ─── Direct order ───
export function listWaiterMenuItems(tenantSlug: string): Promise<WaiterMenuItem[]> {
  return staffGet<{ items: WaiterMenuItem[] }>(`/${tenantSlug}/menu/items`).then(
    (r) => r.items ?? [],
  );
}

export function createDirectTableOrder(
  tenantSlug: string,
  body: {
    tableRef: string;
    items: WaiterDirectOrderItem[];
    notes?: string;
  },
): Promise<WaiterDirectOrderResponse> {
  return staffPost<WaiterDirectOrderResponse>(`/${tenantSlug}/orders/staff-direct`, {
    tableRef: body.tableRef,
    billingMode: 'table',
    items: body.items,
    notes: body.notes,
  });
}

export function requestWaiterShiftEnd(
  tenantSlug: string,
  body: { reason?: string },
): Promise<WaiterShiftEndRequestResponse> {
  return staffPost<WaiterShiftEndRequestResponse>(`/${tenantSlug}/waiter/shift-end-requests`, body);
}

// ─── QR issue ───
export function reportQrIssue(tenantSlug: string, body: QrIssueReportDto): Promise<{ id: string }> {
  // Routed through the shared "qr-issue" complaint endpoint when present;
  // backend may expose either /qr-issue or /complaints?type=qr_issue.
  return staffPost<{ id: string }>(`/${tenantSlug}/qr-issues`, body);
}

// ─── Zone-pause ───
export function listMyZonePauses(tenantSlug: string, waiterId: string): Promise<ZonePauseDto[]> {
  return staffGet<ZonePauseDto[]>(
    `/${tenantSlug}/zone-pauses?waiterId=${encodeURIComponent(waiterId)}&active=true`,
  );
}

// ─── Staff messages (waiter-scoped — backend filters by viewer) ───
// P1 #18 — backend requires `?staffId=<uuid>` per StaffQueryDto.
export function listMyThreads(
  tenantSlug: string,
  staffId: string,
): Promise<StaffMessageThreadDto[]> {
  return staffApi<StaffMessageThreadDto[]>(
    `/${tenantSlug}/staff-messages/threads?staffId=${encodeURIComponent(staffId)}`,
    { method: 'GET', headers: { 'x-staff-id': staffId } },
  );
}

export function getThread(
  tenantSlug: string,
  threadId: string,
  staffId?: string,
): Promise<{ thread: StaffMessageThreadDto; messages: StaffMessageDto[] }> {
  return staffApi<{ thread: StaffMessageThreadDto; messages: StaffMessageDto[] }>(
    `/${tenantSlug}/staff-messages/threads/${threadId}`,
    { method: 'GET', headers: staffId ? { 'x-staff-id': staffId } : undefined },
  );
}

export function sendStaffMessage(
  tenantSlug: string,
  body: { recipientId: string; content: string; threadId?: string },
  staffId?: string,
): Promise<StaffMessageDto> {
  return staffApi<StaffMessageDto>(`/${tenantSlug}/staff-messages`, {
    method: 'POST',
    headers: staffId ? { 'x-staff-id': staffId } : undefined,
    body: JSON.stringify({
      threadId: body.threadId,
      recipientStaffId: body.threadId ? undefined : body.recipientId,
      body: body.content,
    }),
  });
}

export function markMessageRead(
  tenantSlug: string,
  messageId: string,
  staffId: string,
): Promise<{ ok: true }> {
  // P1 #18 — backend requires `staffId` in the body per ReadDto.
  return staffPost<{ ok: true }>(`/${tenantSlug}/staff-messages/${messageId}/read`, { staffId });
}

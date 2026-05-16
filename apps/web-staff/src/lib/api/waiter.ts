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

// ─── Waiter calls ───
export function listPendingCalls(tenantSlug: string): Promise<WaiterCallSummary[]> {
  return staffGet<WaiterCallSummary[]>(`/${tenantSlug}/waiter-calls/pending`);
}

export function acknowledgeCall(
  tenantSlug: string,
  callId: string,
): Promise<{ callId: string; status: string; waiterName?: string; etaMinutes?: number }> {
  return staffPost(`/${tenantSlug}/waiter-calls/${callId}/acknowledge`, {});
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

// ─── QR issue ───
export function reportQrIssue(
  tenantSlug: string,
  body: QrIssueReportDto,
): Promise<{ id: string }> {
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
  return staffPost<{ ok: true }>(
    `/${tenantSlug}/staff-messages/${messageId}/read`,
    { staffId },
  );
}

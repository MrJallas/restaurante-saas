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

import { staffGet, staffPost } from '../api';
import type {
  StaffMessageDto,
  StaffMessageThreadDto,
  ZonePauseDto,
} from '@restaurant/shared-types';

export interface WaiterCallSummary {
  id: string;
  status: string;
  created_at: string;
  table_label: string;
  table_code: string;
  /** Optional reason hint as the API exposes more channels. */
  reason?: string;
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

// ─── Waiter calls ───
export function listPendingCalls(tenantSlug: string): Promise<WaiterCallSummary[]> {
  return staffGet<WaiterCallSummary[]>(`/${tenantSlug}/waiter-calls/pending`);
}

export function acknowledgeCall(tenantSlug: string, callId: string): Promise<{ ok: true }> {
  return staffPost<{ ok: true }>(`/${tenantSlug}/waiter-calls/${callId}/acknowledge`, {});
}

// ─── Tables / sessions ───
export function listMyTables(tenantSlug: string): Promise<ActiveTableSummary[]> {
  return staffGet<ActiveTableSummary[]>(`/${tenantSlug}/staff/my-tables`);
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
export function listMyThreads(tenantSlug: string): Promise<StaffMessageThreadDto[]> {
  return staffGet<StaffMessageThreadDto[]>(`/${tenantSlug}/staff-messages/threads`);
}

export function getThread(
  tenantSlug: string,
  threadId: string,
): Promise<{ thread: StaffMessageThreadDto; messages: StaffMessageDto[] }> {
  return staffGet<{ thread: StaffMessageThreadDto; messages: StaffMessageDto[] }>(
    `/${tenantSlug}/staff-messages/threads/${threadId}`,
  );
}

export function sendStaffMessage(
  tenantSlug: string,
  body: { recipientId: string; content: string; threadId?: string },
): Promise<StaffMessageDto> {
  return staffPost<StaffMessageDto>(`/${tenantSlug}/staff-messages`, body);
}

export function markMessageRead(tenantSlug: string, messageId: string): Promise<{ ok: true }> {
  return staffPost<{ ok: true }>(`/${tenantSlug}/staff-messages/${messageId}/read`, {});
}

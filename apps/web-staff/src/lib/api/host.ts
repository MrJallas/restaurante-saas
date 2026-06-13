// REST helpers for the host (recepcionista) screens.
// Tenant slug is parameterised; route prefixes follow the API conventions
// at apps/api/src/modules/* (late-arrival, table-merge, table-session).

import { staffDelete, staffGet, staffPatch, staffPost } from '../api';
import type {
  HostInboxItemDto,
  LateArrivalRequestDto,
  ScanVerificationRequestDto,
} from '@restaurant/shared-types';

export interface HostTableEntry {
  number: number;
  capacity: number;
  sector: string;
  status: 'livre' | 'liberada' | 'ocupada' | 'alerta';
  seats?: number;
  party?: number;
  observation?: string | null;
  since?: string;
  waiter_initial?: string | null;
  /** UUID do table_sessions ativo (null se livre). */
  active_session_id?: string | null;
}

export interface WaitlistEntry {
  id: string;
  name: string;
  party: number;
  phone?: string;
  cpf?: string;
  added_at: string;
  wait_minutes: number;
  note?: string | null;
  status: 'waiting' | 'seated' | 'left';
}

export interface ReservationEntry {
  id: string;
  name: string;
  party: number;
  phone?: string;
  when: string;
  table?: number | null;
  status: 'awaited' | 'arrived' | 'cancelled' | 'no_show';
  note?: string | null;
}

// ─── Tables / map ───
export function listHostTables(tenantSlug: string): Promise<HostTableEntry[]> {
  return staffGet<HostTableEntry[]>(`/${tenantSlug}/host/tables`);
}

export function liberateTable(tenantSlug: string, tableNumber: number): Promise<{ ok: true }> {
  return staffPost<{ ok: true }>(`/${tenantSlug}/host/tables/${tableNumber}/liberate`, {
    mode: 'auto',
  });
}

export function swapTable(
  tenantSlug: string,
  body: { fromTable: number; toTable: number; sessionId?: string },
): Promise<{ ok: true; sessionId: string }> {
  return staffPost<{ ok: true; sessionId: string }>(`/${tenantSlug}/host/tables/swap`, body);
}

export function updateHostTableSession(
  tenantSlug: string,
  tableNumber: number,
  body: { sessionId?: string; party?: number; note?: string },
): Promise<HostTableEntry> {
  return staffPatch<HostTableEntry>(`/${tenantSlug}/host/tables/${tableNumber}/session`, body);
}

// ─── Host inbox / avisos ───
export function listHostInbox(tenantSlug: string): Promise<HostInboxItemDto[]> {
  return staffGet<HostInboxItemDto[]>(`/${tenantSlug}/host/inbox`);
}

// ─── Waitlist ───
export function listWaitlist(tenantSlug: string): Promise<WaitlistEntry[]> {
  return staffGet<WaitlistEntry[]>(`/${tenantSlug}/host/waitlist`);
}

export function addToWaitlist(
  tenantSlug: string,
  body: { name: string; party: number; phone?: string; note?: string },
): Promise<WaitlistEntry> {
  return staffPost<WaitlistEntry>(`/${tenantSlug}/host/waitlist`, body);
}

export function removeFromWaitlist(
  tenantSlug: string,
  id: string,
  transition: 'seated' | 'left',
): Promise<{ ok: true }> {
  return staffDelete<{ ok: true }>(`/${tenantSlug}/host/waitlist/${id}?transition=${transition}`);
}

// ─── Reservations ───
export function listReservations(tenantSlug: string): Promise<ReservationEntry[]> {
  return staffGet<ReservationEntry[]>(`/${tenantSlug}/host/reservations`);
}

export function createReservation(
  tenantSlug: string,
  body: {
    name: string;
    party: number;
    phone?: string;
    when: string;
    table?: number;
    note?: string;
  },
): Promise<ReservationEntry> {
  return staffPost<ReservationEntry>(`/${tenantSlug}/host/reservations`, body);
}

export function updateReservation(
  tenantSlug: string,
  id: string,
  body: {
    status?: 'arrived' | 'cancelled' | 'no_show';
    table?: number;
    note?: string;
  },
): Promise<ReservationEntry> {
  return staffPatch<ReservationEntry>(`/${tenantSlug}/host/reservations/${id}`, body);
}

// ─── Late-arrival approvals (host fallback when host_customer_id is null
// or didn't respond in 60s — per docs/features/customer-host-model.md) ───
// P1 #22 — backend `ListQueryDto` whitelists ['pending','approved','rejected',
// 'expired']. The old `staff_pending` value silently filtered to nothing.
// `pending` matches the actual DB enum on `late_arrival_requests.status`.
export function listPendingLateArrivals(tenantSlug: string): Promise<LateArrivalRequestDto[]> {
  return staffGet<LateArrivalRequestDto[]>(`/${tenantSlug}/late-arrival-requests?status=pending`);
}

export function getLateArrival(tenantSlug: string, id: string): Promise<LateArrivalRequestDto> {
  return staffGet<LateArrivalRequestDto>(`/${tenantSlug}/late-arrival-requests/${id}`);
}

export function approveLateArrival(
  tenantSlug: string,
  id: string,
  body: { reason?: string } = {},
): Promise<LateArrivalRequestDto> {
  return staffPost<LateArrivalRequestDto>(
    `/${tenantSlug}/late-arrival-requests/${id}/approve`,
    body,
  );
}

export function rejectLateArrival(
  tenantSlug: string,
  id: string,
  body: { reason?: string } = {},
): Promise<LateArrivalRequestDto> {
  return staffPost<LateArrivalRequestDto>(
    `/${tenantSlug}/late-arrival-requests/${id}/reject`,
    body,
  );
}

// ─── Physical QR scan verification ───
export function listPendingScanVerifications(
  tenantSlug: string,
): Promise<ScanVerificationRequestDto[]> {
  return staffGet<ScanVerificationRequestDto[]>(
    `/${tenantSlug}/scan-verification-requests?status=pending`,
  );
}

export function getScanVerification(
  tenantSlug: string,
  id: string,
): Promise<ScanVerificationRequestDto> {
  return staffGet<ScanVerificationRequestDto>(`/${tenantSlug}/scan-verification-requests/${id}`);
}

export function approveScanVerification(
  tenantSlug: string,
  id: string,
): Promise<ScanVerificationRequestDto> {
  return staffPost<ScanVerificationRequestDto>(
    `/${tenantSlug}/scan-verification-requests/${id}/approve`,
    {},
  );
}

export function rejectScanVerification(
  tenantSlug: string,
  id: string,
  body: { reason?: string } = {},
): Promise<ScanVerificationRequestDto> {
  return staffPost<ScanVerificationRequestDto>(
    `/${tenantSlug}/scan-verification-requests/${id}/reject`,
    body,
  );
}

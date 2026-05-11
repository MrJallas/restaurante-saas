// Typed REST helpers for every manager-relevant endpoint shipped in Phase 2.
// Wraps `staffApi` from `lib/api.ts` with the same auth model (`x-staff-key`).
//
// Endpoint surface mapped here mirrors the Phase-2 module list:
//   • customer-host (late-arrival, table-merge)
//   • complaints, order-ratings
//   • staff-messages
//   • zone-pause
//   • vip / session flags
//   • lgpd-requests
//   • chat-history
//   • smart-suggestions (AI service · proxied through API or hit directly)
//
// All ISO datetime strings stay strings (parse at the call site if you need a
// Date). Errors bubble up as the original `Error` from `staffApi`.

import { staffApi, staffGet, staffPost, staffDelete } from '../api';
import type {
  ComplaintDto,
  ComplaintResponseDto,
  ComplaintResolveDto,
  ComplaintForwardDto,
  LateArrivalRequestDto,
  TableMergeRequestDto,
  StaffMessageDto,
  StaffMessageThreadDto,
  StaffMessageSendDto,
  ZonePauseDto,
  ZonePauseCreateDto,
  ZonePauseEndDto,
  SessionFlagToggleDto,
  SessionFlagToggleResponseDto,
  LgpdRequestDto,
  CustomerWelcomeResponseDto,
} from '@restaurant/shared-types';

// ─────────────────────────────────────────────────────────────
// Late-arrival
// ─────────────────────────────────────────────────────────────

export const lateArrivalApi = (slug: string) => ({
  list: () => staffGet<LateArrivalRequestDto[]>(`/${slug}/late-arrival-requests`),
  approve: (id: string) =>
    staffPost<LateArrivalRequestDto>(`/${slug}/late-arrival-requests/${id}/approve`, {}),
  reject: (id: string) =>
    staffPost<LateArrivalRequestDto>(`/${slug}/late-arrival-requests/${id}/reject`, {}),
});

// ─────────────────────────────────────────────────────────────
// Table merge
// ─────────────────────────────────────────────────────────────

export const tableMergeApi = (slug: string) => ({
  list: () => staffGet<TableMergeRequestDto[]>(`/${slug}/table-merge-requests`),
  approve: (id: string) =>
    staffPost<TableMergeRequestDto>(`/${slug}/table-merge-requests/${id}/approve`, {}),
  reject: (id: string) =>
    staffPost<TableMergeRequestDto>(`/${slug}/table-merge-requests/${id}/reject`, {}),
});

// ─────────────────────────────────────────────────────────────
// Complaints
// ─────────────────────────────────────────────────────────────

export const complaintsApi = (slug: string) => ({
  list: () => staffGet<ComplaintDto[]>(`/${slug}/complaints`),
  respond: (id: string, body: ComplaintResponseDto) =>
    staffPost<ComplaintDto>(`/${slug}/complaints/${id}/respond`, body),
  resolve: (id: string, body?: ComplaintResolveDto) =>
    staffPost<ComplaintDto>(`/${slug}/complaints/${id}/resolve`, body ?? {}),
  forward: (id: string, body: ComplaintForwardDto) =>
    staffPost<ComplaintDto>(`/${slug}/complaints/${id}/forward`, body),
});

// ─────────────────────────────────────────────────────────────
// Staff messages (manager <-> staff <-> customer)
// ─────────────────────────────────────────────────────────────

export interface ThreadWithMessagesDto {
  thread: StaffMessageThreadDto;
  messages: StaffMessageDto[];
}

export const staffMessagesApi = (slug: string) => ({
  send: (body: StaffMessageSendDto) =>
    staffPost<StaffMessageDto>(`/${slug}/staff-messages`, body),
  // P1 #18 — backend `StaffQueryDto` requires `staffId` UUID; without it
  // we used to get a 400. Caller must thread the current viewer's staffId.
  listThreads: (params: { staffId: string }) =>
    staffGet<StaffMessageThreadDto[]>(
      `/${slug}/staff-messages/threads?staffId=${encodeURIComponent(params.staffId)}`,
    ),
  getThread: (threadId: string) =>
    staffGet<ThreadWithMessagesDto>(`/${slug}/staff-messages/threads/${threadId}`),
  markRead: (messageId: string, body: { staffId: string }) =>
    staffPost<{ ok: true }>(`/${slug}/staff-messages/${messageId}/read`, body),
});

// ─────────────────────────────────────────────────────────────
// Zone pause
// ─────────────────────────────────────────────────────────────

export const zonePauseApi = (slug: string) => ({
  list: (params?: { waiterId?: string; active?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.waiterId) search.set('waiterId', params.waiterId);
    if (params?.active !== undefined) search.set('active', String(params.active));
    const query = search.toString();
    return staffGet<ZonePauseDto[]>(`/${slug}/zone-pauses${query ? `?${query}` : ''}`);
  },
  create: (body: ZonePauseCreateDto) =>
    staffPost<ZonePauseDto>(`/${slug}/zone-pauses`, body),
  end: (id: string, body?: ZonePauseEndDto) =>
    staffPost<ZonePauseDto>(`/${slug}/zone-pauses/${id}/end`, body ?? {}),
});

// ─────────────────────────────────────────────────────────────
// VIP / session flags
// ─────────────────────────────────────────────────────────────

export const sessionFlagsApi = (slug: string) => ({
  toggle: (tableSessionId: string, body: SessionFlagToggleDto) =>
    staffPost<SessionFlagToggleResponseDto>(
      `/${slug}/staff/sessions/${tableSessionId}/flags`,
      body,
    ),
  list: (tableSessionId: string) =>
    staffGet<SessionFlagToggleResponseDto>(
      `/${slug}/staff/sessions/${tableSessionId}/flags`,
    ),
});

// ─────────────────────────────────────────────────────────────
// VIP customer (customer-scoped — manager UI marks via session flags
// above, but the customer endpoint exists for cross-session VIP audit.)
// ─────────────────────────────────────────────────────────────

export const customerVipApi = (slug: string) => ({
  markVip: (customerId: string, body?: { reason?: string }) =>
    staffPost<CustomerWelcomeResponseDto>(`/${slug}/customer/${customerId}/vip`, body ?? {}),
  unmarkVip: (customerId: string) =>
    staffDelete<CustomerWelcomeResponseDto>(`/${slug}/customer/${customerId}/vip`),
});

// ─────────────────────────────────────────────────────────────
// LGPD
// ─────────────────────────────────────────────────────────────

export const lgpdApi = (slug: string) => ({
  list: () => staffGet<LgpdRequestDto[]>(`/${slug}/lgpd-requests`),
});

// ─────────────────────────────────────────────────────────────
// Chat history (LGPD-impactful — manager can view/erase customer chats)
// ─────────────────────────────────────────────────────────────

export interface ChatHistoryThreadDto {
  threadId: string;
  customerId: string | null;
  startedAt: string;
  lastMessagePreview: string | null;
  unreadCount?: number;
}

export interface ChatHistoryMessageDto {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export const chatHistoryApi = (slug: string) => ({
  listThreads: () => staffGet<ChatHistoryThreadDto[]>(`/${slug}/chat-history/threads`),
  getThread: (threadId: string) =>
    staffGet<ChatHistoryMessageDto[]>(`/${slug}/chat-history/threads/${threadId}/messages`),
  deleteThread: (threadId: string) =>
    staffDelete<{ ok: true }>(`/${slug}/chat-history/threads/${threadId}`),
  deleteAll: () => staffDelete<{ ok: true }>(`/${slug}/chat-history`),
});

// ─────────────────────────────────────────────────────────────
// Smart suggestions (AI service — proxied via /ai-service/smart-suggestions)
// ─────────────────────────────────────────────────────────────

export interface SmartSuggestionChip {
  id: string;
  text: string;
  /** Optional icon hint; UI maps to local Icon set. */
  icon?: string;
  /** When the chip should deep-link (e.g. open compensate flow). */
  linksTo?: string;
}

export interface SmartSuggestionsResponse {
  suggestions: SmartSuggestionChip[];
  poolExpiresAt: string;
}

const AI_BASE_URL =
  process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://localhost:8000';

/**
 * Fetch contextual chip suggestions for the manager `MContactClientSheet`.
 * Surface defaults to `manager_contact_client`; B3 returns 3-4 chips with
 * pre-formatted prose. Falls back to a small static set if the call fails so
 * the sheet is never empty.
 */
export async function fetchSmartSuggestions(params: {
  tenantId: string;
  surface?: string;
  customerId?: string;
  sessionId?: string;
  limit?: number;
}): Promise<SmartSuggestionsResponse> {
  const body = {
    tenantId: params.tenantId,
    customerId: params.customerId,
    sessionId: params.sessionId,
    surface: params.surface ?? 'manager_contact_client',
    limit: params.limit ?? 4,
  };
  try {
    const res = await fetch(`${AI_BASE_URL}/smart-suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`smart-suggestions ${res.status}`);
    const data = (await res.json()) as SmartSuggestionsResponse;
    return data;
  } catch {
    // Hard fallback — keep the sheet usable even when AI is offline.
    return {
      suggestions: [
        { id: 's1', text: 'Já fui verificar seu pedido na cozinha', icon: 'history' },
        { id: 's2', text: 'Saindo da cozinha em uns 5 min', icon: 'clock' },
        { id: 's3', text: 'Estou indo aí em 2 min', icon: 'user' },
        { id: 's4', text: 'Quer uma cortesia pela espera?', icon: 'gift', linksTo: 'mgr-compensate' },
      ],
      poolExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Generic staff/me lookup — used by header greetings + bell badge.
// ─────────────────────────────────────────────────────────────

export interface ManagerProfileDto {
  staffId: string;
  name: string;
  role: 'manager' | 'owner';
  tenantSlug: string;
  tenantId: string;
}

export const managerMe = (slug: string) => ({
  get: () => staffGet<ManagerProfileDto>(`/${slug}/staff/me`).catch(() => null),
});

// ─────────────────────────────────────────────────────────────
// Assistant — manager → cliente direct bubble (Onda 4 batch 2).
//
// Substitui o mis-routing previo em MContactClientSheet que batia
// em `/staff-messages` (staff↔staff). O endpoint `/assistant/staff-to-customer`
// persiste em `assistant_messages` (from_role='staff') e emite WS
// `assistant.staff_message_received` pra customer atualizar a UI
// em real-time.
// ─────────────────────────────────────────────────────────────

export interface AssistantStaffToCustomerDto {
  tableSessionId: string;
  message: string;
  fromStaffId: string;
}

export interface AssistantStaffMessageResponseDto {
  id: string;
  tableSessionId: string;
  message: string;
  fromStaffId: string;
  fromStaffName: string | null;
  createdAt: string;
}

export const assistantApi = (slug: string) => ({
  staffToCustomer: (body: AssistantStaffToCustomerDto) =>
    staffPost<AssistantStaffMessageResponseDto>(
      `/${slug}/assistant/staff-to-customer`,
      body,
    ),
});

// ─────────────────────────────────────────────────────────────
// Alerts — operational notifications feed (Round 18 bell wiring).
//
// Endpoints shipped by `apps/api/src/modules/alerts/`:
//   GET  /:slug/alerts?sev=all|crítica|atenção|info&status=open|dismissed|resolved|all
//   POST /:slug/alerts/:id/dismiss
//   POST /:slug/alerts/:id/resolve
//
// Surface is consumed by `ScreenManagerNotifications` (rota
// /manager/notifications · /host/notifications · /waiter/notifications).
// `actions` é JSONB de `{ label, route?, kind? }` — UI renderiza como
// botões inline. Endpoint pode estar em deploy paralelo — o screen
// trata erro caindo no empty state ao invés de quebrar.
// ─────────────────────────────────────────────────────────────

export type AlertSeverity = 'crítica' | 'atenção' | 'info';
export type AlertStatus = 'open' | 'dismissed' | 'resolved';

export interface AlertActionDescriptor {
  label: string;
  route?: string;
  kind?: 'primary' | 'ghost';
}

export interface AlertRow {
  id: string;
  sev: AlertSeverity;
  kind: string;
  title: string;
  sub: string | null;
  ttl_at: string | null;
  actions: AlertActionDescriptor[];
  dismissed_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export const alertsApi = (slug: string) => ({
  list: (params: { sev?: AlertSeverity | 'all'; status?: AlertStatus | 'all'; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.sev) search.set('sev', params.sev);
    if (params.status) search.set('status', params.status);
    if (params.limit) search.set('limit', String(params.limit));
    const query = search.toString();
    return staffGet<{ alerts: AlertRow[] } | AlertRow[]>(
      `/${slug}/alerts${query ? `?${query}` : ''}`,
    ).then((r) => (Array.isArray(r) ? r : r.alerts ?? []));
  },
  dismiss: (id: string) =>
    staffPost<AlertRow>(`/${slug}/alerts/${id}/dismiss`, {}),
  resolve: (id: string) =>
    staffPost<AlertRow>(`/${slug}/alerts/${id}/resolve`, {}),
});

// ─────────────────────────────────────────────────────────────
// Staff roster — wraps the `{ staff: [...] }` envelope from the
// API so callers receive a flat array. Centralised here so every
// screen (Staff, Home, OrdersPause, Funcionarios) gets the same
// shape regardless of how the controller envelope evolves.
// P1 #14 — backend returns `{ staff }`; FE used to assume `[]`.
// ─────────────────────────────────────────────────────────────

export interface StaffRosterEntry {
  id: string;
  name: string;
  role: 'waiter' | 'cook' | 'manager' | 'host' | 'bartender' | 'cashier' | string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
  default_shift?: 'Manhã' | 'Tarde' | 'Noite' | null;
}

export interface CreateStaffPayload {
  name: string;
  role: 'waiter' | 'cook' | 'manager' | 'host' | 'bartender' | 'cashier';
  pin: string; // 4-6 digits
  cpf?: string;
  phone?: string;
  email?: string;
  default_shift?: 'Manhã' | 'Tarde' | 'Noite';
}

export interface UpdateStaffPayload extends Partial<CreateStaffPayload> {
  isActive?: boolean;
}

export const staffRosterApi = (slug: string) => ({
  list: (params?: { role?: string; activeOnly?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.role) search.set('role', params.role);
    if (params?.activeOnly) search.set('activeOnly', 'true');
    const query = search.toString();
    return staffGet<{ staff: StaffRosterEntry[] }>(
      `/${slug}/staff${query ? `?${query}` : ''}`,
    ).then((r) => r.staff ?? []);
  },
  create: (payload: CreateStaffPayload) =>
    staffPost<StaffRosterEntry>(`/${slug}/staff`, payload),
  update: (id: string, payload: UpdateStaffPayload) =>
    staffApi<StaffRosterEntry>(`/${slug}/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deactivate: (id: string) =>
    staffApi<StaffRosterEntry>(`/${slug}/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: false }),
    }),
  delete: (id: string) =>
    staffDelete<{ deleted: true }>(`/${slug}/staff/${id}`),
});

// ─────────────────────────────────────────────────────────────
// Courtesies (round 18 Onda 1 wiring) — `/courtesies` not
// `/staff/courtesies` because StaffController has wildcard `:id`.
// ─────────────────────────────────────────────────────────────

export interface CourtesyEntry {
  id: string;
  table_session_id: string | null;
  table_number: number | null;
  type: string;
  item: string;
  status: 'pendente' | 'aceita' | 'recusada';
  manager_staff_id: string;
  manager_name: string;
  notes: string | null;
  created_at: string;
  responded_at: string | null;
  response_seconds: number | null;
}

export interface CreateCourtesyPayload {
  type: 'Sobremesa' | 'Drink' | 'Desconto' | 'Couvert' | 'Mensagem' | 'Outro';
  item: string;
  tableSessionId?: string;
  tableNumber?: number;
  notes?: string;
}

// ─────────────────────────────────────────────────────────────
// Shifts (round 18 Onda 2 backend) — `/shifts/*` not `/staff/shifts/*`
// to avoid the StaffController `:id` wildcard collision (same trick as
// courtesies).
// ─────────────────────────────────────────────────────────────

export interface ShiftMemberEntry {
  assignment_id: string;
  staff_id: string;
  staff_name: string;
  staff_role: string;
  work_date: string;
  overtime_minutes: number;
}

export interface ShiftWithMembers {
  id: string;
  label: string;
  range_label: string;
  time_start: string;
  time_end: string;
  sort_order: number;
  members: ShiftMemberEntry[];
}

export const shiftsApi = (slug: string) => ({
  list: (date?: string) => {
    const q = date ? `?date=${date}` : '';
    return staffGet<ShiftWithMembers[]>(`/${slug}/shifts${q}`);
  },
  addMember: (payload: { shiftId: string; staffId: string; workDate: string }) =>
    staffPost<ShiftMemberEntry & { shift_id: string }>(
      `/${slug}/shifts/assignments`,
      payload,
    ),
  moveMember: (assignmentId: string, toShiftId: string) =>
    staffApi<ShiftMemberEntry & { shift_id: string }>(
      `/${slug}/shifts/assignments/${assignmentId}/move`,
      { method: 'PATCH', body: JSON.stringify({ toShiftId }) },
    ),
  setOvertime: (assignmentId: string, minutes: number) =>
    staffApi<ShiftMemberEntry & { shift_id: string }>(
      `/${slug}/shifts/assignments/${assignmentId}/overtime`,
      { method: 'PATCH', body: JSON.stringify({ minutes }) },
    ),
  removeMember: (assignmentId: string) =>
    staffDelete<{ removed: true }>(
      `/${slug}/shifts/assignments/${assignmentId}`,
    ),
  duplicateWeek: (fromDate: string, toDate: string) =>
    staffPost<{ duplicated: number }>(`/${slug}/shifts/duplicate-week`, {
      fromDate,
      toDate,
    }),
});

export const courtesiesApi = (slug: string) => ({
  list: (params?: { today?: boolean; status?: 'pendente' | 'aceita' | 'recusada'; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.today) search.set('today', 'true');
    if (params?.status) search.set('status', params.status);
    if (params?.limit) search.set('limit', String(params.limit));
    const query = search.toString();
    return staffGet<CourtesyEntry[]>(`/${slug}/courtesies${query ? `?${query}` : ''}`);
  },
  create: (payload: CreateCourtesyPayload) =>
    staffPost<CourtesyEntry>(`/${slug}/courtesies`, payload),
  respond: (id: string, status: 'aceita' | 'recusada') =>
    staffPost<CourtesyEntry>(`/${slug}/courtesies/${id}/respond`, { status }),
});

// ─────────────────────────────────────────────────────────────
// Single tagged catch-all so screens can do `manager(slug).complaints.list()`
// ─────────────────────────────────────────────────────────────

export function manager(slug: string) {
  return {
    slug,
    lateArrival: lateArrivalApi(slug),
    tableMerge: tableMergeApi(slug),
    complaints: complaintsApi(slug),
    staffMessages: staffMessagesApi(slug),
    zonePauses: zonePauseApi(slug),
    sessionFlags: sessionFlagsApi(slug),
    customerVip: customerVipApi(slug),
    lgpd: lgpdApi(slug),
    chatHistory: chatHistoryApi(slug),
    staffRoster: staffRosterApi(slug),
    courtesies: courtesiesApi(slug),
    shifts: shiftsApi(slug),
    assistant: assistantApi(slug),
    alerts: alertsApi(slug),
    me: managerMe(slug),
  };
}

// Re-export raw helpers so screens can drop down when needed.
export { staffApi, staffGet, staffPost, staffDelete };

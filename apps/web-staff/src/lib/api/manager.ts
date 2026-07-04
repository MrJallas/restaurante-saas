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
  StaffInboundThreadDto,
  StaffMessageHistoryMessageDto,
  StaffMessageHistoryReadResponse,
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
  send: (body: StaffMessageSendDto, params?: { staffId?: string }) =>
    staffApi<StaffMessageDto>(`/${slug}/staff-messages`, {
      method: 'POST',
      headers: params?.staffId ? { 'x-staff-id': params.staffId } : undefined,
      body: JSON.stringify(body),
    }),
  // P1 #18 — backend `StaffQueryDto` requires `staffId` UUID; without it
  // we used to get a 400. Caller must thread the current viewer's staffId.
  listThreads: (params: { staffId: string }) =>
    staffApi<StaffMessageThreadDto[]>(
      `/${slug}/staff-messages/threads?staffId=${encodeURIComponent(params.staffId)}`,
      { method: 'GET', headers: { 'x-staff-id': params.staffId } },
    ),
  getThread: (threadId: string, params?: { staffId?: string }) =>
    staffApi<ThreadWithMessagesDto>(`/${slug}/staff-messages/threads/${threadId}`, {
      method: 'GET',
      headers: params?.staffId ? { 'x-staff-id': params.staffId } : undefined,
    }),
  markRead: (messageId: string, body: { staffId: string }) =>
    staffPost<{ ok: true }>(`/${slug}/staff-messages/${messageId}/read`, body),
});

// ─────────────────────────────────────────────────────────────
// Customer→staff inbox (round 22)
//
// Sibling of `staffMessagesApi` (staff↔staff). Surfaces customer-
// initiated messages — hoje só via `send_message_to_manager` tool,
// possivelmente waiter/host UI no futuro. As mensagens vivem em
// `staff_threads` + `staff_messages` (Mongo · 30d TTL), separados
// do `staff_messages` postgres do staff↔staff path.
// ─────────────────────────────────────────────────────────────

export const customerInboxApi = (slug: string) => ({
  listThreads: () =>
    staffGet<StaffInboundThreadDto[]>(`/${slug}/customer-staff-messages/staff/threads`),
  getThread: (threadId: string) =>
    staffGet<StaffMessageHistoryMessageDto[]>(
      `/${slug}/customer-staff-messages/staff/threads/${threadId}/messages`,
    ),
  markRead: (threadId: string) =>
    staffPost<StaffMessageHistoryReadResponse>(
      `/${slug}/customer-staff-messages/staff/threads/${threadId}/read`,
      {},
    ),
  sendReply: (threadId: string, body: { content: string }) =>
    staffPost<StaffMessageHistoryMessageDto>(
      `/${slug}/customer-staff-messages/staff/threads/${threadId}/messages`,
      body,
    ),
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
  create: (body: ZonePauseCreateDto) => staffPost<ZonePauseDto>(`/${slug}/zone-pauses`, body),
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
    staffGet<SessionFlagToggleResponseDto>(`/${slug}/staff/sessions/${tableSessionId}/flags`),
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

const AI_BASE_URL = process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://localhost:8000';

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
        {
          id: 's4',
          text: 'Quer uma cortesia pela espera?',
          icon: 'gift',
          linksTo: 'mgr-compensate',
        },
      ],
      poolExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  }
}

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
  /**
   * Destinatário (obrigatório desde 2026-06-11): a resposta do gerente é
   * privada por cliente — backend emite WS só no room `customer:<id>`.
   */
  toCustomerId: string;
}

export interface AssistantStaffMessageResponseDto {
  id: string;
  tableSessionId: string;
  message: string;
  fromStaffId: string;
  fromStaffName: string | null;
  toCustomerId: string;
  createdAt: string;
}

export const assistantApi = (slug: string) => ({
  staffToCustomer: (body: AssistantStaffToCustomerDto) =>
    staffPost<AssistantStaffMessageResponseDto>(`/${slug}/assistant/staff-to-customer`, body),
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

export interface FunnelStage {
  stage: string;
  count: number;
  medianMinutes: number;
  p95Minutes: number;
  ok: boolean;
  note: string;
}

/** Funil real do dia (order_status_history) — decisão Caleb 2026-07-04. */
export const funnelApi = (slug: string) => ({
  get: () => staffGet<{ stages: FunnelStage[] }>(`/${slug}/dashboard/funnel`),
});

export const alertsApi = (slug: string) => ({
  list: (
    params: { sev?: AlertSeverity | 'all'; status?: AlertStatus | 'all'; limit?: number } = {},
  ) => {
    const search = new URLSearchParams();
    if (params.sev) search.set('sev', params.sev);
    if (params.status) search.set('status', params.status);
    if (params.limit) search.set('limit', String(params.limit));
    const query = search.toString();
    return staffGet<{ alerts: AlertRow[] } | AlertRow[]>(
      `/${slug}/alerts${query ? `?${query}` : ''}`,
    ).then((r) => (Array.isArray(r) ? r : (r.alerts ?? [])));
  },
  dismiss: (id: string) => staffPost<AlertRow>(`/${slug}/alerts/${id}/dismiss`, {}),
  resolve: (id: string) => staffPost<AlertRow>(`/${slug}/alerts/${id}/resolve`, {}),
});

// ─────────────────────────────────────────────────────────────
// Manager account/preferences/shift logs
// ─────────────────────────────────────────────────────────────

export interface ManagerPreferences {
  notifications: Record<string, boolean>;
  theme: 'light' | 'dark' | 'auto';
  twoFactorEnabled: boolean;
  updatedAt: string | null;
}

export interface ManagerSecuritySession {
  id: string;
  label: string;
  ip: string;
  userAgent: string;
  current: boolean;
  lastSeenAt: string;
}

export interface ManagerShiftLog {
  id: string;
  staffId: string;
  staffName: string;
  shiftLabel: string;
  startedAt: string;
  endedAt: string;
  salesCents: number;
  orders: number;
  tablesServed: number;
  criticalAlerts: number;
  avgTicketCents: number;
  waitersOnShift: string[];
  createdAt: string;
}

export const managerAccountApi = (slug: string) => ({
  getPreferences: () => staffGet<ManagerPreferences>(`/${slug}/manager/preferences`),
  updatePreferences: (body: Partial<ManagerPreferences>) =>
    staffApi<ManagerPreferences>(`/${slug}/manager/preferences`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  changePin: (body: { currentPin: string; nextPin: string }) =>
    staffPost<{ message_user: string; code: string }>(`/${slug}/manager/security/change-pin`, body),
  sessions: () =>
    staffGet<{ sessions: ManagerSecuritySession[] }>(`/${slug}/manager/security/sessions`),
  revokeSession: (sessionId: string) =>
    staffDelete<{ ok: true }>(
      `/${slug}/manager/security/sessions/${encodeURIComponent(sessionId)}`,
    ),
  endShift: () => staffPost<ManagerShiftLog>(`/${slug}/manager/shift-logs/end`, {}),
  shiftLogs: (params?: { date?: string; staff?: string; shift?: string }) => {
    const search = new URLSearchParams();
    if (params?.date) search.set('date', params.date);
    if (params?.staff) search.set('staff', params.staff);
    if (params?.shift) search.set('shift', params.shift);
    const query = search.toString();
    return staffGet<{ shifts: ManagerShiftLog[] }>(
      `/${slug}/manager/shift-logs${query ? `?${query}` : ''}`,
    );
  },
});

// ─────────────────────────────────────────────────────────────
// Kitchen queue / reorder
// ─────────────────────────────────────────────────────────────

export interface KitchenQueueOrderItem {
  id: string;
  name: string;
  quantity: number;
  subtotalCents: number;
  notes?: string | null;
}

export interface KitchenQueueOrder {
  id: string;
  status: string;
  billing_mode: string;
  total_cents: number;
  notes?: string | null;
  visit_id: string | null;
  table_session_id: string;
  table_label: string;
  table_number: number;
  created_at: string;
  updated_at: string;
  wait_minutes: number;
  meta_minutes: number;
  priority_rank: string;
  priority_reason: string | null;
  priority_requested_by: string | null;
  priority_updated_at: string | null;
  delivery_id?: string | null;
  delivery_status?: string | null;
  delivery_called_at?: string | null;
  delivery_claimed_at?: string | null;
  delivery_target_waiter_id?: string | null;
  delivery_target_waiter_name?: string | null;
  items: KitchenQueueOrderItem[];
}

export interface KitchenReorderRequest {
  id: string;
  order_ids: string[];
  reason: string | null;
  requested_by_staff_id: string | null;
  requested_by_name: string | null;
  status: 'pending' | 'accepted' | 'next' | 'cancelled';
  response: 'accept' | 'next' | null;
  protected_order_ids: string[];
  response_note: string | null;
  created_at: string;
  responded_at: string | null;
  orders: KitchenQueueOrder[];
}

export const kitchenApi = (slug: string) => ({
  queue: () =>
    staffGet<{ orders: KitchenQueueOrder[] }>(`/${slug}/kitchen/queue`).then((r) => r.orders ?? []),
  reorder: (body: { orderIds: string[]; reason?: string }) =>
    staffPost<{
      ok: true;
      updatedOrderIds: string[];
      reason: string | null;
      updatedAt: string;
    }>(`/${slug}/kitchen/reorder`, body),
  requestReorder: (body: { orderIds: string[]; reason?: string }) =>
    staffPost<KitchenReorderRequest>(`/${slug}/kitchen/reorder-requests`, body),
  pendingReorderRequests: () =>
    staffGet<KitchenReorderRequest[]>(`/${slug}/kitchen/reorder-requests/pending`),
  getReorderRequest: (requestId: string) =>
    staffGet<KitchenReorderRequest>(`/${slug}/kitchen/reorder-requests/${requestId}`),
  respondReorderRequest: (
    requestId: string,
    body: { response: 'accept' | 'next'; protectedOrderIds?: string[] },
  ) =>
    staffPost<KitchenReorderRequest>(
      `/${slug}/kitchen/reorder-requests/${requestId}/respond`,
      body,
    ),
});

// ─────────────────────────────────────────────────────────────
// Manager order timeline
// ─────────────────────────────────────────────────────────────

export interface OrderTimelineEvent {
  event: string;
  at: string;
  byStaffId: string | null;
  byStaffName: string | null;
  fromStatus: string | null;
}

export interface OrderTimelineResponse {
  orderId: string;
  tableNumber?: number | null;
  tableLabel?: string | null;
  totalCents?: number | null;
  currentStatus?: string | null;
  assignedStaffName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  events: OrderTimelineEvent[];
}

export function getOrderTimeline(slug: string, orderId: string): Promise<OrderTimelineResponse> {
  return staffGet<OrderTimelineResponse>(`/${slug}/orders/${encodeURIComponent(orderId)}/timeline`);
}

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

export interface StaffPerformance {
  staffId: string;
  period: 'today' | '7d' | '30d' | string;
  kpis: {
    ordersServed: number;
    totalRevenue: number;
    avgResponseSec: number;
    sessionsHandled: number;
    callsAnswered: number;
  };
  salesByDay?: Array<{
    date: string;
    ordersServed: number;
    totalRevenue: number;
  }>;
  teamComparison?: Array<{
    metric: 'avgResponseSec' | 'avgTicketCents' | 'callsAnswered' | 'sessionsHandled';
    mine: number;
    team: number;
    lowerIsBetter?: boolean;
  }>;
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
  get: (id: string) => staffGet<StaffRosterEntry>(`/${slug}/staff/${id}`),
  performance: (id: string, period: 'today' | '7d' | '30d') =>
    staffGet<StaffPerformance>(
      `/${slug}/staff/${id}/performance?period=${encodeURIComponent(period)}`,
    ),
  create: (payload: CreateStaffPayload) => staffPost<StaffRosterEntry>(`/${slug}/staff`, payload),
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
  delete: (id: string) => staffDelete<{ deleted: true }>(`/${slug}/staff/${id}`),
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
    staffPost<ShiftMemberEntry & { shift_id: string }>(`/${slug}/shifts/assignments`, payload),
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
    staffDelete<{ removed: true }>(`/${slug}/shifts/assignments/${assignmentId}`),
  duplicateWeek: (fromDate: string, toDate: string) =>
    staffPost<{ duplicated: number }>(`/${slug}/shifts/duplicate-week`, {
      fromDate,
      toDate,
    }),
  decideShiftEnd: (
    requestId: string,
    body: { decision: 'approved' | 'rejected'; responseMessage?: string },
  ) =>
    staffPost<{
      requestId: string;
      status: 'approved' | 'rejected';
      threadId: string | null;
    }>(`/${slug}/manager/shift-end-requests/${requestId}/decision`, body),
});

export const courtesiesApi = (slug: string) => ({
  list: (params?: {
    today?: boolean;
    status?: 'pendente' | 'aceita' | 'recusada';
    limit?: number;
  }) => {
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
    customerInbox: customerInboxApi(slug),
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
    funnel: funnelApi(slug),
    account: managerAccountApi(slug),
    kitchen: kitchenApi(slug),
    orderTimeline: {
      get: (orderId: string) => getOrderTimeline(slug, orderId),
    },
  };
}

// Re-export raw helpers so screens can drop down when needed.
export { staffApi, staffGet, staffPost, staffDelete };

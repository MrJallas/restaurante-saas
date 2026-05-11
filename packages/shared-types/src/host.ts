// === Staff-host module ===
//
// DTOs e enums consumidos pelas telas `apps/web-staff/src/screens/host/*`.
// Note: NAO confundir com `customer-host` (cliente que abre comanda primeiro).
// Aqui e o staff-host = recepcionista, que cuida de waitlist, reservas,
// swap e liberate de mesas.

// ─── Mapa / lista de mesas ───

export type HostTableStatus = 'livre' | 'liberada' | 'ocupada' | 'alerta';

/**
 * Linha de mesa retornada por `GET /:slug/host/tables`. Pareada 1:1 com
 * `HostTableEntry` no FE em `apps/web-staff/src/lib/api/host.ts`.
 */
export interface HostTableDto {
  number: number;
  capacity: number;
  sector: string;
  status: HostTableStatus;
  /** Quantos lugares estao ocupados agora (so faz sentido em ocupada). */
  seats?: number;
  /** ISO timestamp do `table_sessions.created_at` ativo. */
  since?: string;
  /** Iniciais do garcom (deriv. de staff.name) — placeholder ate roteamento real. */
  waiter_initial?: string | null;
  /**
   * UUID do `table_sessions` ativo. Necessário pra deep-links staff-side
   * (ex: `/manager/mesa/[n]` resolve numero -> sessionId pra abrir a
   * `ScreenManagerTableMenu` que requer `tableSessionId`). `null` quando
   * mesa esta livre.
   */
  active_session_id?: string | null;
}

// ─── Inbox ───

export type HostInboxKind =
  | 'late_arrival_consumed'
  | 'merge_consumed'
  | 'complaint'
  | 'zone_pause_started'
  | 'zone_pause_ended';

/**
 * Item de notificacao passiva no inbox da recepcionista. Cada source tem
 * seu campo `refId` apontando pro registro original (late_arrival_request,
 * complaint, table_merge_request, zone_pause).
 */
export interface HostInboxItemDto {
  id: string;
  kind: HostInboxKind;
  refId: string;
  title: string;
  subtitle?: string;
  /** ISO timestamp pra ordenacao desc. */
  at: string;
  /** Campo livre, depende do kind (ex.: tableNumber, customerName). */
  context?: Record<string, unknown>;
}

// ─── Liberate ───

export type HostLiberateMode = 'auto' | 'manual_paid' | 'manual_force';

export interface HostLiberateDto {
  mode: HostLiberateMode;
  reason?: string;
  staffId?: string;
}

// ─── Swap ───

export type HostSwapStatus =
  | 'requested'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface HostSwapRequestDto {
  id: string;
  sessionId: string;
  fromTableNumber: number;
  toTableNumber: number;
  status: HostSwapStatus;
  reason?: string | null;
  createdAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
}

/**
 * Body de `POST /:slug/host/swap-requests`.
 *
 * O FE atual tem dois callsites: `swapTable` (`/host/tables/swap`, body
 * `{ fromTable, toTable }`) e essa rota mais REST. Mantemos as duas;
 * a primeira termina em alias da segunda.
 */
export interface HostSwapCreateDto {
  fromTable: number;
  toTable: number;
  sessionId?: string;
  reason?: string;
  staffId?: string;
}

/**
 * Body de `PATCH /:slug/host/swap-requests/:id`. Avanca o status do
 * registro pro proximo na sequencia. Service valida transicoes.
 */
export interface HostSwapUpdateDto {
  status: 'in_progress' | 'completed' | 'cancelled';
  reason?: string;
  staffId?: string;
}

// ─── Waitlist ───

export type WaitlistStatus = 'waiting' | 'seated' | 'left';

export interface WaitlistEntryDto {
  id: string;
  name: string;
  party: number;
  phone?: string;
  cpf?: string;
  added_at: string;
  /** Tempo desde added_at em minutos (calculado server-side). */
  wait_minutes: number;
  note?: string | null;
  status: WaitlistStatus;
}

export interface WaitlistCreateDto {
  name: string;
  party: number;
  phone?: string;
  cpf?: string;
  note?: string;
}

// ─── Reservations ───

export type ReservationStatus = 'awaited' | 'arrived' | 'cancelled' | 'no_show';

export interface ReservationEntryDto {
  id: string;
  name: string;
  party: number;
  phone?: string;
  /** HH:MM (do horario agendado). */
  when: string;
  table?: number | null;
  status: ReservationStatus;
  note?: string | null;
}

export interface ReservationCreateDto {
  name: string;
  party: number;
  phone?: string;
  /**
   * "HH:MM" interpretado como "hoje as HH:MM" pelo backend, ou ISO
   * datetime completo. Service normaliza pra TIMESTAMPTZ.
   */
  when: string;
  table?: number;
  note?: string;
}

// ─── VIP ───

export interface HostVipToggleDto {
  flag: boolean;
  reason?: string;
  staffId?: string;
}

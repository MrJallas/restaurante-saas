import type {
  CustomerIdentifyResponse,
  LateArrivalRequestDto,
  TableMergeRequestDto,
  MergeCooldownDto,
} from '@restaurant/shared-types';
import { apiPost, ApiRequestError } from '../api';
import { cleanCpf } from '../cpf';

/**
 * Customer-host model API client. Per docs/features/customer-host-model.md.
 *
 * Endpoints implemented in apps/api/src/modules/{customers,late-arrival,table-merge}.
 * Slug is derived from current pathname so callers don't have to thread it through.
 */

function getSlugFromPath(): string {
  if (typeof window === 'undefined') return '';
  const seg = window.location.pathname.split('/').filter(Boolean);
  return seg[0] ?? '';
}

function numberFromBody(body: Record<string, unknown> | undefined, key: string): number | null {
  const value = body?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringFromBody(body: Record<string, unknown> | undefined, key: string): string | null {
  const value = body?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function cooldownFromError(err: ApiRequestError): MergeCooldownDto {
  const body = err.body as Record<string, unknown> | undefined;
  const retryAfterSeconds = numberFromBody(body, 'retryAfterSeconds');
  const cooldownEndsAt =
    stringFromBody(body, 'cooldownEndsAt') ??
    new Date(Date.now() + Math.max(retryAfterSeconds ?? 600, 60) * 1000).toISOString();
  const originTable =
    numberFromBody(body, 'originTable') ?? numberFromBody(body, 'originTableNumber') ?? 0;
  const targetTable =
    numberFromBody(body, 'targetTable') ?? numberFromBody(body, 'targetTableNumber') ?? 0;
  return {
    originTable,
    targetTable,
    originTableNumber: numberFromBody(body, 'originTableNumber') ?? originTable,
    targetTableNumber: numberFromBody(body, 'targetTableNumber') ?? targetTable,
    originSessionId: stringFromBody(body, 'originSessionId') ?? undefined,
    targetSessionId: stringFromBody(body, 'targetSessionId') ?? undefined,
    originHostName: stringFromBody(body, 'originHostName'),
    targetHostName: stringFromBody(body, 'targetHostName'),
    originPartySize: numberFromBody(body, 'originPartySize') ?? undefined,
    targetPartySize: numberFromBody(body, 'targetPartySize') ?? undefined,
    reason: body?.reason === 'timeout' ? 'timeout' : 'rejected',
    cooldownEndsAt,
    retryAfterSeconds: retryAfterSeconds ?? undefined,
    code: stringFromBody(body, 'code') ?? undefined,
    message: stringFromBody(body, 'message_user') ?? stringFromBody(body, 'message') ?? err.message,
    message_user: stringFromBody(body, 'message_user') ?? undefined,
  };
}

// ─── Customer identify (CPF lookup) ──────────────────────────────────────────

/**
 * `POST /:slug/customer/identify` — CPF lookup before late-arrival join.
 *
 * Backend handles both branches:
 *  - returning customer (CPF found) → `isReturning=true`, refreshed token
 *  - new customer (CPF not found) → creates record, issues token
 *
 * The recognition token is set as an httpOnly cookie by the server, so we
 * don't need to persist it client-side. We expose it in the response anyway
 * so the caller can show a "bem-vindo de volta" hint when names differ.
 */
export async function identifyCustomer(input: {
  cpf: string;
  name?: string;
  currentSessionId?: string;
  slug?: string;
}): Promise<CustomerIdentifyResponse> {
  const slug = input.slug ?? getSlugFromPath();
  return apiPost<CustomerIdentifyResponse>(`/${slug}/customer/identify`, {
    name: input.name,
    cpf: cleanCpf(input.cpf),
    currentSessionId: input.currentSessionId,
  });
}

// ─── Late-arrival ────────────────────────────────────────────────────────────

/**
 * `POST /:slug/late-arrival-requests` — kicks off a customer-B join request.
 * Returns the freshly created request with TTL/expiresAt so the waiting screen
 * can render its 60s countdown.
 */
export async function createLateArrivalRequest(input: {
  customerId: string;
  visitId?: string;
  tableSessionId?: string;
  expectedArrivalAt?: string;
  message?: string;
  slug?: string;
}): Promise<LateArrivalRequestDto> {
  const slug = input.slug ?? getSlugFromPath();
  return apiPost<LateArrivalRequestDto>(`/${slug}/late-arrival-requests`, {
    customerId: input.customerId,
    visitId: input.visitId,
    tableSessionId: input.tableSessionId,
    expectedArrivalAt: input.expectedArrivalAt,
    message: input.message,
  });
}

/**
 * `POST /:slug/late-arrival-requests/:id/approve` — host accepts the joiner.
 * `customerId` identifies the host (the approver).
 */
export async function approveLateArrival(
  id: string,
  input: { customerId?: string; staffId?: string; slug?: string } = {},
): Promise<LateArrivalRequestDto> {
  const slug = input.slug ?? getSlugFromPath();
  return apiPost<LateArrivalRequestDto>(`/${slug}/late-arrival-requests/${id}/approve`, {
    customerId: input.customerId,
    staffId: input.staffId,
  });
}

/**
 * `POST /:slug/late-arrival-requests/:id/reject` — host refuses the joiner.
 * Optional `reason` ends up in the rejection record (free-form, max 500).
 */
export async function rejectLateArrival(
  id: string,
  input: { customerId?: string; staffId?: string; reason?: string; slug?: string } = {},
): Promise<LateArrivalRequestDto> {
  const slug = input.slug ?? getSlugFromPath();
  return apiPost<LateArrivalRequestDto>(`/${slug}/late-arrival-requests/${id}/reject`, {
    customerId: input.customerId,
    staffId: input.staffId,
    reason: input.reason,
  });
}

/**
 * `POST /:slug/late-arrival-requests/:id/cancel` — o PRÓPRIO solicitante
 * (Customer B) derruba o próprio pedido de join enquanto o host não decidiu.
 *
 * P1 (re-scan): antes o "Cancelar pedido" da waiting-approval só fazia
 * router.back() (no-op) — o request seguia 'pending' e escalava pro gerente
 * como timeout fantasma. O BE valida (cookie recognition_token) que o caller
 * é o requester da row, flipa 'cancelled', fecha a escalation_chain e dispensa
 * o card do host. O customerId derivado do cookie é a fonte de verdade; o
 * campo aqui é só best-effort (o BE ignora body).
 */
export async function cancelLateArrivalRequest(
  id: string,
  input: { slug?: string } = {},
): Promise<LateArrivalRequestDto> {
  const slug = input.slug ?? getSlugFromPath();
  return apiPost<LateArrivalRequestDto>(`/${slug}/late-arrival-requests/${id}/cancel`, {});
}

// ─── Table merge ─────────────────────────────────────────────────────────────

/**
 * Discriminated result of `createTableMergeRequest`. Backend returns 429 when
 * a cooldown blocks a new attempt — we surface that as a tagged variant so
 * the caller doesn't have to inspect HTTP error shapes.
 */
export type TableMergeCreateResult =
  | { ok: true; request: TableMergeRequestDto }
  | { ok: false; error: 'cooldown'; cooldown: MergeCooldownDto }
  | { ok: false; error: 'unknown'; message: string };

/**
 * `POST /:slug/table-merge-requests` — initiates merge between two sessions.
 * Returns either the new request or a typed cooldown error (HTTP 429).
 */
export async function createTableMergeRequest(input: {
  sourceTableSessionId?: string;
  targetTableSessionId?: string;
  targetTableNumber?: number;
  targetTableLabel?: string;
  requestingCustomerId?: string;
  targetCustomerId?: string;
  message?: string;
  slug?: string;
}): Promise<TableMergeCreateResult> {
  const slug = input.slug ?? getSlugFromPath();
  try {
    const request = await apiPost<TableMergeRequestDto>(`/${slug}/table-merge-requests`, {
      sourceTableSessionId: input.sourceTableSessionId,
      targetTableSessionId: input.targetTableSessionId,
      targetTableNumber: input.targetTableNumber,
      targetTableLabel: input.targetTableLabel,
      requestingCustomerId: input.requestingCustomerId,
      targetCustomerId: input.targetCustomerId,
      message: input.message,
    });
    return { ok: true, request };
  } catch (err) {
    if (err instanceof ApiRequestError && err.statusCode === 429) {
      return { ok: false, error: 'cooldown', cooldown: cooldownFromError(err) };
    }
    return {
      ok: false,
      error: 'unknown',
      message: err instanceof Error ? err.message : 'Erro inesperado',
    };
  }
}

/** `POST /:slug/table-merge-requests/:id/approve` — host (origin or target). */
export async function approveTableMerge(
  id: string,
  input: { decidedByCustomerId?: string; slug?: string } = {},
): Promise<TableMergeRequestDto> {
  const slug = input.slug ?? getSlugFromPath();
  return apiPost<TableMergeRequestDto>(`/${slug}/table-merge-requests/${id}/approve`, {
    decidedByCustomerId: input.decidedByCustomerId,
  });
}

/** `POST /:slug/table-merge-requests/:id/reject` — triggers cooldown server-side. */
export async function rejectTableMerge(
  id: string,
  input: { decidedByCustomerId?: string; reason?: string; slug?: string } = {},
): Promise<TableMergeRequestDto & { cooldownEndsAt?: string | null }> {
  const slug = input.slug ?? getSlugFromPath();
  return apiPost<TableMergeRequestDto & { cooldownEndsAt?: string | null }>(
    `/${slug}/table-merge-requests/${id}/reject`,
    {
      decidedByCustomerId: input.decidedByCustomerId,
      reason: input.reason,
    },
  );
}

/**
 * Cliente pede a RECEPÇÃO na mesa (`POST /:slug/host/assist`, SessionGuard).
 * Nasceu do card de junção de mesas no assistente — o botão "Chamar
 * recepcionista" abria o sheet do GARÇOM (bug dos vídeos 2026-06-10).
 * Backend persiste alert visível pro papel host + emite WS
 * `host.assist_requested`.
 */
export async function requestHostAssist(
  slug: string,
  reason?: string,
): Promise<{ ok: true; tableLabel: string | null }> {
  return apiPost<{ ok: true; tableLabel: string | null }>(`/${slug}/host/assist`, {
    reason,
  });
}

import type {
  CustomerIdentifyResponse,
  TableMergeRequestDto,
  MergeCooldownDto,
} from '@restaurant/shared-types';
import { apiGet, apiPost, ApiRequestError } from '../api';
import { cleanCpf } from '../cpf';

/**
 * Customer-host model API client. Per docs/features/customer-host-model.md.
 *
 * Endpoints implemented in apps/api/src/modules/{customers,table-merge}.
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
 * `POST /:slug/customer/identify` — CPF lookup do gate de identidade.
 *
 * Backend handles both branches:
 *  - returning customer (CPF found) → `isReturning=true`, cookie canônico
 *  - new customer (CPF not found) → creates record, issues token
 *
 * The recognition token is set as an httpOnly cookie by the server, so we
 * don't need to persist it client-side. O backend não devolve o bearer no body;
 * `isReturning` + `canonicalName` sustentam o "bem-vindo de volta".
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

/** Status customer-scoped do merge, sem expor tokens das duas mesas. */
export async function getTableMergeRequestStatus(
  id: string,
  input: { slug?: string } = {},
): Promise<TableMergeRequestDto> {
  const slug = input.slug ?? getSlugFromPath();
  return apiGet<TableMergeRequestDto>(`/${slug}/table-merge-requests/${id}/status`);
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

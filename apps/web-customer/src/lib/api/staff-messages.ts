import { api, apiGet, apiPost } from '../api';
import type {
  StaffMessageHistoryThreadDto,
  StaffMessageHistoryMessageDto,
  StaffMessageHistoryThreadDeleteResponse,
  StaffMessageHistoryDeleteResponse,
  StaffMessageHistoryReadResponse,
  StaffMessageHistoryCustomerSendResponse,
} from '@restaurant/shared-types';

/**
 * Customer-facing inbox "Mensagens com a equipe" — Mongo-backed (30d TTL).
 * Distinct from `chat-history.ts` (AI conversations); the BE keeps the two
 * histories in separate collections so the customer surface can show them
 * as separate cards. Endpoints are mounted under
 * `:slug/customer-staff-messages/...` — see the API controller header for
 * why the prefix isn't `staff-messages` (collides with the staff↔staff
 * thread controller).
 */

const BASE = (slug: string) => `/${slug}/customer-staff-messages`;

export function listThreads(slug: string): Promise<StaffMessageHistoryThreadDto[]> {
  return apiGet<StaffMessageHistoryThreadDto[]>(`${BASE(slug)}/threads`);
}

export function listMessages(
  slug: string,
  threadId: string,
): Promise<StaffMessageHistoryMessageDto[]> {
  return apiGet<StaffMessageHistoryMessageDto[]>(
    `${BASE(slug)}/threads/${encodeURIComponent(threadId)}/messages`,
  );
}

export function markRead(slug: string, threadId: string): Promise<StaffMessageHistoryReadResponse> {
  return apiPost<StaffMessageHistoryReadResponse>(
    `${BASE(slug)}/threads/${encodeURIComponent(threadId)}/read`,
    {},
  );
}

export function sendCustomerMessage(
  slug: string,
  threadId: string,
  content: string,
): Promise<StaffMessageHistoryCustomerSendResponse> {
  return apiPost<StaffMessageHistoryCustomerSendResponse>(
    `${BASE(slug)}/threads/${encodeURIComponent(threadId)}/messages`,
    { content },
  );
}

export function deleteThread(
  slug: string,
  threadId: string,
): Promise<StaffMessageHistoryThreadDeleteResponse> {
  return api<StaffMessageHistoryThreadDeleteResponse>(
    `${BASE(slug)}/threads/${encodeURIComponent(threadId)}`,
    { method: 'DELETE' },
  );
}

export function deleteAllThreads(slug: string): Promise<StaffMessageHistoryDeleteResponse> {
  return api<StaffMessageHistoryDeleteResponse>(BASE(slug), {
    method: 'DELETE',
  });
}

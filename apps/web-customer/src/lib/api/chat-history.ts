import { api, apiGet } from '../api';
import type {
  ChatThreadDto,
  ChatMessageDto,
  ChatThreadDeleteResponse,
  ChatHistoryDeleteResponse,
} from '@restaurant/shared-types';

/**
 * Lists the customer's chat threads (NoSQL-backed). Sorted by `lastMessageAt`
 * descending — same shape exposed by `ChatHistoryService.listThreads`.
 */
export function listThreads(slug: string, customerId: string): Promise<ChatThreadDto[]> {
  return apiGet<ChatThreadDto[]>(
    `/${slug}/chat-history/threads?customerId=${encodeURIComponent(customerId)}`,
  );
}

/**
 * Returns the messages belonging to a single thread, in chronological order.
 * Read-only — there's no edit or append endpoint by design.
 */
export function listMessages(slug: string, threadId: string): Promise<ChatMessageDto[]> {
  return apiGet<ChatMessageDto[]>(
    `/${slug}/chat-history/threads/${encodeURIComponent(threadId)}/messages`,
  );
}

/**
 * Soft-deletes a single thread. The BE marks the thread `deletedByUser=true`
 * and removes the message docs from MongoDB.
 */
export function deleteThread(
  slug: string,
  threadId: string,
  customerId: string,
): Promise<ChatThreadDeleteResponse> {
  return api<ChatThreadDeleteResponse>(
    `/${slug}/chat-history/threads/${encodeURIComponent(threadId)}?customerId=${encodeURIComponent(customerId)}`,
    { method: 'DELETE' },
  );
}

/**
 * Bulk delete — used by the "Apagar todo o histórico" button. Backed by the
 * same endpoint that the LGPD erasure path hits, so the result here is
 * informational (the LGPD flow returns a protocol; this one returns a count).
 */
export function deleteAllThreads(
  slug: string,
  customerId: string,
): Promise<ChatHistoryDeleteResponse> {
  return api<ChatHistoryDeleteResponse>(
    `/${slug}/chat-history?customerId=${encodeURIComponent(customerId)}`,
    { method: 'DELETE' },
  );
}

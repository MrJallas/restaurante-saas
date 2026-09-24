// === Chat history (NoSQL · 30-day TTL) ===
// Per docs/produto/funcionalidades/historico-de-chat-e-lgpd.md. Read-only consumption from MongoDB.

/**
 * Role of the message author. `manager` is for staff replies (complaint
 * responses, courtesy messages) — distinct from `assistant` (LLM).
 */
export type ChatMessageRole = 'user' | 'assistant' | 'system' | 'manager';

/**
 * Tool call attached to an assistant message. Persisted in NoSQL for replay
 * during read-only history view. `result` is opaque; FE only needs `name` and
 * indicator state.
 */
export interface ChatToolCall {
  name: string;
  params?: Record<string, unknown>;
  result?: unknown;
}

/** Linked menu item embedded in a message (e.g. "I suggest the carbonara"). */
export interface ChatLinkedItem {
  itemId: string;
  name: string;
  /** Cents. */
  price: number;
}

/**
 * Domain shape for a chat thread. Mirrors `chat_threads` collection.
 * `expiresAt` is the TTL trigger; `deletedByUser` indicates explicit user wipe.
 */
export interface ChatThread {
  threadId: string;
  customerId: string;
  tenantId: string;
  sessionId: string;
  visitId: string;
  startedAt: Date;
  lastMessageAt: Date;
  messageCount: number;
  expiresAt: Date;
  deletedByUser: boolean;
  deletedAt: Date | null;
  /** First message or short summary for the list view. */
  preview: string;
}

/**
 * DTO for `GET /customer/chats`. ISO date strings.
 */
export interface ChatThreadDto {
  threadId: string;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
  preview: string;
  /** ISO datetime when the thread auto-expires (startedAt + 30d). */
  expiresAt: string;
}

/**
 * Domain shape for a chat message. Mirrors `chat_messages` collection.
 */
export interface ChatMessage {
  messageId: string;
  threadId: string;
  customerId: string;
  role: ChatMessageRole;
  content: string;
  toolCalls: ChatToolCall[] | null;
  suggestionChips: string[] | null;
  linkedItems: ChatLinkedItem[] | null;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * DTO for `GET /customer/chats/:threadId/messages`. Read-only; no edit endpoint.
 */
export interface ChatMessageDto {
  messageId: string;
  role: ChatMessageRole;
  content: string;
  toolCalls: ChatToolCall[] | null;
  suggestionChips: string[] | null;
  linkedItems: ChatLinkedItem[] | null;
  createdAt: string;
  /** Free-form metadata (chipAction for ManagerBubble, etc.). */
  metadata?: Record<string, unknown>;
}

/**
 * Response of `DELETE /customer/chats/:threadId`. Single delete.
 */
export interface ChatThreadDeleteResponse {
  deletedAt: string;
}

/**
 * Response of `DELETE /customer/chats`. Bulk delete.
 */
export interface ChatHistoryDeleteResponse {
  deletedCount: number;
}

/**
 * Response of `GET /customer/data-policy`. Footer notice on history list.
 */
export interface DataPolicyDto {
  retentionDays: number;
  lastFetched: string;
  contactEmail: string;
  lgpdNoticeText: string;
}

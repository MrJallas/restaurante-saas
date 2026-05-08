// === AI / tool contracts ===
// Per .claude/agents/ai-service.md. Provider-agnostic shapes consumed by
// apps/web-customer (chat UI), apps/web-staff (manager-side LLM tools), and
// services/ai-service (Python FastAPI on the LLM side — TS types here mirror
// the Pydantic models on the wire).

/**
 * Single tool invocation from the LLM. The same shape covers both:
 *  - call (when LLM emits a tool_use): `result` undefined, may set `silent`
 *  - resolved (after backend executes): `result` populated
 *
 * Flags are FE-routing hints emitted by the LLM/back-end:
 *  - `silent`: don't render a `ToolCallIndicator` bubble for this call
 *  - `requiresText`: the LLM expects to follow up with a text bubble after
 *    the tool result; FE keeps the typing indicator instead of clearing it
 *  - `router`: this tool is a routing decision (e.g. show_lgpd_notice
 *    deciding whether to render a canned bubble); FE may swap UI mode
 */
export interface ToolCall {
  /** Tool name, e.g. `request_table_merge`, `show_lgpd_notice`, `lgpd_data_request`. */
  name: string;
  /** Arguments the LLM passed; opaque to FE except for routing decisions. */
  args: Record<string, unknown>;
  /** Backend-resolved result. Undefined while pending. */
  result?: unknown;
  silent?: boolean;
  requiresText?: boolean;
  router?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Contextual chips (chips that appear under an assistant bubble)
// ─────────────────────────────────────────────────────────────

/** What happens when the customer taps a chip. */
export type ContextualChipAction = 'send' | 'navigate' | 'expand';

/**
 * Single chip rendered under an assistant bubble. `payload` is action-specific:
 *  - send: text to send as if user typed it
 *  - navigate: route or screen identifier
 *  - expand: payload to inflate inline (e.g. expand the LGPD notice with full text)
 */
export interface ContextualChip {
  id: string;
  label: string;
  action: ContextualChipAction;
  payload: unknown;
  /** Optional flag — primary visual treatment (filled vs outline). */
  primary?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Smart suggestions (deterministic pool from Redis)
// ─────────────────────────────────────────────────────────────

/**
 * Request for smart suggestions. Driven by deterministic pool keyed by
 * tenant + customer state — no LLM call required for the suggestion list itself.
 */
export interface SmartSuggestionsRequest {
  tenantId: string;
  customerId?: string;
  sessionId: string;
  /** Up to N suggestions (default 3). */
  limit?: number;
  /** Surface where the suggestions render: 'home' | 'post-rating' | 'idle'. */
  surface: 'home' | 'post-rating' | 'idle' | 'continuation';
}

/**
 * One suggestion entry. Derived from the Redis-cached pool (deterministic
 * per surface). FE renders as a chip; tap routes through the LLM as if the
 * customer typed `text`.
 */
export interface SmartSuggestion {
  id: string;
  /** Short label rendered as chip. */
  label: string;
  /** Text effectively sent to the LLM if customer taps. */
  text: string;
  /** Optional category for analytics. */
  category?: string;
}

export interface SmartSuggestionsResponse {
  suggestions: SmartSuggestion[];
  /** ISO datetime when the cache TTL expires; clients can warm next request. */
  poolExpiresAt: string;
}

// ─────────────────────────────────────────────────────────────
// Continuation messages (Redis pool · post-action templates)
// ─────────────────────────────────────────────────────────────

/**
 * Kinds of continuation messages. Determines the small-talk template family
 * triggered after a flow completes (rating sent, complaint resolved, etc.).
 */
export type ContinuationMessageKind =
  | 'pos_rating_positive'
  | 'pos_rating_neutral'
  | 'pos_reclamacao'
  | 'pos_join_approved'
  | 'pos_merge_approved'
  | 'idle_nudge';

/**
 * Single template entry from the Redis pool. `template` is a small string
 * with `{slot}`-style placeholders that the backend fills before delivery.
 */
export interface ContinuationMessage {
  id: string;
  kind: ContinuationMessageKind;
  /** Templated text with named slots (`{customerName}`, `{itemName}`...). */
  template: string;
  /** Names of slots the template expects. Used for validation in tests. */
  slots: string[];
  /** Optional follow-up chips rendered with the bubble. */
  chips?: ContextualChip[];
  /** Optional weight for randomized selection inside the kind bucket. */
  weight?: number;
}

# Chat history + LGPD + delete — scenarios (a–f)

Method: code review + Mongo/Postgres state + live AI tool dispatch via
`/tools/dispatch`. iOS-sim UI walkthrough was skipped (anti-overflow rule,
auth required cookie not reachable from CLI).

Status legend: PASS / FAIL / PARTIAL.

| # | Scenario | Status | Evidence |
|---|---|---|---|
| a | `/chat-history` lists threads grouped by day with eyebrow `QUI 14 MAI` | **PARTIAL** | Grouping is BY MONTH, eyebrow renders `MAI · 2026` — not the canon V20 `QUI 14 MAI`. See "Eyebrow mismatch" below. |
| b | Tap thread → `/chat-history/[threadId]` hydrates messages via `GET /chat-history/threads/:id/messages` | **PASS** | `ScreenCustomerChatThread` calls `listMessages(slug, threadId)`; backend `ChatHistoryService.listMessagesForCustomer` with ownership check. |
| c | CTA `Continuar nessa conversa` → `/assistente?threadId=X` | **PASS** | `ScreenCustomerChatThread.tsx:206` pushes `/${slug}/assistente?threadId=${encodeURIComponent(threadId)}`. Active screen hydrates by `threadId` query (verified in `assistente/page.tsx`). |
| d | FIFO 80 — drop oldest when 81st thread enters | **PASS** | Service code `chat-history.service.ts:299-344` `pruneOldestThreads`. Simulated: seeded 80 synthetic + 2 baseline = 82 active; prune dropped 2 oldest, settled at 80. See `fifo-80-test.md`. |
| e | `delete_chat` AI tool marks `deletedByUser=true` | **FAIL** | Tool path 404's. `services/ai-service/services/tools/delete_chat.py:36` calls `DELETE /{tenant_id}/chat-history/...`, but `API_BASE_URL=http://api:3001/api/restaurant_dev` already contains the tenant → final URL has double prefix `/api/restaurant_dev/restaurant_dev/...`. Live dispatch returned `{"error":{"code":"api_error","message":"DELETE /restaurant_dev/chat-history/threads/...:AUDIT-R23-50?customerId=... → 404"}}`. Same bug in `delete_all_chats.py:34`. Even after fixing the path the call would 401 (controller uses `SessionGuard`; `api_client` sends no cookie). |
| f | LGPD: `show_lgpd_notice` + `lgpd_data_request` flow → row in `lgpd_requests`; erasure clears BOTH Mongo `chat_messages` AND Postgres `assistant_messages` | **FAIL** | 1) `lgpd_data_request.py:47` posts to `/customer/lgpd-requests` — that route does not exist (real route `POST /:slug/lgpd-requests`). Live dispatch returned `api_error: POST /customer/lgpd-requests → 404`. No row was inserted in `lgpd_requests` (count remained 0). <br>2) Even if path were fixed, `LgpdService.createRequest` only calls `chatHistory.deleteAllForCustomer` which deletes Mongo `chat_messages` and soft-marks `chat_threads`. There is NO `DELETE FROM assistant_messages` anywhere (grep across `apps/api/src` returns zero hits). Erasure leaves Postgres `assistant_messages.user_message` + `assistant_response` text intact (19 rows still present for Caleb after testing). See `lgpd-erasure.md`. |

## Eyebrow mismatch (scenario a)

The chat-history **list** (`ScreenCustomerChatHistory.tsx`) groups by month
(`YYYY-MM`) and renders the group eyebrow with `formatDateMonthLabel(iso) =
"${MES} · ${ANO}"` (line 22–39), e.g. `MAI · 2026`. The per-row helper
`formatThreadDateTime` renders `"${DD} ${MES} · ${hh}:${mm}"`, e.g.
`14 MAI · 16:53`.

The brief expected `QUI 14 MAI` as the list eyebrow. That format only exists
in the thread DETAIL page (`ScreenCustomerChatThread.tsx:36-46`
`formatDayLabel`). The list groups by month, not day.

Either:
- the list page should adopt the same per-day grouping + `formatDayLabel`
  (`QUI 14 MAI`) — V20 canon consistency, OR
- the brief was treating the per-row `formatThreadDateTime` ("14 MAI · 16:53")
  as "the eyebrow", in which case it's a wording miss but the visuals match.

Recommend aligning the list with the detail page so V20 canon is uniform.

## Manager bubble mismatch (scenario b)

The brief expects `<StaffBubble>` (border-left 3px `ink`, eyebrow
`RENATA · GERENTE`) for manager replies in the historical thread view. The
active `/assistente` page does use `StaffBubble` (`apps/web-customer/src/app/[slug]/assistente/page.tsx:1496`).

But `ScreenCustomerChatThread.tsx:13,291` imports and uses
`ManagerBubble` (border-left 3px `warning` mostarda) for `role === 'manager'`
messages. `ManagerBubble` is the complaint-flow signature (per its own
header doc, `complaint-flow-v12.md §ChipActionInset`), not the V20 generic
manager→customer canon (§F11_Manager, ink stripe).

Result: a manager message looks one way in the live chat and a different
way in the read-only history.

See `staff-bubble-render.md`.

## Path/auth gap on AI tools (scenarios e + f)

Three customer-facing AI tools hit the `apps/api` backend; ALL three fail
in the current build:

| Tool | Hard-coded path | Real path | Issue |
|---|---|---|---|
| `delete_chat` | `/{tenant}/chat-history/threads/{id}?customerId=...` | `/{slug}/chat-history/threads/{id}` (cookie) | Double-prefix (`API_BASE_URL` already has tenant); also relies on `?customerId=` query which controller refuses (Round 5 hardening — reads cookie only). |
| `delete_all_chats` | `/{tenant}/chat-history?customerId=...` | `/{slug}/chat-history` (cookie) | Same double-prefix; same `?customerId=` rejection. |
| `lgpd_data_request` | `/customer/lgpd-requests` | `/{slug}/lgpd-requests` | Wrong path entirely (legacy `/customer/...` prefix never existed in the new controller). Patch comment on `delete_chat` says "Was hitting `DELETE /customer/chats/{thread_id}` which 404's", same fix was never carried over to LGPD. |

Compounding issue: `_api_client` sends no auth headers; the three routes all
require `SessionGuard` which reads `recognition_token` cookie or session
header. Even with the right path, dispatcher calls would 401. The AI service
needs either a privileged S2S bypass header or the controllers must accept
an `X-AI-Service-Key` + `customerId`-in-body path. The `lgpd-requests`
controller's `resolveCallerCustomerId(req)` doesn't even check `session`
fallback — it's pure cookie.

This means: in production today, if a customer asks the assistant "apagar
minha conversa" or "exclui meus dados LGPD", the tool dispatch ALWAYS
returns `error.api_error` and:
- no thread is deleted
- no `lgpd_requests` row is inserted
- no Mongo erasure happens
- the assistant's silent canonical message is suppressed (because the tool
  returned `error`, not `message`)

The UI delete buttons in `ScreenCustomerChatHistory.tsx` use a different
path (`apiGet`/`api` from `lib/api/chat-history.ts`) which hits the right
route with the recognition cookie, so the **UI-driven delete works**. Only
the **tool-driven (LLM-initiated) delete** is broken.

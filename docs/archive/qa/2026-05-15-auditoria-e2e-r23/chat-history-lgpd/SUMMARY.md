Subagent: chat-history-lgpd
Status: PARTIAL (4 PASS · 2 FAIL · 4 HIGH + 2 MEDIUM + 1 LOW)

Branch: fix/customer-tools-and-continuation
Customer: Caleb Teste customerId 21a81205-4adf-41e3-86b5-baa8d3e339fb

## Verdict per scenario

| # | Cenário | Status | Notes |
|---|---|---|---|
| a | /chat-history lista threads agrupados por dia, eyebrow `QUI 14 MAI` | ⚠️ PARTIAL | List groups por **MÊS** (`MAI · 2026`), NÃO por dia |
| b | Tap thread → hidrata mensagens | ✅ PASS | ScreenCustomerChatThread → GET /:slug/chat-history/threads/:id/messages |
| c | CTA "Continuar nessa conversa" → /assistente?threadId=X | ✅ PASS | ScreenCustomerChatThread.tsx:206 |
| d | FIFO 80 drop oldest | ✅ PASS | Simulated: 82 active → prune dropped 2 oldest, settled 80 |
| e | delete_chat AI tool soft-marks thread | ❌ **FAIL** | api_error: DELETE /restaurant_dev/chat-history/threads/... → 404 |
| f | LGPD: show_lgpd_notice + lgpd_data_request → row em lgpd_requests; erasure clears Mongo + Postgres | ❌ **FAIL** | api_error: POST /customer/lgpd-requests → 404 + erasure NÃO dual-side |

## Bugs novos / Achados (severity ordered)

### 🚨 HIGH #1 — lgpd_data_request tool 100% quebrado
- **Path errado**: posts pra `/customer/lgpd-requests`, real é `POST /:slug/lgpd-requests`
- Live `/tools/dispatch` retorna `error.api_error` com `POST /customer/lgpd-requests → 404`
- `lgpd_requests` row count permaneceu 0
- File: `services/ai-service/services/tools/lgpd_data_request.py:47`
- **Compliance LGPD QUEBRADO** — usuário não consegue solicitar erasure

### 🚨 HIGH #2 — Erasure NÃO é dual-side (LGPD compliance)
- `LgpdService.createRequest` só chama `chatHistory.deleteAllForCustomer` (Mongo)
- Postgres `restaurant_dev.assistant_messages.user_message` / `assistant_response` (full text) **SOBREVIVEM erasure INDEFINIDAMENTE**
- 19 rows current existem pra Caleb
- Files: `apps/api/src/modules/lgpd/lgpd.service.ts:59`
- Grep `DELETE FROM assistant_messages` em `apps/api/src` retorna **zero hits**
- **CONSEQUÊNCIA**: empresa exposta a violação LGPD se cliente pedir erasure

### 🚨 HIGH #3 — delete_chat + delete_all_chats AI tools 404
- Build `f"/{ctx.tenant_id}/chat-history/..."` mas `API_BASE_URL` é `http://api:3001/api/restaurant_dev`
- Resultado: `/api/restaurant_dev/restaurant_dev/chat-history/...` — **double prefix**
- Mesmo com fix, controller não aceita `?customerId=` (Round 5 hardening — lê só cookie)
- Files: `services/ai-service/services/tools/delete_chat.py:36`, `delete_all_chats.py:34`

### 🟡 MEDIUM #4 — _api_client sem auth
- Mesmo com paths corrigidos, every SessionGuard-protected route 401 quando chamado do AI service
- Precisa S2S pattern (ex.: X-AI-Service-Key honored by controllers + trusted customerId body field pra AI-service callers)
- `apps/api/src/modules/lgpd/lgpd.controller.ts:103` `resolveCallerCustomerId` sem session-fallback path

### 🟡 MEDIUM #5 — Chat-history list eyebrow drift V20 canon
- List groups por mês (`formatDateMonthLabel` → `MAI · 2026`)
- V20 canon + thread DETAIL page usam per-day grouping com `QUI 14 MAI`
- File: `apps/web-customer/src/screens/feedback-and-history/ScreenCustomerChatHistory.tsx:22-39`

### 🟡 MEDIUM #6 — Bubble wrong no historical chat view
- `ScreenCustomerChatThread.tsx:13,291` usa `<ManagerBubble>` (complaint-flow mostarda stripe) pra `role === 'manager'`
- Live /assistente chat correctly usa `<StaffBubble>` (V20 canon ink stripe + `RENATA · GERENTE` eyebrow)
- 2 surfaces, 2 visual treatments para o mesmo manager-message concept
- ⚠️ Branch também é **dead code** — nenhum producer escreve `role: 'manager'` em Mongo `chat_messages` (grep em chat-history retorna 0 producers)

### 🔵 LOW #7 — FIFO 80 é soft cap
- Prune só roda quando `appendTurn` faz fresh insert
- Se customer's turns all hit existing day-buckets, prune nunca fires
- TTL (30d) é o único enforcement
- `apps/api/src/modules/chat-history/chat-history.service.ts:127`

## FIFO 80 simulation details
Seeded 80 synthetic threads back-dated 0..79 days pra Caleb → active count 82 → rodou exact `pruneOldestThreads` logic do service contra Mongo directly. Dropped 2 oldest synthetic threads; final active = 80. Prune cascade também wipes message docs `WHERE threadId IN (...)`.

Cleanup: removed 79 remaining AUDIT threads e restored Caleb's 2026-05-15 thread doc (prune deletou junto com synthetic). Final state matches pre-test: 2 threads, 31 messages.

Tempo: ~8.4min (104849 tokens, 71 tool uses · ~35/50 cap)

# Super-Prompt V4 · Round 20+ continuation

> Substitui V3. Captura estado pós Round 19 overnight + manhã (continuation
> API rewrite com 4 variants/kind, pos_reclamacao rich, scrollbar fix global,
> join-table flow E2E). Próximo chat continua a partir desta base.

---

## 0. TL;DR pra retomar

1. `cd /Users/calebmedeiros/meus_projetos/restauranteSaaS/.claude/worktrees/wonderful-rhodes-95809e`
2. **CRÍTICO**: Docker monta este worktree (`claude/wonderful-rhodes-95809e`). NÃO confundir com `objective-cerf-e49db1` (worktree paralelo com history compatível, mas `restaurant-ai` container monta `objective-cerf-e49db1` — espelhar arquivos AI via `cp` quando editar).
3. `git status -s | wc -l` → ~30 dirty (mistos: continuation rewrite em flight + debug PNGs)
4. Reler:
   - `qa-reports/round19-morning-report.md` (estado pós overnight)
   - `qa-reports/round19-continuation-api-test.md` (cada kind testado)
   - `qa-reports/round19-canvas-gaps-v1.md` (78 V20 screens auditadas)
5. Pegar próxima onda: **#1 prioritário = `customer_events` migration + tracking + replace viu_cardapio keyword heuristic**

---

## 1. Stack + infra (mesma do V3)

- **Backend NestJS 10** `apps/api` :3001 com prefix `/api`
- **Customer FE** Next.js 14 `apps/web-customer` :3003
- **Staff FE** Next.js 14 `apps/web-staff` :3002
- **AI** FastAPI + LM Studio `services/ai-service` :8000 (não exposto)
- **Postgres** multi-schema `restaurant_saas` (tenant: `restaurant_dev`) via `docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas`
- **Redis** sessions + rate-limit + AI pool seed
- **Mongo** chat history
- Docker compose project: `agent-a4ea5de55cbb3619e` (não recriar)
- **⚠️ Mount mismatch**: 3 dos 4 containers (api/web-staff/web-customer) montam `wonderful-rhodes-95809e`; `restaurant-ai` monta `objective-cerf-e49db1`. Edits em `services/ai-service/**` precisam ser mirrored via `cp` pra objective-cerf + `docker restart restaurant-ai`. TODO: alinhar via docker-compose mas requer cuidado.

## 2. Auth + test data (igual V3)

```js
// Staff
localStorage.setItem('staffId', '8bd06156-1fe5-4c18-a82d-43d38287ed4a');
localStorage.setItem('staffRole', 'manager'); // Erica Gerente
```

Outros staff: Renata Host, Ana/Bruno Garcom, Carlos/Diana Cozinha. Query `SELECT id, name, role FROM restaurant_dev.staff;` pra ids.

Mesas seedadas: M01-M08 + M13-M15 + M22. M07/M13 com active_session_id.

API key: `dev-staff-api-key-change-in-prod` (header `x-staff-key`).

## 3. Round 19 commits (já no git history)

```
cc607eb docs(round19): overnight morning report
d2f1d89 docs(round19): QA reports + screenshots
fd3f00b feat(round19): customer join-table flow E2E + V20 canon host accept screen
175f64c fix(round19): viu_cardapio kind detection via assistant_messages heuristic + pos_reclamacao template enrich
ad86502 fix(round19): continuation API · pagou template variant when customer_name=null
dbfe3d3 round19: resolve merge conflicts pós-reconciliation
b6a1cb3 round19: reconcile worktrees — merge round18+19 work from objective-cerf-e49db1 into wonderful-rhodes-95809e
```

**Em flight (dirty tree, NÃO comitado ainda)**:
- `services/ai-service/services/continuation.py` — rewrite com 4 variants/kind, sem "Paguinho", pos_reclamacao rich-by-default
- `services/ai-service/main.py` — ContinuationRequest aceita managerName + avgResponseMin + waitMinutes + tableLabel + lastItem + lastOrderSummary
- `apps/api/src/modules/continuation/continuation.service.ts` — populate manager_name + avg_response_min slots from DB (JOIN staff via assigned_manager_id, AVG response time), forwardToAi body shape estendido
- Scrollbar `data-hide-scrollbar` adicionado em 4 chip rows: ScreenWaiterCalls, ScreenManagerAlertsAll, ScreenHostWaitlist, ScreenStaffMessages (waiter)

**Antes de commitar**: testar pagou novamente (got: "Tudo certo com o pagamento...", "Pagamento processado..."), testar pos_reclamacao com complaint linked to manager para confirmar slots populated. Mirror AI files + restart restaurant-ai.

## 4. Onda 4 finish (P0 imediato)

User flagrou (screenshots): 3 telas dizem "MÉTRICAS MOCK · BACKEND DE PERFORMANCE VEM NA ONDA 4" e "DADOS MOCK · backend GET /staff/calls real chega na Onda 4". BE já existe (commit `889bd2c` Onda 4 batch 2), só falta wire FE + remover mocks:

### 4.1 Staff performance (BE ✅, FE pendente)
- `GET /:slug/staff/:id/performance?period=today|7d|30d` retorna `{staffId, period, kpis:{ordersServed, totalRevenue, avgResponseSec, sessionsHandled, callsAnswered}}`
- FE atual: `apps/web-staff/src/screens/manager/ScreenManagerStaffDetail.tsx` usa mock + disclaimer "BACKEND DE PERFORMANCE VEM NA ONDA 4"
- TODO: 
  - Adicionar `staffPerformanceApi(slug, id, period)` em `apps/web-staff/src/lib/api/manager.ts`
  - useEffect na tela pra fetch real
  - Remover linha de disclaimer

### 4.2 Waiter chamados (BE ✅ via `/waiter-calls`, FE pendente)
- `GET /:slug/waiter-calls?status=pending` ou similar — confirmar exact endpoint shape em `apps/api/src/modules/waiter-calls/`
- FE: `apps/web-staff/src/screens/waiter/ScreenWaiterCalls.tsx` usa mock + disclaimer "DADOS MOCK · backend GET /staff/calls real chega na Onda 4"
- TODO: wire FE pra endpoint real, remover disclaimer

### 4.3 Financeiro (BE NÃO existe ainda · build new)
- FE `/manager/financeiro` é placeholder "Painel financeiro chega em breve" com 4 KPI cards vazios (FATURAMENTO HOJE · TICKET MÉDIO · MESAS SERVIDAS · TEMPO DE MESA)
- Build BE:
  - Module `apps/api/src/modules/finance/` (controller + service)
  - `GET /:slug/finance/summary?period=today|7d|30d` retornando `{revenueCents, ticketAvgCents, tablesServed, avgTableMinutes, breakdownByPaymentMethod, comparisonVsPrevious}`
  - Aggregates from `orders`, `payments`, `table_sessions`
- FE wire + remover "Em desenvolvimento" estado

## 5. P0 — Customer events tracking (PRIORIDADE MÁXIMA do usuário)

**Contexto**: usuário no chat disse "essa parte do futuro que pode ser feito de uma maneira melhor de event tracking precisamos fazer para melhorar a contextualização da ia que vai mandar a mensagem".

Atualmente `viu_cardapio` é detectado por heuristic em `continuation.service.ts:228` usando `assistant_messages.user_message ILIKE '%cardap%' OR '%menu%' OR ...`. Funciona em 80% dos casos mas:
- Captura false positives (cliente menciona "cardapio" sem ter visto)
- Não detecta navegação real pra /cardapio (cliente vai ver, sai sem mandar msg)
- Não generalizável pra outros kinds (viu_drinks, viu_sobremesa, etc)

**Spec proposta**:

### 5.1 Migration 046_customer_events.sql
```sql
CREATE TABLE customer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,   -- 'menu_viewed', 'item_viewed', 'cart_added', 'orders_history_viewed', etc
  metadata JSONB NOT NULL DEFAULT '{}',  -- {category?, item_id?, ms_on_page?, etc}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_events_session_type_created
  ON customer_events(table_session_id, event_type, created_at DESC);
```

### 5.2 New API endpoint
`POST /:slug/customer/events` body `{event_type, metadata?}` (session-token auth · customer-only)

### 5.3 FE customer logging
- `apps/web-customer/src/app/[slug]/cardapio/page.tsx` (or wherever menu loads) — `useEffect` no mount → `POST /customer/events {event_type: 'menu_viewed', metadata: {entry_ms: Date.now()}}`
- Same pattern: `assistente/page.tsx` log 'assistant_opened'; `mesa/[tableCode]/page.tsx` log 'session_resumed' no recognize-path; item detail pages log 'item_viewed' with item_id

### 5.4 Update continuation.service.ts
Substituir keyword heuristic (Priority 4.5) por:
```sql
SELECT 1 FROM customer_events 
WHERE table_session_id = $1 
  AND event_type = 'menu_viewed' 
  AND created_at >= now() - INTERVAL '10 minutes' 
LIMIT 1
```

### 5.5 Future kinds desbloqueados
Com `customer_events` table, fácil adicionar:
- `viu_drinks` (event_type='menu_section_viewed' metadata.category='drinks')
- `viu_sobremesa` (similar)
- `comparou_pratos` (event_type='items_compared' metadata.item_ids=[...])
- `ficou_ocioso` (heuristic via timestamp delta + no events)
- Etc.

Cada kind precisa um pool template novo em `services/ai-service/services/continuation.py` DEFAULTS.

## 6. Round 20+ punchlist (do canvas comparator V3 + sessão atual)

### P0 imediato
1. **Customer events tracking** (§5 above) — prioridade do usuário
2. **Wire FE pra performance + chamados endpoints** (§4.1, 4.2)
3. **Build Financeiro module** (§4.3)
4. **Testar pos_reclamacao rich end-to-end** + commit current dirty tree

### P1 (canvas gaps confirmados)
1. **StaffBubble FE: fetch histórico** assistant_messages no reload (atual: só WS-listened, mensagem some no refresh)
2. **CourtesyArrival bubble customer** — backend `/courtesies` existe + manager cria; customer FE não tem bubble (border-left mostarda + ícone gift seal). Spec: `docs/design-canvas/handoff/cliente/cliente-journey-v20.jsx` §F12
3. **ContextualChips dinâmicos no home** `/[slug]/mesa/[tableCode]` — só 2 PillButtons fixos; canvas tem chips dinâmicos da continuation API (agora destrancado pelo viu_cardapio fix)
4. **MergeTypewriterBubble customer chat** — backend emite WS `table_merge.created` mas customer não vê typewriter bubble (border-left mostarda 25ms/char)
5. **Join-table AI typewriter integration** (user pediu mas não fizemos ainda):
   - Quando `participant:join_request` chega no WS do host customer, AI insere um TypewriterBubble: "Olha {customerName}, {joinerName} quer entrar na mesa de vocês — pode deixar?" (com 3-4 variants no pool)
   - Tool calls disponíveis pra LLM: `accept_join_request(joinId)` + `reject_join_request(joinId)` 
   - Cliente pode tipar "pode" / "aceito" → LLM chama tool → POST `/table/participants/decide`
   - Mesmo pattern pra table-merge

### P1 (Onda 4 batch 2 follow-ups)
1. **Waiter order screens V20** (`ScreenOrderQuick`/Search/Item) — `/garcom/pedidos` é V0 KDS-style legacy, bloqueia waiter doing on-floor orders. 6-8h.

### P2
1. **Post-merge confirmation screens** (PostMerge/PostReject/CooldownReattempt) — atualmente customer só vê TopBar mudar
2. **/conta route 404** — rota não existe; provavelmente vive dentro de /mesa flow ou nunca foi construída
3. **Waiter login + forgot-password** (3 telas missing)
4. **Infra: alinhar `restaurant-ai` mount** pra wonderful-rhodes-95809e via docker-compose edit (mirror manual atualmente)

### P2 infra/dx
1. **Real event tracking generalization** — customer_events table + dashboard de funnel pra manager (quantos clientes viram menu vs pediram)
2. **Pos_reclamacao slot population testing E2E** — confirmar template rica fire when complaint has assigned_manager_id (criar test fixture com complaint linked to Erica)

## 7. Decisões / judgment calls da sessão Round 19 (referência)

1. **Reconciliação merge**: opção D (merge branch) sobre B (docker-compose) ou A (rsync) — preserva git history unificado.
2. **C2 pos_reclamacao**: rich-by-default no template pool + DB slot population implementado nesta sessão (forwardToAi body estendido + JOIN staff via assigned_manager_id + AVG response time aggregate).
3. **C3 viu_cardapio**: heuristic via assistant_messages keyword (cardap/menu/prato/comida/sobremesa/bebida/vinho) — **substituir por customer_events table no Round 20** (priority).
4. **AI mount divergence**: mirror manual via cp em vez de docker-compose edit — TODO Round 20+.
5. **Continuation templates**: 4 variants por kind (vm1-4, cg1-4, ap1-4, pg1-4, vs1-4, pc1-4 + pc_fallback) — pesos 1.0/0.5/0.8 pra controlar distribuição. requires_slots filter pra graceful fallback.
6. **Removido "Paguinho"** (slang) — substituído por "Pagamento confirmado/processado/Recebido/Tudo certo".

## 8. Patterns canônicos (não inventar de novo)

### Continuation template variant
```py
{
    "id": "<kind><n>",
    "kind": "<kind>",
    "subtitle": "EYEBROW EM CAPS",
    "template": "Frase com {slot1} se necessário.",
    "slots": ["slot1"],
    "requires_slots": ["slot1"],  # filtra pool quando slot ausente
    "chips": [{"id": "x", "label": "X", "action": "send|navigate", "payload": "..."}],
    "weight": 1.0,  # 0.5-1.0 typical
}
```

### Slots BE → AI
- BE `slots` dict (snake_case): `tenant_slug, table_number, customer_name, last_item_seen, last_order_summary, wait_minutes, manager_name, avg_response_min`
- AI body (camelCase): `tenantId, customerName, favoriteItem, kind, managerName, avgResponseMin, waitMinutes, tableLabel, lastItem, lastOrderSummary`
- AI slots dict pra template (mix): `customerName, favoriteItem, tableLabel, last_item, managerName, avgResponseMin, waitMinutes, lastOrderSummary`

### Test pattern (smoke continuation API)
```bash
SID=$(docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -tA -c "WITH ins AS (INSERT INTO restaurant_dev.table_sessions (table_id, status, created_at) SELECT id, 'active', now() FROM restaurant_dev.tables WHERE code = 'M07' LIMIT 1 RETURNING id) SELECT id FROM ins;" | tail -1)
# insert trigger row (payment/complaint/etc)
# curl POST /continuation
docker exec restaurant-postgres psql ... DELETE FROM ... WHERE table_session_id='$SID'
```

### Hide horizontal scrollbar canon
```tsx
<div data-hide-scrollbar style={{ overflowX: 'auto', ... }}>
```
Estilo em `apps/web-staff/src/app/globals.css` matchea `[data-hide-scrollbar]`.

### V20 customer locked surfaces (NÃO MODIFICAR)
Per `CLAUDE.md` §🔒:
- `WelcomeModal.tsx`, `CpfInput.tsx`
- `ScreenCustomerIdentifyBeforeJoin.tsx`
- `ScreenCustomerWaitingApproval.tsx`
- `CallWaiterSheet.tsx`
- Reclaim banner em `app/[slug]/mesa/[tableCode]/page.tsx`
- `/assistente` landing branch `!chatStarted` (V20 home-like)

### Test before commit
- Funcional: curl/Playwright/iOS Sim exercise the actual path
- Visual: screenshot 393×852 antes do commit
- Trust-but-verify subagentes (Agent F errou 2x no round 18; verify findings via curl/grep antes de aceitar)

## 9. Tools disponíveis (mantidos)

- **browser-harness CLI** (`~/.local/bin/browser-harness`) — preferred pra superscan (4× menos tokens que Playwright MCP). Chrome :9223 isolado dedicated com `BU_NAME=audit BU_CDP_WS=ws://localhost:9223`.
- **Playwright MCP** — pra fix-validation no Chrome principal :9222 (já tem auth localStorage do shell parent).
- **xcodebuildmcp** — iPhone iOS Sim pra real-device validation (safe-area, blur, gestures). iPhone 16 Pro iOS 18.1 booted: `60ED4E4A-976B-4C6E-BE65-779B45EDA867`. Open Safari via `xcrun simctl openurl <udid> "http://localhost:3002/..."`.

## 10. Memory entries persistentes

`~/.claude/projects/-Users-calebmedeiros-meus-projetos/memory/`:
- `feedback_visual_validation.md` — sempre preview + screenshots
- `feedback_buttons_must_work.md` — real or stub toast, nunca placebo
- `feedback_systematic_button_audit.md` — superscan toda onda
- `feedback_test_before_commit.md` — funcional + visual antes commit
- `feedback_superscan_via_browser_harness.md` — browser-harness > Playwright pra audits; tentar iOS Sim antes
- `feedback_verify_docker_mount.md` — `docker inspect` antes de assumir commit = running state
- `reference_browser_harness.md` — skill install + usage

## 11. Comandos úteis

```bash
# Reset test data
docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -c "
  DELETE FROM restaurant_dev.staff_shift_assignments;
  DELETE FROM restaurant_dev.courtesies;
  DELETE FROM restaurant_dev.staff_messages WHERE body LIKE 'AUDIT-%' OR body LIKE 'FIX TEST%';
  DELETE FROM restaurant_dev.alerts WHERE kind LIKE 'test%';
"

# Restart specific containers
docker stop restaurant-api restaurant-web-staff && docker rm restaurant-api restaurant-web-staff
docker-compose -p agent-a4ea5de55cbb3619e up -d --no-deps api web-staff

# Mirror AI service file (worktree divergence workaround)
cp services/ai-service/services/continuation.py /Users/calebmedeiros/meus_projetos/restauranteSaaS/.claude/worktrees/objective-cerf-e49db1/services/ai-service/services/continuation.py
docker restart restaurant-ai

# Smoke continuation kind=X
SID=$(docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -tA -c "WITH ins AS (INSERT INTO restaurant_dev.table_sessions (table_id, status, created_at) SELECT id, 'active', now() FROM restaurant_dev.tables WHERE code = 'M07' LIMIT 1 RETURNING id) SELECT id FROM ins;" | tail -1)
# ... insert kind-triggering row
curl -sS --max-time 30 -X POST "http://localhost:3001/api/restaurant_dev/continuation" \
  -H "Content-Type: application/json" \
  -H "x-staff-key: dev-staff-api-key-change-in-prod" \
  -H "x-staff-id: 8bd06156-1fe5-4c18-a82d-43d38287ed4a" \
  -H "x-staff-role: manager" \
  -d "{\"tableSessionId\":\"$SID\"}"
```

## 12. Próximas ações sugeridas (ordem)

1. **Commit dirty tree atual** após smoke test pagou/pos_reclamacao final (1 commit batch: "round19 final · continuation templates rewrite + scrollbar fixes")
2. **Customer events migration + tracking** (§5) — desbloqueia AI contextual precision
3. **Onda 4 finish** (§4) — wire performance + chamados + build financeiro
4. **Join-table AI typewriter** (§6 P1 #5) — user explicitamente pediu
5. **StaffBubble fetch histórico** (P1 #1)
6. **Continue P1/P2** conforme prioridade

---

**Boa retomada. Confia no código + git log se algo não bater com este doc — ele é snapshot, código é fonte de verdade.**

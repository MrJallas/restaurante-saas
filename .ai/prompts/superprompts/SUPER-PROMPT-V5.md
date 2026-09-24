# Super-Prompt V5 · Round 20+ retake

> Substitui V4. Adiciona descobertas pós-iPhone-test (WS URL bug + fix
> via PUBLIC_HOST env), continuation templates rewrite com 4 variants/kind,
> scrollbar globais, CallWaiterSheet drag bug, e o restante do punchlist.

---

## 0. Cole isso no próximo chat pra retomar

```
Continuando trabalho no restauranteSaaS. Estado completo em:
<repo>/.claude/worktrees/wonderful-rhodes-95809e/qa-reports/SUPER-PROMPT-V5.md

Leia o SUPER-PROMPT-V5 primeiro, depois pega a próxima tarefa do §6
punchlist. Prioridades por ordem:
1. Customer events tracking (§4) — substituir keyword heuristic do viu_cardapio
2. Onda 4 finish: wire FE pra performance + chamados (BE existe) + build Financeiro
3. CallWaiterSheet drag-to-dismiss em iOS real (V20 locked, mas user reportou bug)
4. Join-table AI typewriter integration
5. StaffBubble fetch histórico ao reload

Constraints: V20 locked files untouched, test before commit, browser-harness
pra superscan, trust-but-verify subagentes.

Worktree mount: Docker monta `wonderful-rhodes-95809e` pra api/web-staff/
web-customer; `objective-cerf-e49db1` pra restaurant-ai. Mirror manual de
`services/ai-service/**` via cp quando editar.

Aplicativo está rodando — Mac IP <IP-da-LAN> (hotspot), iPhone reachable.
PUBLIC_HOST=<IP-da-LAN> já setado em .env. Pra iOS real test:
qrencode + HMAC pattern (vide §7 deste doc).
```

---

## 1. Stack + infra

- **Backend NestJS 10** `apps/api` :3001 com prefix `/api`
- **Customer FE** Next.js 14 `apps/web-customer` :3003
- **Staff FE** Next.js 14 `apps/web-staff` :3002
- **AI** FastAPI + LM Studio `services/ai-service` :8000 (não exposto · LM Studio em `host.docker.internal:1234` model `qwen2.5-7b-instruct-mlx`)
- **Postgres** `restaurant_saas` schema `restaurant_dev` · port 5434
- **Redis** :6380 · **Mongo** :27017
- Docker compose project: `agent-a4ea5de55cbb3619e`

### ⚠️ Mount divergence
- `restaurant-api`, `restaurant-web-staff`, `restaurant-web-customer` montam `wonderful-rhodes-95809e` (canonical)
- `restaurant-ai` monta `objective-cerf-e49db1` — edits em `services/ai-service/**` precisam ser mirrored:
  ```bash
  cp wonderful-rhodes-95809e/services/ai-service/services/continuation.py \
     objective-cerf-e49db1/services/ai-service/services/continuation.py
  docker restart restaurant-ai
  ```
- **TODO**: alinhar via docker-compose edit (P2)

### Env vars (recent · `.env` em wonderful-rhodes)
- `PUBLIC_HOST=<IP-da-LAN>` (Mac LAN IP via hotspot — necessário pra iPhone test)
- Aplica em `NEXT_PUBLIC_WS_URL=http://<IP-da-LAN>:3001` (web-customer + web-staff)

## 2. Auth + test data

```js
// Staff
localStorage.setItem('staffId', '8bd06156-1fe5-4c18-a82d-43d38287ed4a');
localStorage.setItem('staffRole', 'manager');  // Erica Gerente
```

DB user query:
```bash
docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas \
  -tA -c "SELECT id, name, role FROM restaurant_dev.staff;"
```

Mesas seedadas: M01-M08 + M13-M15 + M22. M07/M13 com active_session_id.

API key staff: `<chave-de-dev-antiga-bloqueada-em-producao>` (header `x-staff-key`).

## 3. Commits Round 19 (já no git history)

```
cc607eb docs(round19): overnight morning report
d2f1d89 docs(round19): QA reports + screenshots
fd3f00b feat(round19): customer join-table flow E2E + V20 canon host accept screen
175f64c fix(round19): viu_cardapio kind detection via assistant_messages heuristic + pos_reclamacao template enrich
ad86502 fix(round19): continuation API · pagou template variant when customer_name=null
dbfe3d3 round19: resolve merge conflicts pós-reconciliation
b6a1cb3 round19: reconcile worktrees — merge round18+19 work from objective-cerf-e49db1 into wonderful-rhodes-95809e
```

**Dirty tree (não-comitado ainda)**:
- `services/ai-service/services/continuation.py` — rewrite com 4 variants/kind, sem "Paguinho", pos_reclamacao rich-by-default, requires_slots filter
- `services/ai-service/main.py` — ContinuationRequest aceita managerName + avgResponseMin + waitMinutes + tableLabel + lastItem + lastOrderSummary
- `apps/api/src/modules/continuation/continuation.service.ts` — populate manager_name + avg_response_min slots from DB (JOIN staff via assigned_manager_id, AVG response time), forwardToAi body shape estendido
- 4 scrollbar fixes via `data-hide-scrollbar`: ScreenWaiterCalls · ScreenManagerAlertsAll · ScreenHostWaitlist · ScreenStaffMessages (waiter)
- `.env` novo com `PUBLIC_HOST=<IP-da-LAN>`

**Antes de commitar** (round 20 onda 1):
- Test pagou + pos_reclamacao variations (já testado: "Pagamento confirmado/Tudo certo/Pagamento processado")
- Test viu_cardapio (já funcionou no round 19)
- Sanity check no iOS Simulator (CallWaiterSheet drag — debug)
- Commit em 2-3 batches temáticos

## 4. P0 PRIORIDADE MÁXIMA: Customer events tracking

**Contexto** (do usuário): substituir o keyword heuristic atual (`assistant_messages.user_message ILIKE '%cardap%'`) por event tracking real. Generaliza pra futuros kinds.

### Migration 046_customer_events.sql
```sql
CREATE TABLE customer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_events_session_type_created
  ON customer_events(table_session_id, event_type, created_at DESC);
```

### POST `/customer/events` endpoint
- Body: `{event_type, metadata?}` (session-token auth)
- Service insere row

### FE customer logging
- `/cardapio/page.tsx` mount → POST `event_type='menu_viewed', metadata: {entry_ms: Date.now()}`
- `/assistente/page.tsx` open → `'assistant_opened'`
- `/mesa/[tableCode]/page.tsx` recognize-path → `'session_resumed'`
- Item detail pages → `'item_viewed' metadata.item_id`

### Update continuation.service.ts
Substituir Priority 4.5 keyword heuristic por:
```sql
SELECT 1 FROM customer_events
WHERE table_session_id = $1 
  AND event_type = 'menu_viewed'
  AND created_at >= now() - INTERVAL '10 minutes'
LIMIT 1
```

### Desbloqueia kinds futuros
- `viu_drinks` (event_type='menu_section_viewed' metadata.category='drinks')
- `viu_sobremesa` (similar)
- `comparou_pratos` (event_type='items_compared' metadata.item_ids=[...])
- `ficou_ocioso` (timestamp delta + no events)

Cada novo kind → adicionar pool template em `services/ai-service/services/continuation.py` DEFAULTS.

## 5. Onda 4 finish (P0)

User flagrou screenshots de telas com mock + "BACKEND CHEGA NA ONDA 4". BE já existe (commit 889bd2c), só falta wire FE:

### 5.1 Staff performance (BE ✅, FE pendente)
- `GET /:slug/staff/:id/performance?period=today|7d|30d` retorna `{kpis:{ordersServed, totalRevenue, avgResponseSec, sessionsHandled, callsAnswered}}`
- FE: `apps/web-staff/src/screens/manager/ScreenManagerStaffDetail.tsx` usa mock + disclaimer "BACKEND DE PERFORMANCE VEM NA ONDA 4"
- TODO: adicionar `staffPerformanceApi(slug, id, period)` em `apps/web-staff/src/lib/api/manager.ts`, useEffect fetch real, remover disclaimer

### 5.2 Waiter chamados (BE ✅, FE pendente)
- `GET /:slug/waiter-calls?status=pending` — confirmar shape em `apps/api/src/modules/waiter-calls/`
- FE: `apps/web-staff/src/screens/waiter/ScreenWaiterCalls.tsx` usa mock + disclaimer "DADOS MOCK · backend GET /staff/calls real chega na Onda 4"
- TODO: wire + remover disclaimer

### 5.3 Financeiro (BE NÃO existe · build novo)
- FE `/manager/financeiro` é placeholder "Painel financeiro chega em breve" + 4 KPI cards vazios
- Build: `apps/api/src/modules/finance/` (controller + service)
- `GET /:slug/finance/summary?period=today|7d|30d` retornando `{revenueCents, ticketAvgCents, tablesServed, avgTableMinutes, breakdownByPaymentMethod, comparisonVsPrevious}`
- Aggregates from `orders`, `payments`, `table_sessions`
- FE wire + remover "Em desenvolvimento"

## 6. Round 20+ punchlist

### P0 imediato
1. **Customer events tracking** (§4) — usuário disse "precisamos fazer pra melhorar a contextualização"
2. **Onda 4 finish** (§5) — wire FE performance + chamados + build Financeiro
3. **CallWaiterSheet drag-to-dismiss em iOS** — user reportou bug, V20 locked mas precisa fix
4. **Testar pos_reclamacao rich E2E** + commit current dirty tree

### P1
1. **Join-table AI typewriter** — quando `participant:join_request` chega no WS do host customer, AI insere TypewriterBubble: "Olha {customerName}, {joinerName} quer entrar — pode deixar?" (3-4 variants). Tool calls disponíveis: `accept_join_request(joinId)` + `reject_join_request(joinId)`. Cliente tipa "pode" → LLM chama tool → POST `/table/participants/decide`. Mesmo pattern pra table-merge.
2. **StaffBubble fetch histórico** — assistant_messages no reload (atual: só WS-listened, mensagem some no refresh)
3. **CourtesyArrival bubble customer** — backend `/courtesies` existe; FE não tem bubble (border-left mostarda + ícone gift seal). Spec §F12 canvas
4. **ContextualChips dinâmicos no home** `/[slug]/mesa/[tableCode]` — só 2 PillButtons fixos; canvas tem chips dinâmicos da continuation API (destrancado pelo viu_cardapio fix)
5. **MergeTypewriterBubble customer chat** — backend emite WS `table_merge.created` mas customer não vê typewriter bubble

### P1 follow-ups
1. **Waiter order screens V20** (`ScreenOrderQuick`/Search/Item) — `/garcom/pedidos` é V0 KDS-style legacy, 6-8h
2. **Pos_reclamacao slot population testing E2E** — criar test fixture com complaint linked to assigned_manager

### P2
1. **Post-merge confirmation screens** (PostMerge/PostReject/CooldownReattempt)
2. **/conta route 404**
3. **Waiter login + forgot-password** (3 telas missing)
4. **Infra: alinhar `restaurant-ai` mount** via docker-compose

## 7. Comandos úteis

### Gerar QR pra iPhone test
```bash
SECRET=$(docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -tA \
  -c "SELECT qr_hmac_secret FROM restaurant_dev.tables WHERE code='M01';" | tail -1)
TS=$(node -e "console.log(Date.now())")
HMAC=$(node -e "const c=require('crypto'); console.log(c.createHmac('sha256','$SECRET').update('M01:'+'$TS').digest('hex'));")
URL="http://<IP-da-LAN>:3003/restaurant_dev/mesa/M01?hmac=$HMAC&ts=$TS"
qrencode -o /tmp/qr.png -s 12 -l M "$URL"
echo "$URL (expira 30min)"
```

### Smoke continuation kind
```bash
SID=$(docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -tA \
  -c "WITH ins AS (INSERT INTO restaurant_dev.table_sessions (table_id, status, created_at) \
      SELECT id, 'active', now() FROM restaurant_dev.tables WHERE code = 'M07' LIMIT 1 \
      RETURNING id) SELECT id FROM ins;" | tail -1)
# ... insert trigger row (payment/complaint/etc)
curl -sS --max-time 30 -X POST "http://localhost:3001/api/restaurant_dev/continuation" \
  -H "Content-Type: application/json" \
  -H "x-staff-key: <chave-de-dev-antiga-bloqueada-em-producao>" \
  -H "x-staff-id: 8bd06156-1fe5-4c18-a82d-43d38287ed4a" \
  -H "x-staff-role: manager" \
  -d "{\"tableSessionId\":\"$SID\"}"
# cleanup
docker exec restaurant-postgres psql ... DELETE FROM ... WHERE table_session_id='$SID'
```

### Mirror AI service file (mount divergence workaround)
```bash
cp services/ai-service/services/continuation.py \
   <repo>/.claude/worktrees/objective-cerf-e49db1/services/ai-service/services/continuation.py
docker restart restaurant-ai
```

### iOS Simulator
```bash
xcrun simctl openurl 60ED4E4A-976B-4C6E-BE65-779B45EDA867 "http://localhost:3002/manager/equipe"
# UDID iPhone 16 Pro iOS 18.1 booted
```

### Reset test data
```bash
docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -c "
  DELETE FROM restaurant_dev.alerts WHERE kind LIKE 'test%';
  DELETE FROM restaurant_dev.staff_messages WHERE body LIKE 'AUDIT-%';
"
```

### Restart specific containers
```bash
docker stop restaurant-api restaurant-web-staff && docker rm restaurant-api restaurant-web-staff
docker-compose -p agent-a4ea5de55cbb3619e up -d --no-deps api web-staff
```

## 8. Patterns canônicos

### Continuation template variant
```py
{
    "id": "<kind><n>",
    "kind": "<kind>",
    "subtitle": "EYEBROW EM CAPS",
    "template": "Frase com {slot1}.",
    "slots": ["slot1"],
    "requires_slots": ["slot1"],  # filtra pool quando slot ausente
    "chips": [{"id": "x", "label": "X", "action": "send|navigate", "payload": "..."}],
    "weight": 1.0,
}
```

### Slots BE → AI
- BE `slots` (snake_case): `tenant_slug, table_number, customer_name, last_item_seen, last_order_summary, wait_minutes, manager_name, avg_response_min`
- AI body (camelCase): `tenantId, customerName, favoriteItem, kind, managerName, avgResponseMin, waitMinutes, tableLabel, lastItem, lastOrderSummary`
- AI slots dict pra template: `customerName, favoriteItem, tableLabel, last_item, managerName, avgResponseMin, waitMinutes, lastOrderSummary`

### Hide horizontal scrollbar
```tsx
<div data-hide-scrollbar style={{ overflowX: 'auto', ... }}>
```
Util em `apps/web-staff/src/app/globals.css` matchea `[data-hide-scrollbar]`.

### V20 customer locked (NÃO MODIFICAR)
- `WelcomeModal.tsx`, `CpfInput.tsx`
- `ScreenCustomerIdentifyBeforeJoin.tsx`
- `ScreenCustomerWaitingApproval.tsx`
- `CallWaiterSheet.tsx` ← user reportou bug drag, precisa fix dentro do canon
- Reclaim banner em `mesa/[tableCode]/page.tsx`
- `/assistente` landing branch `!chatStarted`

### Test before commit
- Funcional: curl/Playwright/iOS Sim exercise the actual path
- Visual: screenshot 393×852 + iOS real device se safe-area/blur/gestures
- Trust-but-verify subagentes (Agent F errou 2x; verify findings via curl/grep)

## 9. Memory entries persistentes

`~/.claude/projects/-Users-calebmedeiros-meus-projetos/memory/`:
- `feedback_visual_validation.md`
- `feedback_buttons_must_work.md`
- `feedback_systematic_button_audit.md`
- `feedback_test_before_commit.md`
- `feedback_superscan_via_browser_harness.md`
- `feedback_verify_docker_mount.md`
- `reference_browser_harness.md`

## 10. Tools disponíveis

- **browser-harness CLI** (`~/.local/bin/browser-harness`) — preferred pra superscan. Chrome :9223 isolado com `BU_NAME=audit BU_CDP_WS=ws://localhost:9223`.
- **Playwright MCP** — fix-validation no Chrome principal :9222.
- **xcodebuildmcp** — iPhone iOS Sim. iPhone 16 Pro iOS 18.1 booted: `60ED4E4A-976B-4C6E-BE65-779B45EDA867`. Safari via `xcrun simctl openurl <udid> URL`.

## 11. Decisões / judgment calls da Round 19+ mid-Round-20

1. **Reconciliação merge** opção D (branch merge) — preserva git history.
2. **C2 pos_reclamacao rich-by-default**: implementado nesta sessão (forwardToAi body estendido + DB JOIN + AVG response time).
3. **C3 viu_cardapio keyword heuristic**: substituir por customer_events table (priority #1 Round 20).
4. **AI mount divergence**: mirror manual; alinhar docker-compose é P2.
5. **Continuation templates 4 variants/kind**: vm1-4, cg1-4, ap1-4, pg1-4, vs1-4, pc1-4 + pc_fallback. Pesos 0.5-1.0. requires_slots filter.
6. **Removed "Paguinho"** — substituído por "Pagamento confirmado/processado/Recebido/Tudo certo".
7. **PUBLIC_HOST=<IP-da-LAN>** — iPhone hotspot reachability. Set in `.env`.
8. **CallWaiterSheet drag**: V20 locked mas bug iOS real — fix DENTRO do canon (preserve visuals, fix gesture detection only).

---

**Pronto pra retomar. Confia no código + git log se algo não bater.**

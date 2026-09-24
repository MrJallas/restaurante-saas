# Prompt 1 · Correção paralela dos bugs P0/P1

> **Como usar:** abre um chat novo de Claude Code dentro do repo
> `<repo>`. Cola o prompt abaixo
> em mensagem única. O orquestrador vai disparar 6 subagentes em paralelo
> via Agent tool (run_in_background=true) e abrir 6 PRs no fim.

---

## Prompt

Você é o orquestrador de uma rodada de correção. O E2E anterior terminou com NO-GO; o relatório consolidado está em `.claude/worktrees/pensive-ritchie-251016/qa-reports/E2E-CONSOLIDATED-VEREDITO.md` (cópia oficial). Tem 13 bugs P0 e 21 P1. As 5 telas faltando já foram resolvidas no merge anterior (commit `518704c` na branch `claude/musing-fermi-b9b919` — ver `apps/web-staff/src/screens/manager/ScreenManagerProfile.tsx`, `apps/web-staff/src/screens/waiter/ScreenWaiterProfile.tsx`, `apps/web-staff/src/app/cozinha/eu/`, `apps/web-customer/src/screens/feedback-and-history/ScreenCustomerMe.tsx`, `apps/web-staff/src/app/manager/{configuracoes,financeiro}/`).

**Sua tarefa:** disparar 6 subagentes em **paralelo** (single message com 6 Agent tool calls, todos com `run_in_background=true`). Cada subagent recebe um prompt self-contained, cria branch própria `fix/<scope>`, implementa, roda validação local e abre PR. Depois você merge-os sequencialmente na ordem 1→2→3→4→5→6 (essa é a ordem de risco — 1 destrava os outros).

**Convenções obrigatórias** (passar pra cada subagent):

- Branch: `fix/<scope>` a partir de `main` atualizado.
- Commit/PR: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Validação local antes do PR: `npm run lint`, `npx tsc --noEmit -p <tsconfig do app afetado>`, `cd <app> && npx next build` quando aplicável; pra ai-service, `python -m pytest`.
- Não amend, não force-push. Não pular hooks.
- Spec é contrato: ler `docs/features/*.md` antes de tocar código.
- Reportar de volta em <300 palavras: o que mudou, arquivos tocados, link do PR, o que verificou.

---

### Subagent 1 — Stack falando entre si (4-6h, alta prioridade)

> Branch: `fix/integration-quick-wins`
> Tipo: backend + frontend wrapper

Implementa estes 5 fixes pequenos no mesmo PR:

1. **CORS missing :3002** (P0 #1) — adiciona `http://localhost:3002` em `CORS_ORIGINS` (env do `apps/api`). Conferir `apps/api/.env.example` e atualizar também. Validar com:

   ```
   curl -i -X OPTIONS http://localhost:3001/api/restaurant_dev/zone-pauses \
     -H "Origin: http://localhost:3002" -H "Access-Control-Request-Method: GET"
   ```

   Esperado: `204` com `Access-Control-Allow-Origin: http://localhost:3002`.

2. **MONGO_URL vs MONGODB_URI** (P0 #3) — em `apps/api/src/modules/chat-history/mongo.service.ts` (ou onde a conexão Mongo é criada), aceitar **fallback**: `process.env.MONGODB_URI ?? process.env.MONGO_URL`. Não remover MONGO_URL pra não quebrar dev existente. Atualizar `.env.example`.

3. **x-staff-role header missing** (P0 #8) — em `apps/web-staff/src/lib/api/index.ts` (ou o fetch wrapper canônico — provavelmente `staffFetch`/`staffGet`/`staffPatch`), incluir header `x-staff-role` ao lado de `x-staff-id` e `x-staff-api-key`. Ler role de `localStorage.getItem('staffRole')` ou query param `role`.

4. **SessionGuard cozinha** (P0 #12) — em `apps/api/src/common/guards/session.guard.ts` (ou equivalente), permitir requests com `x-staff-key` válido em rotas KDS (`GET /orders`, `PATCH /orders/:id/status`). Manter cookie `session` como fallback. Adicionar testes unitários se já houver pasta `__tests__/`.

5. **CORS smoke test** — adicionar 1 teste e2e em `e2e/smoke-cors.spec.ts` que faz fetch do `:3002` pra `:3001` e valida headers. Rápido, deixa documentado.

PR title: `fix(integration): CORS + Mongo env + staff-role header + KDS guard (P0 #1, #3, #8, #12)`

---

### Subagent 2 — WebSocket Socket.IO migration

> Branch: `fix/ws-socket-io`
> Tipo: frontend reescrita

**P0 #2** — `useManagerEvents`, `useWaiterEvents`, `useHostEvents` (em `apps/web-staff/src/hooks/`) hoje usam raw `WebSocket` em `ws://...:3001/ws` (404). API serve Socket.IO em `/socket.io/`. Reescreva os 3 hooks usando `socket.io-client`.

Requisitos:

- Reusar `EventsGateway` server-side (`apps/api/src/events/events.gateway.ts`) — não mudar contrato de eventos.
- Auth: passar `staffId`/`tenantSlug` no `auth` do socket connect.
- Reconnect com backoff (defaults do socket.io-client basta).
- Manter assinatura pública dos hooks idêntica (callers em ScreenManagerHomeA, ScreenHomeGrid, host screens não devem mudar).
- Testar emissão real: subir stack local, rodar 1 manager e 1 waiter, disparar `complaint.created` via curl, ver chegando em <2s no manager.
- Adicionar reconnect indicator opcional via `isConnected` retorno.

Adicionalmente fix do **P1 #19** — adicionar listener `staff_message.read` no FE (provavelmente em `useStaffMessages` ou similar) — atualiza UI quando outro device leu.

PR title: `fix(web-staff): migrate WS hooks from raw to socket.io-client + add staff_message.read listener (P0 #2, P1 #19)`

---

### Subagent 3 — TypeORM qr.query() destructuring

> Branch: `fix/typeorm-query-destructure`
> Tipo: backend bug fix

**P0 #4** — `qr.query()` em UPDATE/DELETE do `pg` retorna `[rows, affectedCount]`, não `rows[]` direto. 7 endpoints fazem destructuring errado.

Endpoints afetados (encontre cada um e corrige):

- `complaints/:id/respond` — `apps/api/src/modules/complaints/complaints.service.ts`
- `zone-pauses/:id/end` — `apps/api/src/modules/zone-pause/`
- `late-arrival-requests/:id/approve` — `apps/api/src/modules/late-arrival/`
- `table-merge-requests/:id/approve` — `apps/api/src/modules/table-merge/`
- `table-merge-requests/:id/reject` — idem
- 2 outros — fazer `grep -rn "qr.query" apps/api/src/modules/` e auditar todos os UPDATE/DELETE.

Padrão correto:

```ts
const result = await qr.query(`UPDATE ... RETURNING *`);
const rows = result[0]; // não `const [rows] = result` — confere com runtime
```

Verificar com pytest/jest existentes ou criar caso. Mínimo: subir stack, fazer POST/PATCH manual em cada endpoint, conferir DB com psql.

PR title: `fix(api): TypeORM qr.query() destructuring in 7 mutation endpoints (P0 #4)`

---

### Subagent 4 — AI service tools

> Branch: `fix/ai-tools-invocation`
> Tipo: ai-service Python

Resolver 3 P0 + 1 P1:

1. **P0 #5 IA não invoca tools** — em `services/ai-service/`, investigar:
   - `services/llm_client.py` ou similar — está passando o tool registry no `tools=[...]` do call OpenAI-compat? Confere com curl direto pro LM Studio (`http://127.0.0.1:1234/v1/chat/completions` com `tools` array).
   - `services/dispatcher.py` ou orquestrador — está parseando `tool_calls` da resposta?
   - `services/tools/__init__.py` — schemas estão bem formados? (LM Studio é estrito sobre `parameters.required`).
   - Modelo: `qwen2.5-7b-instruct-mlx` suporta function calling, mas exige system prompt que indique "use tools when relevant". Confere `prompts/system.py` ou similar.
   - Critério: depois do fix, mandar `"quero adicionar 1 risoto"` deve resultar em `tool_calls=[{name:"add_to_order"}]` populado em `assistant_messages.tool_calls` no Postgres.

2. **P0 #6 Tool paths errados** — em `services/ai-service/services/tools/__init__.py`, 4 tools apontam pra rotas 404:
   - `request_table_merge` → deveria ser `POST /api/{slug}/table-merge-requests` (confere o módulo no API)
   - `delete_chat` → `DELETE /api/{slug}/chats/{threadId}` ou similar (ler `apps/api/src/modules/chat-history/`)
   - `delete_all_chats` → idem, all variant
   - `view_courtesy` → checar com `apps/api/src/modules/courtesy/` se existe; senão é silent UI navigation, marcar como tal

3. **P0 #7 ctx.api_client não wired** — em `services/ai-service/main.py`, garantir que tool context tem cliente HTTP injetado. Buscar `send_message_to_manager` em `services/tools/`, ver onde tenta usar `ctx.api_client` — wirar no entrypoint do `/chat`.

4. **P1 #27 Classifier blocking legítimos** — em `services/ai-service/services/classify_ack.py`, intents como `"tira a cebola"`, `"quero pedir a conta"` retornam `block_reason='classifier'` com latency=0. Afrouxa as regras: lista de allow-list explícita pra modificar pedido + pedir conta. Casos de teste em `tests/test_classifier.py`.

PR title: `fix(ai-service): tool invocation + 4 tool paths + api_client wire + classifier rules (P0 #5, #6, #7, P1 #27)`

---

### Subagent 5 — Customer guards + frontend P1s

> Branch: `fix/customer-guards-and-p1s`
> Tipo: web-customer

Resolver 1 P0 + 3 P1:

1. **P0 #13 Customer guard ausente** — telas que dependem de `customerId` mostram mensagem passiva "Faça login na próxima visita" em vez de redirecionar. Adicionar guard que `router.replace(\`/${slug}/identify\`)`quando`!session.customerId` em:
   - `ScreenCustomerChatHistory` (`apps/web-customer/src/screens/feedback-and-history/ScreenCustomerChatHistory.tsx:183`)
   - `/{slug}/complaints` (lista) — `apps/web-customer/src/app/[slug]/complaints/page.tsx`
   - `/{slug}/orders/[orderId]/rating`
   - `/{slug}/pedido` se depender de customerId

   Padrão: criar hook `useRequireCustomerId(slug)` em `apps/web-customer/src/hooks/` e usar em cada tela.

2. **P1 #20 Tab bar invisível iOS Safari** — investigar em qual tela acontece. Provável: `position: fixed; bottom: 0` com `safe-area-inset-bottom` faltando. Adicionar `padding-bottom: env(safe-area-inset-bottom)` ou converter pra `position: sticky`.

3. **P1 #21 Banner zone-pause não renderiza** — em `apps/web-customer/src/components/...` ou na home customer, banner zone-pause ativa no DB mas não aparece. Adicionar polling/WS de zone_pause na customer side OU verificar se a query `zone-pauses` é feita.

4. **P1 #15 DeliveryConfirm sem chamada API** — em `apps/web-staff/src/screens/waiter/ScreenWaiterDeliveryConfirm.tsx` (opa, é staff — mas é flow customer-facing), botão de confirmar entrega não chama API. Adicionar `PATCH /orders/:id/status` com `delivered`.

PR title: `fix(customer): customer guard for customerId-dependent routes + 3 P1s (P0 #13, P1 #15, #20, #21)`

---

### Subagent 6 — Manager + Host frontend P1s

> Branch: `fix/staff-frontend-p1s`
> Tipo: web-staff frontend

Resolver vários P1:

1. **P1 #14** — `/staff` retorna `{staff: [...]}` mas FE espera array direto. Decidir: adapter no FE OR mudar API. Preferência: FE adapter (não quebrar contrato existente).

2. **P1 #16** — `/staff/my-tables` retorna 500. Buscar implementação em `apps/api/src/modules/staff/`, debug com staff_id real.

3. **P1 #17** — `/qr-issues` 404. Verificar se a rota existe; se não, criar stub controller que retorna `[]`.

4. **P1 #18** — `staffMessages.listThreads` sem `staffId` query. Em `apps/web-staff/src/lib/api/staff-messages.ts` ou similar, passar `staffId` como query param. Server-side já espera (confere controller).

5. **P1 #22 Frontend host status filter** — em screens host, request usa `?status=staff_pending` mas API só aceita `pending`. Trocar.

6. **P1 #23** — `GET /late-arrival-requests/:id` singular não existe. Criar no backend (`apps/api/src/modules/late-arrival/`) — útil pro deep-link `/manager/stat/late-arrival/:id`.

7. **P1 #24** — Páginas `[id]`/`[tableId]` no host sem `<Suspense>` ao redor de `useSearchParams()`. Replicar fix de ff0471c (waiter Suspense).

8. **P1 #25** — Mensagens host redireciona pra rota do garçom. Em `apps/web-staff/src/app/host/profile/page.tsx:26` e onde mais, criar rota dedicada `/host/mensagens` ou ajustar.

9. **P1 #32 e #34 Mocks hardcoded** — substituir Caleb/Olivia/Henrique por dados reais do `/staff` quando disponível. Ana/Bruno também — não inventar dados se API tem.

10. **P1 #31 ScreenManagerTableMenu órfão** — investigar se ainda faz sentido manter. Se sim, criar rota; se não, deletar (cuidado: derruba VIP via TableMenu, que é spec).

PR title: `fix(web-staff): 10 P1 fixes — staff API drift, host filters, Suspense, mocks (P1 #14, #16-#18, #22-#25, #31, #32, #34)`

---

## Coordenação final

Depois que os 6 PRs estiverem prontos (todos passaram CI):

1. Faz `gh pr list --state open --label fix` pra ver todos.
2. Merge na ordem **1 → 2 → 3 → 4 → 5 → 6**.
3. Após cada merge, rebase os pendentes em main e re-run CI.
4. Se Subagent 2 (Socket.IO) e 6 (frontend mocks) tiverem conflito em `apps/web-staff/`, resolver no PR 6 (que entra depois).
5. Ao fim, gera `qa-reports/post-fix-summary.md` com:
   - 13 P0 → quantos resolvidos por PR
   - 21 P1 → idem
   - Restantes (espera-se 0)
   - Sugestão de re-rodar Prompt 2 (validação cross-simulator) imediatamente.

**Lembrete:** não rodar /ultrareview no fim — o usuário decide isso. Só report.

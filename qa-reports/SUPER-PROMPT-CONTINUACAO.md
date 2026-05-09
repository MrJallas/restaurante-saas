# SUPER-PROMPT · Continuação do Restaurant SaaS

> Cole isso num **chat fresh** de Claude Code. Antes de qualquer ação, leia este briefing INTEIRO + os arquivos referenciados. Trate este documento como source-of-truth — não confie em memória.
>
> **Tarefa principal**: ler **TODAS as telas** do canvas com detalhe, screenshotar **TODAS as telas** atuais via Playwright, comparar lado-a-lado, e produzir **plano de implementação priorizado** das features faltantes.

---

## 0 · Setup imediato

```bash
cd /Users/calebmedeiros/meus_projetos/restauranteSaaS/.claude/worktrees/jolly-wing-8f1e21
ls qa-reports/  # SIM-ALLOCATION.md + e2e-cross-{A..N}-*.md + round3-bug-hunt.md + screenshots/
git log --oneline -5
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep restaurant-
```

Containers via `docker-compose` no project name **`agent-a4ea5de55cbb3619e`**. Reset:
```bash
docker-compose stop api ai-service web-staff web-customer
docker-compose rm -f api ai-service web-staff web-customer
docker-compose up -d api ai-service web-staff web-customer
```
Aguarde até `curl :3001/api/health`, `:3002`, `:3003`, `:8000/health` retornarem 200.

---

## 1 · Stack + portas

| App | Porta | Container | Linguagem |
|---|---|---|---|
| `apps/api` | 3001 | `restaurant-api` | NestJS · TypeORM |
| `apps/web-staff` | 3002 | `restaurant-web-staff` | Next.js 14 App Router |
| `apps/web-customer` | 3003 | `restaurant-web-customer` | Next.js 14 |
| `services/ai-service` | 8000 | `restaurant-ai` | FastAPI Python |
| Postgres | **5434** | `restaurant-postgres` | DB `restaurant_saas`, schema `restaurant_dev` |
| Redis | 6380 | `restaurant-redis` | — |
| Mongo | 27017 | `restaurant-mongodb` | DB `restaurant_chat` |

LLM: LM Studio em `http://host.docker.internal:1234` rodando `qwen2.5-7b-instruct-mlx` (function calling habilitado).

Helpers bash:
```bash
PG_T() { docker exec restaurant-postgres psql -U postgres -p 5434 -h /var/run/postgresql -d restaurant_saas -tAc "$1"; }
PG()   { docker exec restaurant-postgres psql -U postgres -p 5434 -h /var/run/postgresql -d restaurant_saas -c "$1"; }
MONGO(){ docker exec restaurant-mongodb mongosh restaurant_chat --quiet --eval "$1"; }
REDIS(){ docker exec restaurant-redis redis-cli "$@"; }
```

---

## 2 · Multi-tenancy + IDs seedados (cheat-sheet)

DB `restaurant_saas`, schema **`restaurant_dev`** = tenant default (slug = `restaurant_dev`). Multi-tenancy é **por schema**, não por coluna `tenant_slug`.

### Customers (CPFs **válidos check-digit BR** · seedados Round 3)

| Customer | CPF | UUID |
|---|---|---|
| Ana Pereira | `11144477735` | `5ec9ccc0-e294-4d14-880b-95e842689a01` |
| Bruno Pacheco | `22255588846` | `29bc0b71-58f2-4192-bc02-d6a84a9b26b7` |
| Carla Mendes | `33366699957` | `26cd496e-cadc-410e-91dd-a94900065c89` |
| Diego Vargas | `44477700083` | `38d9a0f4-a967-405f-b8bf-6ca9b4579e78` |
| Pedro Silva | `55588811194` | `76e0565a-9f80-4c89-b008-4ae0be07d095` |
| Eduardo Vargas | `66600033398` | **NÃO EXISTE** — para teste de cadastro novo |

### Staff
- Ana Garcom (waiter): `320de62c-073f-4e50-9f68-f5e9064c8bab`
- Bruno Garcom (waiter): `35c95cc6-312a-4cfb-b857-8fe77a7dd5d3`
- Carlos Cozinha (cook): `787b5fea-c128-4696-812d-d91c1e5aad12`
- Diana Cozinha (cook): `70c63f26-cf4f-4076-9623-6c3ce7228982`
- Erica Gerente (manager): `8bd06156-1fe5-4c18-a82d-43d38287ed4a`
- Renata Host (host): `a4c89ca7-86e6-4072-9432-449118a62fd4`

### Mesas (12 ativas)
M01-M08, M13, M14, M15, M22 · 22 menu_items · 4 menu_categories (Entradas / Pratos Principais / Bebidas / Sobremesas)

### iOS Sims booted
8 sims (iPhone 15 Pro, Pro Max, 15, Plus, 16 Pro, Pro Max, 16, Plus). UUIDs em `qa-reports/SIM-ALLOCATION.md`.

---

## 3 · Schema cheat-sheet (tabelas críticas)

| Tabela | Colunas relevantes |
|---|---|
| `tables` | `id, code (M01..), label, qr_hmac_secret, capacity, is_active, sort_order, zone_id` — **sem** `tenant_slug`, `number`, `status` |
| `customers` | `id, name, cpf, recognition_token (uuid), total_visits, is_vip` |
| `menu_items` | `id, category_id, name, price_cents, allergens text[], is_available, kind` — **substitui `dishes`** |
| `staff` | `id, name, role (waiter/cook/manager/host), pin_hash, is_active` |
| `table_sessions` | `id, table_id, session_token, status (open/active/closed), host_customer_id, flags text[]` |
| `session_participants` | `id, table_session_id, customer_id, status (pending/approved/rejected), approved_at, approved_by` — **sem `is_host`** |
| `orders` | `id, table_session_id, billing_mode, status, total_cents` — **sem `customer_id`, sem `payment_status`** |
| `order_items` | `id, order_id, menu_item_id, quantity, customer_id (sim aqui)` |
| `order_status_history` | tabela separada (não jsonb) |
| `assistant_messages` | `id, table_session_id, customer_id, user_message, assistant_response, tool_calls jsonb, contextual_chips jsonb, kind, from_role, to_role, thread_id` |
| `waiter_calls` | `id, customer_id, status, reason, acknowledged_by, eta_minutes` |
| `complaints` | `id, customer_id, status (pending_review/in_progress/responded/closed), assigned_manager_id, response_text, response_at, resolved_at` |
| `lgpd_requests` | `kind (erasure/export), status, protocol_number` — **não `type`** |
| `table_merge_requests` | `source_table_session_id, target_table_session_id` — **não `origin/target`** |
| `table_merge_cooldowns` | `source_table_session_id, target_table_session_id, cooldown_expires_at` — UNIQUE direcional após migration 037 |
| `escalation_chains` | `kind, level, current_assignee_role, steps jsonb` |
| `zone_pauses` | `waiter_id, started_at, ends_at, ended_at, started_by, ended_by` (ativo = `ended_at IS NULL`) |
| `payments` | `amount_cents, status, method (pix/card), split_mode, split_allocations jsonb` |

**Tabelas que NÃO existem** (spec antigo): ~~dishes~~ (use menu_items) · ~~merge_cooldowns~~ (use table_merge_cooldowns) · ~~table_session_participants~~ (use session_participants) · ~~courtesies~~ (provavelmente via session_flags)

---

## 4 · Features (com paths de spec)

| Feature | Spec | Frontend | Backend |
|---|---|---|---|
| Chat customer com IA V20 | `docs/design-canvas-final/handoff/cliente/cliente-journey-v20.jsx` + `cliente-screens-v14.jsx` | `apps/web-customer/src/app/[slug]/assistente/page.tsx` | `apps/api/src/modules/assistant/assistant.service.ts` + `services/ai-service/main.py` |
| Customer-host model V16 | `docs/features/customer-host-model.md` | `apps/web-customer/src/screens/customer-host-flows/*.tsx` | `apps/api/src/modules/late-arrival/*` + `table-merge/*` |
| Complaint flow V12 | `docs/features/complaint-flow-v12.md` | `apps/web-customer/src/screens/feedback-and-history/*` | `apps/api/src/modules/complaints/*` |
| Zone-pause | `docs/features/zone-pause.md` | `apps/web-staff/src/screens/manager/ScreenManagerOrdersPause.tsx` | `apps/api/src/modules/zone-pauses/*` |
| LGPD + chat-history | `docs/features/chat-history-lgpd.md` | tools chat IA | `apps/api/src/modules/lgpd/*` + `chat-history/*` |
| VIP customer | `docs/features/vip-customer.md` (`docs/design-canvas-final/docs/features/`) | `ScreenManagerTableMenu.tsx` MoreSheet | `session_flags` (Postgres) |
| ContinuationHome (warmback) | canvas `docs/design-canvas-final/app-cliente-canvas.html` sections 4.2-4.5 | `apps/web-customer/src/components/ui/ContinuationHome.tsx` | `services/ai-service/services/continuation.py` |
| Push notifications staff (9 lockscreens) | `apps/web-staff/src/components/push/Push*.tsx` | idem | Service Worker + Web Push API |
| Telas staff V11 (Painel/Equipe/Operação/Eu manager+waiter+host) | canvas garcom V11 (`app-garcom-canvas-v11.html`) | `apps/web-staff/src/screens/manager|waiter|host/*.tsx` | — |
| KDS cozinha | — | `apps/web-staff/src/app/cozinha/page.tsx` | `apps/api/src/modules/orders/*` |
| Identify before join (late-arrival) | `customer-host-model.md` linha 63+ | `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerIdentifyBeforeJoin.tsx` | `customers.identify` endpoint |

39 tools registradas em `services/ai-service/services/tools/*.py` (cobre menu/order/payment/waiter/complaint/lgpd/merge/etc).

---

## 5 · Estado git + uncommitted neste worktree

```
main:
  71dba35 fix(round3): 15 categorias P0/P1 (PR #26 squash · 2026-05-09)
  174c3bd PR #25 late-arrival promote + dual-consent merge
  6823a20 PR #24 host backend module (Mapa + Inbox + Liberate + Swap + VIP)

claude/jolly-wing-8f1e21 (worktree atual, ahead of main):
  e288035 cherry-pick do Round 3 (já em main via squash)
  + UNCOMMITTED:
    - 6 telas V11 reescritas (Painel/Equipe/Operação/Eu manager+waiter+host)
    - apps/web-staff/src/components/waiter/Icons.tsx (+ settings, + shield)
    - apps/web-staff/src/app/manager/operacoes/page.tsx (default tab='alerts')
    - apps/web-staff/src/app/waiter/eu/page.tsx (onEndShift prop)
    - docs/prompts/02-cross-simulator-validation.md (cheat-sheet schema · helpers)
    - qa-reports/SIM-ALLOCATION.md
    - qa-reports/e2e-cross-{A,B,D,F,K,N}-*.md (Wave 1+2 reports)
    - qa-reports/round3-bug-hunt.md
    - qa-reports/screenshots/{A,D,N,F,B,K}/ (PNGs)
    - v11-1..8.png (8 screenshots V11 staff)
    - docs/design-canvas-final/* (canvas extraído ZIP)
    - qa-reports/SUPER-PROMPT-CONTINUACAO.md (este arquivo)
```

**Decisão**: as 6 telas V11 reescritas e os reports são valiosos. Próximo chat **deve commitar** num PR separado se forem reusar/promover.

---

## 6 · Canvas final · TODAS as telas a estudar

Canvas extraído em `docs/design-canvas-final/`. ZIP original em `~/Downloads/canvas final.zip`.

### 6.1 · App do CLIENTE (web-customer · porta 3003)

**HTMLs canvas** (cada um carrega múltiplos JSX handoff):
| Versão | Arquivo | O que cobre |
|---|---|---|
| **v20 (CANON)** | `docs/design-canvas-final/app-cliente-canvas-v20.html` | journey completa V20: welcome novo · home warmback · chat com chips · multi-step · system join notice · USANDO ADD_TO_ORDER eyebrow |
| original | `docs/design-canvas-final/app-cliente-canvas.html` | sections 4.2-4.5: continuação · sheet · cortesia · gerente |
| v2-v16 | `docs/design-canvas-final/app-cliente-canvas-v{2,13,14,15,15-patched,15-patched-2,16,16-2}.html` | iterações intermediárias (use só pra contexto histórico) |

**JSX handoff** (`docs/design-canvas-final/handoff/cliente/`):
- `cliente-tokens.jsx` (942 linhas) — tokens de design (cores, fonts, primitives)
- `cliente-screens.jsx` (637 linhas) — telas core
- `cliente-screens-v2.jsx` (640 linhas) — iteração
- `cliente-screens-v13.jsx` (643 linhas) — iteração
- `cliente-screens-v14.jsx` (935 linhas) — base atual
- **`cliente-journey-v20.jsx` (CANON)** — F01 a F20+ frames numerados (welcome, home, scan QR, identify, chat, add_to_order multi-step, call_waiter sheet vaul, request_bill, payment, dividir, pix, complaint compose, courtesy arrival, chat history, LGPD)
- `cliente-menu-drawer-v20.jsx` (316 linhas) — menu drawer + perfil
- `cliente-late-arrival.jsx` — fluxo late-arrival (V16)
- `cliente-table-merge.jsx` (802 linhas) — fluxo table-merge

### 6.2 · App STAFF (web-staff · porta 3002)

**HTMLs canvas**:
| Versão | Arquivo | O que cobre |
|---|---|---|
| **v17 (mais recente)** | `docs/design-canvas-final/app-garcom-canvas-v17.html` | redesign atual mais recente |
| **v11** | `docs/design-canvas-final/app-garcom-canvas-v11.html` | layout V11 das telas Eu (Mensagens em bloco próprio) |
| **v15/16** | `app-garcom-canvas-v{15,16}.html` | iterações |
| v10/12 | `app-garcom-canvas-v{10,12}.html` | iterações intermediárias |
| v3-9 | `app-garcom-canvas-v{3,3-2,4,5,6,7,7-2,8,9}.html` | histórico |

**JSX handoff** (`docs/design-canvas-final/handoff/garcom/`):
- `garcom-tokens.jsx` (404 linhas) — tokens
- `garcom-screens-a.jsx` (806 linhas) — primitives + login
- `garcom-screens-b.jsx` (2.678 linhas) — telas garçom (table detail, call detail, order quick, scan QR, delivery, profile)
- `garcom-screens-c.jsx` (2.246 linhas) — **telas manager core**: Painel (`ScreenManagerHomeA`), Equipe (`ScreenManagerStaff`), Eu/Settings (`ScreenManagerSettings`), Cortesias, ShiftEditor
- `garcom-screens-d.jsx` (3.604 linhas) — manager extras: Operação (`ScreenManagerOps` com Alertas/Mapa/Funil), Financeiro, TableMenu, AlertsAll, KitchenReorder, OrdersPause, OrdersPauseSummary, CompensateClient, StatDetail
- `garcom-screens-e.jsx` (994 linhas) — extras
- `garcom-screens-host.jsx` (2.598 linhas) — telas host (recepcionista) · ScreenHostProfile, HostHome, HostInbox, HostWaitlist, HostReservations, HostTableSwap, HostLiberate
- `garcom-complaint.jsx` (1.002 linhas) — fluxo complaint (`ScreenComplaintDetail`, `MComplaintInProgressCard`, `ManagerBubbleWithAction`)
- `garcom-late-arrival-info.jsx` — push lockscreen + info card
- `garcom-table-merge-info.jsx` — push + info
- `garcom-qr-issue.jsx` (1.298 linhas) — fluxo QR ilegível + escalation
- `garcom-push.jsx` (624 linhas) — 9 lockscreens push
- `garcom-app.jsx` (1.251 linhas) — orquestra canvas inteiro

### 6.3 · Specs textuais
- `docs/design-canvas-final/docs/features/customer-host-model.md` (V16)
- `docs/design-canvas-final/docs/features/complaint-flow-v12.md`
- `docs/design-canvas-final/docs/features/chat-history-lgpd.md`
- `docs/design-canvas-final/docs/features/zone-pause.md`
- `docs/design-canvas-final/docs/features/vip-customer.md` (se houver)
- `docs/design-canvas-final/handoff/garcom/server-notes.md` (notas de backend pendentes)
- `docs/design-canvas-final/handoff/cliente/server-notes.md`
- `docs/design-canvas-final/prototypes/seguranca-qr/index.html` (segurança QR · futura repactuação)

### 6.4 · TV Cozinha + Bar
- `docs/design-canvas/tv-cozinha-bar.html` + `docs/design-canvas/tv-screens.jsx` — KDS para TV (display público da cozinha)

---

## 7 · Bugs já fixados (Round 3 · PR #26 mergeado)

15 categorias C1-C15 fechadas. Resumo (detalhes em `qa-reports/round3-bug-hunt.md`):
- C1 ✅ Pipeline LLM→tools (`API_BASE_URL` env + chips persisted em `contextual_chips`)
- C2 ✅ KDS status filter aceita legacy + canon (`received|in_progress|ready`)
- C3 ✅ Tool naming docs (`change_order` / `remove_from_cart` / `request_check`)
- C4 ✅ Chat customer V20 (eyebrows ASSISTENTE · USANDO X · Mensagem para a casa placeholder)
- C5 ✅ ContinuationHome wirado em `[slug]/page.tsx` + 5 kinds (viu_menu/chamou_garcom/abriu_pedido/pagou/voltou_sem_acao)
- C6 ✅ Cooldown table-merge unidirecional (migration 037)
- C7 ✅ Migration renomeada 035→036 dual_consent
- C8 ✅ Staff override merge endpoint `POST /staff/table-merges/force`
- C9 ⚠️ Classifier ask_about_restaurant ok mas ainda bloqueia call_waiter ("preciso de mais agua") — pendente Round 4
- C10 ✅ customer_id NOT NULL forçado
- C11 ✅ Mongo dual-write (chat_history.appendTurn) — funciona em flow real
- C12 ✅ qty/UUID validation no add_to_order
- C13 ✅ Dead code (ContextualInputExpand + MergedTableTile deletados)
- C14 ✅ Cosmetic (cozinha overflow + bottom-nav `?name=`)
- C15 ⚠️ Pix QR leak (inconclusive — body request precisa ajuste)

---

## 8 · Pendências conhecidas (Round 4)

Lista do prompt já gerado (conteúdo em mensagens anteriores · `qa-reports/round3-bug-hunt.md` ou `02-cross-simulator-validation.md`):

| ID | Severidade | Categoria |
|---|---|---|
| **C16** | P1 | Sheet "Chamar garçom" deveria ser bottom-sheet vaul-style (canvas `cliente-journey-v20.jsx:341 F07_CallWaiter`), atualmente é rota fullscreen `/garcom/chamar` |
| **C17** | P2 | Audit copy "fale com gerente/recepcionista" — repro exata pendente |
| **C-NEW-1** | P1 | Migration runner não aplica novas migrations no boot (037 precisou manual) |
| **C-NEW-2** | P1 | Classifier ainda bloqueia "preciso de mais agua" (call_waiter pattern) |
| **C-NEW-3** | P1 | Chips populated em só 2/6 turnos — `add_to_order`, `ask_about_restaurant` e demais tools de mutação não retornam chips |
| **C-NEW-4** | P2 | `voltou_sem_acao` template `{last_item}` literal quando ausente |
| **C-NEW-5** | P2 | Resíduos de comentário `ContextualInputExpand` em 3 arquivos |

---

## 9 · Wave plan pendente do Prompt 2

`docs/prompts/02-cross-simulator-validation.md` v3.0 define 14 subagentes A-N + O/P/Q/R (regression). Status:

| Wave | Subagentes | Status |
|---|---|---|
| 1 | A (onboarding+discovery), D (payment 3 modes), N (telas Eu) | ✅ Executada |
| 2 | B (order lifecycle+KDS), F (table-merge), K (contextualização IA) | ✅ Executada |
| 3 | C (communication tools), E (late-arrival V16) | ⏳ **Pendente** |
| 4 | G (complaint roundtrip), I (VIP+zone-pause+allergy+courtesy) | ⏳ **Pendente** |
| 5 | H (KDS pipeline+push), J (LGPD), L (push lockscreens), M (recovery+edge) | ⏳ **Pendente** |
| Reg | O (regression) + P (V20 chat) + Q (continuation) + R (dead code) + S (sheet vaul Round 4) + T (copy audit Round 4) | parcial |

---

## 10 · TAREFA PRINCIPAL (este chat)

> **Objetivo**: produzir um plano de implementação priorizado das features faltantes/divergentes vs canvas, baseado em **inventário visual completo** lado-a-lado.

### Etapa 1 · Mapear todas as telas do canvas (literal)
Para cada role (cliente, garçom, manager, host, cook):
1. Abra o HTML canon (cliente: v20 · garçom/manager/host: v17 ou v11 ou ambos)
2. Liste TODAS as seções/frames (ex.: "F01 welcome", "F02 home", ...). Cada handoff JSX tem comentários `// FNN_NomeFrame` ou `DCSection id="..."`.
3. Para cada frame, capture: (a) screenshot do canvas (renderize via headless ou inspecione JSX), (b) propósito, (c) interações esperadas, (d) backend dependencies.

Use `Agent` com subagent_type `Explore` em paralelo (3-4 agents simultâneos) pra ler os JSX longos:
- 1 agent lê `cliente-screens-v14.jsx` + `cliente-journey-v20.jsx` + `cliente-table-merge.jsx` + `cliente-late-arrival.jsx`
- 1 agent lê `garcom-screens-c.jsx` + `garcom-screens-d.jsx`
- 1 agent lê `garcom-screens-host.jsx` + `garcom-complaint.jsx` + `garcom-qr-issue.jsx`
- 1 agent lê `garcom-screens-a.jsx` + `garcom-screens-b.jsx` + `garcom-screens-e.jsx` + `garcom-push.jsx`

Cada agent devolve: lista numerada de frames com 1 linha de descrição + path:line.

### Etapa 2 · Screenshot todas as telas atuais (real)
Use Playwright (393×852 iPhone viewport):

**Cliente** (porta 3003) — para cada rota:
```
/restaurant_dev                                    (welcome novo / warmback)
/restaurant_dev/mesa/M07?ts=...&hmac=...           (scan QR + welcome modal)
/restaurant_dev/identify?next=...                  (IdentifyBeforeJoin late-arrival)
/restaurant_dev/assistente                         (chat IA)
/restaurant_dev/cardapio                           (menu fullscreen)
/restaurant_dev/pedido                             (current order)
/restaurant_dev/pagamento                          (bill)
/restaurant_dev/pagamento/dividir                  (split)
/restaurant_dev/pagamento/pix                      (PIX QR)
/restaurant_dev/garcom/chamar                      (call waiter — atualmente rota, deveria ser sheet)
/restaurant_dev/garcom/chamando                    (waiter coming)
/restaurant_dev/aguardando-aprovacao               (late-arrival waiting)
/restaurant_dev/orders/:id/avaliar                 (rating)
/restaurant_dev/reclamacao                         (complaint compose)
/restaurant_dev/chat-history                       (LGPD chat history)
/restaurant_dev/eu                                 (perfil cliente)
/restaurant_dev/host/approve/join/:id              (host approval)
... etc
```
Crie sessão válida via HMAC pra Pedro/M07 (ver §11 receita).

**Staff** (porta 3002):
```
/manager                       (Painel V11)
/manager/operacoes             (Operação V11 · 3 sub-tabs ?tab=alerts|map|funnel)
/manager/equipe                (Equipe V11)
/manager/financeiro            (placeholder)
/manager/configuracoes         (Eu V11)
/manager/mensagens             (staff messages)
/manager/cortesias             (courtesy history)
/manager/pausa-zona            (zone-pause modal)
/manager/cozinha-reorder       (kitchen reorder)
/manager/chamado/:id?kind=complaint   (complaint detail)
/manager/stat/:type/:id        (stat detail)
/waiter                        (home grid)
/waiter/eu?tenant=...&waiterId=... (perfil waiter V11)
/waiter/scan-qr                (QR scanner)
/waiter/new-entry              (new entry chooser)
/waiter/mensagens              (staff messages)
/waiter/entrega/:orderId       (delivery confirm)
/waiter/report-qr-issue        (QR issue)
/cozinha                       (KDS)
/cozinha/eu                    (perfil cook)
/host                          (host home)
/host/profile?tenant=...       (perfil host V11)
/host/waitlist                 (lista de espera)
/host/reservations             (reservas)
/host/late-arrival             (late-arrival approvals)
/host/swap                     (table swap)
/host/liberate                 (table liberate)
/host/mensagens                (staff messages)
... etc
```

Salve em `qa-reports/round4-screenshots/{cliente,staff}/{role}/{rota}.png` em batch via Playwright.

Para cada rota: capture estado padrão **e** estado pós-interação relevante (ex.: chat após enviar mensagem · sheet aberto · empty state).

### Etapa 3 · Comparar lado-a-lado
Para cada frame do canvas, encontre a tela atual correspondente. Construa tabela em `qa-reports/round4-canvas-vs-impl.md`:

| Canvas | Atual (rota) | Match? | Gaps |
|---|---|---|---|
| F01 welcome novo | `/restaurant_dev/identify?next=assistente` | ✅ | — |
| F07 CallWaiter sheet vaul | `/garcom/chamar` (rota fullscreen) | ❌ | sheet → rota; falta blur backdrop, swipe-down, drag handle |
| ... | ... | ... | ... |

### Etapa 4 · Plano de implementação priorizado

`qa-reports/round4-implementation-plan.md` com:
1. **P0 fixes** — bloqueiam funcionalidade core
2. **P1 fixes** — visíveis pro usuário, divergem do canon
3. **P2 fixes** — polishes, dead code, cosmetic
4. **Features faltantes** — frames do canvas que não têm rota equivalente

Para cada item: ETA estimada, files afetados, dependencies (backend? schema?), aceitação.

Total esperado: 30-60 min de leitura/screenshot + 30 min de plano = ~1.5-2h.

---

## 11 · Receita rápida pra criar session válida (Pedro/M07)

```bash
PG_T() { docker exec restaurant-postgres psql -U postgres -p 5434 -h /var/run/postgresql -d restaurant_saas -tAc "$1"; }
M07_ID=$(PG_T "SELECT id FROM restaurant_dev.tables WHERE code='M07'")
PG_T "UPDATE restaurant_dev.table_sessions SET status='closed', closed_at=NOW() WHERE table_id='$M07_ID' AND status IN ('open','active')" > /dev/null
SECRET=$(PG_T "SELECT qr_hmac_secret FROM restaurant_dev.tables WHERE code='M07'")
TS_MS=$(python3 -c 'import time; print(int(time.time() * 1000))')
SIG=$(printf "M07:%s" "$TS_MS" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p -c 256)

# URL pra Playwright navegar:
echo "http://localhost:3003/restaurant_dev/mesa/M07?ts=$TS_MS&hmac=$SIG"

# Depois preenche WelcomeModal com Pedro/55588811194 + clica Continuar.
# Cookie de sessão fica salvo no Playwright; daí navegue pra outras rotas /restaurant_dev/*.
```

Pra staff é direto (sem auth no dev) — `/manager`, `/waiter`, `/cozinha`, `/host` carregam.

---

## 12 · Reports + arquivos chave a ler

| File | Conteúdo |
|---|---|
| `qa-reports/SIM-ALLOCATION.md` | sims iOS booted + IDs customers/staff/mesas + Wave plan |
| `qa-reports/e2e-cross-A-onboarding-discovery.md` | Subagent A · 6 tools de descoberta |
| `qa-reports/e2e-cross-B-order-lifecycle.md` | Subagent B · order lifecycle + KDS |
| `qa-reports/e2e-cross-D-payment.md` | Subagent D · 3 modes de pagamento |
| `qa-reports/e2e-cross-F-table-merge.md` | Subagent F · merge + cooldown |
| `qa-reports/e2e-cross-K-context-and-chips.md` | Subagent K · contextualização IA |
| `qa-reports/e2e-cross-N-eu-screens.md` | Subagent N · telas Eu |
| `qa-reports/round3-bug-hunt.md` | 7 bugs novos achados em Round 3 |
| `docs/prompts/02-cross-simulator-validation.md` v3.0 | spec dos 14 subagentes A-N + O/P/Q/R |
| `qa-reports/screenshots/` | PNGs das Waves 1+2 |
| `v11-1..8.png` | screenshots V11 das telas staff (Manager Eu/Painel/Equipe/Operação · Waiter Eu · Host Eu) |

---

## 13 · Comandos úteis

```bash
# Smoke E2E LLM→tools
PG_T "SELECT id FROM restaurant_dev.customers WHERE cpf='55588811194'"  # Pedro
curl -s -X POST "http://localhost:3001/api/restaurant_dev/assistant/message" \
  -H "Content-Type: application/json" -b /tmp/p.txt \
  -d '{"message":"mostra o cardapio","customerId":"<PEDRO_ID>"}' | jq .toolCalls

# Continuation 5 kinds
for k in viu_menu chamou_garcom abriu_pedido pagou voltou_sem_acao; do
  curl -s -X POST :8000/continuation -H 'Content-Type: application/json' \
    -d "{\"tenantId\":\"restaurant_dev\",\"kind\":\"$k\",\"customerName\":\"Pedro\",\"isReturning\":true,\"isVip\":false}" \
  | jq -c '{kind:"'$k'", subtitle:.message.subtitle, chips:(.chips|length)}'
done

# Logs ai-service tool dispatch
docker logs restaurant-ai --tail 100 | grep -iE 'tool|dispatch|view_menu|add_to_order'

# Re-aplicar migration manual se runner falhar
docker exec -i restaurant-postgres psql -U postgres -p 5434 -h /var/run/postgresql \
  -d restaurant_saas -v ON_ERROR_STOP=1 \
  -c "SET search_path TO restaurant_dev;" \
  -f - < packages/database/migrations/tenant-template/037_table_merge_cooldown_directional.sql
```

---

## 14 · Como retomar (escolha 1)

**A · Plano completo** (recomendado): execute as 4 etapas da §10 e devolva `qa-reports/round4-canvas-vs-impl.md` + `round4-implementation-plan.md`.

**B · Foco em sub-feature**: pegue 1 categoria pendente (ex.: C16 sheet vaul, ou Wave 3 subagentes C+E) e implemente/valide isolado.

**C · Continuar Prompt 2**: dispare Wave 3 (subagentes C complaint communication + E late-arrival V16) seguindo o spec `docs/prompts/02-cross-simulator-validation.md`.

**D · Aplicar Round 4 prompt**: já existe prompt completo em mensagens anteriores (7 issues C16, C17, C-NEW-1..5). Pode ser usado por outro chat de fix; este chat valida.

Comece confirmando qual escolher antes de codar.

---

**FIM do super-prompt.** Tudo que importa pra retomar está aqui ou nos arquivos referenciados.

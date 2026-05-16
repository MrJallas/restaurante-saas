# Auditoria E2E R23 · Final Report

**Branch**: `fix/customer-tools-and-continuation` (HEAD d0f0781)
**Data**: 2026-05-15
**Tenant**: `restaurant_dev`
**Cobertura**: 25 subagentes paralelos · 7 superfícies (customer iOS + 4 staff roles + AI/API/WS + V20 canon + placebo regression)
**Método**: idb + Playwright MCP + curl + docker psql + source-code audit
**Stack**: web-customer :3003 · web-staff :3002 · API :3001 · AI :8000 (RTX 5090 qwen/qwen3-coder-30b) · Postgres :5434 · Mongo :27017 · Redis :6380

---

## 📊 Tabela master · 25 subagentes

| # | Subagent | Status | PASS/TOTAL cenários | Bugs novos | Bugs conhecidos | Evidência |
|---|---|---|---|---|---|---|
| 1 | customer-entry-flow | ✅ PASS | 8/8 | 1 P3 (erro QR copy) | — | qa-reports/audit-r23/customer-entry-flow/ |
| 2 | assistente-tool-dispatch | ⚠️ PARTIAL | 7/10 com tool | 2 P1 + 2 P2 | add_to_order 404 confirmado | qa-reports/audit-r23/assistente-tool-dispatch/ |
| 3 | call-waiter-sheet | ✅ PASS | 6/7 (1 N/A Esc) | 1 P3 (dev hot-reload) | — | qa-reports/audit-r23/call-waiter-sheet/ |
| 4 | menu-overlay-iframe | ✅ PASS | 8/8 · 0 issues | 0 | — | qa-reports/audit-r23/menu-overlay-iframe/ |
| 5 | pedido-flow | ⚠️ PARTIAL | 4 PASS, 1 N/A, 3 PARTIAL | 2 P1 + 1 P2 + 2 P3 | — | qa-reports/audit-r23/pedido-flow/ |
| 6 | pagamento-flow | ✅ PASS | 6/7 (1 PARCIAL trio) | 2 P2 + 2 P3 | — | qa-reports/audit-r23/pagamento-flow/ |
| 7 | garcom-chamando | ✅ PASS | 5/5 (1 N/A keyboard) | 1 P3 UX | — | qa-reports/audit-r23/garcom-chamando/ |
| 8 | host-approve-flows | ✅ PASS | 6/6 | 3 P3 cold-open | — | qa-reports/audit-r23/host-approve-flows/ |
| 9 | chat-history-lgpd | ⚠️ PARTIAL | 4 PASS, 2 FAIL | 3 HIGH + 2 MEDIUM + 1 LOW | — | qa-reports/audit-r23/chat-history-lgpd/ |
| 10 | complaints-msg-manager | ✅ PASS | 5/5 | 0 (CONTRADIZ sub 15) | — | qa-reports/audit-r23/complaints-msg-manager/ |
| 11 | eu-identify-late-arrival | ✅ PASS | 3 PASS, 2 PARTIAL | 2 P2 + 2 P3 | — | qa-reports/audit-r23/eu-identify-late-arrival/ |
| 12 | manager-home-operacoes | ✅ PASS | 8/8 · 137 clickables | 1 MEDIUM (3 functional placebos) | — | qa-reports/audit-r23/manager-home-operacoes/ |
| 13 | manager-equipe | ✅ PASS | 8/8 · CRUD real | 3 cosmetic P3 | — | qa-reports/audit-r23/manager-equipe/ |
| 14 | manager-alertas-cortesias | ✅ PASS | cortesias gold-standard | 4 P2 (alertas mock, kitchen NOT drag, etc) | — | qa-reports/audit-r23/manager-alertas-cortesias/ |
| 15 | manager-financeiro-mensagens | ⚠️ PARTIAL | financeiro mock + mensagens broken | 2 P1 DISPUTED + 3 P2 | — | qa-reports/audit-r23/manager-financeiro-mensagens/ |
| 16 | manager-mesa-timeline | ✅ PASS (2 PARTIAL) | 5 cenários | 1 HIGH (DTO mapping) + 3 MEDIUM + 2 LOW | — | qa-reports/audit-r23/manager-mesa-timeline/ |
| 17 | host-home-mesas | ✅ PASS | 10 rotas | 2 P1 + 4 P3 | — | qa-reports/audit-r23/host-home-mesas/ |
| 18 | host-profile-settings | ✅ PASS | 5/5 · 3 PROGRESSOS round 19 | 1 P3 (Aparência placebo parcial) | — | qa-reports/audit-r23/host-profile-settings/ |
| 19 | waiter-home-chamados | ⚠️ PARTIAL | 8 rotas, 4 com mock | 🚨 **2 P0** + 3 P1 + 2 P2 | — | qa-reports/audit-r23/waiter-home-chamados/ |
| 20 | cozinha-kds | ✅ PASS | 2 rotas | 1 P2 + 3 P3 | — | qa-reports/audit-r23/cozinha-kds/ |
| 21 | ai-tools-dispatch | ✅ PASS | 39/39 shape canon | 4 P3 (endpoints 404) | add_to_order 404 confirmado | qa-reports/audit-r23/ai-tools-dispatch/ |
| 22 | continuation-api | ✅ PASS | 5 kinds | 1 P2 (GET sem slots) + 2 P3 | **home.service.ts kind OUTDATED — JÁ FIXADO em 5edb454** | qa-reports/audit-r23/continuation-api/ |
| 23 | multi-tenant-auth-ws | ✅ PASS | 3 áreas | 1 P3 (emit cross-tenant) + 1 P4 (ParseUUIDPipe) | — | qa-reports/audit-r23/multi-tenant-auth-ws/ |
| 24 | v20-canon-audit | ✅ **PASS 7/7** | 7 surfaces locked | 3 drifts minor non-urgent | — | qa-reports/audit-r23/v20-canon-audit/ |
| 25 | placebo-regression-scan | ✅ PASS | 61 rotas scan | 3 NEW P2 (Buscar + Mais icons) | 9 placebos baseline (8 toggles + 1 2FA — sub 18 contradiz alguns) | qa-reports/audit-r23/placebo-regression-scan/ |

**Sumário status**: 18 PASS · 6 PARTIAL · 1 PASS-com-2-PARTIAL · 0 FAIL · 0 BLOCKED

---

## 🚨 Bugs novos descobertos (priorizados por severidade)

### P0 críticos (bloqueantes)

| # | Local | Bug | Severidade | Impacto |
|---|---|---|---|---|
| P0-1 | `apps/web-staff/src/screens/waiter/ScreenWaiterCallDetail.tsx:89-93` | `ack()` apenas faz toast + router.back(); NÃO invoca `acknowledgeCall` (helper existe em `lib/api/waiter.ts:50`) | 🚨 P0 | Cliente vê chamado "em fila" indefinidamente — waiter UX quebrado |
| P0-2 | `apps/api/src/modules/waiter-calls/waiter-calls.service.ts:213-238` | `acknowledged_by` nunca gravado no DB (schema tem a coluna) | 🚨 P0 | Permite impersonation (qualquer staff seta waiterName livre) + audit/forensics cego |

### P1 (bloqueante regulatório · LGPD)

| # | Local | Bug |
|---|---|---|
| P1-LGPD-1 | `services/ai-service/services/tools/lgpd_data_request.py:47` | Path errado: posts `/customer/lgpd-requests` (real é `POST /:slug/lgpd-requests`) → 404. **Usuário NÃO consegue solicitar erasure** |
| P1-LGPD-2 | `apps/api/src/modules/lgpd/lgpd.service.ts:59` | Erasure NÃO dual-side: só limpa Mongo. **Postgres `restaurant_dev.assistant_messages` (user_message + assistant_response full text) SOBREVIVEM INDEFINIDAMENTE** após "delete" — exposição legal real |
| P1-LGPD-3 | `services/ai-service/services/tools/delete_chat.py:36` + `delete_all_chats.py:34` | Double prefix: builds `/{tenant_id}/...` mas API_BASE_URL já tem `/api/restaurant_dev` → `/api/restaurant_dev/restaurant_dev/...` 404 |

### P1 (FE + API bugs)

| # | Local | Bug |
|---|---|---|
| P1-1 | Bug vídeo user (BUG.md) — `CallWaiterSheet.tsx` onDismiss + `home.service.ts inferContinuationKind` ~189-202 | Sheet drag-dismiss não revalida continuation + continuation trava em `chamou_garcom` mesmo após user visitar /cardapio |
| P1-2 | `apps/api/src/modules/complaints/complaints.service.ts:348+` mapRow (+ late-arrival.service.ts + table-merge.service.ts) | Não denormaliza `tableNumber`, `customerName`, `description`, `createdAt` — Frontend ComplaintDto recebe `undefined`/`Invalid Date` em stat drill |
| P1-3 | `apps/api/src/modules/host/host.controller.ts:130-150` + `host.service.ts:507-517` | POST /host/tables/swap (legacy atomic) quebrado — state-machine rejeita requested→completed; deixa row órfã com status='requested' |
| P1-4 | `apps/api/src/modules/late-arrival/late-arrival.service.ts:316-335` mapRow() | API GET retorna shape diferente de LateArrivalRequestDto (faltam tableNumber, requesterName, visitContext) — UI mostra "Mesa undefined" |
| P1-5 | `services/ai-service/services/continuation.py:365,379,394,405` + `apps/web-customer/src/app/[slug]/assistente/page.tsx:1673` | Chip "Avaliar" → `/restaurant_dev/avaliar` 404 (rota não existe; deveria ser `feedback` ou `orders/{id}/rating`) |
| P1-6 | `apps/api/src/modules/orders/orders.controller.ts:165-184` | `order_items.customer_id=NULL` em cross-origin (recognition cookie SameSite=Lax). Per-customer billing/split via visit_id fallback OK mas **analytics undercountam** |
| P1-7 | LLM guardrail / `services/ai-service/services/tools/__init__.py` | 3 customer tools BLOQUEADAS pelo qwen3-coder-30b system prompt: `compare_dishes`, `view_courtesy`, `view_chat_history` → "Desculpe, só posso ajudar com assuntos do restaurante" |
| P1-8 | `services/ai-service/services/` (resolver `search_dish`) | `search_dish` dispatched OK mas resolver retorna shape vazio (response="", linkedItems=[], chips=[]) — quebra `test_chips_coverage_at_least_9_of_10_mutations` |

### P1 DISPUTED (sub 10 vs sub 15)

| # | Local | Status |
|---|---|---|
| P1-DISPUTED-1 | `apps/api/src/modules/customer-staff-messages/customer-staff-messages.controller.ts:21-24` | Sub 15 reportou ThreadIdParamDto sem slug → 400 forbidNonWhitelisted. Sub 10 inspecionou source e diz que DTO está correto (slug vem do `@Controller(':slug/...')` path-param). Possíveis causas: TS watch cache stale em sub 15 OU ambient state diferente. **Ação**: rebuild + repro em ambiente limpo |
| P1-DISPUTED-2 | mesmo controller | Sub 15: staff/threads não registrado runtime. Sub 10: endpoints staff JÁ registrados (linhas 175-197). **Ação**: idem acima |

### P2-P3 outros (resumo)

- **P2 emitAlertCreated** (`events.gateway.ts:1033`): único helper com `this.server.emit()` global sem room — vaza alerts cross-tenant
- **P2 kitchen-reorder** (`ScreenManagerKitchenReorder.tsx`): NÃO é drag-drop, é select+confirm mock; PATCH /orders/:id/queue-position nunca dispara
- **P2 GET /continuation sem slots ricos** (`main.py:537-545`): variantes cg4/ap4/vs1/vs2/pc1-3 inalcançáveis via /home
- **P2 MInProgressCard** (3 functional placebos quando ScreenManagerHomeA não passa onSecondary)
- **P2 /pagamento entrypoint** não é "trio PillButton" (radio cards) + custom split mode incompleto
- **P2 Logout cosmético** /eu — cookies recognition_token + session_token persistem 1 ano (privacy concern)
- **P2 /eu** não exibe total_visits nem last_visit_at (dados existem no DB)
- **P2 /cozinha** não subscribe WS room kitchen — só polls 5s
- **P2 /waiter/chamados** MOCK_CALLS hardcoded — inconsistência badge tabbar (1 real) vs tela (5 mock)
- **P2 /waiter/scan-qr** sem QR decoder — só viewfinder visual
- **P2 /waiter/table/[id]** 100% mock
- **P3** Chip "Avaliar" 404, /eu não renderiza visits, FieldShell duplicado, `acknowledged_by` cego, `peguei_conta` silent fallback, ParseUUIDPipe missing em vários endpoints, view_courtesy fallback hardcoded, +6 endpoints 404 (call_waiter, staff_broadcast, staff_respond_complaint, delete_all_chats, lgpd_data_request, request_check), tema /host/aparencia placebo parcial, +cosmetic drifts

---

## ✅ Bugs conhecidos do super-prompt — RECONCILIAÇÃO

| Bug original | Status após audit |
|---|---|
| `home.service.ts NÃO passa kind` pro /continuation | ⚠️ **OUTDATED** — JÁ FIXADO em commit 5edb454 (este branch). Sub 22 confirmou live |
| `add_to_order/view_order/...` → 404 `/customer/cart/items` | ✅ **CONFIRMADO** (sub 21 + sub 2) |
| 8 toggles `/host/notificacoes-prefs` placebo + 1 2FA `/host/seguranca` placebo (round 19) | ✅ **PROGRESSO**: sub 18 (live click + react fiber probe) confirma TODOS FIXADOS — viraram `<input type=checkbox>` reais com onChange + localStorage. Sub 25 reportou-os como still placebo mas era false positive (probe pre-hydration) |
| 4 ActionRows `/host/profile` placebo (round 18) | ✅ **CONFIRMADO FIXADO** (sub 18) |

---

## 🎨 V20 Customer canon · drift report

**7/7 surfaces locked: CANON OK** (sub 24)

| Surface | Verdict | Drift |
|---|---|---|
| WelcomeModal.tsx | ✅ | Nenhum |
| CpfInput.tsx | ✅ | Nenhum |
| ScreenCustomerIdentifyBeforeJoin.tsx | ✅ | Nenhum (label "Seu nome" preservado) |
| ScreenCustomerWaitingApproval.tsx | ✅ + minor | **D1**: eyebrow `tracking-[1.2px]` (canon `1.5px`) — justificável |
| CallWaiterSheet.tsx | ✅ + 2 minors | **D2**: title 22px (canon 26/700) — context-justified; **D3**: CTA raw `<button>` em vez de PillButton — viola rule 7 estritamente |
| reclaim banner (mesa/[tableCode]/page.tsx) | ✅ | Nenhum (sem amber/yellow regression) |
| Landing /assistente !chatStarted | ✅ | Nenhum |

**Conclusão V20**: branch atual **preserva 100% do canon Round 4** com 3 drifts minor todos contextualmente justificados ou easy fix. **NÃO há regressão visual**.

---

## 📋 Recomendação final

# 🔴 **RETRABALHO**

**Justificativa**:

1. **🚨 2 P0 bloqueantes** (waiter UX + audit/forensics):
   - ack() não persiste (waiter vê chamado em fila pra sempre)
   - acknowledged_by NULL → impersonation possível

2. **🚨 LGPD compliance QUEBRADO** (regulatório):
   - `lgpd_data_request` tool 404 (usuário não solicita erasure)
   - Erasure NÃO dual-side (`assistant_messages` sobrevive indefinidamente)
   - `delete_chat` + `delete_all_chats` tools 404 (double prefix)
   - **Exposição legal real** se cliente pedir erasure

3. **🔴 ~10 P1 bugs** funcionais (FE, API mapping, AI tools, endpoints 404)

4. **🔴 1 P1 confirmado do bug vídeo user** (CallWaiterSheet drag + continuation stuck — UX critical)

5. **✅ MAS V20 canon PRESERVADO** (não há retrabalho visual necessário)

**Não é MERGE READY**: 2 P0 + LGPD + 10 P1 fundamental
**Não é HOTFIX**: escopo amplo (≥4 P0 OU regressão LGPD)
**Não é BLOCKED**: audit completou com cobertura total

---

## 🛠️ Plano de fix sugerido (ordem de prioridade)

### Fase 1 — Bloqueantes regulatório (1-2 dias)
1. **LGPD-1**: Fix path em `lgpd_data_request.py:47` → POST /:slug/lgpd-requests
2. **LGPD-2**: Adicionar `DELETE FROM assistant_messages WHERE customer_id=$1` em `LgpdService.createRequest`
3. **LGPD-3**: Fix double prefix em delete_chat/delete_all_chats tools

### Fase 2 — Bloqueantes UX waiter (0.5 dia)
4. **P0-1**: Trocar `setStubMsg` por `acknowledgeCall(callId, ...)` em ScreenWaiterCallDetail.tsx (~5 linhas)
5. **P0-2**: Adicionar staffId ao service + `SET acknowledged_by = $staffId`

### Fase 3 — Bug do user do vídeo (0.5-1 dia)
6. **P1-1a**: Sheet drag-dismiss revalida home/continuation (mutate SWR)
7. **P1-1b**: `inferContinuationKind` re-priorizar OU hint viu_menu prevalecer sobre waiter_call active

### Fase 4 — FE/API bugs altos (2-3 dias)
8. **P1-2**: complaints + late-arrival + table-merge mapRow denormalize (JOIN tables + customers)
9. **P1-3**: POST /host/tables/swap state-machine fix
10. **P1-5**: Chip "Avaliar" payload `feedback` OR resolve orderId em FE
11. **P1-6**: order_items.customer_id NULL — same-origin proxy OU SameSite=None
12. **P1-7**: 3 LLM tools blocked — revisar system prompt OR tool definitions  
13. **P1-8**: search_dish resolver fix

### Fase 5 — P2 e cleanup (3-5 dias)
14. emitAlertCreated cross-tenant scoping
15. kitchen-reorder real drag-drop OR wire endpoint
16. GET /continuation aceitar slots ricos
17. Logout server-side clear cookies
18. WS subscribe em /cozinha
19. MOCK_CALLS → listPendingCalls em /waiter/chamados
20. QR decoder em /waiter/scan-qr
21. Várias outras P2-P3

### Fase 6 — V20 drifts opcionais (0.5 dia)
22. Normalize WaitingApproval tracking 1.2px → 1.5px (D1)
23. CallWaiterSheet CTA → PillButton (D3, requer extender PillButton)
24. Extract FieldShell pra components/ui/

**Tempo total estimado**: 8-13 dias de dev senior. P0+LGPD em 2-3 dias.

---

## 📁 Cleanup pendente da auditoria

```bash
# Limpar test data residual (executar pré-merge)
docker exec -e PGPASSWORD=postgres restaurant-postgres psql -h localhost -p 5434 -U postgres -d restaurant_saas -c "
  SET search_path=restaurant_dev,public;
  DELETE FROM customer_staff_messages WHERE body LIKE 'AUDIT-R23-%';
  DELETE FROM complaints WHERE description LIKE 'AUDIT-R23-%' OR text LIKE 'AUDIT-R23-%';
  DELETE FROM waiter_calls WHERE notes LIKE 'AUDIT-R23-%' OR (reason='other' AND status IN ('pending','cancelled'));
  DELETE FROM orders WHERE notes LIKE 'AUDIT-R23-%';
  DELETE FROM zone_pauses WHERE reason LIKE 'AUDIT-R23-%';
  DELETE FROM courtesies WHERE item LIKE 'AUDIT-R23-%' OR description LIKE 'AUDIT-R23-%';
  DELETE FROM staff_messages WHERE body LIKE 'AUDIT-R23-%';
"

docker exec restaurant-mongodb mongosh restaurant_chat --quiet --eval "
  db.chat_messages.deleteMany({body: {\$regex: '^AUDIT-R23-'}});
  db.chat_threads.deleteMany({title: {\$regex: '^AUDIT-R23-'}});
  db.staff_messages.deleteMany({content: {\$regex: 'AUDIT-R23'}});
"

# Stop idb companions (após audit)
pkill -f idb_companion

# (Opcional) shutdown 2 sims extras
xcrun simctl shutdown F1BA0367-20B8-4598-8DEA-7A9E48519E1C
xcrun simctl shutdown FEA2E5CC-596A-413E-8897-EE1CC04C3A87
```

---

## 🎯 TL;DR

**Recomendação: 🔴 RETRABALHO** com foco em:
- **Bloqueantes regulatórios** (LGPD erasure) — 2-3 dias
- **2 P0 waiter UX** — 0.5 dia
- **Bug do user** (continuation stuck) — 0.5-1 dia
- **10 P1 FE/API** — 2-3 dias
- **V20 canon ✅ preservado** (nenhum retrabalho visual)

**Hand-off pro próximo dev**:
- `qa-reports/audit-r23/FINAL_REPORT.md` (este arquivo)
- 25 SUMMARYs em `qa-reports/audit-r23/<slug>/SUMMARY.md`
- Detalhes técnicos em cada subfolder (scenarios.md, db-cross-check.md, screenshots)
- Bug do user com vídeo: `qa-reports/audit-r23/bug-call-waiter-continuation-stuck/BUG.md` (vídeo em `~/Desktop/Gravação de Tela 2026-05-15 às 17.09.23.mov`)

---

**Audit completada por**: orquestrador Claude + 25 subagentes paralelos
**Tempo total**: ~3.5h elapsed wall time
**Ferramentas validadas**: idb (4-6 sims iOS 26.5 paralelos via companions dedicados) · Playwright MCP (Chrome multi-tab) · docker exec psql/mongosh · curl direto · source-code reading

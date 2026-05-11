# Round 19 · Canvas Gap Analysis

> **Source-of-truth**: `docs/design-canvas/handoff/cliente/` + `docs/design-canvas/handoff/garcom/` (V20).
> **Scope**: enumerate every named V20 frame/screen and cross-reference with `apps/web-customer/src` + `apps/web-staff/src` to feed round 19 wave planning.
> **Generated**: 2026-05-11.

---

## Summary

- **Canvas frames/screens enumerated**: 78
  - Customer side: 13 journey frames (F01–F13) + 5 late-arrival screens + 8 table-merge screens + 1 menu drawer = **27 canvas units**
  - Staff side: 51 named `Screen*` exports + flow variants
- **Implemented in `apps/web-customer/` OR `apps/web-staff/`**: ~60 (≈77%)
- **Missing entirely (no impl file, no route)**: **11**
- **Implemented but wired incompletely (handlers placebo / "Onda 3/4 backend" stubs)**: **9**
- **Implemented + wired but with V20-canon drift (visuals diverge)**: **6**

---

## Customer side (`apps/web-customer/src/`)

### Journey frames (cliente-journey-v20.jsx)

| Canvas spec (frame) | Canvas tag | File ref | Route in app | Implemented? | Visual match | Wired (real handlers) | Gap notes |
|---|---|---|---|---|---|---|---|
| **F01 · Splash / Escanear QR** | só prod | cliente-journey-v20.jsx:85 | `/[slug]/mesa/[tableCode]` (loading state) | partial | drift | yes | Canvas mostra "TL monograma + 3 bouncing dots cap 1.5s" — atual page nao tem splash dedicado, vai direto pro recognize. P2 cosmetic. |
| **F02 · Identificar (nome+CPF)** | aligned | cliente-journey-v20.jsx:130 | `/[slug]/mesa/[tableCode]` (WelcomeModal) | yes | LOCKED V20 | yes | WelcomeModal.tsx + ScreenCustomerIdentifyBeforeJoin.tsx. CPF lookup auto-login funciona. |
| **F03 · Home (hero + 2 pills + input)** | aligned (chips pending) | cliente-journey-v20.jsx:141 | `/[slug]/mesa/[tableCode]` (home) | yes | LOCKED V20 | yes (HomeHero typing) | **ContextualChips ainda não em prod no F03** — canvas mostra chips abaixo do AssistantBlock; prod só tem 2 PillButtons fixos. |
| **F04 · Chat (turn com chips)** | pendente | cliente-journey-v20.jsx:175 | `/[slug]/assistente` | yes | match | yes | ContextualChips wired via SuggestionChip · ToolCallIndicator wired (rendering inline na bubble); cobertura ≥9/10 tools tem `chips`. Canon match. |
| **F05 · Cardápio (overlay vs rota)** | diverge | cliente-journey-v20.jsx:216 | `/[slug]/cardapio` | yes | divergente | yes | Canvas: overlay sheet. Prod: rota dedicada `/cardapio` + `/cardapio/[itemId]`. Decisão pendente — manter rota (mais robusto) ou agregar overlay sheet. |
| **F06 · Adicionar ao pedido** | diverge | cliente-journey-v20.jsx:302 | `/[slug]/cardapio/[itemId]` | yes | divergente | yes | Canvas: chips multi-step inline (Vinho → Tinto/Branco/Rosé). Prod: tela dedicada com qty/note. Decisão pendente. |
| **F07 · Chamar garçom (bottom sheet)** | diverge | cliente-journey-v20.jsx:341 | `/[slug]/garcom/chamando` + CallWaiterSheet | yes | LOCKED V20 (sheet) | yes | CallWaiterSheet.tsx é V20 canon. Rota fullscreen `/garcom/chamando` coexiste com sheet — escolha de UX já feita: sheet vence. |
| **F08 · Pedir conta (2-step router)** | diverge | cliente-journey-v20.jsx:403 | `/[slug]/pagamento` | yes | match | yes | request_bill router tool dispatches open_payment_screen OR call_waiter(ask_bill). Wired via tools/request_check.py. |
| **F09 · Late-arrival** | aligned | cliente-journey-v20.jsx:443 | `/[slug]/waiting-approval` + `/identify` | yes | LOCKED V20 | yes | ScreenCustomerWaitingApproval + ScreenCustomerIdentifyBeforeJoin + host approve flow wired end-to-end. |
| **F10 · Merge (overlay map + typewriter)** | pendente | cliente-journey-v20.jsx:454 | `/[slug]/host/approve/merge` + OverlaySalonMap | partial | partial drift | partial | `request_table_merge` tool exists, OverlaySalonMap renders, host approve route exists. **Missing**: MergeTypewriterBubble (border-left mostarda 25ms/char typewriter) no chat do receptor — TypewriterBubble.tsx existe mas só é usado no ScreenCustomerHostApproveJoin (late-arrival), não no chat para merge. ScreenPostMerge / ScreenPostReject / ScreenCooldownReattempt nao tem equivalente FE. |
| **F11 · Manager bubble + complaint** | pendente | cliente-journey-v20.jsx:465 | `/[slug]/assistente` (StaffBubble) + `/complaints/new` + `/[id]` | yes | match | yes | StaffBubble.tsx + assistant.staff_message_received WS event wired. Complaint compose + waiting + thread tudo wired. ManagerBubble.tsx para fluxo de complaint reuso. **Gap**: F11 sub-flow Pattern2A_AskType (5 chips inline) não tem equivalente puro — `complaints/new` é tela dedicada full-screen (alinhado V20 alternativo). |
| **F12 · Cortesia + Rating** | pendente | cliente-journey-v20.jsx:491 | `/[slug]/orders/[orderId]/rating` + `/pagamento/feedback` | partial | drift | partial | Rating tela existe (5 stars + comment + redirect to complaint quando <=3 ou comment). Submit wired. **MISSING**: CourtesyArrival bubble — `view_courtesy` tool returns `not_implemented` (services/ai-service/services/tools/view_courtesy.py:23). Backend courtesies endpoint (apps/api/modules/courtesies) shipou na Onda 1B mas FE customer-side não consome — não existe componente que renderize "Renata mandou uma taça de espumante" border-left mostarda. |
| **F13 · LGPD + histórico Eu** | pendente | cliente-journey-v20.jsx:551 | `/[slug]/assistente` (lgpdNotice) + `/eu` | yes | LOCKED V20 | yes | show_lgpd_notice + lgpd_data_request tools wired no chat (canonical text from lgpd_messages.py). Protocol number rendering wired. ScreenCustomerMe.tsx existe pro histórico. |

### Late-arrival sub-screens (cliente-late-arrival.jsx)

| Canvas spec | File ref (canvas) | Implemented? | File ref (prod) | Notes |
|---|---|---|---|---|
| ScreenHostApproveJoin | cliente-late-arrival.jsx:162 | yes | apps/web-customer/src/screens/customer-host-flows/ScreenCustomerHostApproveJoin.tsx | wired + WS events |
| ScreenCustomerIdentifyBeforeJoin | cliente-late-arrival.jsx:296 | yes | apps/web-customer/src/screens/customer-host-flows/ScreenCustomerIdentifyBeforeJoin.tsx | **LOCKED V20** (CLAUDE.md) |
| ScreenWaitingApproval (states: waiting/approved/failed) | cliente-late-arrival.jsx:388 | yes | apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx | **LOCKED V20** |
| ScreenNewClientWelcome | cliente-late-arrival.jsx:575 | partial | - (subsumido no WelcomeModal) | OK |
| ScreenJoinedNotice | cliente-late-arrival.jsx:631 | partial | - (subsumido no banner) | OK — `reclaimBanner` faz papel similar |
| PushHostJoinIOS (push lockscreen mock) | cliente-late-arrival.jsx:77 | n/a | n/a | só design comp |

### Table merge sub-screens (cliente-table-merge.jsx)

| Canvas spec | File ref (canvas) | Implemented? | File ref (prod) | Notes |
|---|---|---|---|---|
| ScreenOverlayMapIOS | cliente-table-merge.jsx:237 | yes | apps/web-customer/src/components/ui/OverlaySalonMap.tsx | wired via `useTableMerge` |
| ScreenOverlayMapAndroid | cliente-table-merge.jsx:261 | yes (same component) | OverlaySalonMap.tsx | shared web — variant N/A |
| **ScreenTypewriterMid** | cliente-table-merge.jsx:374 | **MISSING for merge flow** | TypewriterBubble.tsx existe pra late-arrival mas não no chat de merge | **GAP — F10 sub-component** |
| ScreenTypewriterCompleteWithPill | cliente-table-merge.jsx:398 | partial | partial | mesmo gap |
| ScreenHostApproveMerge | cliente-table-merge.jsx:423 | yes | apps/web-customer/src/screens/customer-host-flows/ScreenCustomerHostApproveMerge.tsx | wired |
| **ScreenPostMerge** (TopBar "Mesa 14+15" + success-wash) | cliente-table-merge.jsx:531 | **MISSING** | nenhum | Após merge aprovado: customer não tem confirmação visual dedicada. Apenas TopBar atualiza. |
| **ScreenPostReject** | cliente-table-merge.jsx:590 | **MISSING** | nenhum | Após reject: customer não tem feedback dedicado. |
| **ScreenCooldownReattempt** (20min lockout pós-rejeição) | cliente-table-merge.jsx:633 | **MISSING** | nenhum | LLM/backend pode bloquear mas FE não tem state visual de cooldown. |

### Menu drawer (cliente-menu-drawer-v20.jsx)

| Canvas spec | File ref (canvas) | Implemented? | File ref (prod) | Notes |
|---|---|---|---|---|
| MenuDrawerV20 | cliente-menu-drawer-v20.jsx:101 | yes | apps/web-customer/src/components/ui/MenuDrawer.tsx | wired |

---

## Staff side (`apps/web-staff/src/`)

### Waiter (garcom-screens-a/b.jsx + garcom-screens-c.jsx for waiter share)

| Canvas spec | File ref (canvas) | Implemented? | Route | Wired? | Visual match | Gap notes |
|---|---|---|---|---|---|---|
| **ScreenLogin** (CPF + senha + biometria) | garcom-screens-a.jsx:213 | **MISSING** | nenhum | n/a | n/a | Sem tela de login dedicada — `app/page.tsx` é dev passthrough. |
| **ScreenForgotPassword** (3-step) | garcom-screens-a.jsx:316 | **MISSING** | nenhum | n/a | n/a | |
| **ScreenSetNewPassword** | garcom-screens-a.jsx:492 | **MISSING** | nenhum | n/a | n/a | |
| ScreenHomeGrid | garcom-screens-a.jsx:625 | yes | `/waiter` | yes | match | `apps/web-staff/src/screens/waiter/ScreenHomeGrid.tsx` |
| ScreenTableDetail | garcom-screens-b.jsx:9 | yes | `/waiter/table/[id]` | yes | match | |
| ScreenCallDetail | garcom-screens-b.jsx:324 | yes | `/waiter/call/[id]` | yes | match | + `/manager/chamado/[id]` (manager view) |
| **ScreenOrderQuick** (chips por categoria) | garcom-screens-b.jsx:510 | **MISSING/drift** | `/garcom/pedidos` (legacy KDS-style) | partial | **DRIFT** | Existing `/garcom/pedidos` é V0 simple cards · NÃO é o V20 canon (chips multi-categoria + comanda full-screen). Same pra ScreenOrderSearch + ScreenOrderItem. |
| **ScreenOrderSearch** (POS busca) | garcom-screens-b.jsx:972 | **MISSING** | nenhum | n/a | n/a | |
| **ScreenOrderItem** (detalhe + modificadores) | garcom-screens-b.jsx:1092 | **MISSING** | nenhum | n/a | n/a | |
| **ScreenShift** (turno + faturamento) | garcom-screens-b.jsx:1239 | **MISSING** | nenhum | n/a | n/a | |
| ScreenProfile (waiter) | garcom-screens-b.jsx:1333 | yes | `/waiter/eu` | yes | match | `ScreenWaiterProfile.tsx` |
| ScreenWaiterNewEntry (chooser V4 · QR vs número) | garcom-screens-b.jsx:1490 | yes | `/waiter/new-entry` | yes | match | |
| ScreenWaiterScanQr | garcom-screens-b.jsx:1611 | yes | `/waiter/scan-qr` | yes | match | |
| ScreenWaiterTablePicker | garcom-screens-b.jsx:1695 | yes | `/waiter/scan-qr/picker` | yes | match | |
| ScreenWaiterDeliveryConfirm | garcom-screens-b.jsx:1789 | yes | `/waiter/scan-qr/delivery-confirm` | yes | match | |
| ScreenWaiterCalls | garcom-screens-b.jsx:1908 | yes | `/waiter/chamados` | yes | match | |
| ScreenStaffMessages (waiter) | garcom-screens-b.jsx:2184 | yes | `/waiter/mensagens` | yes | match | |
| ScreenStaffMessageThread | garcom-screens-b.jsx:2402 | yes | `/waiter/mensagens/[threadId]` | yes | match | |
| ScreenWaiterReportQrIssue | garcom-qr-issue.jsx:357 | yes | `/waiter/qr-issue` | yes | match | |

### Manager (garcom-screens-c/d/e.jsx)

| Canvas spec | File ref (canvas) | Implemented? | Route | Wired? | Visual match | Gap notes |
|---|---|---|---|---|---|---|
| ScreenManagerHomeA | garcom-screens-c.jsx:641 | yes | `/manager` | partial | match | **stubMsg em 4 actions** ("em desenvolvimento Onda 3 backend") — F-grid action handlers placebo |
| ScreenManagerStaff | garcom-screens-c.jsx:876 | yes | `/manager/equipe` | partial | match | stubMsg em ações de equipe |
| ScreenManagerShiftEditor | garcom-screens-c.jsx:1351 | yes | `/manager/equipe/turnos` | yes | match | |
| ScreenManagerStaffForm | garcom-screens-c.jsx:1763 | yes | `/manager/equipe/novo` + `/equipe/[id]/editar` | yes | match | |
| ScreenManagerSettings | garcom-screens-c.jsx:1889 | yes | `/manager/configuracoes` | yes | match | |
| ScreenManagerCourtesies | garcom-screens-c.jsx:2086 | yes | `/manager/cortesias` | partial | match | **Backend `GET /courtesies?today=true` shipou** (apps/api/modules/courtesies) — verificar se screen consome `manager.courtesies.list()` ou ainda usa MOCK inline. |
| ScreenManagerStaffDetail | garcom-screens-d.jsx:34 | yes | `/manager/equipe/[id]` | partial | match | stubMsg em algumas actions |
| ScreenManagerOps | garcom-screens-d.jsx:189 | yes | `/manager/operacoes` | partial | match | 4 sub-tabs implementadas em sub-rotas (em-alerta/criticos/atencao/mesas-ativas) |
| ScreenManagerFinance | garcom-screens-d.jsx:653 | yes | `/manager/financeiro` | unknown | match | precisa verificar wiring |
| **ScreenManagerTableTimeline** | garcom-screens-d.jsx:851 | partial | `/manager/timeline/[orderId]` | partial | **DRIFT** | "DADOS MOCK · timeline real chega na Onda 4 (GET /orders/{':id'}/timeline)" — backend ainda nao shipou. |
| ScreenManagerTableMenu | garcom-screens-d.jsx:1010 | yes | `/manager/table-menu/[tableId]` | yes | match | |
| ScreenManagerAlertsAll | garcom-screens-d.jsx:1684 | yes | `/manager/alertas` | partial | match | stubMsg em algumas actions |
| ScreenManagerKitchenReorder | garcom-screens-d.jsx:1818 | yes | `/manager/kitchen-reorder` | yes | match | |
| ScreenManagerOrdersPause | garcom-screens-d.jsx:2076 | yes | `/manager/pausa-zona` | yes | match | |
| **ScreenManagerOrdersPauseSummary** | garcom-screens-d.jsx:2483 | **MISSING** | nenhum | n/a | n/a | Tela de sumário pós-pausa (mostrar pedidos pausados, ETA reactivação) — não tem equivalente. |
| ScreenManagerCompensateClient | garcom-screens-d.jsx:2520 | yes | `/manager/compensate` | unknown | match | |
| ScreenManagerStatDetail | garcom-screens-e.jsx:32 | yes | `/manager/stat/[kind]/[id]` | partial | match | |
| ScreenStaffMessages (manager) | garcom-screens-b.jsx:2184 | yes | `/manager/mensagens` | yes | match | |

### Host (garcom-screens-host.jsx)

| Canvas spec | File ref (canvas) | Implemented? | Route | Wired? | Visual match | Gap notes |
|---|---|---|---|---|---|---|
| ScreenHostHome | garcom-screens-host.jsx:185 | yes | `/host` | yes | match | listHostTables + listPendingLateArrivals wired |
| ScreenHostTableLiberate | garcom-screens-host.jsx:710 | yes | `/host/liberate/[tableId]` | yes | match | |
| **ScreenHostTableLiberada** (post-liberate confirm) | garcom-screens-host.jsx:973 | **MISSING** | nenhum | n/a | n/a | Tela de confirmação pós-liberação (success-wash) — não tem equivalente. |
| **ScreenHostInbox** | garcom-screens-host.jsx:1067 | **MISSING (uses ScreenManagerNotifications)** | `/host/notifications` | yes (mas wrong shell) | drift | `/host/notifications/page.tsx` reusa `ScreenManagerNotifications` (mgr-personas) — V20 canvas tem ScreenHostInbox próprio com layout diferente (no mgr-style bottom-nav). |
| **ScreenHostAlertDetail** | garcom-screens-host.jsx:1140 | **MISSING** | nenhum (cai em manager equivalents) | n/a | n/a | Manager has alerta but host doesn't have its own alert-detail screen. |
| ScreenHostWaitlist | garcom-screens-host.jsx:1307 | yes | `/host/waitlist` | yes | match | addToWaitlist API wired |
| ScreenHostWaitlistAdd (modal inline · party+phone+note) | garcom-screens-host.jsx:1493 | yes (inline em Waitlist) | n/a | yes | match | Modal interno · OK |
| ScreenHostReservations | garcom-screens-host.jsx:1652 | yes | `/host/reservations` | yes | match | |
| **ScreenHostReservationAdd** | garcom-screens-host.jsx:1854 | **MISSING dedicated** | nenhum | n/a | n/a | Provavelmente inline no ScreenHostReservations. **Confirmar**. |
| ScreenHostTableSwap | garcom-screens-host.jsx:2137 | yes | `/host/swap` | yes | match | |
| ScreenHostProfile | garcom-screens-host.jsx:2453 | yes | `/host/profile` | yes | match | |

### Cross-cutting flows (garcom-complaint.jsx + garcom-push.jsx)

| Canvas spec | File ref | Implemented? | Notes |
|---|---|---|---|
| **ScreenComplaintDetail** (manager-side response) | garcom-complaint.jsx:652 | **MISSING** | Manager não tem tela dedicada de complaint detail/response. Existe ManagerBubble no customer chat mas o lado manager (que responde) sem tela canon. Manager talvez responda via `/manager/mensagens/[threadId]`. |
| ScreenCallDetailQrIssue | garcom-qr-issue.jsx:1056 | partial | tela genérica `/waiter/call/[id]` cobre? Confirmar. |
| Push notifications mockups (iOS lockscreen, Android lockscreen, urgent) | garcom-push.jsx | n/a | só design comp · não precisa impl |

---

## TV / KDS (tv-screens.jsx + tv-cozinha-bar.html)

| Canvas spec | File ref | Implemented? | Route | Notes |
|---|---|---|---|---|
| TV_KitchenKDS (cozinha 4-col grid) | tv-screens.jsx | partial | `/cozinha` | Existing `/cozinha` é V0 simple cards — não é V20 4-col KDS grid com headers + filtros. **DRIFT** |
| TV_BarBoard (bar 3-col) | tv-screens.jsx | **MISSING** | nenhum | Sem tela de bar dedicada. |
| TV cozinha "eu" (profile) | n/a | yes | `/cozinha/eu` | OK |

---

## Interactions / flows (beyond individual screens)

| Flow | Status | Canvas refs | Notes |
|---|---|---|---|
| **Customer → Manager messaging** | yes complete | F11 (cliente-journey-v20.jsx:465) + assistant.staff_message_received WS event | StaffBubble.tsx renderiza inbound; `send_message_to_manager` tool dispatches POST /staff-messages; manager pode responder via `/manager/mensagens/[threadId]`. |
| **Continuation greeting cascade** (last_action → contextual greeting) | partial | services/ai-service/services/continuation.py | Continuation tool exists com pool de templates; HomeHero recebe `message` prop e renderiza com typing animation. Slots ausentes caem em fallback round 4 C-NEW-4. **PRECISA VERIFICAR**: HomeHero está consumindo `/continuation` ou está caindo em static fallback no `/[slug]/mesa/[tableCode]`? Code path em mesa page apiGet HomeData mas não está claro se `greetingMessage` vem da continuation. |
| **Reclamação flow** (complaint → IA → manager → resolution) | yes complete | F11 + ManagerBubble + ScreenCustomerComplaintCompose/Waiting + manager.mensagens | send_complaint tool wired; ManagerBubble exibe response inset; resolve_complaint + respond_complaint tools wired do staff side; complaint thread tem ScreenCustomerComplaintWaiting. |
| **Table merge** (request → typewriter → approve duplo → confirm) | partial | F10 + cliente-table-merge.jsx | Backend wired (table-merge.service + WS table_merge.created/.approved/.rejected); ScreenCustomerHostApproveMerge wired; OverlaySalonMap wired. **Gap**: MergeTypewriterBubble não renderiza no chat do receptor (border-left mostarda 25ms/char). ScreenPostMerge / PostReject / CooldownReattempt missing. |
| **Late arrival** (identify → wait → host approve → join) | yes complete | F09 + cliente-late-arrival.jsx | LOCKED V20 — todas as telas wired e WS late_arrival.created/.approved consumidos. |
| **Cortesia/Compensation** (manager send → customer receive bubble + chip) | partial | F12 + compensate-client | Backend courtesies module shipou + cortesias UI no manager existe. **Gap**: view_courtesy tool não persiste fetch (services/ai-service/services/tools/view_courtesy.py retorna not_implemented). CourtesyArrival bubble (border-left mostarda + ícone gift seal + nome staff) **NÃO existe no customer FE**. |
| **LGPD** (show_lgpd_notice → chips → lgpd_data_request → protocol) | yes complete | F13 + assistente page | show_lgpd_notice + lgpd_data_request tools wired; lgpdNotice + lgpdProtocol rendered inline no chat; canonical text from lgpd_messages.py. |
| **Rating post-delivery** (push lockscreen → 5 stars → optional complaint redirect) | yes complete | F12 + push timer | ScreenCustomerOrderRating wired; rating ≤3 OR comment → redirect to complaint composer. |
| **Contextual chips reactive** (V13 spec — chip-action canal principal) | partial | cliente-screens-v14.jsx:25 (TOOL_REGISTRY) | F04 (chat) wired com SuggestionChip; F03 (home) **NÃO tem chips contextuais** — só PillButtons fixos "Chamar garçom" + "Ver cardápio". Canvas mostra chips dinâmicos contextuais. |
| **ContextualInputExpand inline** (animação Apple-flavor pra chips que pedem texto) | **MISSING** | cliente-tokens.jsx | Nenhum component `ContextualInputExpand` no FE. Quando chip exige `requires_text` o flow atual é submeter mensagem regular — perda de UX prevista no V13. |
| **WS push lockscreen** (iOS/Android mockups → deep-link) | partial | garcom-push.jsx + cliente-late-arrival.jsx:77 | Manager + Host + Waiter notification pages existem. Real push notifications (web push API) **PRECISA CONFIRMAR** se está shipado ou se só WS toast no app. |

---

## Prioritized punchlist (input para próxima onda)

Pesos: customer-facing > staff-facing · backend stub que precisa só wiring > pure new build · V20-locked screens NUNCA modify (only flag).

```
1. [P0 · canvas F12 cortesia] CourtesyArrival bubble missing — view_courtesy.py retorna not_implemented; backend `/courtesies` (apps/api/modules/courtesies) shipou + manager UI cria cortesias mas customer FE não tem bubble que renderize "Renata mandou uma taça de espumante" border-left mostarda + ícone gift seal. **Backend pronto, falta só FE bubble + WS event subscription**. ETA: 2-3h.

2. [P0 · canvas F03 home] ContextualChips no home — F03 canvas mostra chips contextuais (não só PillButtons fixos). Hoje `/[slug]/mesa/[tableCode]` renderiza só "Chamar garçom" + "Ver cardápio" hardcoded. Continuation API já retorna message rendered; precisa cabear chips contextuais alimentados do mesmo endpoint. ETA: 2-3h.

3. [P0 · canvas F10 table-merge] MergeTypewriterBubble no chat do receptor — table-merge.service emite WS `table_merge.created` mas o customer no chat não recebe nem renderiza a bubble typewriter. ScreenCustomerHostApproveMerge cobre a tela de approve mas o bubble inbound no /assistente chat (border-left mostarda + 25ms/char typewriter + ScrollPill "voltar ao topo") ainda não existe. ETA: 3-4h.

4. [P1 · canvas waiter ScreenOrderQuick] V20 canon waiter order entry (chips por categoria + comanda full-screen) — hoje `/garcom/pedidos` é V0 KDS-style sem chips. Canvas tem 3 abordagens (A chips, B busca, C item detail) e nenhuma está em prod V20-canon. Bloqueia waiter doing real on-floor orders. ETA: 6-8h por abordagem.

5. [P1 · canvas F10 sub] ScreenPostMerge / ScreenPostReject / ScreenCooldownReattempt — após merge aprovado/rejeitado o customer só vê TopBar mudar; canvas tem 3 telas dedicadas pra confirmar visualmente o resultado. Backend já emite WS `table_merge.approved/.rejected`. ETA: 3-4h pro conjunto.

6. [P1 · canvas host ScreenHostInbox] `/host/notifications` reusa ScreenManagerNotifications — V20 canvas tem ScreenHostInbox dedicado (layout diferente, sem mgr bottom-nav, focus em mesas+reservas). Persona check + small refactor. ETA: 2-3h.

7. [P1 · canvas cross ContextualInputExpand] V13 spec — quando chip-action exige `requires_text` (ex: "Outro motivo"), abrir input expand inline com animação Apple-flavor. Hoje cai em mensagem regular. ETA: 4-5h.

8. [P2 · canvas waiter login] ScreenLogin + ScreenForgotPassword + ScreenSetNewPassword — sem autenticação dedicada do staff. Bloqueia onboarding real de garçons. ETA: 8-12h (3 telas + backend auth flow se ainda não existir).
```

---

## V20-locked screens — DRIFT FLAG ONLY (no modify per CLAUDE.md)

These were hand-designed in Round 4 and are locked. Audit for drift only — do NOT modify.

| Screen | Status | Drift detected? |
|---|---|---|
| WelcomeModal.tsx | LOCKED | none — match V20 |
| CpfInput.tsx | LOCKED | none |
| ScreenCustomerIdentifyBeforeJoin.tsx | LOCKED | none |
| ScreenCustomerWaitingApproval.tsx | LOCKED | none |
| CallWaiterSheet.tsx | LOCKED | none |
| reclaimBanner em mesa/[tableCode]/page.tsx | LOCKED | none |
| /assistente landing branch (!chatStarted) | LOCKED | **note**: continuation API path precisa confirmar — se está caindo em static fallback é P0 (LOCKED only the visual; the wiring is free to ship). |

---

## Method notes

- 78 canvas screens/frames enumerated by grep over `const Screen*`/`const F[0-9]+` em todos os `.jsx` em `docs/design-canvas/handoff/`.
- Cross-referenced contra `apps/web-customer/src/{app,screens,components}` e `apps/web-staff/src/{app,screens,components}`.
- "Wired" = real handler com `apiPost`/`apiGet`/`router.push`/WS subscribe (not `setSuccess()` placebo).
- "Drift" = component existe mas tokens visuais não batem V20 (ex: legacy `/garcom/pedidos` usa lucide-react icons + tailwind classes não-V20).
- Stub markers identificados: 7 manager/staff screens com `stubMsg` ("em desenvolvimento Onda 3/4 backend") — listadas inline na tabela.
- 1 V20-locked path possivelmente fragile: /assistente landing continuation greeting cascade — needs runtime check whether HomeHero recebe rendered continuation or static fallback.

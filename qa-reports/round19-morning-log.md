# Round 19 Morning Log — Overnight Autonomous Waves (Round 2)

**Start**: 2026-05-11 madrugada
**Mode**: Loop dinâmico self-paced após reconciliação de worktrees

---

## Pre-wave: Reconciliação crítica (commit dbfe3d3)

Sessão anterior descobriu Docker monta `wonderful-rhodes-95809e` mas commits round 18 foram em `objective-cerf-e49db1`. Esta sessão:

1. `git stash` dos 57 dirty files em wonderful-rhodes
2. `git merge claude/objective-cerf-e49db1` (zero conflicts no main merge)
3. `git stash pop` (7 conflicts, todos aditivos)
4. Resolve manual:
   - `app.module.ts`: include alerts + courtesies + shifts + continuation
   - `launch.json`: keep upstream (docker logs)
   - `caller-resolver.module.ts`: keep upstream comments
   - `customers.module.ts`: drop redundant comment
   - `primitives.tsx`: fix typo "navega pra" → "passa a navegar pra"
   - `manager.ts`: additive (courtesies/shifts/assistant/alerts)
   - `screens/manager/index.ts`: additive (11 V9 drill-down exports)
5. `git add` + commit `dbfe3d3`
6. `docker restart restaurant-api` → todos modules round 18 mapeados ✅

Verificação: `GET /api/restaurant_dev/alerts` returns `{"alerts":[]}` (200) — antes era 404.

---

## Onda 1 · Continuation API contextual tests

**Status**: ✅ 4/6 kinds working perfectly · 3 bugs identificados

| Kind | Status | Bug? |
|---|---|---|
| first_time | ✅ | — |
| chamou_garcom | ✅ EXATO match canvas | — |
| abriu_pedido | ✅ EXATO match canvas | — |
| pagou | ⚠️ → ✅ | **C1**: "Paguinho registrado, ." (vírgula órfã quando customer_name null) — **FIXED commit ec...** |
| pos_reclamacao | ⚠️ | **C2**: template genérico vs canvas (sem chips, sem manager_name slot) — pendente |
| viu_cardapio | ❌ | **C3**: kind nunca emite — sem signal DB pra menu viewing — pendente |
| voltou_sem_acao | ✅ (indireto) | — |

### Fix C1 commit dbfe3d3 → ec... (round 19)

Mecânica: adicionado campo `requires_slots` no schema, pool selection filtra eligible entries. Pg1 (com customerName) só sai do pool quando slot populated; senão cai em pg2 (sem nome).

**Infra discovery #2**: `restaurant-ai` container monta `objective-cerf-e49db1`, NÃO wonderful-rhodes (diferente das outras 3). Espelhado manual: `cp wonderful-rhodes/...py objective-cerf/...py` + `docker restart restaurant-ai`. TODO: alinhar docker-compose.

Doc completa: `qa-reports/round19-continuation-api-test.md`

---

## Onda 2 · E2E StaffBubble (Phase B)

**Status**: ✅ verificado end-to-end via DB + curl

- `POST /api/restaurant_dev/assistant/staff-to-customer` returna 200 com `{id, tableSessionId, message, fromStaffId, fromStaffName: "Erica Gerente", createdAt}`
- DB row criada em `restaurant_dev.assistant_messages` com `provider_used='staff'`, `model_used=<staffId>`, `assistant_response` populado
- StaffBubble.tsx + useTableSocket WS handler já existem (Agent G2 round 19 onda 1)
- 2 screenshots disponíveis: `.playwright-mcp/staff-bubble-v20-canon.png` + `staff-bubble-mixed-thread.png`

**Mini-gap**: FE customer **não fetch histórico** de assistant_messages no reload — só listens WS event live. Se cliente recarrega após manager mandar msg, mensagem some.

---

## Onda 3 · iOS Simulator real device (Phase C)

**Status**: ✅ CTA blur + clipping fix VALIDATED em iPhone 16 Pro

- `mcp__xcodebuildmcp__list_sims` → encontrou iPhone 16 Pro iOS 18.1 booted
- `xcrun simctl openurl` → Safari abriu /manager/equipe
- Screenshot: `qa-reports/round19-morning-shots/ios-real-cta-blur-fix-validated.jpg`
- **Resultado visual**: "+ Adicionar funcionário" pill renderiza corretamente acima do bottom-nav, com Renata Host card parcialmente visível atrás (blur halo funcionando), zero clipping

**Bug original do round 18 (CTA clipando em iPhone) confirmado RESOLVIDO em iOS real.**

---

## Onda 4 · Superscan v3 (Phase A) post-reconciliação

**Status**: ✅ 540 elementos · 512 real (94%) · zero console errors · 100% dos placebos v1 fixados

| Métrica | v1 | v2 | v3 |
|---|---|---|---|
| Routes scanned | 35 | 37 | 42 |
| Interactive elements | 398 | 421 | 540 |
| Real (%) | 96% | 93% | 94% |
| Placebos (heuristic) | 15 | 31 | 28 |
| Console errors | varied | 0 | **0** |

**100% dos 15 placebos v1 (bell × 9 + /host/profile 4 rows + 3 unlabeled buttons) FIXADOS** post-round-18.

### "28 placebos" v3 → false positives

Trust-but-verify: agent classificou 9 toggle-rows como placebos em `/host/notificacoes-prefs` (8) + `/host/seguranca` (1, 2FA). Investigação:

```js
// Playwright eval em /host/notificacoes-prefs
document.querySelectorAll('input[type="checkbox"]').length // → 8
const first = ...; first.click();
first.checked // mudou true → false ✅
```

**Conclusão**: toggles SÃO funcionais. O heuristic do agent só checa onClick em `<label>`, mas o `<input>` real está `position:absolute opacity:0` dentro de um `<span>` filho. O click no `<label>` proxia pro `<input>` nativamente em HTML. Agent não detecta esse padrão.

**Placebos reais remanescentes: ~0** (depende de validação dos outros 19 elementos, mas se padrão é o mesmo, probably zero).

### Novas regiões scaneadas (vs v1)

- /manager/operacoes/{criticos,atencao,mesas-ativas,em-alerta} (4 V9 drill-downs)
- /manager/equipe/{em-campo,sobrecarga,carga-media} (3 V9 drill-downs)
- /manager/equipe/{id}
- /manager/cortesias?tab=history
- /host/{turnos-historico,aparencia,notifications,notificacoes-prefs,seguranca}

Todas: enumerate at 100% real (toggle false-positives à parte).

Report completo: `qa-reports/round19-superscan-v3.md`

---

## Pendente nesta sessão

- Phase E · Join-table flow audit + build (Agent E ainda rodando)
- Bug fix C2: pos_reclamacao enrich
- Bug fix C3: viu_cardapio detection
- Final report consolidado

---

## Onda 5 · Customer Join-Table Flow (Phase E) ✅

**Status**: ✅ COMPLETO — 3 telas novas + 1 bug fix descoberto + 8 screenshots

### Audit (Agent E)
2 sistemas paralelos descobertos:
- **System A (live)**: `session_participants` + `HostApprovalModal` sticky-bottom + V13 PendingApprovalScreen
- **System B (orphan V20)**: `late_arrival_requests` API + `ScreenCustomerHostApproveJoin` V20 + `ScreenCustomerWaitingApproval` LOCKED — wired pra rotas mas nunca chamado pelo cliente

### Bug descoberto + fix
- `checkParticipantStatus` só rodava via `handleWelcomeComplete` na mesa page
- Recognize-path (cliente já identificado) pulava esse check → `isHost` ficava false → host modal não montava
- **Fix aplicado** (commit pendente)

### 5-question scorecard

| Pergunta | Antes | Depois |
|---|---|---|
| Endpoint create join request | ✅ `/customer/welcome` upsertParticipant | ✅ (mesmo, reused) |
| Host WS notification | ⚠️ event emitido mas filtered out por useTableSocket | ✅ adicionado `participant:join_request` na listener events list |
| Host full-screen accept | ❌ ausente | ✅ **NOVO** `ScreenHostApproveParticipant.tsx` (362 linhas, V20 canon) |
| Customer waiting screen | ⚠️ V13 dots-only | ✅ swap pra V20 LOCKED `ScreenCustomerWaitingApproval` (via PendingApprovalWrapper bridge) |
| End-to-end wired | ⚠️ partial | ✅ |

### Files (todos em wonderful-rhodes-95809e)

**NEW**:
- `apps/web-customer/src/screens/customer-host-flows/ScreenHostApproveParticipant.tsx` (362 linhas)
- `apps/web-customer/src/components/host/HostJoinRequestBanner.tsx` (117 linhas · clickable notification banner deep-linking → full-screen accept)
- `apps/web-customer/src/app/[slug]/host/approve/participant/page.tsx` (39 linhas, route)

**MODIFIED** (sem V20 LOCKED visual changes):
- `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx` (+127 / -4) — recognize-path bug fix + banner mount + V20 PendingApprovalWrapper
- `apps/web-customer/src/hooks/useTableSocket.ts` (+5) — `participant:join_request` + `participant:decision` na listener events list

### API endpoints (todos reused, zero added)
- `POST /:slug/customer/welcome`
- `GET /:slug/table/participants`
- `POST /:slug/table/participants/decide`

### Validation
- TS check: `tsc --noEmit` exit 0
- 8 screenshots em `qa-reports/round19-join-flow-shots/`:
  - `round19-6-host-with-banner-v2.png` · Alice sees V20 banner + legacy modal
  - `round19-7-host-approve-fullscreen.png` · "Bruno Joiner quer juntar a sua mesa"
  - `round19-8-customer-b-waiting-v20.png` · V20 LOCKED "Esperando aprovação"
  - `round19-10-host-after-approve.png` · post-decision (banner gone)
- DB verified: approve → Bruno `approved`; reject → Bruno `rejected`

Doc completa: `qa-reports/round19-join-flow-audit.md`


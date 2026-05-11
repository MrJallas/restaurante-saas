# Round 19 — Overnight Autonomous Waves Log

**Started**: 2026-05-11 (overnight)
**Mode**: Self-paced dynamic loop. Each wave: pre-wave recon (canvas comparator + browser-harness superscan) → dispatch wave → validate via Playwright → commit → log.

## Constraints applied
- V20 locked files untouched (WelcomeModal, CallWaiterSheet, ScreenCustomerIdentifyBeforeJoin, ScreenCustomerWaitingApproval, /assistente landing branch !chatStarted, reclaim banner).
- Test before commit (no commit sem validação real).
- Superscan sempre via browser-harness (port 9223 isolado).
- Build, never remove placebos (round 18 rule).
- Trust-but-verify agent findings (Agent F errou 2x no round 18).

## Initial state

Round 19 Onda 1 dispatched mid-session (before loop start):
- Agent G1 (continuation API proxy backend): RUNNING
- Agent G2 (customer-side StaffBubble + WS + role=staff): RUNNING

Last commits before loop:
- 10c72f2 feat(round18): 4 host/profile sub-screens + wire ActionRows
- 3bfec95 feat(round18): notifications panel + wire bell across 13 staff routes
- 5514901 docs(round18): Onda 4 superscan — 35-route UI functional map

---


---

## 🚨 CRITICAL ARCHITECTURE DISCOVERY (loop pausado)

**Descoberto durante iteração 2** após Agente G1 retry indicar "module already existed".

### Estado real

Docker container `restaurant-api` (e `restaurant-web-staff`) está montado em
**`wonderful-rhodes-95809e`** (verified via `docker inspect`), NÃO em
`objective-cerf-e49db1` como eu havia assumido a sessão inteira.

Consequências:

1. **Todos meus commits no round 18 + onda inicial round 19 estão em `objective-cerf-e49db1`**
   (branch `claude/objective-cerf-e49db1`), mas Docker NÃO vê esses commits.
2. **`wonderful-rhodes-95809e` está em HEAD `3abe337` (round 17 mergeado)** com 56
   dirty files — esses são os arquivos que os agentes escreveram diretamente lá
   (porque o shell cwd default é wonderful-rhodes).
3. **Round 18 backend modules MISSING in running container**:
   - ❌ `apps/api/src/modules/alerts/` — NÃO existe em wonderful-rhodes
   - ❌ `apps/api/src/modules/courtesies/` — NÃO existe
   - ❌ `apps/api/src/modules/shifts/` — NÃO existe
   - ✅ `apps/api/src/modules/qr-issues/` — existe (sobrevivente)
   - ✅ `apps/api/src/modules/continuation/` — existe (pré round 19)
4. **Round 18 FE drill-downs MISSING in running container**:
   - ❌ `ScreenManagerOpsCriticos.tsx`, `OpsAtencao`, `OpsEmAlerta`, `OpsMesasAtivas`,
     `StaffEmCampo`, `StaffSobrecarga`, `StaffCargaMedia` — NÃO existem em wonderful-rhodes
   - ✅ `ScreenManagerNotifications.tsx` — existe (Agente D wrote here)
5. **Round 18 Host profile sub-screens — existem** (Agente E mirrored).
6. **Endpoints round 18 que aparentavam funcionar** (alerts, etc) só retornavam
   200 por cache do Next.js OU rota fallback.

### Validação enganosa

Os smoke tests dos Agentes B e A (e da minha verificação manual) **devem ter
sido contra estado intermediário** ou cache. Hoje (agora), confirmei:
- `curl /alerts` → 404 (não existe)
- `docker exec ls /repo/apps/api/src/modules` → sem `alerts`, `courtesies`, `shifts`

### Estado dos agentes em background quando descobri

- **Agente G1 (continuation BE retry)**: completou. Reportou "module already
  existed" — correto, continuation existe em wonderful-rhodes (pré round 19).
  Smoke test passou.
- **Agente G2 (customer StaffBubble)**: ainda rodando. Trabalho dele em
  wonderful-rhodes está direto na working tree (visible to Docker).
- **Canvas comparator**: ainda rodando. Read-only, sem impacto.

### Plano de reconciliação (pra você decidir de manhã)

Opções:

**A. Sincronizar arquivos de objective-cerf-e49db1 → wonderful-rhodes-95809e**
   ```bash
   # Copy round 18 work into wonderful-rhodes
   rsync -av --exclude='.git' \
     /Users/calebmedeiros/.../objective-cerf-e49db1/apps/api/src/modules/{alerts,courtesies,shifts}/ \
     /Users/calebmedeiros/.../wonderful-rhodes-95809e/apps/api/src/modules/
   # Same for screen files + routes
   # Then docker restart
   ```
   Pro: simples. Con: deixa wonderful-rhodes mais dirty ainda.

**B. Trocar Docker pra montar objective-cerf-e49db1**
   Editar `docker-compose.yml` source mount path + restart.
   Pro: consome o git history correto. Con: pode quebrar outras dependências.

**C. Merge `claude/objective-cerf-e49db1` em `claude/wonderful-rhodes-95809e`**
   ```bash
   cd wonderful-rhodes-95809e
   git stash push -m "agent overnight WIP"
   git merge claude/objective-cerf-e49db1
   git stash pop
   # resolve conflicts
   ```
   Pro: histórico unificado. Con: conflitos com 56 dirty files.

**D. Recomendo: hybrid — opção C com cuidado**
   Salvar dirty files → merge → reaplica. Mais limpo de longo prazo.

### Por que pausei o loop

Sem reconciliação, qualquer onda adicional pode:
- Comitar trabalho num worktree que Docker não vê
- Aparentar funcionar via cache/200 fallback
- Não testar real-state

Vou **deixar Agente G2 + canvas-comparator terminarem** (suas saídas vão pro
log) mas **não disparar Onda 2** até você acordar.

### Estado dos agentes
- G1: ✅ completed (no-op, continuation já existia)
- G2: ⏳ in-flight, writing to wonderful-rhodes (será visível ao app)
- canvas-comparator: ⏳ in-flight, read-only

### Para retomada de manhã
Decisão necessária: opção A/B/C/D para reconciliar worktrees + branches.
Recomendo D (merge claude/objective-cerf em claude/wonderful-rhodes).

---

## Canvas Comparator Output (Agent retornou)

Path do report: `qa-reports/round19-canvas-gaps-v1.md` (no objective-cerf-e49db1)

**Totais**: 78 canvas screens/frames (27 customer · 51 staff/cross).
- ~60 implementados (77%)
- 11 missing entirely
- 9 com placebo stub handlers
- 6 com visual drift

### Top 5 gaps priorizados pelo agent

1. **[P0 F12]** CourtesyArrival bubble — backend `/courtesies` existe + manager cria,
   mas customer FE não tem bubble assinado (border-left mostarda + ícone gift seal).
   ETA: 2-3h.
2. **[P0 F03]** ContextualChips no home — `/[slug]/mesa/[tableCode]` só tem 2
   PillButtons fixos; canvas mostra chips dinâmicos contextuais alimentados pela
   continuation API. ETA: 2-3h.
3. **[P0 F10]** MergeTypewriterBubble no chat do receptor — backend emite WS
   `table_merge.created` mas customer não vê typewriter bubble border-left mostarda
   25ms/char no `/assistente`. TypewriterBubble.tsx só é usado pra late-arrival.
   ETA: 3-4h.
4. **[P1 waiter]** `ScreenOrderQuick`/Search/Item V20 canon missing — `/garcom/pedidos`
   é V0 KDS-style legacy. ETA: 6-8h.
5. **[P1 F10 sub]** `ScreenPostMerge`/`PostReject`/`CooldownReattempt` missing —
   após merge customer só vê TopBar mudar, sem confirmação visual. ETA: 3-4h.

### Outras findings

- Manager screens com `stubMsg` em 7 lugares: ManagerHomeA, ManagerStaff,
  ManagerStaffDetail, ManagerStaffCargaMedia, ManagerAlertsAll, etc.
- `/host/notifications` reusa `ScreenManagerNotifications` em vez de
  ScreenHostInbox dedicado (visual drift).
- Waiter login/forgot-password missing entirely (3 telas).
- LGPD flow + late-arrival + customer-manager messaging + complaint **completos**.
- V20-locked screens íntegros (sem drift visual). ✅
- 1 risco P0 indireto: continuation greeting cascade em `/[slug]/mesa/[tableCode]`
  precisa runtime check pra confirmar não está caindo em static fallback.

⚠️ **MAS NOTA**: o report foi escrito em `objective-cerf-e49db1` (não mountado).
Conteúdo do report descreve estado de wonderful-rhodes (working tree), então
findings são válidos. Só lembrar que paths de "implementado" refletem a working
tree do wonderful-rhodes.


---

## Agent G2 (Customer StaffBubble) ✅ completou

### Files
- **New**: `apps/web-customer/src/components/ui/StaffBubble.tsx` (75 lines)
- **Modified**: `apps/web-customer/src/app/[slug]/assistente/page.tsx` (+133/-2)
- **Modified**: `apps/web-customer/src/hooks/useTableSocket.ts` (+6) — adicionou `assistant.staff_message_received` na events list (estava hardcoded a 3 events; bug encontrado pelo agente)

### Resultados
- TS errors apps/web-customer: 0 → 0 ✅
- Type union estendido com `'staff'` + fields `staffName/staffInitial/staffRole/staffCreatedAt`
- Render branch: early return pra StaffBubble antes do Bubble genérico
- WS handler com dedupe por `staff-${payload.id}` (verificado: 3× mesmo payload → 1 bubble)
- **Bonus race-fix**: customerId redirect agora lê sessionStorage como fallback quando context state não re-hidratou (real production hardening)

### V20 canon ambiguity resolved
- ManagerBubble.tsx existente usa border-l-warning (mostarda) — usado pra complaint-flow
- StaffBubble.tsx novo usa border-l-ink (preto) — match V20 §F11_Manager (cliente-journey-v20.jsx)
- Os 2 são intencionalmente sub-patterns diferentes

### Screenshots (Playwright @ 393×852)
1. `.playwright-mcp/staff-bubble-v20-canon.png` — single StaffBubble: avatar "R" + "RENATA · GERENTE" + "AGORA" + body, ink left-border, warm surface
2. `.playwright-mcp/staff-bubble-mixed-thread.png` — 4 bubble types stacked provando visual distinction

### G2 também detectou o worktree-mount issue
Agent reportou: "API container is mounted from a different worktree (wonderful-rhodes-95809e without the Round 18 staff-to-customer endpoint) and the local API was failing to boot (pre-existing CustomersModule forwardRef cycle)". Workaround via React Fiber state injection — mesma mutation que o real WS handler faria.

---

## 📋 Estado final overnight — pronto pra leitura matinal

### Quem rodou
| Agent | Mission | Status | Files |
|---|---|---|---|
| G1 retry | Continuation API proxy backend | ✅ no-op (já existia em wonderful-rhodes) | nenhum (módulo pré-existente) |
| G2 | Customer StaffBubble + WS + role=staff | ✅ completou + 2 screenshots | 1 new + 2 modified em wonderful-rhodes |
| Canvas comparator | Audit 78 V20 screens vs implementado | ✅ report 60% impl + top-5 gaps | qa-reports/round19-canvas-gaps-v1.md |

### O que está disponível pra você agora (em wonderful-rhodes, o worktree que Docker monta)
- ✅ StaffBubble component + customer assistente wiring (G2)
- ✅ Continuation API proxy (pré-existente, smoke-tested)
- ✅ /host/notifications screen (Agent D round 18)
- ✅ /host/aparencia, /host/notificacoes-prefs, /host/seguranca, /host/turnos-historico (Agent E round 18 mirrored)
- ✅ /manager/notifications screen + bell wiring (Agent D)
- ✅ chip-row scrollbar hidden (round 18 globals.css util)
- ✅ CTA blur halo fix em /manager/equipe (round 18)
- ✅ qr-issues + continuation modules (na container)

### O que MINHA história git em objective-cerf-e49db1 promete mas NÃO está em wonderful-rhodes (= não no app)
- ❌ V9 drill-down screens (em-campo/sobrecarga/carga-media/criticos/atencao/mesas-ativas/em-alerta)
- ❌ V9 route files pra essas 7 drill-downs
- ❌ alerts module (apps/api/src/modules/alerts/)
- ❌ courtesies module
- ❌ shifts module + migration 043
- ❌ Outras coisas comitadas em round 18 que dependem de Agent A/B trabalho

### Top 5 punchlist Round 19+ (do canvas comparator)
1. **[P0]** CourtesyArrival bubble customer-side (backend existe, FE missing) — 2-3h
2. **[P0]** ContextualChips dinâmicos no home `/[slug]/mesa/[tableCode]` — 2-3h
3. **[P0]** MergeTypewriterBubble customer chat — 3-4h
4. **[P1]** Waiter order screens (ScreenOrderQuick/Search/Item) — 6-8h
5. **[P1]** Post-merge confirmation screens — 3-4h

### Reconciliação (precisa decisão sua)

**Opção D (recomendada)**: merge `claude/objective-cerf-e49db1` em `claude/wonderful-rhodes-95809e` com cuidado dos 56 dirty files.

Comandos sugeridos:
```bash
cd /Users/calebmedeiros/meus_projetos/restauranteSaaS/.claude/worktrees/wonderful-rhodes-95809e

# 1. Save in-progress agent work
git stash push -m "round19-overnight-agent-WIP" --include-untracked

# 2. Try merge
git merge claude/objective-cerf-e49db1 --no-ff -m "merge round18+19 work from objective-cerf"

# 3. Resolve conflicts (provável em ScreenHostProfile, ScreenManagerProfile, primitives.tsx)

# 4. Restore stash
git stash pop

# 5. Resolve more conflicts (StaffBubble integration with whatever was in stash)

# 6. Test app at :3002/:3003

# 7. Commit final
git add -A && git commit -m "round19: reconcile worktrees + integrate G2 StaffBubble"

# 8. Restart Docker pra hot-reload pegar tudo
docker stop restaurant-api restaurant-web-staff restaurant-web-customer && docker-compose -p agent-a4ea5de55cbb3619e up -d --no-deps api web-staff web-customer
```

**Opção B (mais radical)**: trocar Docker mount via docker-compose. Eu não toquei nesse arquivo overnight.

**Opção A (paliativo)**: rsync manual dos files faltando. Não preserva git history.

### Loop status
- Loop autônomo está **PAUSADO**. Wakeup ainda agendado em ~12 min vai disparar mas instrução é "harvest only + stop".
- Sem novos agentes dispatchados.
- Sem novos commits.

### Por que parei

Continuar disparando ondas sobre o worktree errado:
- Faz commits em branch que app não vê
- "Valida" via Playwright contra cache do Next.js (200 falsos)
- Acumula problema de divergência

Melhor pausar + você reconciliar de manhã + reiniciar loop com worktree correto.


---

## Final Validation (loop wakeup final)

Playwright @ 393×852, set staffId/staffRole localStorage, navegou pra `/manager/notifications`.

**Observação confirma worktree-mount issue ao vivo**:
- Página renderiza (screen file existe em wonderful-rhodes via Agent D)
- MAS console mostra `GET /api/restaurant_dev/alerts?status=open` → **404** (rota não existe no API do container)
- WebSocket connection failed (pre-existing)

Console: 2 errors (ambos 404 do alerts endpoint), 1 warning (WS).

Screenshot: `qa-reports/round19-overnight-shots/final-notifications.png`

Isso confirma: o screen renderiza mas o backend `alerts` module (criado no round 18 batch 2, comitado em objective-cerf-e49db1) NÃO está no container porque Docker monta wonderful-rhodes-95809e.

**Reconciliação opção D (merge claude/objective-cerf-e49db1 em claude/wonderful-rhodes-95809e) trará o alerts module + V9 drill-downs pro container e resolverá os 404s.**

## 🛑 Loop encerrado

Sem ScheduleWakeup desta vez. Próxima ação fica com você (usuário) ao acordar.


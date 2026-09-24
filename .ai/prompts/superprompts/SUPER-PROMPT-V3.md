# Super-prompt v3 · retomada pós-Round 18 wave-fixes

> Substitui SUPER-PROMPT-V2 (2026-05-09). Esta versão captura o estado
> após várias ondas de bug-fix + feature-build executadas em 2026-05-09
> e 2026-05-10 (Round 18 estendido). Foco: você terá ~150 alterações em
> dirty tree e precisa entender o quadro antes de continuar.

---

## 0. TL;DR pra retomar

Antes de qualquer coisa:

1. `cd <repo>/.claude/worktrees/objective-cerf-e49db1`
2. `git status -s | wc -l` → vai dar ~116. **Não comite ainda** — review primeiro.
3. Reler `qa-reports/round18-button-audit.md` (auditoria de CTAs) e `qa-reports/round18-sticky-footer-audit.md` (auditoria de footers grudados — pode estar incompleta).
4. Containers Docker rodam apontando pra ESTA worktree (não mudar). Slug do tenant: **`restaurant_dev`**. Auth manager: localStorage `staffId=8bd06156-1fe5-4c18-a82d-43d38287ed4a` + `staffRole=manager` (Erica Gerente).
5. Próxima onda recomendada: **Onda 4 · Round 18 backend cleanups** (vip dead code, events.gateway safeJsonParse, qr-issues persistência real) — descritas no §6 abaixo.

## 1. Stack + processo

Mesma estrutura do V2:
- **Backend**: NestJS 10 (`apps/api`), Postgres multi-schema, Redis (sessions+rate), Mongo (chat).
- **Frontend**: Next.js 14 — `apps/web-customer` :3003, `apps/web-staff` :3002.
- **API**: porta 3001 com prefixo `/api`.
- **AI**: FastAPI + LM Studio :8000 (não exposto).

Docker compose project name: `agent-a4ea5de55cbb3619e`. Não recrie com nome diferente — vai conflitar com containers existentes (postgres/redis/mongo conservam state).

Postgres acessível via `docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas`. Tenant = `restaurant_dev`. Tabela mestre: `public.restaurants`.

## 2. Estado git (importante)

```
HEAD: claude/objective-cerf-e49db1 @ 3abe337 (round17 mergeado)
Dirty: ~116 arquivos modificados, ~30 untracked
```

**NÃO foi commitado ainda**. As mudanças cobrem:
- 3 migrations novas (041 staff fields, 042 courtesies, 043 staff_shifts)
- 2 módulos NestJS novos (`courtesies`, `shifts`) registrados em app.module
- Expansões em staff/staff-messages/host modules
- Fix P0 circular dep (`caller-resolver.module.ts` + `customers.module.ts` com forwardRef)
- ~12 telas novas (manager: cortesias, compensate, equipe/turnos, equipe/novo, equipe/[id], equipe/[id]/editar, alertas, timeline, kitchen-reorder, mesa/[n]; waiter: table/[id], call/[id], chamados)
- ~25 telas existentes alteradas (wiring de botões, drag-to-dismiss, error display)
- 1 fix raiz CSS: `minHeight: '100dvh'` → `height: '100dvh'` em **34 arquivos** (resolveu footer/CTA não-sticky)
- 1 fix DTO: `staff-messages.SendMessageDto.senderStaffId` virou opcional
- 2 audit reports novos em `qa-reports/`

**Antes de comitar**: rode `npx tsc --noEmit -p tsconfig.json` em `apps/api` e `apps/web-staff` pra confirmar zero novos erros TS. Os 17 erros pré-existentes (HostInboxItemDto etc) ainda estão lá — não introduzir novos.

## 3. Auth + dados de teste

Pra staff side:
```js
localStorage.setItem('staffId', '8bd06156-1fe5-4c18-a82d-43d38287ed4a');
localStorage.setItem('staffRole', 'manager');
// (Erica Gerente · role 'manager' no DB)
```

Outros staff seedados:
- Ana Garcom (`320de62c-...`) · waiter
- Bruno Garcom (`35c95cc6-...`) · waiter
- Carlos Cozinha (`787b5fea-...`) · cook
- Diana Cozinha (`70c63f26-...`) · cook
- Renata Host (`a4c89ca7-...`) · host

Mesas seedadas em `restaurant_dev.tables`: M01-M08 + M13-M15 + M22. M07 e M13 têm `active_session_id` (úteis pra testar `/manager/mesa/13` redirect → `/manager/table-menu/[sessionId]`).

API key: `<chave-de-dev-antiga-bloqueada-em-producao>` (header `x-staff-key`).

## 4. Memória persistente

Arquivos em `~/.claude/projects/-Users-calebmedeiros-meus-projetos/memory/`:
- `feedback_visual_validation.md` — sempre subir preview + screenshots
- `feedback_buttons_must_work.md` — nunca telas-zumbi (CTAs reais ou toast stub explícito)
- `feedback_systematic_button_audit.md` — spawn subagent Playwright a cada onda
- `MEMORY.md` — index (max 200 linhas)

**Leia esses 4** antes de fazer qualquer coisa visual.

## 5. Ondas concluídas (resumão pra cross-check)

| Onda | Escopo | Status |
|---|---|---|
| Wave 1A | Fix `/manager/mesa/[n]` link broken + Round 18 P0 circular dep | ✅ |
| Wave 1B | Build `/manager/cortesias` + backend courtesies module | ✅ |
| Wave 1C | Build `/manager/equipe/turnos` (ShiftEditor) | ✅ |
| Wave 1D | Build `/manager/equipe/novo` (StaffForm) + backend expand | ✅ |
| Wave 2A | Wire ~25 CTAs com onClick + toast stub (Painel/Ops/Equipe/Profile/TableMenu) | ✅ |
| Wave 2B | Drag-to-dismiss em 6 sheets | ✅ |
| Wave 2C | Shifts backend (migration 043 + module + 5 endpoints) + ShiftEditor FE wired | ✅ E2E tested |
| Onda 2 | 4 manager screens novos: StaffDetail, AlertsAll, Timeline, KitchenReorder | ✅ |
| **Sticky-footer root fix** | `minHeight: '100dvh'` → `height: '100dvh'` em 34 arquivos | ✅ |
| Onda 3 | 3 waiter screens: TableDetail, CallDetail, WaiterCalls | ✅ |
| Onda 4 | Round 18 backend cleanups | ⏳ Pendente |
| Onda 5 | F05 cardapio sheet vs route alignment | ⏳ Pendente |

## 6. Onda 4 · Round 18 backend cleanups (próximo trabalho)

Itens identificados no round 17 backlog + auditorias:

### 6.1 · P0/P1 ainda pendentes (do audit `round18-button-audit.md`)

Os botões que **não viraram toast stub** (são noop ou aguardando backend):
- `/manager/equipe/turnos` — apesar de Wave 2C ter backend completo, validar se "Duplicar pra próxima semana" usa o endpoint real `POST /shifts/duplicate-week` (estava no `onDuplicateWeek` mas pode estar simulando)
- `/manager/table-menu/[tableId]` — Imprimir/Transferir/Fechar mesa: ainda toast stub. Implementar endpoints:
  - `POST /:slug/tables/:id/print-bill` (gera receipt PDF ou pinga impressora)
  - `POST /:slug/tables/:id/transfer` body `{toTableId}`
  - `POST /:slug/sessions/:id/close` (com checklist conta paga)
- `/manager/configuracoes` — "Encerrar turno": implementar `POST /shifts/end` que cria row em `shift_history` com aggregates (vendas, mesas, etc)

### 6.2 · Round 17 backlog herdado

- **`vip.service.ts:33`** — cleanup do `customerId?` param (dead code pós round 17 fix)
- **`events.gateway.ts:349`** — migrar `JSON.parse` pra `safeJsonParse` (cosmético)
- **`qr-issues.controller.ts`** — atualmente STUB completo (`POST /qr-issues` retorna fake id, não persiste). Implementar:
  - Migration 044: criar tabela `qr_issues` (table_number, description, photo_url, reported_by_staff_id, status, created_at, resolved_at)
  - Endpoint `POST /qr-issues` real
  - Endpoint `GET /qr-issues?status=open`
- **Custom lint rule** pra detectar divergência "comentário diz X mas código faz Y" (round 17 identificou esse padrão em vip.controller)

### 6.3 · Backend pendente identificado durante Onda 2/3

- **`/manager/timeline/[orderId]`** — backend `GET /orders/:id/timeline` precisa retornar etapas + tempos reais. Schema sugerido: agregar `order_status_history` table que já existe.
- **`/manager/alertas`** — `/alerts` endpoint não existe. Schema: tabela `alerts` (sev, kind, ttl, sub, actions JSONB, dismissed_at, resolved_at). Tabela e WS event `alert.created`.
- **`/waiter/chamados`** — `/staff/calls` existe mas wirar real fetch + remove mock data.
- **MContactClientSheet** — endpoint `POST /assistant/staff-to-customer` pra manager → cliente direct messages (atualmente bate em `/staff-messages` que é staff↔staff e ignora os fields).
- **`/manager/equipe/[id]` StaffDetail** — endpoint `GET /staff/:id/performance?period=today|7d|30d` retornando KPIs agregados.

### 6.4 · Bugs cosméticos pendentes

- ScreenWaiterCalls usava HBottomNav (host) em vez de GBottomNav (waiter) — fixado nesta sessão. Validar visualmente.
- Mapa tab em `/manager/operacoes` ainda mostra MQuickActionsBar — o user pediu pra "redesenhar" (remover ou minimizar). Decisão arquitetural pendente.

## 7. Onda 5 · F05 cardápio sheet alignment

Customer-side `/[slug]/cardapio` é uma ROTA fullscreen. Canvas V20 prevê `MenuDrawer` como **bottom-sheet 68% com blur** (igual `CallWaiterSheet.tsx` já é). UX divergence — funcional, só mudança de form factor.

Implementação sugerida:
- Criar `<MenuSheet>` em `apps/web-customer/src/components/ui/` espelhando `CallWaiterSheet`
- Trigger via `/[slug]/assistente` chip "Ver cardápio" abre sheet em vez de navegar
- Manter rota `/cardapio` pra deep-link / refresh

**Atenção V20 locked**: leia `CLAUDE.md` raiz antes de mexer em customer-side. `WelcomeModal`, `ScreenCustomerIdentifyBeforeJoin`, `CallWaiterSheet` etc são intocáveis.

## 8. Auditorias importantes (reler)

### `qa-reports/round18-button-audit.md`
~80 CTAs catalogados. Tabela completa com Endpoint esperado vs observado vs DB persistiu. Detecta placebos via padrão `try { api() } catch { setSuccess() }`. Reread se for atacar Onda 4.

### `qa-reports/round18-sticky-footer-audit.md` (pode estar incompleta)
Subagent rodou auditando footers/sheets em 30+ screens via Playwright + DOM. Identifica false-affordance (drag handle sem listeners) e footer offscreen. Status: agent rodou em paralelo na sessão final, **pode ter retornado depois do contexto fechar** — verifique se o arquivo existe.

## 9. Patterns canon (não inventar de novo)

### Stub toast pattern
Pra ações sem backend ainda:
```tsx
const [stubMsg, setStubMsg] = useState<string | null>(null);
const showStub = (m: string) => {
  setStubMsg(`${m} · em desenvolvimento (Onda N backend).`);
  setTimeout(() => setStubMsg(null), 2800);
};
// JSX: <button onClick={() => showStub('Label')}> ... </button>
// Toast no fim: {stubMsg && <div role="status" style={{ position: 'fixed', bottom: 90, ...}}>{stubMsg}</div>}
```

### Tela com bottom-nav fixo + footer sticky
```tsx
<div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
  <TopBar />
  <div style={{ flex: 1, overflow: 'auto' }}>{content}</div>
  {/* CTA fixo */}
  <div style={{ padding: 14, borderTop: '1px solid ...', flexShrink: 0 }}>
    <Button>...</Button>
  </div>
  <BottomNav />
</div>
```
**NÃO** use `minHeight: '100dvh'` — em flex-column o middle cresce indefinidamente e o footer sai do viewport.

### Drag-to-dismiss sheet
```tsx
const dragStartY = useRef<number | null>(null);
const [dy, setDy] = useState(0);
const onDown = (e) => { dragStartY.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); };
const onMove = (e) => { if (dragStartY.current == null) return; setDy(Math.max(0, e.clientY - dragStartY.current)); };
const onUp = () => { if (dy > 120) onClose(); else setDy(0); dragStartY.current = null; };
// handle pill com onPointerDown/Move/Up + touchAction: 'none'
// sheet style: transform: `translateY(${dy}px)`, touchAction: 'pan-y'
```

### Path collision com StaffController wildcard
Endpoint customizado **NÃO** pode ter prefix `/:slug/staff/...` pq o `@Get(':id')` em StaffController captura. Use path direto: `/:slug/courtesies`, `/:slug/shifts`, etc. Foi assim que resolvi pra courtesies e shifts.

### UUID validation pra IDs determinísticos
Migrations seed com IDs tipo `11111111-1111-1111-1111-aaaaaaaaaaaa` (sem version bit). `@IsUUID()` (class-validator) rejeita. Use `@Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)`. Foi assim que resolvi pra `shiftId` em shifts.controller.

## 10. Workflow obrigatório (memória reforça)

1. **Toda tela nova** → screenshot via Playwright pra validar visual antes de marcar completed
2. **Todo CTA** → ou faz API real (com error display visível) ou stub toast explícito · **NUNCA** `catch { setSuccess() }`
3. **Onda nova** → spawn subagent Playwright pra audit cruzando UI ↔ DB
4. **Test data** → sempre prefix `AUDIT-` ou `STICKY-AUDIT-` ou `Teste-` e cleanup no fim

## 11. Comandos úteis

```bash
# Aplicar migrations + checar
docker logs restaurant-api --tail 30 | grep migrat

# Cleanup test data
docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -c "
  DELETE FROM restaurant_dev.staff_shift_assignments;
  DELETE FROM restaurant_dev.courtesies;
  DELETE FROM restaurant_dev.staff_messages WHERE body LIKE 'AUDIT-%' OR body LIKE 'FIX TEST%';
"

# Re-up containers (DBs preservam volumes)
docker stop restaurant-api restaurant-web-staff restaurant-web-customer restaurant-ai
docker rm restaurant-api restaurant-web-staff restaurant-web-customer restaurant-ai
docker-compose -p agent-a4ea5de55cbb3619e up -d --no-deps api web-staff web-customer ai-service

# Test API endpoint with auth
curl -s "http://localhost:3001/api/restaurant_dev/host/tables" \
  -H "x-staff-key: <chave-de-dev-antiga-bloqueada-em-producao>" \
  -H "x-staff-id: 8bd06156-1fe5-4c18-a82d-43d38287ed4a" \
  -H "x-staff-role: manager"
```

## 12. Próximas ações sugeridas (ordem de execução)

1. **Verify state** — git status, leia 2 audit reports, abra Playwright na home pra confirmar tudo renderiza
2. **Commit cleanup** — separar em 3-4 commits temáticos antes de seguir (recommendation: round18-staff-crud, round18-courtesies, round18-shifts, round18-screen-builds, round18-sticky-fix)
3. **Onda 4 batch 1** (cleanups round 17 backlog) — vip.service:33, events.gateway:349, qr-issues persistência (~1h)
4. **Onda 4 batch 2** (backend novo) — alerts module, orders timeline aggregator, manager→customer messaging (~3h)
5. **Onda 4 batch 3** (wire FE pendente) — quando endpoints da batch 2 ficarem prontos, remover toast stubs e wirar de verdade (~1h)
6. **Onda 5** — F05 cardapio sheet (~1h)
7. **Final QA** — spawn subagent re-auditando, comparar com baseline do round18-button-audit, gerar diff → última lista de itens

## 13. Coisas que NÃO se mexe

- V20 customer UI (locked no CLAUDE.md raiz — welcome, identify, waiting-approval, CallWaiterSheet, reclaim banner, /assistente landing)
- Continuation API fallback em `services/ai-service/services/continuation.py`
- Migration runner pattern em `packages/database/scripts/migrate-tenants.ts`
- Chips coverage ≥9/10 em mutation tools customer-side
- Os 3 fixes circular dep deste round 18 (caller-resolver + customers module) — não reverter `forwardRef()`, são necessários

## 13.5 · browser-harness (skill instalada nesta sessão)

Pra **próxima sessão**, browser-harness está pronto pra usar. É um harness CDP que conecta o agente direto ao Chrome — substitui Playwright MCP com 4× menos tokens.

### Estado atual

- ✅ `uv` instalado em `~/.local/bin/uv`
- ✅ `browser-harness` instalado em `~/.local/bin/browser-harness` (binary symlink)
- ✅ Repo clonado em `~/tools/browser-harness/`
- ✅ Skill registrada via import em `~/.claude/CLAUDE.md` (global · próxima sessão Claude Code já vê)
- ✅ Symlink Codex em `~/.codex/skills/browser-harness/SKILL.md`
- ✅ PATH persistido em `~/.zshrc` (`$HOME/.local/bin`)
- ⚠️ **Chrome remote debugging precisa ser habilitado antes do primeiro uso** (one-time setup manual)

### Pra primeiro uso (chrome remote debugging)

**Opção A · UI manual (recomendada · faz 1× só)**:
1. Abre Chrome
2. Navega pra `chrome://inspect/#remote-debugging`
3. Marca o checkbox "Allow remote debugging for this browser instance"
4. Click "Allow" no popup
5. Pronto. `browser-harness --doctor` agora deve mostrar "daemon alive" + connections

**Opção B · launch flag** (se quiser script automático):
```bash
# Mata Chrome rodando (cuidado com trabalho perdido!)
pkill -f "Google Chrome"
# Re-launch com debug port
open -na "Google Chrome" --args --remote-debugging-port=9222
# Set env var pro browser-harness apontar pro endpoint
export BU_CDP_WS="ws://localhost:9222"
```

### Uso (substitui Playwright MCP)

Antes (Playwright MCP):
```
mcp__playwright__browser_navigate(url)
mcp__playwright__browser_take_screenshot(...)
mcp__playwright__browser_click(...)
```

Agora (browser-harness, executa Python direto):
```bash
browser-harness -c '
new_tab("http://localhost:3002/manager")
wait_for_load()
print(page_info())
screenshot("/tmp/manager-home.png")
click("button[aria-label=\"Voltar\"]")
'
```

Helpers pre-imported: `new_tab`, `goto_url`, `wait_for_load`, `page_info`, `screenshot`, `click`, `type_text`, `eval_js`, etc. Veja `~/tools/browser-harness/SKILL.md` + `~/tools/browser-harness/interaction-skills/*.md` (connection, cookies, dialogs, dropdowns, iframes, screenshots, scrolling, shadow-dom, tabs, uploads, viewport).

### Quando usar browser-harness vs Playwright MCP

- **browser-harness**: tarefas longas/complexas que envolvem múltiplos clicks + assertions sequenciais (ex.: rodar audit completo de 80 telas). Token-efficient.
- **Playwright MCP**: tarefas pontuais (1-2 screenshots de uma tela específica), ou quando você precisa do snapshot accessibility tree pra agent navigation.

Mix os dois conforme makes sense.

### Conhecidos

- Daemon auto-starts no primeiro comando. Se travar, `browser-harness --doctor` mostra estado.
- Se Chrome estiver em multiplos profiles, daemon pode conectar no profile errado. Solução: BU_CDP_WS apontando pro endpoint específico.
- `latest release (could not reach github)` no doctor é benign — só skip update check.

## 13.6 · Audit agent findings (resolvidos parcialmente nesta sessão)

`qa-reports/round18-sticky-footer-audit.md` (15730 bytes) tem o report completo.

**Resolvidos nesta sessão**:
- ✅ P0.2 `/manager/equipe/[id]/editar` + P1.1 `/manager/equipe/novo` — `ScreenManagerStaffForm.tsx:286` agora tem `overflow:auto` + `minHeight:0`
- ✅ P0.3 `/manager/timeline/[orderId]` — CTAs `Avisar cozinha` + `Cortesia` movidos pra FORA do scroll container
- ✅ P0.1 `/manager/equipe/[id]` — CTA `Editar funcionário` extraído pra footer sticky fora do scroll
- ✅ Build fix: `MONO_FONT` exportado de `apps/web-staff/src/components/waiter/tokens.ts` (Onda 3 telas usavam)

**Pendente pra próximo chat**:
- ⏳ P1.2 `/manager/cortesias?tab=new` — "Abrir compositor" CTA. Mesmo pattern (footer dentro do scroll). Fix curto.
- ⏳ P1.3 `/host/swap` — similar. Aplicar `overflow:auto` + `minHeight:0` no middle.
- ⏳ P2 listas-menu longas (`/manager/configuracoes`, `/host/profile`, `/waiter/eu`) — accept that long lists need scroll, ou refactor pra ter footer fixo
- ⏳ Bonus bug `ScreenStaffMessages.tsx:242` — TypeError de undefined.length em `/manager/mensagens/[id]`. Adicionar guard `(messages ?? []).length`

Screenshots em `qa-reports/round18-sticky-shots/` (38 PNGs · cada bug tem antes/depois proposto).

## 14. Onde encontrar o quê

- **Memória**: `~/.claude/projects/-Users-calebmedeiros-meus-projetos/memory/`
- **Audit reports**: `qa-reports/round18-*.md`
- **Canvas spec**: `docs/design-canvas/handoff/garcom/garcom-screens-{a,b,c,d}.jsx` (V11+ manager/host/waiter); `docs/design-canvas/handoff/cliente/cliente-journey-v20.jsx` (V20 customer)
- **Tokens**: `apps/web-staff/src/components/manager/tokens.ts` (manager); `apps/web-staff/src/components/waiter/tokens.ts` (waiter)
- **API client**: `apps/web-staff/src/lib/api/manager.ts` (manager.shifts, manager.courtesies, manager.staffRoster, etc) + `apps/web-staff/src/lib/api/host.ts`
- **Migrations**: `packages/database/migrations/tenant-template/041_*.sql` em diante

## 15. Diff sumário desta sessão (referência rápida)

```
Arquivos modificados: ~80
Arquivos novos: ~30 (telas + rotas + módulos backend + migrations)
Linhas adicionadas: ~6000
Linhas removidas: ~400
```

3 audit reports gerados (em `qa-reports/`). Memória atualizada com 3 entries novos. Backend tem 9 endpoints novos + 4 modules expandidos. FE tem 12 telas novas + ~25 wired.

---

**Pronto. Boa sorte na continuação.** Se algo não bater com este documento, confia no código + git log e ignora o doc — ele é snapshot, não fonte de verdade.

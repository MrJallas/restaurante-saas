# Super-prompt v2 · text-only retomada (sem dependência de screenshots)

> Substitui o `SUPER-PROMPT-CONTINUACAO.md` original quando o objetivo é
> **bug-hunt + fixes + tests** sem visual comparison. O original tem 461
> linhas e o passo "Screenshot TODAS as rotas via Playwright" puxava
> PNGs em DPR 3x (1290×2796) que estouravam o limite de 2000px do
> many-image API → sessão travava com `An image in the conversation
> exceeds the dimension limit`.
>
> Use este prompt quando: pediu bug-fix dos últimos PRs, quer rodar
> round N+1 do audit cycle, ou quer continuar de onde o round 17 parou.
> Use o original quando: vai retomar a comparação canvas-vs-impl
> (passos 1–4 do original) — nesse caso re-tira screenshots em
> viewport-only com `deviceScaleFactor: 1`.

---

## 1. Stack

- **Backend**: NestJS 10 (`apps/api`) — multi-tenant via Postgres schemas.
- **Frontend**: Next.js 14 — `apps/web-customer` (porta 3003) +
  `apps/web-staff` (porta 3002).
- **AI service**: FastAPI + LM Studio local (`services/ai-service`,
  porta 8000).
- **Stores**: Postgres (multi-schema), Redis (sessions + idempotency +
  rate limits), Mongo (chat history).
- **Containers**: docker-compose, project name `agent-a4ea5de55cbb3619e`.

## 2. Multi-tenancy

- `public.restaurants(slug, schema_name, is_active)` é o registro mestre.
- Cada tenant tem seu próprio schema Postgres (`tenant_<slug>`).
- `TenantConnectionProvider` resolve a conexão por slug do path.
- Migrations em `packages/database/migrations/tenant-template/` rodadas
  por `packages/database/scripts/migrate-tenants.ts` no boot da API.
  Tracking via tabela `__migrations__` por schema. Pattern obrigatório:
  `IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS` (idempotência).

## 3. Auth

| Caller | Cred | Header / Cookie |
|---|---|---|
| Customer (sessão de mesa) | session_token cookie | `cookie: session_token` |
| Customer (identificado) | recognition_token cookie | `cookie: recognition_token` |
| Staff (geral) | x-staff-key + x-staff-id + x-staff-role | headers + handshake WS |

Guards principais (em `apps/api/src/common/guards/`):
- `SessionGuard` · valida session_token, popula `req.sessionData`.
- `StaffOnlyGuard` · valida x-staff-key contra `STAFF_API_KEY` env.
- `ManagerOnlyGuard` · checa `x-staff-role === 'gerente'` + DB.
- `HostOrManagerGuard` · `host` OU `gerente` (round 9 B-NEW-33).
- `StaffOrSessionGuard` · aceita ambos (KDS + customer).

`CallerResolverService` (`apps/api/src/common/services/`):
- `requireCustomerId(req)` → from cookie (throws 401 se ausente).
- `tryGetCustomerId(req)` → null se ausente.
- `requireStaffId(req)` → from x-staff-id header (throws 401).
- `requireActiveStaffId(req)` → staffId + DB cross-check (is_active=true).

## 4. Estado git

```
main: c732701 round16 (PR #40 mergeado)
HEAD desta worktree: claude/sleepy-hermann-c6868b (round17)
```

Histórico recente:
- #40 round16 · DB pool + rate-limits + JSON.parse defense + audit attribution + LGPD gate + feedback idempotency
- #39 round15 · WS join:customer cross-tenant
- #38 round14 · WS handshake tenant-slug + staff-messages membership + table-merge.reject host
- #37 round13 · staff-messages thread IDOR + complaints.forward manager-only
- #36 round12 · requireActiveStaffId wire + cookie ownership (4 P1)
- #35 round11 · host DTOs + assistant cookie + late-arrival session-pinned + payments SETNX
- #34 round10 · orders SETNX atomic + ratings IDOR + VIP guard + staffId sweep + DB ports + WS CORS env
- #33 round9 · WS auth + HostOrManagerGuard DB role + cookie secure + welcome rate-limit + Mongo camelCase
- ... rounds 3-8 anteriores

Round 17 (esta sessão, ainda não-PR): orders dto.customerId IDOR + vip
audit spoof + zone-pause endedBy fallback. Ver
[round17-bug-hunt.md](../../../docs/archive/qa/2026-05-09-bug-hunt-estatico/round17-bug-hunt.md).

## 5. Bug-hunt protocol (round N)

```
1. Ler `qa-reports/round{N-1}-bug-hunt.md` se existir — pega items
   "deferred" e "famílias-irmãs incompletas".
2. Rodar greps estáticos pra anti-patterns conhecidos (lista §6 abaixo).
3. Cross-check git log pra ver quais paths receberam atenção recente
   (= mais bugs intermediários possíveis) vs paths intocados (= bugs
   antigos sobreviveram).
4. Categorizar P0/P1/P2/P3 com critério:
   - P0 · privilege escalation, RCE, leak de dados de outro tenant
   - P1 · IDOR same-tenant, race condition em billing, audit log spoof
     com impacto financeiro
   - P2 · DoS via input não-capado, audit corruption sem $$, double-submit
   - P3 · defense-in-depth, robustness, cosmético
5. Salvar em `qa-reports/round{N}-bug-hunt.md` antes de fixar.
6. Fixar P0/P1 prioridade, P2/P3 só se trivial; o resto fica em backlog.
7. Adicionar typecheck spec em `apps/api/src/modules/round{N}-contract.spec.ts`
   (pattern de `query-utils.spec.ts` — sem Jest, plain TS asserções
   exercitáveis via tsc + ts-node).
8. `npx tsc --noEmit -p tsconfig.json` na apps/api — zero novos erros.
9. Commit no formato:
   `fix(round{N}): <one-line resumo dos fixes> (PR #X)`
```

## 6. Anti-patterns canon (greps fáceis)

```bash
# Customer IDOR via dto.customerId mass-assignment
grep -rn "dto\.customerId" apps/api/src/modules --include="*.ts" \
  | grep -v "spec\|comment\|^.*://\|IGNORADO"

# Staff audit spoof via dto.staffId
grep -rn "dto\.staffId\|dto\.startedBy\|dto\.endedBy\|dto\.senderStaffId" \
  apps/api/src/modules --include="*.ts" | grep -v "spec\|IGNORADO"

# JSON.parse sem defense (round 16 sweep)
grep -rn "JSON\.parse" apps/api/src --include="*.ts" \
  | grep -v "safe-json\|spec\|test"

# SessionGuard só sem ownership cross-check
grep -rn "@UseGuards(SessionGuard)" apps/api/src/modules --include="*.ts"

# StaffOnlyGuard sem ManagerOnlyGuard em mutações sensíveis
grep -rn "@UseGuards(StaffOnlyGuard)" apps/api/src/modules --include="*.ts" \
  | grep -v "ManagerOnlyGuard\|HostOrManagerGuard"

# TOCTOU: SELECT-then-INSERT sem UNIQUE constraint
grep -rn "SELECT.*FROM.*WHERE\|INSERT INTO" apps/api/src/modules \
  --include="*.ts" -A 3 | grep -B 3 "INSERT INTO"

# WebSocket emit pra room cross-tenant
grep -rn "this\.server\.to\|emitTo\|server\.in" apps/api/src/modules/websocket \
  --include="*.ts"

# Body parse sem MaxLength em endpoints públicos
grep -rn "@Query\|@Body" apps/api/src/modules --include="*.ts" \
  | xargs grep -L "MaxLength\|@IsUUID\|@IsIn"
```

## 7. Receita pra criar session válida (testar fixes manualmente)

```bash
# 1. Subir containers
docker-compose -p agent-a4ea5de55cbb3619e up -d

# 2. Pegar slug + tableCode dum tenant seedado (default: 'restaurante-do-zeca')
psql -h localhost -p 5433 -U postgres -d restaurant_saas \
  -c "SELECT slug FROM public.restaurants WHERE is_active LIMIT 1"

# 3. Scan QR (gera session_token)
curl -X POST 'http://localhost:3001/restaurante-do-zeca/table/scan' \
  -H 'content-type: application/json' \
  -d '{"tableCode":"M01"}' \
  -c /tmp/cookies.txt

# 4. Welcome (cria customer + recognition_token)
curl -X POST 'http://localhost:3001/restaurante-do-zeca/customer/welcome' \
  -H 'content-type: application/json' \
  -b /tmp/cookies.txt -c /tmp/cookies.txt \
  -d '{"firstName":"Teste","cpf":"11111111111"}'

# 5. Agora qualquer rota customer-side com SessionGuard funciona via -b
curl 'http://localhost:3001/restaurante-do-zeca/home' -b /tmp/cookies.txt
```

Staff: `STAFF_API_KEY` em `.env` (default seedado), pega staffId via
`SELECT id FROM tenant_<slug>.staff WHERE role='gerente' LIMIT 1`.

## 8. Tarefa pra esta sessão

Escolha um modo:

### A · Round 18 bug-hunt
1. Leia [round17-bug-hunt.md](../../../docs/archive/qa/2026-05-09-bug-hunt-estatico/round17-bug-hunt.md) seção "Backlog" e
   "Outras observações".
2. Rode os greps de §6 acima e investigue novos hits.
3. Foco recomendado round 18:
   - **Migration 039** runtime sanity (`session_token` column dropado —
     verificar zero call-sites).
   - **`events.gateway.ts:349`** migrar pra `safeJsonParse`.
   - **`vip.service.ts:33`** cleanup do `customerId?` param dead code.
   - **Endpoints intocados pelos rounds 3-17**: `qr-issues/`,
     `promotions/` (pouco audit attention).
   - **Custom lint rule** pra divergência comentário-vs-código (round
     17 achou 1 caso; provavelmente tem mais).
4. Fix P0/P1 + spec + commit como round18.

### B · Verificar round 17 em runtime
1. Subir containers (§7 acima).
2. Reproduzir B-NEW-66 antes do fix (rollback temporário) → confirmar
   bill em B com items de A.
3. Aplicar fix → confirmar bill volta pro caller.
4. Idem B-NEW-67 (audit log `set_by_customer_id`) e B-NEW-68 (path
   interno via REPL).
5. Adicionar regression tests em
   `apps/api/src/modules/round17-contract.spec.ts` se descobrir
   edge case novo.

### C · PR do round 17
1. Push branch atual.
2. `gh pr create` com título `fix(round17): orders+vip+zone-pause audit
   attribution sweep`.
3. Body: copiar [round17-bug-hunt.md](../../../docs/archive/qa/2026-05-09-bug-hunt-estatico/round17-bug-hunt.md) TL;DR +
   recomendação de priorização.

### D · Comparison canvas-vs-impl (modo visual)
**REQUER setup específico pra evitar travar a sessão**:
- `playwright.config.ts` com `deviceScaleFactor: 1`, `viewport: 393×852`.
- `await page.screenshot({ path, fullPage: false })` (NÃO fullPage).
- Save em `qa-reports/round{N}-screenshots/` (a antiga `screenshots/`
  está arquivada em `.screenshots-archive/`).
- Um screenshot por vez no contexto Claude — não bater 26+ na mesma
  request. Se precisar muitos, salve disco e use `Read` seletivo.

## 9. Coisas que NÃO se mexe (canon do CLAUDE.md raiz)

- V20 customer UI (welcome, identify-before-join, waiting-approval,
  CallWaiterSheet, reclaim banner, /assistente landing). Visual locked
  por design canvas oficial — só mexe se user pede explicitamente ou se
  for bugfix funcional sem mudança visual.
- Continuation API fallback em `services/ai-service/services/continuation.py`
  (round 4 C-NEW-4 — não revert).
- Migration runner pattern em
  `packages/database/scripts/migrate-tenants.ts`.
- Chips coverage ≥9/10 em mutation tools customer-side
  (`tests/test_tools_registry.py::test_chips_coverage_at_least_9_of_10_mutations`).

## 10. Memórias úteis (não repetir trabalho)

- `qa-reports/.screenshots-archive/` tem 72 PNGs antigas (26 com >2000px
  arquivadas). Não re-ler em massa — só `Read` individual e seletivo.
- Tests sem Jest no `apps/api`: pattern é `*.spec.ts` com export de
  função assertion + `if (require.main === module)` invoker.
- `apps/api/package.json` não tem script `test` — `npm run lint` +
  `npx tsc --noEmit -p tsconfig.json` é o ciclo de verificação.
- 17 erros TS pré-existentes no shared-types (HostInboxItemDto etc) —
  ignorar, não introduzir novos.

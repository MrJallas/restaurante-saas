# Round 3 · Bug-hunt audit (Frente B)

> Run: 2026-05-09 · paralelo aos fixes Cat 1-15 da Frente A.
> Target: descobrir bugs adicionais (queries, WS events, rotas, migrations, races, performance).

## TL;DR

7 achados novos:
- **B-NEW-1 (P1)**: complaints.service `assigned_manager_id` escrito com COALESCE sem CAS guard — race entre 2 managers simultâneos pode pisar no resultado um do outro.
- **B-NEW-2 (P2)**: ts-prune flagged 18+ exports não usados em web-customer (LIQUID_MORPH_MS, useAnimation, formatCents, etc.) — limpeza progressiva.
- **B-NEW-3 (P2)**: WS event `staff_message.read` (events.gateway:661) faz `server.emit` global sem filter por tenant — vaza envio cross-tenant em multi-tenant deploy.
- **B-NEW-4 (P2)**: web-staff `/dashboard/funcionarios` e `/dashboard/promocoes` não são linkadas em nenhum bottom-nav nem topbar — rotas órfãs (provavelmente pre-MBottomNav).
- **B-NEW-5 (P2)**: customers.cpf é único globalmente mas o seed usa CPF inválido em 5/6 — colidiria em outro tenant. Validação no /customer/welcome só checa formato, não unicidade.
- **B-NEW-6 (P3)**: `aiConfig.serviceUrl` e `apiConfig` defaults são `localhost:3000` que dentro do container Docker resolve pra localhost-do-container, não pra service. Cat 1 (round 3) cobriu ai-service via `API_BASE_URL: http://api:3001`. Falta ainda o `apps/api` configurar `AI_SERVICE_URL` no docker-compose (já tá: `AI_SERVICE_URL: http://ai-service:8000`). OK.
- **B-NEW-7 (P3)**: `apps/web-customer/src/lib/animations.ts` exporta `LIQUID_MORPH_MS` e `useAnimation` que não são usados em lugar nenhum (eram pro `ContextualInputExpand` que foi deletado em C13). Limpar.

Detalhamento abaixo.

---

## B-NEW-1 · Race condition em complaints.respond / resolve

**Severidade**: P1.

**Repro hipotético**:
1. Manager A (sim 2) e Manager B (sim 3) abrem `/manager/operacoes` simultaneamente e veem complaint pending sem `assigned_manager_id`.
2. Ambos clicam "Responder" ao mesmo tempo (~ms apart).
3. Ambas requests passam pelo `WHERE id = $3 AND status IN ('pending_review','in_progress')` — status change vai pra "responded" no commit do primeiro, mas o segundo ainda vê "in_progress" (read happened before).

**Source**: `apps/api/src/modules/complaints/complaints.service.ts:120-130`.

```sql
UPDATE complaints
   SET status = 'responded',
       response_text = $1,
       response_at = now(),
       assigned_manager_id = COALESCE($2, assigned_manager_id),
       updated_at = now()
 WHERE id = $3 AND status IN ('pending_review','in_progress')
 RETURNING *;
```

**Bug**: COALESCE preserva o `assigned_manager_id` antigo se já existir, mas sobrescreve `response_text` com a versão do segundo writer. Customer recebe resposta do segundo manager, audit trail mostra primeiro manager como "assigned".

**Fix sugerido**: usar `WHERE id = $3 AND status='pending_review' AND assigned_manager_id IS NULL` na 1ª chamada (primeiro write claim assignment), depois `WHERE id = $3 AND assigned_manager_id = $2` na resposta (só o claimed manager pode responder).

OU use SELECT FOR UPDATE NOWAIT no início da transaction pra serializar.

**Não-fix**: COALESCE é fine pra colunas idempotentes, mas `response_text` muda → race ruim.

---

## B-NEW-2 · ts-prune dead exports em web-customer (~18 itens)

**Severidade**: P2 (limpeza progressiva).

```bash
$ cd apps/web-customer && npx ts-prune | head -20
src/lib/animations.ts:139 - useAnimation
src/lib/animations.ts:36 - DOT_PULSE_MS
src/lib/animations.ts:42 - LIQUID_MORPH_MS
src/lib/animations.ts:43 - LIQUID_EASING
src/lib/animations.ts:46 - FADE_IN_UP_MS
src/lib/animations.ts:49 - SLIDE_UP_OVERLAY_MS
src/lib/format.ts:1 - formatCents
e2e/helpers/session.ts:93 - closeDrawer
...
```

**Origem**: provavelmente legacy de iterações anteriores (canvas v13/v14 → v20). Os `LIQUID_*` constants eram pro `ContextualInputExpand` que foi removido em C13.

**Fix sugerido**: 1 PR de limpeza após este (não bloqueia release).

---

## B-NEW-3 · WS `staff_message.read` global emit

**Severidade**: P2 (multi-tenant scoping).

**Source**: `apps/api/src/modules/websocket/events.gateway.ts:661`.

```typescript
this.server.emit('staff_message.read', payload);
```

Esse `server.emit` (sem `to(room)`) broadcasts pra TODOS sockets conectados, independente de tenant ou role. Em multi-tenant deploy:
- Tenant A emite read → Tenant B recebe (vaza notificação cross-tenant)
- Customer escutando outro evento na mesma conexão pode acidentalmente receber metadata da staff

**Fix sugerido**: usar `this.server.to(`tenant:${slug}`).emit(...)` como os outros emits do gateway. Adicionar tenant rooms no `handleConnection`.

---

## B-NEW-4 · Rotas órfãs em web-staff

**Severidade**: P2.

```bash
$ find apps/web-staff/src/app -name "page.tsx"
...
/dashboard/funcionarios       ← órfã
/dashboard/promocoes           ← órfã
```

`grep -rn "dashboard/funcionarios\|dashboard/promocoes" apps/web-staff/src` retorna só os arquivos `page.tsx` próprios — nenhum `<Link>` ou `router.push` aponta pra elas. São páginas pré-MBottomNav esquecidas?

**Fix sugerido**: ou (a) deletar (são placeholders de algum design antigo), ou (b) wirar em algum menu (talvez `/manager/equipe` MoreSheet?). Sugiro **a** se ninguém reivindicar até a próxima sprint.

---

## B-NEW-5 · CPF unicidade global (multi-tenant gap)

**Severidade**: P2.

**Repro**: customer com CPF X em tenant A. Mesmo CPF tenta /customer/welcome em tenant B (schema separado).

**Source**: schema `customers` é per-tenant (cada schema tem sua própria table). Mas o backend valida `cpf` só por algoritmo BR — não checa unicidade GLOBAL nem cross-tenant. Customer-host-model V16 line 90 prevê:
> "CPF existe no banco (cliente já cadastrado em outra visita ou outro tenant) → faz auto-login"

Ou seja, V16 spec assume CPF é fonte de verdade pra reconhecer cross-tenant. Implementação atual não cobre — cada tenant tem seu próprio rim de customers, e o schema isolation impede a query cross-tenant.

**Fix sugerido**: criar `public.customer_identities` central (CPF → canonical_id, name) e cada tenant referencia via FK pra esse canonical_id. Customer existente em tenant A reaparece em tenant B já reconhecido.

---

## B-NEW-6 · AI_SERVICE_URL OK · API_BASE_URL fixed em C1

Verificação resolveu. AI service tem `AI_SERVICE_URL: http://ai-service:8000` em `apps/api` env. `API_BASE_URL` foi adicionado em ai-service env via Cat 1.

---

## B-NEW-7 · Constants órfãs em animations.ts

**Severidade**: P3 (estética).

`src/lib/animations.ts` tem `LIQUID_MORPH_MS=580`, `LIQUID_EASING='cubic-bezier(...)'`, `useAnimation` hook — nenhum tem caller após C13 deletar `ContextualInputExpand`. Limpar quando convier.

---

## Performance smoke (não-medido)

Não rodei `EXPLAIN` em queries hoje (sem docker access nesta sessão). Lista pra rodar depois:

- `assistant.service.ts:getHistory` — `WHERE table_session_id = $1 AND was_blocked = false AND ($2::uuid IS NOT NULL AND customer_id = $2)`. Index `idx_assistant_messages_thread_created` (migration 030) cobre `(thread_id, created_at)` mas não `(table_session_id, was_blocked, customer_id)`. Consultar EXPLAIN pra confirmar se Postgres está usando index parcial em `was_blocked`.
- `home.service` (não vi código) — provavelmente carrega session + customer + last_orders. Caso seja lento, candidato a materialized view.

---

## Migrations vs schema real

Não rodei `\d+` em DB real, mas:
- ✅ Migration 035 conflict resolvido em C7 (renomeado pra 036)
- ✅ Migration 037 (cooldown directional) criada
- ✅ Migration 030 contém `contextual_chips` jsonb (verificado via grep)
- ⚠️ Pendente: confirmar que aplicar 037 não quebra o constraint `CHECK (a < b)` em rows existentes — o DO $$ block do 037 dropa antes mas precisa de verify em prod-like dataset

---

## Recomendação

Após este PR consolidado, abrir 3 issues separadas:
1. B-NEW-1 (P1) · race em complaints — fix no próximo sprint
2. B-NEW-3 (P2) · WS multi-tenant scoping — quando rolar deploy multi-tenant
3. B-NEW-5 (P2) · CPF cross-tenant identity — schema redesign maior, planejar dedicated

B-NEW-2/4/7 são limpeza, fazer "tag-along" no próximo PR de housekeeping.

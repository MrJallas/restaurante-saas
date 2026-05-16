# Tenant Isolation — Audit R23

**Branch:** `fix/customer-tools-and-continuation`
**Data:** 2026-05-15
**Stack alvo:** API NestJS em `http://localhost:3001/api` + Postgres 16 (port 5434 dentro do container).

---

## 1. HTTP smoke — `/api/<slug>/home`

| Cenário | Comando | HTTP | Body relevante |
|---|---|---|---|
| Slug válido **sem** `x-session-token` | `curl -s -o /dev/null -w "%{http_code}" /api/restaurant_dev/home` | **401** | `{"statusCode":401,"message":"Sessao nao encontrada. Escaneie o QR Code novamente."}` |
| Slug **inexistente** | `curl -s -o /dev/null -w "%{http_code}" /api/inexistente/home` | **404** | `{"statusCode":404,"message":"Restaurante nao encontrado."}` |
| Slug válido **com** `x-session-token` de sessão ativa do mesmo tenant | `curl -H "x-session-token: 2494fc2c-…" /api/restaurant_dev/home` | **200** | payload completo (`heroMessage`, `restaurantName`, `tableLabel`, `highlights`, …) |
| Slug **inexistente** + token válido do tenant `restaurant_dev` | `curl -H "x-session-token: 2494fc2c-…" /api/inexistente/home` | **404** | `{"statusCode":404,"message":"Restaurante nao encontrado."}` |
| Sem slug (`/api/home`) | `curl /api/home` | **404** | `{"message":"Cannot GET /api/home","error":"Not Found","statusCode":404}` (Nest router) |

> O endpoint funciona como spec'd: slug é o primeiro gate (404 → middleware) e só **depois** a sessão é validada (401 → `SessionGuard`). Tenant ausente nunca chega no resolver de sessão, e token de outro tenant não consegue "atravessar" pra schema de slug inexistente.

---

## 2. Mecânica do gate de tenant — `TenantMiddleware`

Arquivo: [`apps/api/src/modules/tenant/tenant.middleware.ts`](../../../apps/api/src/modules/tenant/tenant.middleware.ts)

- Aplicado pelo `app.module.ts` em todo path `:slug/*`.
- Resolve `req.params.slug` → `public.restaurants(slug, schema_name, is_active)`.
- Status:
  - `is_active=false` → **403** `"Restaurante inativo."`
  - slug não encontrado → **404** `"Restaurante nao encontrado."`
  - slug ausente → **400** `"Slug do restaurante nao informado."`
- **Defense-in-depth contra SQL injection no `search_path`**: rejeita `schema_name` que não case `/^[a-z_][a-z0-9_]{0,62}$/` → 500 `"Configuracao do restaurante invalida."`. Postgres não aceita `SET search_path` parametrizado; o regex é o que segura.
- Stamps em `req`: `tenantSchemaName`, `tenantSlug`, `tenantRestaurantId`. Esses três campos viram a única fonte de verdade pro resto da request.

## 3. `TenantConnectionProvider` — search_path por query

Arquivo: [`apps/api/src/modules/tenant/tenant-connection.provider.ts`](../../../apps/api/src/modules/tenant/tenant-connection.provider.ts)

- `@Injectable({ scope: Scope.REQUEST })` — instância por request, lê `tenantSchemaName` do `TenantRequest`.
- `query()`: pega `QueryRunner` fresh do pool, faz `SET search_path = '<schema>'` no MESMO runner, executa a query, `release()` no `finally`. Sem `release` ⇒ leak de conexão (comentário menciona o bug histórico que motivou a refactor).
- `transaction()`: mesmo padrão, mas `startTransaction` e o `tx.query` (passado ao callback) reusa o runner com search_path aplicado. Rollback automático em throw.
- Throw `'Schema do tenant nao encontrado no request.'` se `tenantSchemaName` ausente — bloqueia chamadas que escapem do middleware (e.g. cron, jobs, gateway sem stamping).

## 4. CallerResolverService — quem é o caller?

Arquivo: [`apps/api/src/common/services/caller-resolver.service.ts`](../../../apps/api/src/common/services/caller-resolver.service.ts)

| Método | Token source | Strict? | Saída |
|---|---|---|---|
| `requireCustomerId(req)` | cookie `recognition_token` | 401 se ausente/inválido | `customerId` (string UUID) |
| `tryGetCustomerId(req)` | cookie `recognition_token` | non-throw | `customerId \| null` |
| `requireStaffId(req)` | header `x-staff-id` | 401 se ausente/shape inválido | `staffId` |
| `requireActiveStaffId(req)` | header `x-staff-id` | 401 + cross-check `staff.is_active=true` no schema do tenant | `staffId` |
| `tryGetStaffId(req)` | header `x-staff-id` | non-throw | `staffId \| null` |

**Por que importa pra isolation**: substitui o pattern legado em ≥6 controllers que aceitavam `dto.customerId` / `dto.staffId` mass-assigned do body — atacante mandava UUID de vítima e o registro ficava em nome dela. Hoje o caller é resolvido server-side a partir do cookie/header autenticado, não do body. `requireActiveStaffId` ainda cross-checha no schema do tenant via `tenantConn.query` (UUID de staff fired/de outro tenant é rejeitado).

Usado em (lista parcial — `grep "callerResolver\." apps/api/src/modules/**/*.ts`):
- `home.controller.ts` (`tryGetCustomerId`)
- `assistant.controller.ts`, `complaints.controller.ts`, `customer-staff-messages.controller.ts`, `lgpd.controller.ts`, `late-arrival.controller.ts`, `qr-issues.controller.ts`, `waiter-calls.controller.ts`, `staff-messages.controller.ts`, `table-merge.controller.ts`, `staff-table-merge.controller.ts`, `vip.controller.ts`, `host.controller.ts`, `chat-history.controller.ts`, `order-ratings.controller.ts`, `courtesies.controller.ts`, `orders.controller.ts`, `table.controller.ts`, `feedbacks.controller.ts`.

## 5. Schemas Postgres

```text
postgres=# \dn
          List of schemas
      Name      |       Owner
----------------+-------------------
 public         | pg_database_owner
 restaurant_dev | postgres
(2 rows)
```

- `public.restaurants` é o catálogo (slug ↔ schema_name ↔ is_active). Apenas **1 row** no dev:

```text
      slug      |  schema_name   | is_active
----------------+----------------+-----------
 restaurant_dev | restaurant_dev | t
```

- O schema do tenant tem 43 tabelas isoladas (`__migrations__`, `customers`, `staff`, `orders`, `waiter_calls`, …). Verificado via `\dt restaurant_dev.*` no container postgres (port **5434** — não 5432). Não há tabelas "globais" no schema do tenant, e o schema do tenant **não** tem tabela com `restaurant_id` discriminator (isolation 100% via schema, não via row-level filter).

---

## 6. Conclusão

- 4 camadas de defesa antes de qualquer query tocar um schema:
  1. Express route shape — slug é mandatório no path (`/:slug/...`).
  2. `TenantMiddleware` — slug→`schema_name` no `public.restaurants`, valida `is_active`, regex anti-injection.
  3. `SessionGuard` (ou guards staff/customer correspondentes) — token autenticado por request.
  4. `TenantConnectionProvider` — `SET search_path` por query, com release garantido.
- `CallerResolverService` impede mass-assignment de `customerId`/`staffId` no body (P0 anteriormente).
- Slugs inexistentes retornam **404** consistentes; slug válido sem sessão retorna **401**. Nenhum caso de leak ou cross-tenant via slug observado nos endpoints testados.
- Único caveat: `is_active=false` resulta em **403**, não 404 — fingerprint do tenant é visível pra cliente externo. Aceitável (operacional precisa diferenciar "não existe" de "pausado").

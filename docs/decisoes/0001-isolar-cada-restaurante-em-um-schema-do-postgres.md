---
status: aceita
date: 2026-04-10
decision-makers: Caleb Medeiros
---

# Isolar cada restaurante em um schema do Postgres

## Contexto e problema

Uma mesma instalação atende vários restaurantes (tenants). Mesas, pedidos, clientes e equipe de um
restaurante não podem aparecer para outro. Toda rota da API já carrega o restaurante na URL
(`/api/:slug/...`), então o isolamento precisa partir desse `slug`.

## Decisão

Escolhida: "um schema do PostgreSQL por restaurante", porque isola os dados sem depender de um
filtro por restaurante escrito à mão em cada consulta.

- O schema `public` guarda só o catálogo global (`plans`, `restaurants`, `admin_users`,
  `ai_usage_daily`), com migrations próprias em `packages/database/migrations/public/`.
- `TenantMiddleware` resolve o `:slug` em `public.restaurants` (cache em memória de 5 s,
  `TENANT_LOOKUP_CACHE_TTL_MS`), responde 404 ou 403 para restaurante inexistente ou inativo e valida
  o nome do schema antes de usá-lo.
- `TenantConnectionProvider` executa `SET search_path = '<schema>'` em cada conexão da requisição.
  Tabelas globais são sempre qualificadas (`public.restaurants`).
- `packages/database/scripts/create-tenant.ts` cria o schema, aplica todas as migrations de
  `migrations/tenant-template/`, roda os seeds do template e registra o restaurante em
  `public.restaurants`.

### Consequências

- Boa, porque uma consulta sem filtro não enxerga outro restaurante: o `search_path` só aponta para o
  schema da requisição. Os tokens de sessão do cliente e da equipe também guardam o restaurante e são
  recusados em outro (`common/guards/session-revalidation.ts`, `common/auth/staff-session-token.ts`).
- Boa, porque apagar, copiar ou inspecionar um restaurante é operar um schema.
- Ruim, porque toda migration nova precisa rodar em todos os schemas. Isso levou ao runner de
  migrations no boot ([ADR 0010](0010-aplicar-migrations-idempotentes-no-boot-e-falhar-se-quebrarem.md)).
- Ruim, porque o `search_path` não aceita parâmetro e o nome do schema é interpolado no SQL. A
  validação `^[a-z_][a-z0-9_]{0,62}$` no middleware é obrigatória.
- Ruim, porque consultas ao catálogo do PostgreSQL precisam de escopo de schema. A migration 018
  procurava a constraint em todos os schemas e deixava do segundo restaurante em diante sem a
  `UNIQUE` (corrigido em 2026-07-04; o comentário está na própria migration).
- Tarefas periódicas, WebSocket e o resolvedor de QR não passam pelo middleware: percorrem os
  restaurantes ativos de `public.restaurants` e escolhem o schema por conta própria.

## Mais informações

- `apps/api/src/modules/tenant/tenant.middleware.ts` e `tenant-connection.provider.ts`
- `packages/database/scripts/create-tenant.ts`, criado no commit `02807ca` (2026-04-10, primeira
  sprint do monorepo)
- [Dados e armazenamento](../arquitetura/dados-e-armazenamento.md)

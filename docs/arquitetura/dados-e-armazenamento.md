# Dados e armazenamento

Três bancos, cada um com um papel
([ADR 0002](../decisoes/0002-usar-postgres-redis-e-mongodb-com-papeis-separados.md)):

| Banco         | Papel                                                                                        | Acesso da API                                                                     |
| ------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| PostgreSQL 16 | Dados transacionais do restaurante: mesas, sessões, pedidos, equipe, pagamentos              | SQL escrito à mão pelo `DataSource` do TypeORM, sem entidades e sem `synchronize` |
| Redis 7       | Estado curto: sessões, limites de tentativa, travas, caches                                  | `ioredis`                                                                         |
| MongoDB 7     | Históricos e trilhas: conversas, mensagens, linha do tempo da sessão, auditoria de segurança | driver oficial `mongodb`                                                          |

Nenhum deles publica porta no computador; o acesso de desenvolvimento é por `docker exec`
([Visão geral](visao-geral.md)).

## PostgreSQL: um schema por restaurante

Cada restaurante (tenant) tem o próprio schema; o schema `public` guarda só o catálogo global
([ADR 0001](../decisoes/0001-isolar-cada-restaurante-em-um-schema-do-postgres.md)).

| Onde                                              | Conteúdo                                                                                  | Migrations                                                                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `public`                                          | `plans`, `restaurants`, `admin_users`, `ai_usage_daily`. A API só lê `public.restaurants` | 4 arquivos em `packages/database/migrations/public/`, aplicados por `migrate:public` (sem tabela de controle; todos usam `IF NOT EXISTS`) |
| Um schema por restaurante (ex.: `restaurant_dev`) | Todas as tabelas operacionais                                                             | `packages/database/migrations/tenant-template/`, de `001` a `081` (não existe `051`)                                                      |

**Migrations dos restaurantes.** O runner `packages/database/scripts/migrate-tenants.ts` trata como
restaurante todo schema que não é de sistema, cria em cada um a tabela `__migrations__` e aplica, em
ordem, as migrations que faltam, cada uma na própria transação. O `command` do serviço `api` no
`docker-compose.yml` roda esse runner antes de subir a API; falha é fatal. Toda migration é
idempotente (`IF NOT EXISTS` ou bloco `DO $$ … IF NOT EXISTS`) e migration aplicada não é editada
([ADR 0010](../decisoes/0010-aplicar-migrations-idempotentes-no-boot-e-falhar-se-quebrarem.md)).

**Criar um restaurante.** `packages/database/scripts/create-tenant.ts <schema> [--slug] [--name]`
cria o schema, aplica todas as migrations, roda os seeds de `seeds/tenant-template/` (categorias e
configurações padrão) e registra o restaurante em `public.restaurants`. Os dados de demonstração
(`seeds/demo/demo_data.sql`) são aplicados à parte, com `psql`
([Ambiente local](../desenvolvimento/ambiente-local.md)).

## Multi-tenancy na requisição

1. As rotas de restaurante são `/api/:slug/...`. O `TenantMiddleware`
   (`apps/api/src/modules/tenant/tenant.middleware.ts`) busca `id, schema_name, is_active` em
   `public.restaurants` pelo slug. O resultado fica em cache na memória do processo por 5 s
   (`TENANT_LOOKUP_CACHE_TTL_MS`).
2. Slug desconhecido: 404. Restaurante inativo: 403. O nome do schema é validado com
   `^[a-z_][a-z0-9_]{0,62}$` antes de qualquer uso, porque entra no SQL como texto.
3. O `TenantConnectionProvider` (escopo de requisição) executa `SET search_path = '<schema>'` na
   conexão que atende a requisição. O `search_path` contém só o schema do restaurante; tabelas
   globais sempre aparecem qualificadas (`public.restaurants`).
4. Fora de requisição (tarefas agendadas, WebSocket, resolução do QR), o código percorre os
   restaurantes ativos e faz o `SET search_path` por conta própria.

Um schema que não está em `public.restaurants` é invisível para a API.

## Redis

| Uso                   | Exemplos de chave                                                                                                                                                                | Prazo                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Sessão da mesa        | `session:<token>`                                                                                                                                                                | 4 h                                |
| Sessão da equipe      | `staff-session:v1:<hash do token>` e o índice por funcionário `staff-sessions:v1:…`                                                                                              | 12 h (`STAFF_SESSION_TTL_SECONDS`) |
| Limites de tentativa  | `staff:pin_attempts:…`, `throttle:…`, `ws:handshake:<ip>`                                                                                                                        | janela de cada limite              |
| Travas e idempotência | `payment_lock:…`, `order_idem:…`, `sweep:auto-confirm:<slug>`                                                                                                                    | curtos                             |
| Caches                | papel da equipe (`staff-role:v1:…`, `STAFF_ROLE_CACHE_TTL_MS`), configurações públicas (`public-settings:v1:…`), cliente pelo token de reconhecimento (`recognition_customer:…`) | TTL por variável de ambiente       |
| Controle de envio     | `rating-push:<id>` (convite de avaliação)                                                                                                                                        | 30 dias                            |

Sessões, limites e travas dependem do Redis; `GET /api/ready` responde `degraded` quando ele não
responde. O serviço de IA tem Redis opcional para os conjuntos de mensagens prontas; o
compose não passa `REDIS_URL` a ele, então lá esses dados ficam na memória do processo.

## MongoDB

Regra do projeto: log e histórico novos vão para o MongoDB, não para o PostgreSQL. Os documentos
usam nomes em camelCase (`tenantId`, `customerId`, `threadId`, `expiresAt`).

| Banco                 | Coleção                                                               | Conteúdo                                                              | Retenção                                                          |
| --------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `restaurant_chat`     | `chat_threads`, `chat_messages`                                       | Conversas do cliente com o assistente                                 | 30 dias (índice TTL em `expiresAt`); até 80 conversas por cliente |
| `restaurant_chat`     | `staff_threads`, `staff_messages`                                     | Mensagens entre cliente e equipe                                      | 30 dias                                                           |
| `restaurant_chat`     | `customer_courtesy_history`                                           | Cortesias recebidas pelo cliente                                      | 30 dias                                                           |
| `restaurant_chat`     | `session_timeline`                                                    | Linha do tempo de cada sessão de mesa                                 | sem prazo (decisão de produto)                                    |
| `restaurant_chat`     | `shift_logs`                                                          | Pedidos e decisões de fim de turno                                    | sem prazo                                                         |
| `restaurant_chat`     | `manager_preferences`                                                 | Preferências do gerente                                               | sem prazo                                                         |
| `restaurant_security` | `qr_scan_events`, `scan_verification_events`, `security_audit_events` | Auditoria de QR, da verificação do primeiro scan e de ações sensíveis | 395 dias                                                          |

Os nomes dos bancos vêm de `MONGODB_DB` e `MONGODB_SECURITY_DB`. Os índices (TTL e consulta) são
criados por `packages/database/mongo-init.js`, que o container do MongoDB executa **só no primeiro
boot** de um volume vazio. Para um volume existente, rode de dentro do container da API:
`docker exec restaurant-api sh -c "cd /repo/packages/database && npm run mongo:init"` (versão
`scripts/mongo-init.ts`). O histórico de conversas também garante o
próprio índice TTL na primeira gravação.

**Linha do tempo da sessão.** O emissor de eventos do WebSocket grava cada evento relevante em
`session_timeline`, sem bloquear o fluxo. Se o MongoDB cair, os eventos daquele período se perdem;
o script `backfill:timeline` (`apps/api/scripts/`) reconstrói a linha do tempo a partir das tabelas
do PostgreSQL e pode ser rodado de novo sem duplicar. Leitura: `GET
/api/:slug/sessions/:sessionId/timeline`.

**MongoDB fora do ar.** A API sobe mesmo assim. As rotas de histórico e de linha do tempo respondem
503; o assistente continua conversando, só não grava o histórico.

## Convenções de acesso ao PostgreSQL

- **`unwrapRows` / `unwrapAffected`** (`apps/api/src/modules/tenant/query-utils.ts`): com o driver
  `pg`, um `UPDATE` ou `DELETE … RETURNING` chega como `[linhas, contagem]`, não como a lista de
  linhas. Todo `RETURNING` passa por esses helpers. Tratar o par como lista já causou recursão
  infinita e falta de memória na API.
- **`NUMERIC` e `SUM()` voltam como texto.** Converta com `Number()` na fonte: somar a string
  `'790'` com `79` produz `'79079'`. A conta faz essa conversão num lugar só
  (`BillingService`).
- **Cast explícito de parâmetro** quando o mesmo parâmetro é usado em `SET` e em `CASE`
  (`$1::varchar`); sem ele o PostgreSQL recusa com o erro 42P08
  ([Ciclo do pedido](ciclo-do-pedido.md)).

## Divergências com o texto antigo

A versão anterior deste documento (dedicada só aos logs no MongoDB) listava as coleções
`notifications_log`, `kitchen_calls`, `merge_requests_history`, `priority_requests_history` e
`complaints_archive`. Nenhuma delas é usada pelo código hoje. O esquema antigo de conversas, com
nomes em snake_case, está em
[2026-06-mongodb-chat-threads-schema-antigo.md](../archive/2026-06-mongodb-chat-threads-schema-antigo.md).

## Referências de código

- `apps/api/src/modules/tenant/` (middleware, conexão por requisição, `query-utils.ts`)
- `apps/api/src/infra/redis/redis.service.ts`, `apps/api/src/infra/mongo/mongo.service.ts`
- `apps/api/src/config/database.config.ts`
- `packages/database/` (migrations, seeds, `mongo-init.js`, `scripts/`)

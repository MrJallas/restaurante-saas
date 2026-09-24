# packages/database — schema, seeds e scripts de banco

SQL das migrations, dados iniciais, inicialização do MongoDB e scripts para criar restaurantes. Não tem
código de runtime: a API acessa o banco diretamente. Cada restaurante tem o próprio schema no
PostgreSQL ([ADR 0001](../../docs/decisoes/0001-isolar-cada-restaurante-em-um-schema-do-postgres.md));
o schema `public` guarda planos e o cadastro dos restaurantes.

## Conteúdo

```
migrations/
├── public/             # 4 migrations globais: plans, restaurants, admin_users, ai_usage_daily
└── tenant-template/    # aplicadas em cada restaurante: 001 a 081 (o número 051 não existe)
seeds/
├── tenant-template/    # categorias e configurações padrão, aplicadas ao criar um restaurante
└── demo/demo_data.sql  # restaurante de demonstração restaurant_dev
scripts/                # create-tenant, migrate-public, migrate-tenants, mongo-init, provision-staging
mongo-init.js           # índices do MongoDB no primeiro boot do container
```

## Scripts

Todos rodam com `ts-node` e leem `DATABASE_URL` (padrão `postgresql://…@localhost:5434/restaurant_saas`).
Como o Compose não publica a porta do Postgres, rode-os de dentro do container da API, que já tem a
`DATABASE_URL` da rede interna:

```bash
docker exec restaurant-api sh -c "cd /repo/packages/database && npm run migrate:public"
```

| Script                       | O que faz                                                                                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrate:public` (`migrate`) | aplica as migrations de `public` (idempotentes)                                                                                                                                                                                         |
| `create-tenant`              | `npm run create-tenant -- <schema> [--slug <slug>] [--name "<Nome>"]`: cria o schema, roda todas as migrations do `tenant-template` e os seeds padrão, e registra o restaurante em `public.restaurants` (garante um plano padrão antes) |
| `migrate:tenants`            | aplica migrations novas em todos os restaurantes (ou só em um, passando o nome)                                                                                                                                                         |
| `provision:staging`          | cria os dois restaurantes de staging (ver [staging](../../docs/operacao/staging.md))                                                                                                                                                    |
| `mongo:init`                 | recria, de forma idempotente, os índices do MongoDB num volume que já existe                                                                                                                                                            |

## Migrations

- O runner `scripts/migrate-tenants.ts` guarda o que já foi aplicado na tabela `__migrations__` de cada
  schema. No Compose, ele roda no boot da API, antes do servidor subir; falha de migration impede o
  boot, e "nenhum restaurante" só gera um aviso
  ([ADR 0010](../../docs/decisoes/0010-aplicar-migrations-idempotentes-no-boot-e-falhar-se-quebrarem.md)).
- Toda migration nova é idempotente (`IF NOT EXISTS`, `DO $$ … END $$`); migration aplicada não é
  editada. Regras em [convenções](../../docs/desenvolvimento/convencoes.md#migrations).

## Seed de demonstração

Depois de `migrate:public` e `create-tenant -- restaurant_dev --name 'Restaurante Demo'`:

```bash
docker compose exec -T postgres psql -U postgres -p 5434 -d restaurant_saas \
  -v ON_ERROR_STOP=1 -c "SET search_path = restaurant_dev" -f /dev/stdin \
  < packages/database/seeds/demo/demo_data.sql
```

O seed apaga e recria mesas (M01–M05, QRTEST91/92), equipe de demonstração (CPFs fictícios
`9000000000x`, PIN `1234`), cardápio com fotos, promoções, 7 dias de histórico e clientes fictícios.
O que cada item significa e as ressalvas de reaplicação estão em
[ambiente local](../../docs/desenvolvimento/ambiente-local.md#criar-o-restaurante-de-demonstração).

## MongoDB

- `mongo-init.js` é montado em `/docker-entrypoint-initdb.d/` e só roda quando o volume do MongoDB está
  vazio. No banco `restaurant_chat`, cria os índices de `chat_threads`, `chat_messages` e
  `customer_courtesy_history` (expiração por `expiresAt`, campos em camelCase) e os de `shift_logs`; no
  banco `restaurant_security`, os de `qr_scan_events`, `scan_verification_events` e
  `security_audit_events`, também com expiração por `expiresAt` e com nome explícito, igual ao de
  `scripts/mongo-init.ts`.
- `scripts/mongo-init.ts` (`npm run mongo:init`) faz o mesmo, de forma idempotente, sobre um volume que
  já existe (lê `MONGODB_URI`, `MONGODB_DB`, `MONGODB_SECURITY_DB`). Rode de dentro do container da API,
  porque o MongoDB não publica porta no computador.

Onde cada dado vive e por quê: [dados e armazenamento](../../docs/arquitetura/dados-e-armazenamento.md).

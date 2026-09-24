# apps/api — backend (NestJS)

API REST e servidor Socket.IO do sistema, em NestJS 11. Atende o app do cliente, o app da equipe e o
serviço de IA. É multi-restaurante: toda rota de negócio começa com `/:slug`, que aponta para o schema
Postgres do restaurante ([ADR 0001](../../docs/decisoes/0001-isolar-cada-restaurante-em-um-schema-do-postgres.md)).
Usa Redis (sessões, limites, travas, cache) e MongoDB (histórico do assistente, auditoria de
segurança, linha do tempo da mesa).

## Como roda

- **No Compose** (`docker-compose.yml`, serviço `api`, container `restaurant-api`): instala as
  dependências, aplica as migrations pendentes em todos os restaurantes e só então inicia
  `nest start --watch`. Falha de migration impede o boot
  ([ADR 0010](../../docs/decisoes/0010-aplicar-migrations-idempotentes-no-boot-e-falhar-se-quebrarem.md)).
- **Isolado:** `npm run dev --workspace @restaurant/api`, com Postgres, Redis e MongoDB acessíveis e um
  `apps/api/.env` criado a partir do `.env.example` da raiz (`src/main.ts` carrega `dotenv/config`).
  Detalhes em [ambiente local](../../docs/desenvolvimento/ambiente-local.md#rodar-um-serviço-fora-do-docker).
- **Porta** 3001 (`PORT`), prefixo global `/api`. `GET /api/health` responde se o processo está vivo;
  `GET /api/ready` confere Postgres e Redis.
- No boot, a API aborta em produção sem `STAFF_API_KEY` ou `SESSION_TOKEN_SECRET`.

## Scripts

| Script              | O que faz                                                                         |
| ------------------- | --------------------------------------------------------------------------------- |
| `dev`               | `nest start --watch`                                                              |
| `build` / `start`   | compila para `dist/` e roda o compilado                                           |
| `test`              | Jest em banda única (`jest --runInBand`)                                          |
| `lint`, `lint:fix`  | ESLint                                                                            |
| `backfill:timeline` | reconstrói a linha do tempo das mesas no MongoDB (`scripts/backfill-timeline.ts`) |

`scripts/verify-timeline.ts` confere a linha do tempo sem alterar nada (`--heal` corrige); roda com
`npx ts-node apps/api/scripts/verify-timeline.ts [--tenant <slug>]` a partir da raiz, dentro do
container.

## Variáveis que lê

`DATABASE_URL`, `REDIS_URL`, `MONGODB_URI`, `MONGODB_DB`, `MONGODB_SECURITY_DB`, `STAFF_API_KEY`,
`SESSION_TOKEN_SECRET`, `AI_SERVICE_URL`, `AI_SERVICE_API_KEY`, `AI_SERVICE_TIMEOUT_MS`,
`CORS_ORIGINS`, `CUSTOMER_APP_URL`, `CUSTOMER_WELCOME_RATE_*`, `HOME_CONTINUATION_ENABLED`, `NODE_ENV`,
entre outras. Tabela completa em
[ambiente local](../../docs/desenvolvimento/ambiente-local.md#variáveis-de-ambiente).

## Estrutura

```
src/
├── main.ts, app.module.ts, app.controller.ts   # boot, CORS, headers, /health e /ready
├── config/        # banco, Redis, serviço de IA
├── infra/         # clientes de Redis, MongoDB e serviço de IA
├── common/        # autenticação, guards, filtros de erro, segurança, utilitários
└── modules/       # 42 módulos de domínio + 4 testes transversais
scripts/           # linha do tempo: backfill, verificação e coleta compartilhada
```

Módulos por área:

- **Cliente e mesa:** `table-session`, `qr-resolver`, `scan-verification`, `customers`,
  `customer-events`, `home`, `continuation`, `smart-suggestions`, `table-merge`, `vip`, `courtesies`,
  `lgpd`, `chat-history`, `qr-issues`.
- **Pedido e conta:** `menu`, `orders`, `deliveries`, `order-ratings`, `feedbacks`, `complaints`,
  `billing`, `payments`, `promotions`.
- **Equipe e gestão:** `staff`, `staff-auth`, `staff-messages`, `customer-staff-messages`, `host`,
  `salon`, `shifts`, `waiter-calls`, `zone-pause`, `manager-account`, `alerts`, `dashboard`,
  `settings`, `session-timeline`.
- **Transversais:** `tenant`, `websocket`, `jobs` (tarefas periódicas), `security-audit`, `assistant`
  (ponte para o serviço de IA).

## Testes

152 arquivos `*.test.ts` com Jest e Supertest, sem banco real (dependências entram como fakes).
Convenções e o modelo de teste HTTP estão em [`TESTING.md`](TESTING.md). Fora do Jest ficam 6 specs
legados `*.spec.ts`, rodados à mão com ts-node: `common/guards/auth-guards`, `common/utils/geofence`,
`modules/assistant/assistant-history`, `modules/customer-staff-messages/customer-staff-messages`,
`modules/security-audit/security-audit.service` e `modules/tenant/query-utils`.
Visão geral de todas as suítes em [testes](../../docs/desenvolvimento/testes.md).

## Documentação relacionada

- [Visão geral da arquitetura](../../docs/arquitetura/visao-geral.md)
- [Dados e armazenamento](../../docs/arquitetura/dados-e-armazenamento.md)
- [Autenticação e sessões](../../docs/arquitetura/autenticacao-e-sessoes.md)
- [Tempo real](../../docs/arquitetura/tempo-real.md) e [ciclo do pedido](../../docs/arquitetura/ciclo-do-pedido.md)
- [Convenções de engenharia](../../docs/desenvolvimento/convencoes.md)

---
status: aceita
date: 2026-05-08
decision-makers: Caleb Medeiros
---

# Usar Postgres, Redis e MongoDB com papéis separados

## Contexto e problema

O sistema lida com três tipos de dado. Estado transacional do restaurante (mesas, pedidos,
pagamentos), com chave estrangeira e transação. Estado efêmero (sessões, contadores de tentativa,
travas, caches), que expira sozinho. Registros de volume alto e só de acréscimo (histórico do
assistente, auditoria de segurança, linha do tempo da sessão). Pôr tudo no Postgres misturaria
retenção, carga e ciclo de vida.

## Opções consideradas

Para a linha do tempo da sessão, a parte com alternativa registrada (2026-07-04):

- agregação SQL sobre as tabelas de origem, como modelo de leitura (histórico disponível de graça);
- event-store no MongoDB, alimentado pelos eventos que a API já emite, com backfill SQL re-executável.

## Decisão

Escolhida: "cada banco com um papel", porque cada tipo de dado fica onde o custo de guardar e de ler
é menor.

- **PostgreSQL 16**: fonte transacional, um schema por restaurante
  ([ADR 0001](0001-isolar-cada-restaurante-em-um-schema-do-postgres.md)).
- **Redis 7**: sessões do cliente (`session:<token>`, 4 h) e da equipe (12 h), limites de tentativa,
  travas de pagamento e caches com TTL.
- **MongoDB 7**: banco `restaurant_chat` com o histórico do assistente (`chat_threads`,
  `chat_messages`, 30 dias), mensagens entre cliente e equipe, linha do tempo (`session_timeline`),
  turnos e cortesias; banco `restaurant_security` com a auditoria de QR, de verificação de scan e de
  ações sensíveis da equipe.

Desde 2026-06-01, log ou histórico novo vai para o MongoDB, não para o Postgres. Na linha do tempo,
venceu o event-store no MongoDB: um "tap" no emissor de eventos grava cada evento, e o script
`backfill:timeline` reconstrói o passado a partir do SQL.

### Consequências

- Boa, porque o Postgres fica só com o que precisa de transação e integridade referencial.
- Boa, porque o MongoDB fora do ar não derruba a API: `MongoService` só avisa no boot, os endpoints de
  histórico respondem 503, a gravação da linha do tempo é fail-open e a auditoria de segurança só
  registra aviso.
- Ruim, porque evento perdido com o MongoDB fora do ar só volta pelo backfill. Os ids gerados pelo tap
  e pelo backfill tiveram de convergir para o upsert não duplicar entradas.
- Ruim, porque são três serviços para subir, fazer backup e zerar.
- A árvore de junção de mesas da linha do tempo continua vindo do Postgres (`table_merge_requests`).

## Mais informações

- Datas: Postgres e Redis desde o commit `02807ca` (2026-04-10); MongoDB entrou no commit `7ecc1d8`
  (2026-05-08); regra "log novo vai para o MongoDB" em 2026-06-01 (`1ea92fa`); event-store da linha
  do tempo no commit `b62cc1e` (2026-07-04).
- `apps/api/src/infra/mongo/mongo.service.ts`, `apps/api/src/modules/session-timeline/`,
  `apps/api/scripts/backfill-timeline.ts`, `packages/database/mongo-init.js`
- [Dados e armazenamento](../arquitetura/dados-e-armazenamento.md)

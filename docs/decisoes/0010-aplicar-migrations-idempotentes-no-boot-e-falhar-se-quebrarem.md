---
status: aceita
date: 2026-05-09
decision-makers: Caleb Medeiros
---

# Aplicar migrations idempotentes no boot e falhar se quebrarem

## Contexto e problema

Com um schema por restaurante
([ADR 0001](0001-isolar-cada-restaurante-em-um-schema-do-postgres.md)), `create-tenant.ts` aplica as
migrations só quando cria o schema. Migration adicionada depois ficava parada nos restaurantes que já
existiam, e era preciso rodar `psql` à mão em cada schema. Mais tarde apareceu o problema inverso: a
API subia com migration quebrada, porque um `|| echo` no comando do compose engolia o erro.

## Opções consideradas

- aplicar à mão em cada schema;
- aplicar automaticamente e seguir o boot mesmo se falhar;
- aplicar automaticamente e impedir o boot se falhar.

## Decisão

Escolhida: "runner automático antes da API, com falha fatal", porque schema inconsistente é pior do
que API fora do ar.

- `packages/database/scripts/migrate-tenants.ts` percorre os schemas, garante a tabela
  `__migrations__` em cada um e aplica, em ordem, os arquivos de `migrations/tenant-template/` ainda
  não registrados, cada um na sua transação. Sem nenhum restaurante, termina com sucesso.
- O `command` do serviço `api` no `docker-compose.yml` roda o runner antes de subir a API, ligado por
  `&&`: erro de migration impede a API de subir.
- Toda migration é idempotente (`IF NOT EXISTS`, blocos `DO $$ … END $$` que consultam o catálogo);
  a 037 é o exemplo.
- O runner não reaplica migration registrada. A correção para restaurante existente vai numa
  migration nova (por exemplo, a 065), não na edição da antiga.

### Consequências

- Boa, porque todo restaurante chega ao mesmo nível de schema a cada boot.
- Boa, porque `create-tenant.ts` também registra em `__migrations__`, e o runner não reaplica nada
  num restaurante recém-criado.
- Ruim, porque uma migration defeituosa impede o boot para todos os restaurantes; escrever migration
  idempotente e defensiva é obrigatório.
- Ruim, porque o runner trata como restaurante qualquer schema que não seja do sistema.
- Ruim, porque o boot não roda as migrations do schema `public` nem cria restaurante. Num banco vazio,
  é preciso `migrate:public` e `create-tenant` antes
  ([Ambiente local](../desenvolvimento/ambiente-local.md)).

## Mais informações

- Datas: runner criado no commit `4090a80` (2026-05-09); "falha é fatal" decidido em 2026-06-10,
  segundo o comentário do serviço `api` no `docker-compose.yml`.
- O comentário do topo de `migrate-tenants.ts` diz que o runner roda no `main.ts` com
  `RUN_TENANT_MIGRATIONS=1`. Não é assim: quem o chama é o compose, e essa variável não é lida em
  lugar nenhum.
- [Dados e armazenamento](../arquitetura/dados-e-armazenamento.md) ·
  [Convenções](../desenvolvimento/convencoes.md)

# Backend performance baseline - Maio 2026

Repo: `<repo>`
Data do run: 2026-05-18 America/Sao_Paulo (logs do container em 2026-05-19)
API log bruto: `artifacts/performance/api-baseline-final-2026-05-19.log`

## Instrumentacao aplicada

- `apps/api/src/main.ts`: middleware global emite JSON por request com `method`, `route`, `status`, `ms`, `query_count`, `pg_time_ms`, `redis_time_ms`, `mongo_time_ms`.
- `TenantConnectionProvider`: contabiliza queries tenant-scoped.
- `TenantMiddleware`, `QrResolverService`, `AppController.ready`: contabilizam `DataSource.query` de request HTTP.
- `RedisService`: contabiliza tempo Redis por operacao.
- `MongoService`: proxy leve para contabilizar chamadas Mongo em `Db`, `Collection` e cursores.
- `docker-compose.yml`: Postgres sobe com `log_min_duration_statement=100`; confirmado via `SHOW log_min_duration_statement`.
- MongoDB: `slowOpThresholdMs=100` mantido no default do Mongo 7.

## Atualizacao: ciclo sem mudanca de banco

Depois do baseline, foram mantidas mudancas sem DDL/migration:

- `TenantConnectionProvider`: reusa o `QueryRunner` apenas durante bursts de queries sequenciais e solta apos 5ms ocioso. Isso reduz acquire + `SET search_path` repetido sem segurar conexao durante Redis/Mongo/fetch externo.
- `TenantMiddleware`: cache em memoria de lookup `public.restaurants` por slug com TTL default de 5s (`TENANT_LOOKUP_CACHE_TTL_MS`, `0` desliga). Isso remove uma query por request durante polling.
- `HomeService.inferContinuationKind`: consolidou sinais de continuation em uma query CTE, reduzindo `GET /home` de 6-7 queries para 3 no cenario medido.
- `main.ts`: CORS `maxAge=600`, reduzindo preflight repetido no browser.

Medição sequencial, mesma sessao, 80 requests por rota:

| Rota                                | BEFORE p50 | BEFORE p95 | AFTER p50 | AFTER p95 | Query count BEFORE -> AFTER |
| ----------------------------------- | ---------: | ---------: | --------: | --------: | --------------------------: |
| GET `/api/:slug/home`               |       5.12 |      16.31 |      4.59 |      6.30 |                      7 -> 3 |
| GET `/api/:slug/table/participants` |       1.96 |       2.69 |      1.91 |      2.54 |                      3 -> 2 |
| GET `/api/:slug/host/tables`        |       2.52 |       3.14 |      2.19 |      3.55 |                      3 -> 2 |

Observacao: `host/tables` ficou mais rapido em p50 e query_count, mas p95 sequencial oscilou para cima nesse run. Em outro run apos idle release + tenant cache, antes da CTE de home, `host/tables` mediu p95 2.72ms. Mantive porque a CTE nao toca `host/tables` e o smoke concorrente continuou 100% 200.

Smoke concorrente com `xargs -P 20`, 100 requests por rota:

| Rota                                | Status      |   p50 |   p95 | Avg queries |
| ----------------------------------- | ----------- | ----: | ----: | ----------: |
| GET `/api/:slug/home`               | 100/100 200 | 21.89 | 64.42 |           3 |
| GET `/api/:slug/table/participants` | 100/100 200 |  3.50 |  6.67 |           2 |
| GET `/api/:slug/host/tables`        | 100/100 200 |  6.78 | 11.24 |        2.02 |

Comparacao do `GET /home` sob a mesma carga antes da CTE: p95 79.90ms, avg queries 6.02. Depois: p95 64.42ms, avg queries 3.

Validacao funcional apos essas mudancas:

```bash
npm run build --workspace apps/api
cd apps/web-customer
npx playwright test e2e/specs/physical-qr-heavy.spec.ts e2e/specs/restaurant-night-simulation.spec.ts --reporter=list
```

Resultado: 16 passed, 1 skipped, 0 failed.

## Teste de pressao: 80 concorrentes

Data: 2026-05-19 America/Sao_Paulo.
Carga: 60s, 80 concorrentes, 21 sessoes de mesa reutilizadas, mistura de cliente + cozinha + staff.
Logs: `artifacts/performance/load80-before-api-2026-05-19.log`, `artifacts/performance/load80-after-api-2026-05-19.log`, `artifacts/performance/load80-after-client-2026-05-19.txt`.
Observacao: o gerador escolhe endpoints por peso, entao throughput total nao e comparavel 1:1 entre runs; p95 e `query_count` por rota sao os sinais principais.

Resultado geral:

| Run                          | Total requests | Erros no cliente |
| ---------------------------- | -------------: | ---------------: |
| Antes dos ajustes sem banco  |         88.331 |                0 |
| Depois dos ajustes sem banco |         80.345 |                0 |

Comparacao pelo timing do backend (`request_timing`):

| Rota                                | BEFORE p95 | AFTER p95 |  Delta | Query count BEFORE -> AFTER |
| ----------------------------------- | ---------: | --------: | -----: | --------------------------: |
| GET `/api/:slug/home`               |     104.48 |     72.44 | -30.7% |                4.52 -> 1.78 |
| GET `/api/:slug/settings/public`    |      51.40 |      0.47 | -99.1% |                1.01 -> 0.02 |
| GET `/api/:slug/host/tables`        |      63.25 |     58.57 |  -7.4% |                2.02 -> 1.01 |
| GET `/api/:slug/table/participants` |      57.85 |     60.90 |  +5.3% |                2.01 -> 1.01 |
| GET `/api/:slug/kitchen/queue`      |      57.44 |     63.87 | +11.2% |                2.01 -> 2.01 |
| GET `/api/:slug/orders`             |      61.55 |     66.68 |  +8.3% |                2.01 -> 2.01 |

Comparacao vista pelo cliente do teste:

| Endpoint            | BEFORE p95 | AFTER p95 |  Delta |
| ------------------- | ---------: | --------: | -----: |
| customer:home       |     110.27 |     82.50 | -25.2% |
| customer:settings   |      58.41 |     14.24 | -75.6% |
| staff:host-tables   |      69.39 |     70.10 |  +1.0% |
| staff:kitchen-queue |      64.58 |     74.21 | +14.9% |

Mudancas sem DDL/migration mantidas neste ciclo:

- `SettingsService`: cache em memoria por tenant, TTL default 10s (`PUBLIC_SETTINGS_CACHE_TTL_MS`, `0` desliga).
- `HomeService`: cache em memoria para dados estaticos da home, TTL default 5s (`HOME_STATIC_CACHE_TTL_MS`), cache de continuation message por chave de parametros, TTL default 1s (`HOME_CONTINUATION_CACHE_TTL_MS`), e lookup de customer + summary em uma query.
- `TableSessionService.getParticipants`: host + participantes em uma query, removendo uma ida ao Postgres por poll.
- `HostOrManagerGuard` / `ManagerOnlyGuard`: cache em memoria de role ativa do staff por tenant/staff, TTL default 60s (`STAFF_ROLE_CACHE_TTL_MS`, `0` desliga).

Leitura do resultado: houve melhora clara em `/home` e `/settings/public`, e reducao de pressao no Postgres em `participants` e `host/tables`. Cozinha e pedidos seguem saudaveis no teste de 80 concorrentes, mas ainda ficam na faixa de p95 60-75ms sob logging intenso; o proximo ganho relevante sem banco tende a vir de reduzir polling via WebSocket ou diminuir volume de log de timing em hot path sem perder observabilidade.

Validacao funcional apos o teste de 80 concorrentes:

```bash
npm run build --workspace apps/api
cd apps/web-customer
npx playwright test e2e/specs/physical-qr-heavy.spec.ts e2e/specs/restaurant-night-simulation.spec.ts --reporter=list
```

Resultado: 16 passed, 1 skipped, 0 failed.

## Execucao Playwright

Comando:

```bash
cd apps/web-customer
npx playwright test e2e/specs/physical-qr-heavy.spec.ts e2e/specs/restaurant-night-simulation.spec.ts --reporter=list
```

Resultado do baseline inicial: 7 passed, 1 failed, 9 did not run.

Falha reproduzida:

- `physical-qr-heavy.spec.ts:390` / E2E 9: `waiterSocket` nao recebeu `scan_verification.resolved`.
- Trace: `apps/web-customer/test-results/physical-qr-heavy-E2E-9-ca-47ff1-resposta-termina-em-timeout-iphone-14/trace.zip`
- A spec `restaurant-night-simulation.spec.ts` passou no run final.
- Run mais recente apos os ajustes sem banco em 2026-05-19: 16 passed, 1 skipped, 0 failed.

## Top 20 rotas por p95

Esta tabela preserva o baseline inicial. Os AFTERs mantidos no ciclo sem DDL estao resumidos na secao "Atualizacao: ciclo sem mudanca de banco".

| Rota                                                     | Count | BEFORE p50 | BEFORE p95 | Avg ms | Avg queries | Avg pg ms | AFTER p50/p95 |
| -------------------------------------------------------- | ----: | ---------: | ---------: | -----: | ----------: | --------: | ------------- |
| POST `/api/:slug/customer/welcome`                       |    12 |      14.24 |      25.47 |  16.73 |       17.08 |      7.81 | N/A           |
| GET `/api/:slug/home`                                    |     9 |       9.49 |      23.60 |  10.79 |       10.00 |      3.36 | N/A           |
| GET `/api/:slug/late-arrival-requests`                   |     8 |       4.76 |      20.75 |   7.23 |        2.00 |      5.51 | N/A           |
| GET `/api/:slug/scan-verification-requests`              |    13 |       5.26 |      19.77 |   5.85 |        2.00 |      4.25 | N/A           |
| POST `/api/:slug/session/init` 401                       |     7 |       5.66 |      16.12 |   8.03 |        2.00 |      1.59 | N/A           |
| POST `/api/:slug/orders`                                 |     2 |      11.69 |      15.07 |  13.38 |        6.00 |      6.46 | N/A           |
| POST `/api/:slug/scan-verification-requests/:id/approve` |     3 |      12.71 |      14.46 |  12.69 |        7.00 |      6.11 | N/A           |
| GET `/api/:slug/staff/my-tables`                         |     2 |      10.36 |      13.16 |  11.76 |        2.00 |      8.40 | N/A           |
| GET `/api/qr/:token`                                     |    14 |       3.19 |      11.62 |   3.91 |        2.00 |      1.10 | N/A           |
| POST `/api/:slug/session/init` 201                       |    27 |       6.12 |      11.37 |   6.88 |        4.37 |      2.76 | N/A           |
| GET `/api/:slug/host/tables`                             |    10 |       7.03 |      10.89 |   7.93 |        3.00 |      4.82 | N/A           |
| GET `/api/:slug/waiter-calls/pending`                    |     3 |       9.25 |       9.90 |   7.25 |        2.00 |      4.50 | N/A           |
| GET `/api/:slug/table/participants`                      |    82 |       4.09 |       9.79 |   4.96 |        3.00 |      2.32 | N/A           |
| GET `/api/:slug/zone-pauses` 304                         |     3 |       5.48 |       9.55 |   5.80 |        2.00 |      1.53 | N/A           |
| GET `/api/:slug/kitchen/queue`                           |     9 |       4.03 |       9.55 |   5.05 |        3.00 |      3.21 | N/A           |
| GET `/api/:slug/zone-pauses` 200                         |    11 |       5.39 |       9.23 |   5.28 |        2.00 |      2.52 | N/A           |
| POST `/api/:slug/customer/events`                        |     9 |       5.57 |       7.03 |   5.27 |        2.22 |      2.56 | N/A           |
| PATCH `/api/:slug/orders/:orderId/status`                |     5 |       5.28 |       6.94 |   5.51 |        4.60 |      2.53 | N/A           |
| POST `/api/:slug/customer/recognize`                     |    12 |       2.20 |       6.93 |   2.92 |        2.67 |      1.08 | N/A           |
| POST `/api/:slug/scan-verification-requests/:id/reject`  |     1 |       6.42 |       6.42 |   6.42 |        6.00 |      2.56 | N/A           |

## Top 20 por count

| Rota                                                     | Count |   p50 |   p95 | Avg ms | Avg queries |
| -------------------------------------------------------- | ----: | ----: | ----: | -----: | ----------: |
| GET `/api/:slug/table/participants`                      |    82 |  4.09 |  9.79 |   4.96 |        3.00 |
| POST `/api/:slug/session/init` 201                       |    27 |  6.12 | 11.37 |   6.88 |        4.37 |
| GET `/api/:slug/settings/public`                         |    24 |  1.74 |  3.09 |   1.97 |        2.00 |
| GET `/api/:slug/waiter-calls/active`                     |    16 |  2.98 |  5.49 |   3.37 |        2.00 |
| GET `/api/qr/:token`                                     |    14 |  3.19 | 11.62 |   3.91 |        2.00 |
| GET `/api/:slug/scan-verification-requests`              |    13 |  5.26 | 19.77 |   5.85 |        2.00 |
| POST `/api/:slug/customer/recognize`                     |    12 |  2.20 |  6.93 |   2.92 |        2.67 |
| POST `/api/:slug/customer/welcome`                       |    12 | 14.24 | 25.47 |  16.73 |       17.08 |
| GET `/api/:slug/zone-pauses`                             |    11 |  5.39 |  9.23 |   5.28 |        2.00 |
| GET `/api/:slug/host/tables`                             |    10 |  7.03 | 10.89 |   7.93 |        3.00 |
| GET `/api/:slug/home`                                    |     9 |  9.49 | 23.60 |  10.79 |       10.00 |
| POST `/api/:slug/customer/events`                        |     9 |  5.57 |  7.03 |   5.27 |        2.22 |
| GET `/api/:slug/kitchen/queue`                           |     9 |  4.03 |  9.55 |   5.05 |        3.00 |
| GET `/api/:slug/late-arrival-requests`                   |     8 |  4.76 | 20.75 |   7.23 |        2.00 |
| POST `/api/:slug/session/init` 401                       |     7 |  5.66 | 16.12 |   8.03 |        2.00 |
| GET `/api/:slug/orders/:orderId`                         |     5 |  4.53 |  5.25 |   3.90 |        2.00 |
| PATCH `/api/:slug/orders/:orderId/status`                |     5 |  5.28 |  6.94 |   5.51 |        4.60 |
| GET `/api/:slug/scan-verification-requests/:id`          |     4 |  1.83 |  2.27 |   2.01 |        2.00 |
| GET `/api/:slug/waiter-calls/pending`                    |     3 |  9.25 |  9.90 |   7.25 |        2.00 |
| POST `/api/:slug/scan-verification-requests/:id/approve` |     3 | 12.71 | 14.46 |  12.69 |        7.00 |

## Top 20 por impacto

Impacto = `avg_ms * count`.

| Rota                                                     | Count |   p95 | Avg ms | Impact ms | Avg queries |
| -------------------------------------------------------- | ----: | ----: | -----: | --------: | ----------: |
| GET `/api/:slug/table/participants`                      |    82 |  9.79 |   4.96 |    406.41 |        3.00 |
| POST `/api/:slug/customer/welcome`                       |    12 | 25.47 |  16.73 |    200.78 |       17.08 |
| POST `/api/:slug/session/init` 201                       |    27 | 11.37 |   6.88 |    185.63 |        4.37 |
| GET `/api/:slug/home`                                    |     9 | 23.60 |  10.79 |     97.09 |       10.00 |
| GET `/api/:slug/host/tables`                             |    10 | 10.89 |   7.93 |     79.27 |        3.00 |
| GET `/api/:slug/scan-verification-requests`              |    13 | 19.77 |   5.85 |     76.03 |        2.00 |
| GET `/api/:slug/zone-pauses`                             |    11 |  9.23 |   5.28 |     58.03 |        2.00 |
| GET `/api/:slug/late-arrival-requests`                   |     8 | 20.75 |   7.23 |     57.82 |        2.00 |
| POST `/api/:slug/session/init` 401                       |     7 | 16.12 |   8.03 |     56.22 |        2.00 |
| GET `/api/qr/:token`                                     |    14 | 11.62 |   3.91 |     54.73 |        2.00 |
| GET `/api/:slug/waiter-calls/active`                     |    16 |  5.49 |   3.37 |     53.88 |        2.00 |
| POST `/api/:slug/customer/events`                        |     9 |  7.03 |   5.27 |     47.44 |        2.22 |
| GET `/api/:slug/settings/public`                         |    24 |  3.09 |   1.97 |     47.19 |        2.00 |
| GET `/api/:slug/kitchen/queue`                           |     9 |  9.55 |   5.05 |     45.49 |        3.00 |
| POST `/api/:slug/scan-verification-requests/:id/approve` |     3 | 14.46 |  12.69 |     38.08 |        7.00 |
| POST `/api/:slug/customer/recognize`                     |    12 |  6.93 |   2.92 |     35.08 |        2.67 |
| PATCH `/api/:slug/orders/:orderId/status`                |     5 |  6.94 |   5.51 |     27.54 |        4.60 |
| POST `/api/:slug/orders`                                 |     2 | 15.07 |  13.38 |     26.76 |        6.00 |
| GET `/api/:slug/staff/my-tables`                         |     2 | 13.16 |  11.76 |     23.52 |        2.00 |
| GET `/api/:slug/waiter-calls/pending`                    |     3 |  9.90 |   7.25 |     21.74 |        2.00 |

## Rotas com query_count > 5

| Rota                                                     | Count | Avg queries | Max queries |   p95 |
| -------------------------------------------------------- | ----: | ----------: | ----------: | ----: |
| POST `/api/:slug/customer/welcome`                       |    12 |       17.08 |          19 | 25.47 |
| POST `/api/:slug/customer/recognize`                     |    12 |        2.67 |          11 |  6.93 |
| GET `/api/:slug/home`                                    |     9 |       10.00 |          10 | 23.60 |
| POST `/api/:slug/scan-verification-requests/:id/approve` |     3 |        7.00 |           7 | 14.46 |
| PATCH `/api/:slug/orders/:orderId/status`                |     5 |        4.60 |           7 |  6.94 |
| POST `/api/:slug/scan-verification-requests/:id/reject`  |     1 |        6.00 |           6 |  6.42 |
| POST `/api/:slug/orders`                                 |     2 |        6.00 |           6 | 15.07 |

## DB-bound por media de pg_time_ms

| Rota                                            | Count | Avg ms | Avg pg ms |   Pg % |   p95 |
| ----------------------------------------------- | ----: | -----: | --------: | -----: | ----: |
| GET `/api/:slug/late-arrival-requests`          |     8 |   7.23 |      5.51 | 76.25% | 20.75 |
| GET `/api/:slug/scan-verification-requests`     |    13 |   5.85 |      4.25 | 72.67% | 19.77 |
| GET `/api/:slug/staff/my-tables`                |     2 |  11.76 |      8.40 | 71.43% | 13.16 |
| GET `/api/:slug/scan-verification-requests/:id` |     4 |   2.01 |      1.30 | 64.84% |  2.27 |
| GET `/api/:slug/kitchen/queue`                  |     9 |   5.05 |      3.21 | 63.49% |  9.55 |
| GET `/api/:slug/waiter-calls/pending`           |     3 |   7.25 |      4.50 | 62.14% |  9.90 |
| GET `/api/:slug/host/tables`                    |    10 |   7.93 |      4.82 | 60.83% | 10.89 |
| PATCH `/api/:slug/orders/:orderId/confirm`      |     2 |   5.31 |      3.03 | 57.06% |  6.27 |

## Slow Postgres statements

`docker logs restaurant-postgres | rg 'duration:|statement:'` nao retornou statements acima de 100ms durante o run final. Portanto nao houve `EXPLAIN ANALYZE` obrigatorio por slow log.

EXPLAINs manuais para hotspots suspeitos:

- `GET /kitchen/queue`: 0.410ms execution, 27 shared hits, sem slow query; `idx_orders_kitchen_queue` ja existe em `047_kitchen_reorder.sql`.
- `GET /late-arrival-requests`: 2.337ms execution, 13 shared hits + 6 reads, seq scan por tabela pequena (16 rows).
- `GET /scan-verification-requests`: 0.208ms execution, 10 shared hits, tabela pequena (2 rows).

## Ciclos de fix mantidos

| Candidato                                                                                         | BEFORE                                                   | AFTER                                 | Resultado                                                                                         |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Cache em memoria de `GET /settings/public` por tenant, TTL 10s                                    | p95 backend 51.40ms, avg queries 1.01                    | p95 backend 0.47ms, avg queries 0.02  | Mantido. Maior ganho isolado sem banco.                                                           |
| Home: dados estaticos em cache TTL 5s, continuation cache TTL 1s, customer + summary em uma query | p95 backend 104.48ms, avg queries 4.52                   | p95 backend 72.44ms, avg queries 1.78 | Mantido. Reduziu p95 ~31% e baixa pressao no Postgres/AI-service.                                 |
| `GET /table/participants`: juntar host + participantes em uma query                               | p95 backend 57.85ms, avg queries 2.01                    | p95 backend 60.90ms, avg queries 1.01 | Mantido com observacao: p95 misto ficou ruidoso, mas remove uma query do endpoint mais frequente. |
| Guards `HostOrManager`/`ManagerOnly`: role ativa em cache em memoria TTL 60s                      | `GET /host/tables` p95 backend 63.25ms, avg queries 2.02 | p95 backend 58.57ms, avg queries 1.01 | Mantido. Ganha pouco em latencia, mas reduz DB em polling staff.                                  |

## Indices criados

Nenhum indice novo foi mantido neste ciclo. O Postgres nao registrou statements >100ms, e os EXPLAINs manuais nao justificaram DDL sem carga maior.

Indices existentes relevantes confirmados:

- `idx_orders_kitchen_queue ON orders(priority_rank DESC, created_at ASC) WHERE status NOT IN ('delivered', 'cancelled', 'pending_confirmation')`
- `idx_scan_verification_status ON scan_verification_requests(status, requested_at DESC)`
- `idx_scan_verification_table ON scan_verification_requests(table_id, requested_at DESC)`
- `idx_late_arrival_status ON late_arrival_requests(status)`
- `idx_late_arrival_ttl_expires_at ON late_arrival_requests(ttl_expires_at) WHERE status = 'pending'`

## N+1 / roundtrips corrigidos

Mantido apos o ciclo sem DDL:

- `apps/api/src/modules/home/home.service.ts`: `inferContinuationKind` deixou de fazer ate 4 queries sequenciais para pagamentos, pedido recente, evento de menu e chamado de garcom; agora faz uma CTE unica e preserva a ordem de decisao.
- `apps/api/src/modules/home/home.service.ts`: dados estaticos da home saem de cache curto por tenant; customer + `customer_consumption_summary` agora saem de uma query.
- `apps/api/src/modules/table-session/table-session.service.ts`: `getParticipants` deixou de buscar `table_sessions.host_customer_id` separadamente; a query principal ja traz o host junto dos participantes.
- `apps/api/src/modules/settings/settings.service.ts`: `GET /settings/public` sai de cache curto por tenant.
- `apps/api/src/common/guards/staff-role-cache.ts`: guards de host/manager deixam de consultar `staff` em todo poll enquanto o TTL esta valido.

Ainda suspeitos:

- `POST /customer/welcome`: avg 17.08 queries, max 19. Causa provavel: fluxo de entrada fisica combina customer lookup/upsert, visit idempotente, `session_participants`, `table_qr_releases`, `scan_verification_requests` e audit Mongo. Precisa ciclo dedicado separado para preservar os fluxos de QR fisico, que passaram no Playwright apos este ciclo.
- `POST /customer/welcome`: continuar decompondo `CustomersService.welcome` + `TableSessionService.upsertParticipant` em ciclo separado; nao mexido neste ciclo para preservar os fluxos de QR fisico.

## Polls trocados por WebSocket

Nenhum poll foi trocado por WebSocket neste ciclo. A prioridade ficou em baseline e medicao; tambem ha regra de nao tocar UI/V20 locked.

Polls observados no staff:

- `/host/tables`: polling no host home.
- `/kitchen/queue`: polling a cada 5s.
- `/waiter-calls/pending`: polling a cada 5s.
- `/alerts`: usado por telas de manager/operacoes.

## Hotspots nao corrigidos

- `POST /customer/welcome`: maior p95 e query_count. Proximo ciclo deve decompor `CustomersService.welcome` + `TableSessionService.upsertParticipant` e medir uma mudanca por vez.
- `GET /home`: melhorou p95 no teste de 80 concorrentes, mas ainda e o maior impacto agregado. Proximo ciclo deve medir AI-service e Redis separadamente.
- `GET /late-arrival-requests`: DB-bound no log da API, mas EXPLAIN em tabela pequena nao mostrou gargalo. Candidato futuro: indice `(created_at DESC)` ou `(status, created_at DESC)` se a tabela crescer e o filtro/status aparecer nos traces.
- `GET /scan-verification-requests`: DB-bound no log da API, mas EXPLAIN pequeno. Candidato futuro: alinhar indice a `ORDER BY created_at DESC` se volume crescer.
- `GET /host/tables`: cache de role removeu uma query do guard, mas a query principal continua polled. Proximo ganho sem banco e trocar o refresh de 5s por eventos WS/invalidacao server-driven.
- `GET /kitchen/queue`: p95 9.55ms, query_count 3, sem slow statement. O indice de queue ja existe; continuar monitorando com mais dados de orders.

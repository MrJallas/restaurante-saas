# Gerente Timeline Real QA

Branch: `codex/prompt-09-gerente-timeline-real`

## Ambiente

- API temporaria da worktree: `http://localhost:3101/api`
- Web-staff temporario da worktree: `http://localhost:3102`
- Tenant: `restaurant_dev`
- Login real de gerente: `Gerente Demo`, CPF `90000000001`, PIN `1234`
- Pedido validado: `dbd9fbec-f5b5-461a-9310-16eff538ca89`

## Evidencias

- `01-timeline-before-status-change.png`: timeline abriu como gerente real, sem `DADOS MOCK`, sem `em desenvolvimento`, sem CTA `Avisar cozinha`.
- `02-api-timeline-before.json`: resposta real do `GET /orders/:orderId/timeline` antes da mudanca.
- `03-db-order-status-history-before.txt`: `order_status_history` antes da mudanca.
- `04-auth-missing-response.txt`: erro de auth estruturado com `{ message_user, code }`.
- `05-status-update-response.json`: transicao real `received -> in_progress`.
- `06-api-timeline-after.json`: timeline retornou duas transicoes reais depois da mudanca.
- `07-db-order-status-history-after.txt`: `order_status_history` bate com os eventos renderizados.
- `08-timeline-after-status-change.png`: UI renderizou `Confirmado` e `Em preparo` com responsaveis reais.
- `09-dom-after-status-change.txt`: snapshot DOM final.

## Resultado

- PASS: timeline usa endpoint real e renderiza eventos de `order_status_history`.
- PASS: hero usa mesa, status atual, valor e responsavel real quando disponivel.
- PASS: timeline mudou apos transicao real de status.
- PASS: bloco de chamados mockados e CTA sem backend deterministico foram removidos.
- PASS: erro sem `x-staff-id` nao vazou texto tecnico; resposta foi `AUTH_MISSING`.

## Observacao

Nao validei clique de origem por Operacao/Mesa porque a tela atual nao expoe link ou acao para `/manager/timeline/[orderId]`; a validacao foi por navegacao direta com pedido real.

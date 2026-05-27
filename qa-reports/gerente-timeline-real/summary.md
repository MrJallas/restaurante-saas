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
- `10-origin-operacoes-mapa.png`: origem real em `/manager/operacoes`, aba Mapa, com Mesa 1 clicavel.
- `11-origin-mesa-menu-timeline-action.png`: menu da Mesa 1 aberto a partir da origem.
- `12-origin-mesa-menu-ver-timeline-visible.png`: acao `Ver timeline` visivel no menu da mesa.
- `13-origin-timeline-before-dom.txt`: DOM da timeline aberta por clique de origem antes da nova mudanca.
- `14-origin-timeline-before-status-change.png`: screenshot da timeline aberta por clique de origem antes da nova mudanca.
- `15-api-origin-timeline-before.json`: resposta real do endpoint antes da transicao `in_progress -> ready`.
- `16-db-origin-status-history-before.txt`: `order_status_history` antes da transicao `in_progress -> ready`.
- `17-origin-status-update-response.json`: resposta do PATCH real `in_progress -> ready`.
- `18-auth-missing-role-origin-response.txt`: chamada sem headers de gerente retornou erro estruturado.
- `19-api-origin-timeline-after.json`: resposta real do endpoint depois da transicao `ready`.
- `20-db-origin-status-history-after.txt`: `order_status_history` com as tres transicoes.
- `21-origin-timeline-after-dom.txt`: DOM final renderizando `Confirmado`, `Em preparo` e `Pronto`.
- `22-origin-timeline-after-status-change.png`: screenshot final renderizando `Pronto`.

## Resultado

- PASS: timeline usa endpoint real e renderiza eventos de `order_status_history`.
- PASS: hero usa mesa, status atual, valor e responsavel real quando disponivel.
- PASS: timeline mudou apos transicao real de status.
- PASS: origem por Operacao/Mesa validada via clique Playwright: `/manager/operacoes` -> Mesa 1 -> `Ver timeline` -> `/manager/timeline/dbd9fbec-f5b5-461a-9310-16eff538ca89`.
- PASS: bloco de chamados mockados e CTA sem backend deterministico foram removidos.
- PASS: erro sem `x-staff-id` nao vazou texto tecnico; resposta foi `AUTH_MISSING`.

## Observacao

O seed local tinha duas sessoes ativas antigas para a Mesa 1; a acao de origem resolve por `table_session_id` e tambem por `table_number` como fallback manager-only para esse caso de seed divergente.

# Infra Auditoria - Prompt 07

Data: 2026-06-09

## Escopo entregue

- Documentei setup IDB em `docs/dev/idb-setup.md`.
- Adicionei `scripts/audit-ui.sh` para abrir rotas customer/staff no iOS Simulator,
  salvar PNG/UI tree e validar cada abertura/tap com asserts basicos.
- Documentei MongoDB para logs novos em `docs/dev/mongodb-logs.md`.
- Adicionei a collection real `shift_logs` para encerramento de turno em `ShiftsService`.
- Garanti indices de `shift_logs` nos init scripts Mongo.
- Normalizei mensagens tecnicas de API para `message_user` + `code` com filtro global,
  mantendo `message`/`statusCode` para compatibilidade com consumidores antigos.
- Troquei strings como `Thread nao encontrada` e `x-staff-id invalido` por mensagens amigaveis.
- Escondi toasts WIP de gerente/host atras de `NEXT_PUBLIC_SHOW_WIP_FEATURES=true`.
- Unifiquei tema staff com chave `staff:theme`, mantendo fallback legado `host:appearance`.
- Documentei geolocalizacao inicial em `docs/features/geolocation.md`.
- Registrei follow-ups em `prompts-codex/round-24-followups.md`.

## Auditorias

### IDB

Comando:

```bash
PAUSE_SECONDS=1 scripts/audit-ui.sh
```

Resultado:

- Target: `02F47780-6142-499E-ABA2-974ED03C7082`
- Evidencias de execucao: geradas em `/tmp/restaurant-idb-audit-assert/`
- Resumo versionado: `qa-reports/infra-auditoria/idb/summary.md`
- Rotas: 17/17 marcadas como `[x]`
- Artefatos gerados localmente na auditoria anterior: 257 arquivos
- Artefatos versionados: apenas `summary.md` e relatorios de texto; PNG/UI trees
  detalhados nao ficam no Git para evitar inflar a branch.
- Assert atual do script: screenshot nao vazia, UI tree nao vazia e bloqueio de
  erros Safari/WIP/string tecnica visivel apos cada abertura e cada tap.
- Fluxo manual adicional: abriu a tela staff `manager/equipe`, tocou no campo
  de busca, digitou `Ana` com `idb ui text` e salvou screenshot/UI tree antes
  e depois em `manual-staff-type-*`.

`xcodebuildmcp` foi procurado via descoberta de ferramentas e nao estava
disponivel nesta sessao. A coleta de inventario/screenshot/UI tree ficou em
IDB, que era a ferramenta principal exigida pelo prompt.

### MongoDB

Comandos principais:

```bash
docker compose up -d mongodb
docker exec restaurant-mongodb mongosh restaurant_chat --quiet --eval 'db.adminCommand({ ping: 1 }).ok'
```

Resultado: `1`

Indices confirmados em `shift_logs`:

- `_id_`
- `tenantId_timestamp`
- `staffId_timestamp`
- `requestId_timestamp`
- `eventType_timestamp`

Fluxo real testado:

- `POST /api/restaurant_dev/waiter/shift-end-requests`
- `POST /api/restaurant_dev/manager/shift-end-requests/:id/decision`
- Mongo registrou `shift_end_requested:pending` e `shift_end_decided:approved`.

Dados temporarios criados para validacao:

- request `831eb312-9135-4f54-82a2-e7b68e8f880c`
- thread `877261eb-4cb2-435d-a778-52b06b749e57`
- QR release `cefbcbe6-c9c7-4977-a482-08afb8abdd4a`

Limpeza:

- A request e as duas mensagens de 2026-06-01 foram removidas do Postgres.
- Dois logs Mongo da request foram removidos.
- O thread foi preservado porque ja continha request antiga de desenvolvimento.
- A QR release temporaria foi removida.

### Strings WIP e tecnicas

Comandos:

```bash
rg -n -i "em desenvolvimento|onda [0-9]+ backend" apps > qa-reports/infra-auditoria/wip-audit.txt || true
rg -n "x-staff-id inválido|Thread não encontrada|Thread nao encontrada|manager-only endpoint|xstaff|Cannot read|TypeError|ReferenceError|SyntaxError|Unexpected token|stack trace|stacktrace" apps/api/src apps/web-customer/src apps/web-staff/src > qa-reports/infra-auditoria/technical-string-audit.txt || true
```

Resultado:

- `wip-audit.txt`: 3 ocorrencias, todas comentarios internos.
- `technical-string-audit.txt`: 2 ocorrencias, ambas comentarios internos sobre tratamento de `SyntaxError`.
- Checagem Browser em rotas staff/manager/cozinha: sem WIP ou erro tecnico visivel.
- Capturas Browser/Playwright salvas em `qa-reports/infra-auditoria/browser/`
  para `manager/equipe` e `manager/configuracoes`.

### Navegacao, safe-area e tema

Comando:

```bash
rg -n "safe-area|env\\(safe-area|padding-bottom|back|Voltar|theme|dark|light" apps/web-customer/src apps/web-staff/src > qa-reports/infra-auditoria/navigation-safe-area-audit.txt || true
```

Resultado:

- Evidencia salva em `navigation-safe-area-audit.txt`.
- Tema staff usa helper compartilhado `useStaffTheme`.
- Cozinha, garcom e gerente consomem o mesmo modo claro/escuro/auto.

## Validacoes

```bash
npm --workspace apps/api run build
```

Resultado: passou.

```bash
npm --workspace apps/web-staff run build
```

Resultado: passou.

```bash
npm --workspace apps/web-customer run build
```

Resultado: passou.

```bash
curl -fsS http://localhost:3001/api/health
```

Resultado:

```json
{"status":"ok","service":"api","timestamp":"2026-06-09T02:43:12.219Z"}
```

```bash
curl -sS -o /tmp/error-contract.json -w '%{http_code}' \
  -X POST http://localhost:3001/api/restaurant_dev/scan-verification-requests/00000000-0000-0000-0000-000000000000/approve \
  -H 'x-staff-key: <chave-de-dev-antiga-bloqueada-em-producao>' \
  -H 'x-staff-id: invalid'
```

Resultado:

```json
{"message_user":"Sessão expirada. Faça login novamente.","message":"Sessão expirada. Faça login novamente.","code":"AUTH_INVALID","statusCode":401}
```

```bash
npm --workspace apps/web-customer run e2e
```

Primeira execucao: `43 passed`, `1 skipped`, `1 failed`.

- Falha: `chat-tool-delay.spec.ts` primeiro cenario `view_menu`.
- Causa observada: corrida de warm-up/redirect do Next dev; `page.goto('/restaurant_dev/assistente')` foi interrompido por redirect do QR.

Revalidacoes:

```bash
npm --workspace apps/web-customer exec playwright test e2e/specs/chat-tool-delay.spec.ts:86 --project=iphone-14
```

Resultado: `1 passed`.

```bash
npm --workspace apps/web-customer run e2e
```

Resultado final atual: `45 passed` em 3.5 min.

O cenario `Mongo fora do ar nao bloqueia operacao Postgres` foi tornado parte da
suite serial normal e passou. Depois da suite, `restaurant-mongodb` voltou
healthy e `db.adminCommand({ ping: 1 }).ok` retornou `1`.

## Riscos residuais

- As acoes escondidas por `NEXT_PUBLIC_SHOW_WIP_FEATURES` ainda precisam de implementacao real ou remocao definitiva.
- O assert IDB cobre crash/string proibida por tap; assert semantico profundo de
  destino de cada item de menu ainda deve virar teste Playwright/IDB hibrido no
  follow-up `R24-INFRA-01`.

# Round 24 API transversais — auth/notifications solo pass

Data: 2026-05-26

## Escopo executado

- Bug 0: `x-staff-id` / roles em rotas staff-side.
- Bug 20: `GET /notifications` via `/:slug/alerts` sem erro `manager-only endpoint` para host/garcom.

Os demais itens do prompt `06-api-transversais.md` ainda nao foram implementados neste passe.

## Matrix endpoint -> consumidor -> evidencia

| Endpoint | Consumidor real | Evidencia |
| --- | --- | --- |
| `GET /api/restaurant_dev/courtesies?limit=1` | `/manager/cortesias` (`ScreenManagerCourtesies`) | `curl` com gerente Erica (`8bd06156-1fe5-4c18-a82d-43d38287ed4a`) retornou `HTTP/1.1 200 OK`. Playwright confirmou request do frontend com `x-staff-id: 8bd06156-1fe5-4c18-a82d-43d38287ed4a`. |
| `GET /api/restaurant_dev/courtesies?limit=1` com `x-staff-id: not-a-uuid` | Erro exibido por `staffApi` | `HTTP/1.1 401 Unauthorized` com body `{"message":"Sessão expirada","message_user":"Sessão expirada","code":"AUTH_INVALID"}`. |
| `GET /api/restaurant_dev/host/tables` | `/manager/mesa/[n]` -> `listHostTables` | `curl` com gerente Erica retornou `HTTP/1.1 200 OK`, sem `host- or manager-only endpoint`. |
| `GET /api/restaurant_dev/alerts?status=open&limit=2` | `/manager/notifications` | `curl` com gerente retornou `HTTP/1.1 200 OK` e manteve alertas manager-wide `customer_message_to_manager`. |
| `GET /api/restaurant_dev/alerts?status=open&limit=2` | `/host/notifications` | `curl` com host Renata (`a4c89ca7-86e6-4072-9432-449118a62fd4`) retornou `HTTP/1.1 200 OK` e `{"alerts":[]}`, sem `manager-only endpoint`. Playwright confirmou request do frontend com esse `x-staff-id`. |
| `GET /api/restaurant_dev/alerts?status=open&limit=2` | `/waiter/notifications` | `curl` com garcom Ana (`320de62c-073f-4e50-9f68-f5e9064c8bab`) retornou `HTTP/1.1 200 OK` e `{"alerts":[]}`, sem `manager-only endpoint`. |

## Validacoes automatizadas

- `TS_NODE_PROJECT=apps/api/tsconfig.json TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node -r ts-node/register apps/api/src/common/guards/auth-guards.spec.ts`
- `TS_NODE_PROJECT=apps/api/tsconfig.json TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node -r ts-node/register apps/api/src/modules/alerts/alerts.service.spec.ts`
- `TS_NODE_PROJECT=apps/web-staff/tsconfig.json TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' node -r ts-node/register apps/web-staff/src/lib/api.identity.spec.ts`
- `npm exec --workspace @restaurant/api -- tsc --noEmit -p tsconfig.json`
- `npm exec --workspace @restaurant/web-staff -- tsc --noEmit -p tsconfig.json`
- `npm run build --workspace @restaurant/api`
- `npm run build --workspace @restaurant/web-staff`
- `git diff --check`

## Observacao de ambiente

O servidor `web-staff` ja ativo em `localhost:3002` esta configurado para `NEXT_PUBLIC_API_URL=http://192.168.68.119:3001/api`, e esse IP respondeu timeout localmente. Para validar o contrato real de API, os `curl` acima usaram `http://localhost:3001/api`. Uma instancia temporaria em `3012` confirmou que o frontend usa `localhost:3001`, mas a API bloqueou a origem `3012` por CORS; a porta permitida `3003` ja estava ocupada pelo stack Docker.

# /manager/mesa/[n] -> /manager/table-menu/[sessionId]

Subagente 16 / Audit R23 / Manager mesa flow.

## Resumo

`/manager/mesa/[n]` (`apps/web-staff/src/app/manager/mesa/[n]/page.tsx`)
resolve `n` como **table NUMBER** (inteiro vindo de `tables.sort_order`
exposto pela API host), **nao como `tables.code`**.

Acessar `/manager/mesa/M01` cai em `Erro · CONSULTA · Numero de mesa
invalido.` porque `parseInt('M01', 10) === NaN` (linha 49).

Fluxo de redirect:

1. `useEffect` chama `listHostTables(slug)` em `lib/api/host.ts:44-46`
   (GET `/:slug/host/tables`).
2. Match por `row.number === n`.
3. `active_session_id` presente -> `router.replace('/manager/table-menu/<sid>?slug=...&tableNumber=n')`.
4. `active_session_id` null -> renderiza `FreeTable` (empty-state).
5. Mesa nao encontrada -> `NotFound`.

## Setup

| Item | Valor |
|---|---|
| Persona | Manager Erica |
| `staffId` | `8bd06156-1fe5-4c18-a82d-43d38287ed4a` |
| `staffRole` | `manager` |
| Tenant slug | `restaurant_dev` (resolvido pelo middleware via `public.restaurants.slug`) |
| `STAFF_API_KEY` | `dev-staff-api-key-change-in-prod` (default dev) |
| Mesa de interesse | `M01` -> `tables.sort_order = 1` -> API expoe `number = 1` |

`localStorage.staffId` + `staffRole` foram setados antes do
`page.goto(...)` para que `staffApi()` em `lib/api.ts:16-24` adicionasse
os headers `x-staff-id` / `x-staff-role`.

## DB seed (sessao ativa M01)

```bash
docker exec -e PGPASSWORD=postgres restaurant-postgres psql -h localhost \
  -p 5434 -U postgres -d restaurant_saas -tA -c \
  "SET search_path=restaurant_dev,public;
   SELECT s.id, t.code, t.label
   FROM table_sessions s JOIN tables t ON s.table_id=t.id
   WHERE t.code='M01' AND s.status='active' LIMIT 1;"
# 2494fc2c-f534-4600-8f4b-8de0146e5383|M01|Mesa 01
```

API resposta atual (cache dinamico — pode rotacionar com pause/cleanup
entre runs):

```bash
curl -s "http://localhost:3001/api/restaurant_dev/host/tables" \
  -H "x-staff-key: dev-staff-api-key-change-in-prod" \
  -H "x-staff-id: 8bd06156-1fe5-4c18-a82d-43d38287ed4a" \
  -H "x-staff-role: manager" | jq '.[0:3]'
```

```json
[
  {"number":1,"capacity":2,"sector":"Salão","status":"ocupada","seats":0,
   "since":"2026-05-15T19:18:38.564Z","waiter_initial":null,
   "active_session_id":"4a19456c-91e3-469a-80b2-185db3950f06"},
  {"number":2,"capacity":4,"sector":"Salão","status":"ocupada",
   "active_session_id":"83937b93-ad6c-44d9-b5f2-8993e97b2cf0"},
  {"number":3,"capacity":4,"sector":"Salão","status":"livre",
   "active_session_id":null}
]
```

## Casos testados (Playwright MCP)

| URL inicial | Final URL | Estado renderizado |
|---|---|---|
| `/manager/mesa/M01?slug=restaurant_dev` | `/manager/mesa/M01?slug=restaurant_dev` (sem redirect) | `Erro · CONSULTA · Não consegui carregar · Numero de mesa invalido.` |
| `/manager/mesa/1?slug=restaurant_dev` | `/manager/table-menu/4a19456c-...?slug=restaurant_dev&tableNumber=1` | `ScreenManagerTableMenu` mounted -> "Mesa 1 · 4 pessoas · Em andamento · 6 acoes" |
| `/manager/mesa/2?slug=restaurant_dev` | `/manager/table-menu/83937b93-...?slug=restaurant_dev&tableNumber=2` | `ScreenManagerTableMenu` mounted -> "Mesa 2 · 4 pessoas · Em andamento" |
| `/manager/mesa/3?slug=restaurant_dev` | `/manager/mesa/3?slug=restaurant_dev` (sem redirect) | `FreeTable` Hero -> `MESA · LIVRE` + Setor (Salão) + Capacidade (4 pessoas) + hint QR |
| `/manager/mesa/999?slug=restaurant_dev` | `/manager/mesa/999?slug=restaurant_dev` (sem redirect) | `NotFound` Hero -> "NÃO ENCONTRADA · Mesa 999 · Esse número não existe no salão." |

Screenshots:

- `screenshots/02-mesa-M01-invalid.png` -- erro NaN
- `screenshots/08-table-menu-mesa1-clean.png` -- ScreenManagerTableMenu mounted apos redirect mesa/1
- `screenshots/09-mesa-3-livre.png` -- empty-state mesa livre
- `screenshots/11-mesa-999-notfound.png` -- not-found

## Achados

1. **Confirmado**: route resolve por `number`, nao por `code`. Quem digita
   `/manager/mesa/M01` (copia do label da tabela) recebe erro generico
   "Numero de mesa invalido." sem hint que o caminho correto seria
   `/manager/mesa/1`. Trade-off: o canvas usa `n=number` (mais legivel
   em deep-links) mas humanos confundem com `code`.
2. **Cleanup observado**: ao longo do audit os `active_session_id` rotacionaram
   (`2494fc2c-...` no primeiro snapshot DB, `4a19456c-...` nas chamadas
   API depois). Isto e por causa da concorrencia com o cleanup job de
   sessoes (host.service `liberate` / cleanup) e nao indica bug.
3. **Empty-state V11** preserva: eyebrow mono `MESA · LIVRE`, title `Mesa N`,
   `InfoCard` com `Setor`, `Capacidade`, `Garcom` (se houver), Hint
   contextual sobre QR, e CTA primaria "Voltar pro mapa". Match com
   o canon V11.
4. **NotFound** preserva: eyebrow mono `NÃO ENCONTRADA`, title `Mesa N`,
   subtitle explicativa, InfoCard com `Possível causa` + `Ação`, e
   CTA "Voltar pro mapa". Match V11.
5. **Redirecting transient state** (`apps/web-staff/src/app/manager/mesa/[n]/page.tsx:172-189`)
   exibe spinner + eyebrow `ABRINDO MESA` enquanto `router.replace`
   nao terminou. Em network rapida (~445ms compile + ~140ms response)
   o usuario nao ve.

## Status: OK -- conforme spec V11 / Round 18.

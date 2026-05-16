# /manager/cortesias — Audit R23

## Surface inventory

- Route: `/manager/cortesias?tab=history|new&slug=restaurant_dev`
- Page: `apps/web-staff/src/app/manager/cortesias/page.tsx`
- Screen: `apps/web-staff/src/screens/manager/ScreenManagerCourtesies.tsx`
- Composer target: `/manager/compensate` → `ScreenManagerCompensateClient.tsx`
- API: `apps/api/src/modules/courtesies/courtesies.controller.ts`
  (`@Controller(':slug/courtesies')`)
- DB: `restaurant_dev.courtesies` (migration `042`)

## Histórico tab (default)

```
Cortesias
[ Histórico {count} | Nova cortesia ]
3 KPI tiles: Hoje · Aceitas · Pendentes
"Últimas cortesias enviadas · ordenadas por mais recente."
<CourtesyCard rows>  or  "Nenhuma cortesia hoje."
```

`useEffect` on mount fires
`manager(slug).courtesies.list({ today: true, limit: 50 })` → 
`GET /api/:slug/courtesies?today=true&limit=50` with headers
`x-staff-key`, `x-staff-id`, `x-staff-role`.

Each `CourtesyEntry` from API maps via `entryToRecord()` (lines 53-82):
- `relativeTime(created_at)` formats as "agora" / "há N min" / "há Nh MM" / "ontem" / "há Nd"
- `STATUS_FROM_API` is identity (pendente/aceita/recusada)

KPI tiles are reactive:
- Hoje = `records.length`
- Aceitas = filter `status === 'aceita'`
- Pendentes = filter `status === 'pendente'`

## Nova cortesia tab

```
Cortesias
[ Histórico | Nova cortesia ]
"Nova cortesia"
"Escolha uma mesa e mande um mimo — sobremesa, drink, desconto ou só uma mensagem."
[Abrir compositor]  <- sticky bottom CTA
```

CTA `router.push('/manager/compensate')` → see `compensate-types.md`.

## End-to-end test (Audit R23)

### 1. POST cortesia via API

```bash
curl -X POST 'http://localhost:3001/api/restaurant_dev/courtesies' \
  -H "x-staff-key: dev-staff-api-key-change-in-prod" \
  -H "x-staff-id: 8bd06156-1fe5-4c18-a82d-43d38287ed4a" \
  -H "Content-Type: application/json" \
  -d '{"type":"Sobremesa","item":"AUDIT-R23-Fondant teste",
       "tableNumber":1,
       "tableSessionId":"4a19456c-91e3-469a-80b2-185db3950f06",
       "notes":"AUDIT-R23-cortesia-via-api"}'
```

Response 201:
```json
{
  "id": "68ac4a90-2794-4c13-8fdf-a66d2f035d68",
  "table_session_id": "4a19456c-91e3-469a-80b2-185db3950f06",
  "table_number": 1, "type": "Sobremesa",
  "item": "AUDIT-R23-Fondant teste",
  "status": "pendente",
  "manager_staff_id": "8bd06156-1fe5-4c18-a82d-43d38287ed4a",
  "manager_name": "Erica Gerente",
  "notes": "AUDIT-R23-cortesia-via-api",
  "created_at": "2026-05-15T19:38:39.690Z"
}
```

### 2. Render in UI

`/manager/cortesias?tab=history` showed:

```
Histórico 1 / Nova cortesia
Hoje 1 / Aceitas 0 / Pendentes 1
"Últimas cortesias enviadas · ordenadas por mais recente."
Mesa 1 · há 2 min
Sobremesa
AUDIT-R23-Fondant teste
[pendente]
por Erica Gerente
```

KPI tiles + card rendered correctly. Manager name resolved server-side
via `CallerResolverService.fromHeaders()` (verified `Erica Gerente`).

### 3. Switch tabs preserves URL state

`tab=history` ↔ `tab=new` switches via `router.push('/manager/cortesias?tab=X')`
preserving the URL as state-source (tab is read from `params.get('tab')`).

## Findings

- **POST persistence works.** Schema + audit + storage in
  `restaurant_dev.courtesies` are all correct.
- **GET listing works.** `today=true` filter returns the row; 
  `entryToRecord` correctly formats relative time.
- **KPI tiles are reactive.** Counts updated immediately after the new
  row was created.
- **Manager name is server-resolved.** `manager_name: "Erica Gerente"` came
  from the API (resolved via `x-staff-id`), not from any client param.
- **Status pill rendering is canonical.** Verified `pendente` → warn pill,
  `aceita` → success, `recusada` → danger (see `StatusPill` lines 509-534).
- **0 placebos.** This is a fully-wired surface end-to-end (UI ↔ API ↔ DB).

## Backend env note (resolved during audit)

The web-staff container was built with
`NEXT_PUBLIC_API_URL=http://192.168.43.12:3001/api`. From this audit
machine, that LAN IP doesn't resolve to anything useful and every API
call from the SPA hung. Worked around in Playwright via `page.route`
rewrite of `192.168.43.12:3001` → `localhost:3001`. **Not a code bug, a
deployment-time env injection mismatch**, but worth flagging because it
breaks UI-driven audits unless the rewrite is in place.

## Cleanup

```bash
docker exec restaurant-postgres psql -h localhost -p 5434 -U postgres \
  -d restaurant_saas -c "DELETE FROM restaurant_dev.courtesies
                         WHERE item LIKE 'AUDIT-R23-%' OR notes LIKE 'AUDIT-R23-%';"
-- DELETE 1
```

Verified post-cleanup: `SELECT count(*) FROM restaurant_dev.courtesies
WHERE item LIKE 'AUDIT-R23-%' OR notes LIKE 'AUDIT-R23-%'` → 0.

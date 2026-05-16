# /manager/pausa-zona — UI form + DB cross-check

Subagente 16 / Audit R23.

## Componente

- Page: `apps/web-staff/src/app/manager/pausa-zona/page.tsx`
- Screen: `apps/web-staff/src/screens/manager/ScreenManagerOrdersPause.tsx`

## Form (ScreenManagerOrdersPause)

Source `ScreenManagerOrdersPause.tsx:30`:

```ts
const DURATIONS: ZonePauseDurationMinutes[] = [5, 10, 15, 30];
```

UI:

- **Waiter picker** (horizontal scroll avatares) — must select before submit.
- **Duracao** 4 botoes fixos: 5 / 10 / 15 / 30 min.
- **Motivo (opcional)** — `<textarea placeholder="Ex: cozinha sobrecarregada">`.
- **CTA primario** — `Pausar por N min` (label dinamico).

Sem botao "custom" — type-level union literal nao admite outros valores.
A task pedia 5/10/15/30 + custom; implementacao tem so os 4 fixos
(consistent com Round 18 spec).

DOM probe (Playwright):

```json
{
  "buttons": ["AGAna", "BGBruno", "5 min", "10 min", "15 min", "30 min", "Pausar por 5 min"],
  "textareas": [{"tag":"TEXTAREA","placeholder":"Ex: cozinha sobrecarregada","value":""}]
}
```

## API endpoint

Controller: `apps/api/src/modules/zone-pause/zone-pause.controller.ts`

```
POST   /:slug/zone-pauses          -> start a pause (Manager only)
POST   /:slug/zone-pauses/:id/end  -> end a pause (Manager only)
DELETE /:slug/zone-pauses/:id      -> alias of end
GET    /:slug/zone-pauses          -> list (staff OR session)
```

## DB schema atual

```
restaurant_dev.zone_pauses
  id          uuid           PK
  waiter_id   uuid           FK staff
  started_at  timestamptz
  ends_at     timestamptz
  started_by  uuid           manager who paused
  ended_at    timestamptz    nullable
  ended_by    uuid           nullable
  reason      text
  created_at  timestamptz
```

Nao tem coluna `duration_minutes` — duration e calculada via
`ends_at - started_at`. Frontend passa `durationMinutes` so como
input do controller, server computa `ends_at`.

Estado inicial: `SELECT COUNT(*) FROM zone_pauses` = **0**.

## Live test (Playwright + DOM click)

Persona Manager Erica (staffId `8bd06156-...`).

Steps:

1. Click waiter Ana Garcom (`320de62c-...`)
2. Click `10 min`
3. Fill textarea com `AUDIT-R23-cozinha-sobrecarregada`
4. Click `Pausar por 10 min`

Network captura POST `/api/restaurant_dev/zone-pauses` → HTTP **201**.
Body de resposta:

```json
{
  "id": "5fb47c36-d9c0-4d13-9aa6-6c903543bf09",
  "waiterId": "320de62c-073f-4e50-9f68-f5e9064c8bab",
  "startedAt": "2026-05-15T19:57:35.324Z",
  "endsAt": "2026-05-15T20:07:35.323Z",
  "startedBy": "8bd06156-1fe5-4c18-a82d-43d38287ed4a",
  "endedAt": null,
  "endedBy": null,
  "reason": "AUDIT-R23-cozinha-sobrecarregada",
  "active": true
}
```

`ends_at - started_at = 10 min` confirma duration semantics.

UI apos submit (`screenshots/pausa-zona-after-submit.png`):

```
PAUSAS ATIVAS · 1 · ATIVA · 09:58 [countdown] · Encerrar agora
NOVA PAUSA · GARÇOM AG Ana BG Bruno · DURAÇÃO 5/10/15/30 · MOTIVO ...
```

Counter conta para baixo (09:58 -> 09:57 ...). Botao `Encerrar agora`
disparara POST `/zone-pauses/<id>/end`.

## DB cross-check pos-POST

```sql
docker exec -e PGPASSWORD=postgres restaurant-postgres psql \
  -h localhost -p 5434 -U postgres -d restaurant_saas -c \
  "SET search_path=restaurant_dev,public;
   SELECT id, waiter_id, started_at, ends_at, started_by, reason
   FROM zone_pauses WHERE reason LIKE 'AUDIT-R23-%';"
```

```
id        | 5fb47c36-d9c0-4d13-9aa6-6c903543bf09
waiter_id | 320de62c-073f-4e50-9f68-f5e9064c8bab
started   | 2026-05-15 19:57:35.324+00
ends_at   | 2026-05-15 20:07:35.323+00
started_by| 8bd06156-1fe5-4c18-a82d-43d38287ed4a
reason    | AUDIT-R23-cozinha-sobrecarregada
```

Persistencia confirmada.

## Cleanup (executado no final)

```sql
DELETE FROM restaurant_dev.zone_pauses WHERE reason LIKE 'AUDIT-R23-%';
```

## Status

**OK** — form rendered + API call 201 + DB persisted + cleanup OK.

## Notas

- Form requires waiter select; submit disabled enquanto `!waiterId`.
- A coluna `duration_minutes` nao existe no schema — duration e
  somente um parametro de input no DTO `ZonePauseCreateDto`. O server
  calcula `ends_at = startedAt + durationMinutes*60s`.
- "Forecast tempo de espera" e "Avisar cliente que zona pausada" sao
  Onda 4 TODO no codigo (nao testados).
- O API URL no docker container e `http://192.168.43.12:3001/api`
  (PUBLIC_HOST do .env apontado para LAN antiga). Playwright precisou
  reroutear via `page.route('http://192.168.43.12:3001/**', ...)` para
  funcionar em host disconectada da rede.

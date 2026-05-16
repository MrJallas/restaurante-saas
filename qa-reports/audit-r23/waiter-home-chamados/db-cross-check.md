# DB cross-check — Waiter audit R23

Schema `restaurant_dev` · postgres em `restaurant-postgres` (socket :5434 dentro do container).

## Setup state

```sql
-- staff Ana
SELECT id, name, role FROM staff WHERE id='320de62c-073f-4e50-9f68-f5e9064c8bab';
-- → 320de62c-073f-4e50-9f68-f5e9064c8bab | Ana Garcom | waiter ✓

-- mesas
SELECT id, code, label FROM tables ORDER BY code LIMIT 10;
-- → M01..M14 (10 mesas, todas is_active=true)

-- session ativa usada nos testes
SELECT id, table_id, status FROM table_sessions WHERE status='active' LIMIT 5;
-- → 109f256e-afd7-420f-a5cd-a59ab606c15f / cfabe098-…(M01) / active
```

## Waiter-calls flow

### 1) Insert pending (preparou cenário)

```sql
INSERT INTO waiter_calls (id, table_session_id, status, reason, created_at)
VALUES (gen_random_uuid(),
        '109f256e-afd7-420f-a5cd-a59ab606c15f',
        'pending', 'place_order', now())
RETURNING id;
-- → 4d07e5e7-86c8-45d2-9491-6ea78168911c
```

### 2) `GET /restaurant_dev/waiter-calls/pending`

```bash
curl -H "x-staff-id: …" -H "x-staff-role: waiter" -H "x-staff-key: …" \
  http://localhost:3001/api/restaurant_dev/waiter-calls/pending
# → [{"id":"4d07e5e7…","status":"pending","reason":"place_order",
#     "created_at":"2026-05-15T20:11:25.247Z","assigned_waiter_name":null,
#     "eta_minutes":null,"table_label":"Mesa 01","table_code":"M01","flags":[]}]
```
✓ List endpoint OK · API enriquece com table_label.

### 3) `POST /restaurant_dev/waiter-calls/:id/acknowledge`

```bash
curl -X POST -d '{"waiterName":"Ana Garcom","etaMinutes":3}' …/waiter-calls/4d07e5e7…/acknowledge
# → {"callId":"4d07e5e7…","status":"acknowledged","waiterName":"Ana Garcom","etaMinutes":3}
```
✓ Status flip funciona · UPDATE atômico (B-NEW-14 round 5).

### 4) `POST /restaurant_dev/waiter-calls/:id/resolve`

```bash
curl -X POST …/waiter-calls/4d07e5e7…/resolve
# → {"callId":"4d07e5e7…","status":"resolved"}
```

```sql
SELECT id, status, acknowledged_by, resolved_at FROM waiter_calls
WHERE id='4d07e5e7-86c8-45d2-9491-6ea78168911c';
-- → 4d07e5e7… | resolved | NULL | 2026-05-15 20:14:44.514945+00
```

## **Bug confirmado · `acknowledged_by` não é populado**

A coluna `restaurant_dev.waiter_calls.acknowledged_by` existe no schema mas o
service nunca grava o `x-staff-id` do solicitante. O controller só recebe o
DTO `{waiterName?, etaMinutes?}` (`AcknowledgeCallDto`) e o service só faz
`UPDATE … SET assigned_waiter_name=COALESCE($2,…)` — sem persistir staffId.

Arquivo: `apps/api/src/modules/waiter-calls/waiter-calls.service.ts:213-238`

Impacto:
- Audit/forensics de "qual garçom atendeu este chamado" fica cego.
- Endpoint `acknowledge` aceita waiterName como string livre — qualquer staff
  pode se passar por outro (impersonation latent).
- Dashboard "Minhas mesas / chamados que ATENDI" não pode ser construído
  server-side sem esta foreign key.

Fix sugerido: alterar `acknowledgeCall` para receber `staffId` (do `@Req`
ou de um `@StaffId()` decorator) e `SET acknowledged_by = $4`.

## Qr-issues flow

```bash
curl -X POST -d '{"table_number":1,"description":"[borrado] QR ilegivel R23"}' \
  http://localhost:3001/api/restaurant_dev/qr-issues
# → {"id":"041b7bea-8e54-4b8f-b67e-945590b556d1","table_number":1,
#    "description":"[borrado] QR ilegivel R23","photo_url":null,
#    "reported_by_staff_id":"320de62c-073f-4e50-9f68-f5e9064c8bab",
#    "status":"open","created_at":"2026-05-15T20:15:40.243Z",
#    "resolved_at":null,"resolved_by_staff_id":null}
```
✓ `reported_by_staff_id` populado corretamente via `x-staff-id` header.

## Staff-messages threads

```bash
curl …/staff-messages/threads?staffId=320de62c-…
# → array de 8 threads (b029727b…, 1bb08f60…, 0e9a0b1b…, etc.)
```
✓ List endpoint OK · backend filtra por viewer.

## Tables / sessions (waiter home)

```bash
curl …/staff/my-tables
# → [
#     {"id":"109f256e-…","label":"Mesa 01","table_code":"M01","party_size":2,
#      "capacity":2,"status":"em-andamento","ticket_total_cents":0,
#      "opened_min":17,"last_event":null,"is_vip":false},
#     {"id":"83937b93-…","label":"Mesa 02","table_code":"M02","party_size":1,
#      "capacity":4,"status":"em-andamento","ticket_total_cents":0,
#      "opened_min":36,"last_event":null,"is_vip":false}
#   ]
```
✓ Backend mostra TODAS as sessions ativas (não filtra por
`tables.assigned_waiter_id`) — Ana não tem mesas exclusivas neste tenant,
todas as 2 sessões ativas aparecem como "minhas".

Schema check:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='restaurant_dev' AND table_name='tables';
-- → id, code, label, qr_hmac_secret, capacity, is_active, sort_order,
--   created_at, updated_at, zone_id
-- → NÃO existe coluna `assigned_waiter_id` em tables.
```

**Bug menor:** O endpoint `/staff/my-tables` ignora staff identity — retorna
todas as sessões ativas indiscriminadamente. Em produção, esperar-se-ia
filtragem por `zone_id ↔ staff_zone` ou semelhante.

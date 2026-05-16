# DB cross-check · `restaurant_dev.waiter_calls`

## Conexão

```bash
docker exec -i restaurant-postgres psql -h localhost -p 5434 -U postgres -d restaurant_saas -c "<SQL>"
```

Port interno do container é **5434** (não 5432). Diagnosticado via `docker exec restaurant-postgres pg_isready -h localhost -p 5432` que respondeu "no response".

## Schema (relevante)

```
restaurant_dev.waiter_calls
  id                   uuid PK
  table_session_id     uuid NOT NULL FK→table_sessions(id)
  customer_id          uuid FK→customers(id)
  visit_id             uuid FK→visits(id)
  status               varchar(20) DEFAULT 'pending'
  reason               varchar(30) DEFAULT 'other'  -- enum: bring_menu, place_order, serve_drink, ask_bill, other
  acknowledged_by      uuid FK→staff(id)
  acknowledged_at      timestamptz
  resolved_at          timestamptz
  cancelled_at         timestamptz
  assigned_waiter_name varchar(100)
  eta_minutes          integer
  created_at           timestamptz DEFAULT now()
```

⚠️ Não há coluna `table_id` direta — relação é via `table_session_id`.

## Cenário (b) cross-check

Após tap "Trazer cardápio" → "Confirmar chamado":

```sql
SELECT id, reason, status, created_at FROM restaurant_dev.waiter_calls ORDER BY created_at DESC LIMIT 1;
```

```
                  id                  |   reason   | status  |          created_at
--------------------------------------+------------+---------+-------------------------------
 240c53dd-f090-412a-aacc-3c8506ac5b7b | bring_menu | pending | 2026-05-15 19:39:24.699201+00
```

✅ Row criada com `reason='bring_menu'`, `status='pending'`, timestamp coerente.

## Cenário (d) cross-check

INSERT manual de chamado `other` vinculado à table_session ativa:

```sql
INSERT INTO restaurant_dev.waiter_calls (id, table_session_id, customer_id, reason, status)
SELECT gen_random_uuid(), ts.id, c.id, 'other', 'pending'
FROM restaurant_dev.tables t
JOIN restaurant_dev.table_sessions ts ON ts.table_id=t.id, restaurant_dev.customers c
WHERE t.code='M01' AND c.cpf='12345678909' AND ts.status='active'
ORDER BY ts.created_at DESC LIMIT 1
RETURNING id, reason, status;
```

```
8e62164f-b518-4264-a14a-d716b7d10529 | other | pending
```

Customer ID `21a81205-4adf-41e3-86b5-baa8d3e339fb` (Caleb Teste, CPF 12345678909).
Tenant slug `restaurant_dev` → schema `restaurant_dev` (public.restaurants).

## Cenário (e) cancel via SQL

```sql
UPDATE restaurant_dev.waiter_calls SET status='cancelled' WHERE status='pending';
-- UPDATE 1
```

A sheet detectou via poll de 5s (`/waiter-calls/active` retorna null agora) e voltou pra view de 5 motivos automaticamente.

## Cleanup final

```sql
DELETE FROM restaurant_dev.waiter_calls WHERE reason='other' AND status IN ('pending','cancelled','assigned');
-- DELETE 1 (8e62164f-...)

SELECT count(*), status FROM restaurant_dev.waiter_calls GROUP BY status;
-- 30 cancelled (todos os existentes prévios + os deste run)
```

Sem rows `pending` órfãos. Todos os chamados de teste (`bring_menu`+`other` criados nesse run) foram cancelados ou deletados.

## Tabela `tables` (referência)

```sql
SELECT code, label, qr_hmac_secret, is_active FROM restaurant_dev.tables WHERE code='M01';
```

```
 code |  label  |            qr_hmac_secret            | is_active
------+---------+--------------------------------------+-----------
 M01  | Mesa 01 | 5e4cf4c2-58e9-44fe-a0c0-e3aa7a9f53eb | t
```

HMAC URL usada para entrada:
```
http://localhost:3003/restaurant_dev/mesa/M01?hmac=3eedcea4cebb3fc22e6829284aadf8b746b297cd8d5d1660ae4465449ce34343&ts=1778873519565
```

Gerado via Node `createHmac('sha256', secret).update('M01:<ts>').digest('hex')`.

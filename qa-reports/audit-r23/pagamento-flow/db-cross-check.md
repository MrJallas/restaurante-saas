# DB cross-check — Pagamento flow

Method: docker exec psql direto no container `restaurant-postgres` (porta 5434 dentro do net).

## Schema confirmed
```sql
\d payments
-- 17 cols: id (uuid), table_session_id, visit_id, amount_cents (int),
--   status (varchar), method (varchar), pix_qr_code (text), pix_copy_paste (text),
--   psp_transaction_id, psp_payload (jsonb), paid_at, created_at, updated_at,
--   expires_at, cancelled_at, split_mode (varchar), split_allocations (jsonb)
```

Nota: payments **não tem coluna `customer_id`** — ownership/identidade é via `visit_id` → tabela `visits` → `customer_id`. Filter por session: `table_session_id`. Filter por pessoa: `visit_id` (NULL = pagamento da mesa toda).

## Recent payments (10 mais recentes)
```sql
SELECT id, status, method, amount_cents, visit_id, expires_at, paid_at, cancelled_at, split_mode, created_at
FROM payments ORDER BY created_at DESC LIMIT 10;
```

| id (prefix) | status | method | amount | split_mode | nota |
|---|---|---|---|---|---|
| 5fad9709 | confirmed | pix | 12870 | — | criado + confirmado neste audit |
| b9152fc5 | cancelled | pix | 12870 | — | criado + cancelado neste audit |
| 4fb32970 | expired | pix | 12870 | — | lazy-expired |
| 34263403 | cancelled | credit | 12870 | — | cartão (sem pixQR no DB) |
| aa02002e | cancelled | pix | 12870 | — | – |
| 6f49c169 | confirmed | pix | 9780 | equal | split equal funcionou |
| e22facfa | confirmed | pix | 4290 | by_item | split por_item funcionou |
| cf51be9e | confirmed | card | 5490 | by_item | cartão + split |
| 9ca45efc | confirmed | pix | 9780 | NULL | pagamento individual sem split |
| cb921083 | confirmed | pix | 5490 | NULL | – |

**Status set observado**: pending → confirmed | cancelled | expired ✓ — todos os 3 terminal states aparecem no DB.

## Lazy expiry verification
```sql
SELECT id, status, expires_at, (expires_at < now()) AS overdue
FROM payments WHERE status='expired' LIMIT 3;
```
Row `4fb32970` tem `expires_at < now()` ✓. Lazy expiry path: GET endpoint detecta no read e faz UPDATE inline (linha 376–386 do service).

## Confirm transition (audit-fresh)
```sql
SELECT id, status, paid_at, psp_transaction_id, updated_at
FROM payments WHERE id='5fad9709-7eb0-4885-b628-890b5b245574';
```
- status: `confirmed`
- paid_at: `2026-05-15 20:44:42.701`
- psp_transaction_id: NULL (corpo do `confirm` enviado vazio `{}`)
- updated_at: matches paid_at (mesmo statement SQL)

## Cancel transition (audit-fresh)
```sql
SELECT id, status, cancelled_at FROM payments WHERE id='b9152fc5-1e30-4873-9208-467ba9f4a4bb';
```
- status: `cancelled`
- cancelled_at: `2026-05-15 20:45:xx`

## Cross-tenant isolation (verifica defense-in-depth)
- Schema único `restaurant_dev` no DB local (`SELECT nspname FROM pg_namespace LIKE 'restaurant_%'` → 1 row). Multi-tenant test requer 2 tenants registrados — não verificado neste audit (single-tenant dev DB).
- Mas service `getPaymentStatus` filtra `WHERE id=$1 AND table_session_id=$2` ✓ — mesma sessão diferente do dono retorna NotFoundException (testado via T9 que bateu 401 antes do service).

## Table state (sanity)
```sql
SELECT DISTINCT status FROM table_sessions; -- 'active', 'closed'
SELECT ts.id, ts.status, t.code FROM table_sessions ts 
JOIN tables t ON t.id=ts.table_id ORDER BY ts.created_at DESC LIMIT 3;
```
- 8e5545ab-... | active | M01
- bd771b4d-... | closed | M04
- 109f256e-... | closed | M03

M01 ativo, único table_session candidato pra teste — coincide com o usado.

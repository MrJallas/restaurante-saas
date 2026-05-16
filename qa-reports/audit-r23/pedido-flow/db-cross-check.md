# DB Cross-Check · Pedido Flow

## Orders created during this session

```sql
docker exec -e PGPASSWORD=postgres restaurant-postgres psql -h localhost -p 5434 \
  -U postgres -d restaurant_saas -c "SET search_path=restaurant_dev,public; \
  SELECT id, status, total_cents, billing_mode, visit_id, created_at \
  FROM orders WHERE created_at >= now() - INTERVAL '1 hour' ORDER BY created_at DESC;"
```

| id (truncated) | status | total_cents | billing_mode | visit_id | created_at |
|---|---|---|---|---|---|
| `54dd5a3b...` | created* | 7890 | individual | `61e4f693...` | 2026-05-15 20:34:38 |
| `4fcfb1e2...` | received | 4980 | individual | `61e4f693...` | 2026-05-15 20:34:29 |
| `023568ac...` | created* | 7890 | individual | `2b9af947...` | 2026-05-15 20:24:11 |
| `987df29b...` | received | 11070 | table | `2b9af947...` | 2026-05-15 20:23:24 |
| `67b93b85...` | received | 11070 | table | `897c9293...` | 2026-05-15 20:14:44 |

*`status='created'` reflects the cleanup step at the end (reverted from `delivered`).

## Order items

```sql
SELECT oi.order_id, oi.quantity, oi.subtotal_cents, oi.customer_id, mi.name
  FROM order_items oi JOIN menu_items mi ON oi.menu_item_id = mi.id
 WHERE oi.order_id IN (SELECT id FROM orders WHERE created_at >= now() - INTERVAL '1 hour')
 ORDER BY oi.order_id, oi.created_at;
```

| order_id (truncated) | qty | subtotal_cents | customer_id | name |
|---|---|---|---|---|
| `023568ac...` | 1 | 7890 | **NULL** | Picanha na Brasa |
| `4fcfb1e2...` | 2 | 4980 | `21a81205...` (Caleb) | Bolinho de Bacalhau |
| `54dd5a3b...` | 1 | 7890 | **NULL** | Picanha na Brasa |
| `67b93b85...` | 2 | 3180 | NULL | Pudim da Casa |
| `67b93b85...` | 1 | 7890 | NULL | Picanha na Brasa |
| `987df29b...` | 2 | 3180 | NULL | Pudim da Casa |
| `987df29b...` | 1 | 7890 | NULL | Picanha na Brasa |

## Observations

### 1. `customer_id` populated only on `4fcfb1e2`

Order `4fcfb1e2` (2× Bolinho R$ 49,80, billing=individual) has `customer_id` correctly set to Caleb's id. But the matching `054dd5a3b` (Picanha, also billing=individual, same visit) has `customer_id=NULL`.

The difference: the API derives `callerCustomerId` from the `recognition_token` cookie. In cross-origin requests (web-customer :3003 → api :3001), Safari withholds the SameSite=Lax cookie, so `callerCustomerId` defaults to NULL. Why one order succeeded and the other didn't likely correlates with whether the cookie was *still valid* on that specific request before rotation invalidated it. The API logs show frequent rotation events:

```
WARN [CustomersService] {"event":"recognition_token_rotated","cpf_hash":"123***09",
    "customer_id":"21a81205-4adf-41e3-86b5-baa8d3e339fb","reason":"no_cookie"}
WARN [CustomersService] {"event":"recognition_token_rotated","cpf_hash":"123***09",
    "customer_id":"21a81205-4adf-41e3-86b5-baa8d3e339fb","reason":"token_mismatch"}
```

This is fragile. **Recommendation:** since web-customer :3003 and api :3001 are on the same host, configure Nginx/Next.js to proxy API calls under `/api/*` so the cookie is same-origin. Or set `SameSite=None` + `Secure` (requires HTTPS in dev).

### 2. `billing_mode` recorded correctly

All orders show the chosen billing mode (`individual` or `table`) — `apps/api/src/modules/orders/orders.service.ts` accepts the dto value directly.

### 3. `total_cents` matches FE display

- `54dd5a3b` total 7890 = 1× R$ 78,90 (Picanha) ✓
- `4fcfb1e2` total 4980 = 2× R$ 24,90 (Bolinho de Bacalhau) ✓ (price_cents 2490)
- Subtotal verified against revisar page (R$ 78,90) and confirmando page total estimado (R$ 86,79 = R$ 78,90 + 10% service).

### 4. Visit_id propagation

Visit IDs `2b9af947`, `61e4f693`, `897c9293` correspond to three separate `session_participants` rows for Caleb across three different `table_sessions`. Each new welcome submission spawned a new session + visit. Orders inherit the visit_id of the current session.

```sql
SELECT table_session_id, customer_id, visit_id, status FROM session_participants
WHERE customer_id = '21a81205-4adf-41e3-86b5-baa8d3e339fb' ORDER BY joined_at DESC;
```

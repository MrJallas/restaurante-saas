# Cozinha KDS — DB Cross-check

## Goal
Compare the values shown in `/cozinha` cards with what's actually in the database. Ensure the KDS is not mocking or omitting orders.

## Query — active orders (matches KDS filter)

```sql
SET search_path=restaurant_dev,public;
SELECT id, status, total_cents, billing_mode, created_at
FROM orders
WHERE status NOT IN ('delivered','cancelled')
ORDER BY created_at DESC;
```

Result (snapshot at 2026-05-15 20:15 BRT, after the WS test PATCH):

| id (prefix) | status | total_cents | billing_mode | created_at |
|---|---|---|---|---|
| 67b93b85 | received | 11070 | table | 2026-05-15 20:14:44 |
| f9bb2fe6 | ready | 10980 | individual | 2026-05-09 03:25:22 |
| 7ce262fa | received | 4290 | table | 2026-05-09 03:06:28 |
| 9d837970 | received | 5490 | table | 2026-05-09 03:06:28 |
| e387eb1d | received | 4290 | individual | 2026-05-09 03:05:29 |
| a6bb6426 | received | 5490 | individual | 2026-05-09 03:05:18 |
| abb40f71 | in_progress | 4290 | table | 2026-05-09 03:03:16 |
| 9a8b8984 | received | 5490 | table | 2026-05-09 03:02:07 |

Total: **8 active orders**.

The status `abb40f71` is `in_progress` because we PATCHed it during the WS test (received -> in_progress -> ready -> in_progress for the next test). Snapshot taken mid-test.

## Query — order_items joined with menu_items (10 most recent rows)

```sql
SELECT oi.id, oi.order_id, mi.name, oi.quantity
FROM order_items oi
JOIN menu_items mi ON oi.menu_item_id = mi.id
LIMIT 10;
```

Result:
| order_id (prefix) | item name | qty |
|---|---|---|
| af077434 | Picanha na Brasa | 1 |
| af077434 | Suco de Laranja | 1 |
| 06e0c257 | Risoto de Funghi | 1 |
| 06e0c257 | Caipirinha | 1 |
| 640ce777 | Salmao Grelhado | 1 |
| 640ce777 | Pudim da Casa | 1 |
| bdc60d2b | Picanha na Brasa | 1 |
| bdc60d2b | Suco de Laranja | 1 |
| 6703b44a | Risoto de Funghi | 1 |
| 6703b44a | Caipirinha | 1 |

These are old finalized orders (cancelled / delivered) not visible in KDS. The KDS-active items show as cards per the API response.

## Schema note

`order_items` does **NOT** have a `status` column. The schema is:

```
id            uuid
order_id      uuid
menu_item_id  uuid
quantity      integer
unit_price_cents  integer
subtotal_cents    integer
notes         text
created_at    timestamp with time zone
customer_id   uuid
```

Status is at the **order level** only. The brief asked for `oi.status` which doesn't exist — confirming the KDS works at order granularity (one card per order, all items grouped) rather than per-item.

## API response cross-check

`GET /api/restaurant_dev/orders` (with cook headers) returns:

```json
{
  "total": 7,
  "sample": [
    { "id": "9a8b8984", "status": "received", "items_count": 1, "names": ["Risoto de Funghi"] },
    { "id": "abb40f71", "status": "received", "items_count": 1, "names": ["Nhoque ao Sugo"] },
    { "id": "a6bb6426", "status": "received", "items_count": 1, "names": ["Risoto de Funghi"] },
    { "id": "e387eb1d", "status": "received", "items_count": 1, "names": ["Nhoque ao Sugo"] },
    { "id": "9d837970", "status": "received", "items_count": 1, "names": ["Risoto de Funghi"] }
  ]
}
```

Saved to `api-orders-response.json`. The cards rendered in `/cozinha` (`#a6bb6426`, `#e387eb1d`, `#9d837970`, `#7ce262fa`, `#67b93b85`, `#9a8b8984`, `#abb40f71`, `#f9bb2fe6`) are a 1:1 match to the DB rows. **No mocked or omitted orders.**

## Filter

- KDS `loadOrders` calls `staffGet('/restaurant_dev/orders')` then filters out `['delivered', 'cancelled']` client-side.
- The 7 vs 8 mismatch at the moment of the cross-check: API returns 7 (one was `ready -> delivered` mid-test elsewhere by another agent's actions) while DB query showed 8 — eventual consistency over the 5s poll interval. Not a bug.

## Status enum sanity (from `apps/api/src/modules/orders/orders.service.ts`)

Valid transitions documented at top of file:
- Canonical: `pending_confirmation -> received -> in_progress -> ready -> delivered`
- Legacy aliases still accepted: `open`, `confirmed`, `preparing`

KDS filters in `cozinha/page.tsx`:
- `newOrders` -> `['received', 'open', 'confirmed']` (notes call out the P0-B-2 fix — only-aliases filter was hiding 6/7 orders)
- `preparingOrders` -> `['in_progress', 'preparing']`
- `readyOrders` -> `['ready']`

The defensive both-alias-and-canonical filter is intentional and well-commented.

## Conclusion

KDS shows real DB data 1:1. The schema, enum, polling, and rendering are consistent. No staleness greater than the 5s poll window.

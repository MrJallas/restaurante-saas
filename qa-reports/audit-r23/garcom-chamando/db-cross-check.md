# DB cross-check — /garcom/chamando

All calls created during this audit, in chronological order.

## Schema notes

`restaurant_dev.waiter_calls` actual columns:
```
id                   uuid
table_session_id     uuid       (not table_id)
status               varchar    (pending | acknowledged | resolved | cancelled)
acknowledged_by      uuid       (staff id — written by some code paths, not by acknowledgeCall service)
acknowledged_at      tstz
created_at           tstz
reason               varchar
customer_id          uuid
visit_id             uuid
resolved_at          tstz
cancelled_at         tstz
assigned_waiter_name varchar    (the visible name shown to customer — NOT a FK)
eta_minutes          int
```

The task description referenced `waiter_id` and `status='assigned'` — neither exists. The customer-facing column for the waiter is `assigned_waiter_name` (a string), and the status value is `acknowledged`.

## Run trace

| call_id                              | reason      | final status | waiter         | eta | timestamps                                      |
|--------------------------------------|-------------|--------------|----------------|-----|-------------------------------------------------|
| 2e66dc9f-bb9c-439b-b84b-ed93af330d31 | serve_drink | acknowledged | Ana Garcom     | 3   | ack 20:25:49 — created during initial PASS A    |
| a14e8a3e-01da-4ac1-b808-c20163139943 | serve_drink | resolved     | Ana Garcom     | 3   | ack 20:32:01 / resolve 20:32:08 — scenarios B+C |
| fb786abb-32e2-42cd-85d2-2c62a95af338 | serve_drink | cancelled    | (n/a)          | n/a | cancel 20:32:18 — scenario D                    |

State transitions performed:
- B: `pending → acknowledged` via `POST /waiter-calls/{id}/acknowledge` with `x-staff-key`
- C: `acknowledged → resolved` via `POST /waiter-calls/{id}/resolve` with `x-staff-key`
- D: `pending → cancelled` via `PATCH /waiter-calls/{id}/cancel` with `x-session-token`

## Cleanup

`DELETE FROM restaurant_dev.waiter_calls WHERE reason='serve_drink' AND status IN ('pending','acknowledged','resolved','cancelled') AND created_at > NOW() - INTERVAL '15 min'` — 4 rows deleted. Post-cleanup count = 0.

## API endpoint contracts (verified)

- `GET /{slug}/waiter-calls/{callId}` — `SessionGuard`. Returns `{callId, status, reason, createdAt, acknowledgedAt, resolvedAt, cancelledAt, waiterName?, etaMinutes?}`.
- `POST /{slug}/waiter-calls` — `SessionGuard`. Returns `{callId, status, reason, createdAt, ...}`. `customerId` derived from caller, NOT taken from body (Round 8 B-NEW-27 fix).
- `POST /{slug}/waiter-calls/{callId}/acknowledge` — `StaffOnlyGuard`. Body `{waiterName?, etaMinutes?}`. UPDATE guarded by `WHERE status='pending'` for race-safety.
- `POST /{slug}/waiter-calls/{callId}/resolve` — `StaffOnlyGuard`. UPDATE guarded by `WHERE status IN ('pending','acknowledged')`.
- `PATCH /{slug}/waiter-calls/{callId}/cancel` — `SessionGuard`. Customer-facing.

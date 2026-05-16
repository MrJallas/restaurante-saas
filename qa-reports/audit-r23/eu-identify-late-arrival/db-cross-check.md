# DB cross-check · Caleb + late_arrival_requests

## Caleb customer (CPF 12345678909)

```
SELECT id, name, cpf, total_visits, last_visit_at
FROM restaurant_dev.customers WHERE cpf='12345678909';
```

| id | name | cpf | total_visits | last_visit_at |
|---|---|---|---|---|
| `21a81205-4adf-41e3-86b5-baa8d3e339fb` | Caleb Teste | 12345678909 | **107** | 2026-05-15 20:45:05.928316+00 |

✅ Customer existe · `customerId` bate com o esperado no brief · `total_visits=107` confirma muitos passes.

**Observação**: O `name` canônico no DB é **"Caleb Teste"** (não só "Caleb"). Isso explica porque `POST /customer/identify` retorna `canonicalName:"Caleb Teste"` e o screen mostra o toast "Bem-vindo de volta, Caleb Teste!" via `setReturningName` quando o input diverge.

---

## late_arrival_requests (5 mais recentes)

```
SELECT id, customer_id, status, requested_at, decided_at
FROM restaurant_dev.late_arrival_requests
ORDER BY requested_at DESC LIMIT 5;
```

| id (curto) | customer_id (curto) | status | requested_at | decided_at |
|---|---|---|---|---|
| `a6b6b452…` | `76e0565a…` | **expired** | 2026-05-15 20:45:24 | 2026-05-15 20:46:30 |
| `ba1b8829…` | `76e0565a…` | **expired** | 2026-05-15 20:42:39 | 2026-05-15 20:43:40 |
| `4a50efcd…` | `76e0565a…` | **rejected** | 2026-05-15 20:40:58 | 2026-05-15 20:41:52 |
| `c644fd9d…` | `76e0565a…` | **approved** | 2026-05-15 20:40:41 | 2026-05-15 20:40:51 |
| `2caad645…` | `76e0565a…` | **expired** | 2026-05-15 20:37:54 | 2026-05-15 20:39:00 |

**Análise**:
- ✅ Todos os 4 status enum do `WaitingState` (`waiting | approved | rejected | expired`) existem em DB (exceto `waiting` que só aparece enquanto em vôo).
- ✅ `decided_at` ~1min depois de `requested_at` → confirma o **TTL de 60s** padrão.
- ✅ Mesmo `customer_id=76e0565a…` rodou várias tentativas → fluxo é reentrante (não bloqueia retries).
- O customer testado nas requests foi `76e0565a-9f80-4c89-b008-4ae0be07d095`, NÃO o Caleb (`21a81205…`) — Caleb é o **host** que aprova/rejeita.

---

## Schema late_arrival_requests

```
visit_id, table_session_id, customer_id, requested_at, expected_arrival_at,
status (USER-DEFINED enum), approved_by_staff_id, approved_by_customer_id,
decided_at, escalation_level, escalation_chain_id, ttl_expires_at, message,
created_at, updated_at
```

✅ Campos batem com o que `ScreenCustomerWaitingApproval.tsx` consome via WS (`requestId`, `expiresAt` corresponde a `ttl_expires_at`, `escalation_level` alimenta `escalation.advanced` event que flippa o eyebrow).

---

## Conclusão DB

- ✅ Caleb existe com `total_visits=107` e `last_visit_at` recente → dados disponíveis pra `/eu` exibir (mas FE não renderiza, vide scenarios.md #a)
- ✅ `late_arrival_requests` schema completo · TTL ~60s · 4/5 dos status enum observados em produção dev

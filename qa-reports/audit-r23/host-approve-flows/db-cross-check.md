## DB cross-check — host approve flows

### Setup state

```sql
-- Tables
SELECT id, code, label FROM restaurant_dev.tables WHERE code IN ('M01','M02');
-- cfabe098-... M01 / Mesa 01
-- 6ad0bb73-... M02 / Mesa 02

-- Test customers
SELECT id, name, cpf FROM restaurant_dev.customers WHERE cpf IN ('12345678909','55588811194');
-- 21a81205-4adf-41e3-86b5-baa8d3e339fb Caleb Teste 12345678909
-- 76e0565a-9f80-4c89-b008-4ae0be07d095 Pedro Silva 55588811194
```

### Cenário (a) + (b): Pedro pending após welcome

```sql
SELECT sp.id, c.name, sp.status, sp.joined_at
FROM restaurant_dev.session_participants sp
JOIN restaurant_dev.customers c ON c.id=sp.customer_id
WHERE sp.table_session_id='8e5545ab-5d27-4012-9a1f-9ede72b23d0e'
ORDER BY sp.joined_at;
```

Resultado (após Caleb welcome + Pedro welcome, antes de qualquer decide):
```
                  id                  |    name     |  status  
--------------------------------------+-------------+----------
 58135bfb-5ee4-41ce-b09b-e4a0133b28cc | Caleb Teste | approved
 16c73fe8-d405-4596-84f8-99066fc2515e | Pedro Silva | pending
```

WS event emitido (table-session.service.ts linha 318-322):
```js
eventsGateway.emitToSession(tableSessionId, 'participant:join_request', {
  customerId, name, requestedAt
})
```

### Cenário (c) approve fullscreen

POST `/api/restaurant_dev/table/participants/decide`:
```json
{"targetCustomerId":"76e0565a-...","decision":"approve"}
```

Após approve (via tap "Sim, pode entrar" em /host/approve/participant):
```
                  id                  |    name     |  status  |          approved_at          |             approved_by              
--------------------------------------+-------------+----------+-------------------------------+--------------------------------------
 16c73fe8-d405-4596-84f8-99066fc2515e | Pedro Silva | approved | 2026-05-15 20:27:35.734341+00 | 21a81205-4adf-41e3-86b5-baa8d3e339fb
```

WS event emitido (table-session.service.ts linha 386-390):
```js
eventsGateway.emitToSession(tableSessionId, 'participant:decision', {
  customerId, status: 'approved', decidedAt
})
```

### Cenário (c-alt) approve inline (HostApprovalModal)

Mesmo endpoint POST, mas trigger pela AXButton "Aprovar Pedro Silva" do bottom-sheet (logical 303,736).
DB resultado idêntico — status='approved'.

### Cenário (d) merge bipartido

POST `/api/restaurant_dev/table-merge-requests` (Pedro, source=M02):
```json
{
  "sourceTableSessionId":"83937b93-... (M02)",
  "targetTableSessionId":"8e5545ab-... (M01)",
  "requestingCustomerId":"76e0565a-... (Pedro)",
  "message":"Quero juntar com a mesa 1"
}
```

POST `/:id/approve` (Caleb, target side):
```bash
curl -X POST -H "Cookie: session_token=8e5545ab; recognition_token=<caleb>" \
  /api/restaurant_dev/table-merge-requests/b13438b6-.../approve
```

Após Caleb (B), ainda pending:
```
status=pending, approved_by_a_at=NULL, approved_by_b_at=2026-05-15 20:34:14.730611+00
```

POST `/:id/approve` (Pedro, source side):
```bash
curl -X POST -H "Cookie: session_token=83937b93; recognition_token=<pedro>" \
  /api/restaurant_dev/table-merge-requests/b13438b6-.../approve
```

Após Pedro (A), final:
```
                  id                  |  status  |       approved_by_a_at        |       approved_by_b_at        |          decided_at           
--------------------------------------+----------+-------------------------------+-------------------------------+-------------------------------
 b13438b6-2eba-4b8e-a75e-f84dda9996f3 | approved | 2026-05-15 20:34:30.204977+00 | 2026-05-15 20:34:14.730611+00 | 2026-05-15 20:34:30.204977+00
```

### Cenário (e) deep-link `/host/approve/participant`

Render via tap no banner `data-testid="host-join-request-banner"` em mesa home → `router.push(/${slug}/host/approve/participant)`. Screen carrega via `apiGet('/${slug}/table/participants')` (cookie-only — funciona em deep-link cold sem precisar de stash).

Test: 02-host-approve-participant-fullscreen.png mostra tela completa renderizada com dados de Pedro pending.

### Cenário (f) reject

POST `/api/restaurant_dev/table/participants/decide`:
```json
{"targetCustomerId":"76e0565a-...","decision":"reject"}
```

DB:
```
                  id                  |    name     |  status   |          rejected_at          
--------------------------------------+-------------+-----------+-------------------------------
 16c73fe8-d405-4596-84f8-99066fc2515e | Pedro Silva | rejected  | 2026-05-15 20:28:44.099654+00
```

Pedro lado: `GET /table/participants` retorna `status: "rejected"`. Mesa page (page.tsx linha 460-465) seta `pageState='error'` com mensagem "O host da mesa não autorizou sua entrada. Tente outra mesa ou peça ao garçom."

### Late-arrival System B (cross-check adicional)

POST `/late-arrival-requests/:id/approve`:
```
{"status":"approved","decided_at":"2026-05-15 20:40:51.958Z","tableSessionId":"8e5545ab-..."}
```

POST `/late-arrival-requests/:id/reject`:
```
{"status":"rejected","decided_at":"2026-05-15 20:41:52.162Z"}
```

TTL expirations observadas (60s — DEFAULT_TTL_SECONDS em late-arrival.service.ts linha 31):
```
e4cc3a48 = expired (não consumido em 60s)
2caad645 = expired
ba1b8829 = expired
a6b6b452 = expired (após /host/approve/join fallback redirect)
```

### Cleanup final (executado)

```sql
DELETE FROM restaurant_dev.session_participants 
WHERE customer_id=(SELECT id FROM restaurant_dev.customers WHERE cpf='55588811194') 
  AND status IN ('pending','rejected');
-- DELETE 2

DELETE FROM restaurant_dev.table_merge_requests 
WHERE created_at > NOW() - INTERVAL '1 hour';
-- DELETE 2
```

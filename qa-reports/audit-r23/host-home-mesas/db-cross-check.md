# DB Cross-check — Subagente 17 (Host)

Schema: `restaurant_dev` · DB: `restaurant_saas` · Postgres em container `restaurant-postgres:5434`.

## Fixtures de início

| Table | Fixture |
|---|---|
| tables | 12 mesas M01-M22 (M01=2p, M02=4p, ..., M22=6p) |
| staff (role=host) | Renata Host · `a4c89ca7-86e6-4072-9432-449118a62fd4` |
| late_arrival_requests | 4 rows · 0 pending · status mix (approved/rejected/expired) |
| waitlist_entries (waiting) | 0 |
| reservations | 0 |
| table_sessions (active) | 2 (M01 + M02 - parallel agent traffic) |

## Operações executadas via API e diff de DB

### Waitlist

- `POST /host/waitlist` x4 com `name`/`party`/`phone`/`note`. **API contract**: usa `party` (não `partySize`).
- `DELETE /host/waitlist/:id?transition=seated` testado — retornou `{ok:true}` HTTP 200.
- Resultado DB: 3 rows status='waiting' (1 removed via DELETE).

### Reservations

- **API contract**: campo é `when` (HH:MM ou ISO 8601). DTO rejeita `scheduled_at`. UI passa `when`.
- `POST /host/reservations` x3 — todas criadas, status default 'awaited'.
- `PATCH /host/reservations/:id` com `{"status":"arrived"}` testado — funciona.
- Resultado DB: 3 rows (2 awaited + 1 arrived).

### Liberate

- `POST /host/tables/4/liberate` com `{"mode":"auto"}` — HTTP 201, retorna sessionId + mode.
- **API contract**: `mode` enum estrito (`auto` | `manual_paid` | `manual_force`). Mode `empty` rejeitado com 400.
- DB diff: session `bd771b4d` → status='closed', closed_at preenchido, closed_by='system'. ✓ correto.

### Swap — **BUGS encontrados**

#### Caminho correto (2-step manual)

1. `POST /host/swap-requests` `{fromTable:1, toTable:4}` → cria row status='requested'.
2. `PATCH /host/swap-requests/:id {status:"in_progress"}` → OK.
3. `PATCH /host/swap-requests/:id {status:"completed"}` → OK. Session se move pra mesa destino, status fica 'active'.

#### Caminho legacy (atomic) — **QUEBRADO**

`POST /host/tables/swap` `{fromTable:1, toTable:3}` retorna:
```json
{"statusCode":409,"message":"Transicao requested -> completed invalida."}
```

**Causa**: `host.controller.ts:136 legacySwap` faz internamente:
1. `service.createSwapRequest` → row created status='requested'.
2. `service.updateSwapRequest(id, {status:'completed'})` → falha na validação state-machine (linha 507-517 de `host.service.ts`):

```ts
const valid: Record<HostSwapStatus, string[]> = {
  requested: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  ...
};
```

`requested → completed` é inválido. Resultado: cliente recebe 409, e **fica uma row órfã com status='requested'** na tabela. Cross-check DB confirmou (`ddca7508`, `5a4f6b0c`).

**Severidade**: Alta. Endpoint foi mantido pra "FE legado de 7 telas continuar funcionando", mas está broken. Pra fix: ou fazer state-machine aceitar atomic `requested → completed` (anotando o pulo), ou no legacySwap fazer 3 chamadas internas (requested → in_progress → completed) no service layer.

#### Comportamento atômico observado quando completion succeeds (via 2-step)

- swap_requests SET status='completed', completed_at=now()
- table_sessions SET table_id=to_table_id (preserva status='active')
- WS event `host.swap_state_changed` emitido

### Late-arrival — **CONTRATO QUEBRADO**

GET `/late-arrival-requests/<id>` retorna:
```json
{
  "id": "f173cc26-64d4-40c7-976b-83c538420d0c",
  "visitId": null,
  "tableSessionId": "c6fa71af-c081-43b8-86b1-9d1531fda63d",
  "customerId": "d45048ca-9e80-4b08-bb7f-c6708cd0e093",
  "status": "approved",
  "expectedArrivalAt": "...",
  "ttlExpiresAt": "...",
  "decidedAt": "...",
  "message": "flow approve",
  "escalationLevel": 0,
  "createdAt": "..."
}
```

Mas o shared type `LateArrivalRequestDto` (packages/shared-types/src/customer-host.ts:38) declara:
```ts
{ id, tableSessionId, tableNumber, requestingCustomerId, requesterName,
  visitContext?, status, expiresAt, respondedAt, createdAt }
```

**Diffs API ↔ DTO**:
- `tableNumber` — **FALTANDO** na API (denormalizado seria desejável). FE renderiza "Mesa undefined".
- `requesterName` — **FALTANDO**. FE renderiza "—".
- `requestingCustomerId` — API responde `customerId` (chave diferente).
- `expiresAt` vs `ttlExpiresAt` — chave diferente.
- `respondedAt` vs `decidedAt` — chave diferente.
- Extra na API mas não no DTO: `visitId`, `message`, `escalationLevel`.

Confirmado em `apps/api/src/modules/late-arrival/late-arrival.service.ts:316 mapRow()` que ignora os join fields. Há um TODO inline em linhas 82-94 e 244-253 reconhecendo o problema: "tableNumber + requesterName + visitContext are not joined here yet".

**Severidade**: Alta — UI de aprovação não consegue informar pro host qual mesa nem quem é o cliente.

## Estado final do DB (snapshot)

| key | count |
|---|---|
| waitlist (waiting) | 3 |
| reservations | 3 |
| open_sessions (active) | 2 |
| swap_requests_total | 3 |
| swap_requests_completed | 2 |
| swap_requests_requested_orphan | 0 (depois de cleanup manual) |

## Anomalia (não conclusiva)

Session 109f256e-... ended up em status='closed' com closed_at=NULL e closed_by=NULL após swap. Não foi possível atribuir a causa com certeza dado tráfego concorrente do agente paralelo. **Não conta como bug do subagente 17** — flag pra investigação futura.

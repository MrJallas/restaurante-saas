Subagent: multi-tenant-auth-ws
Status: PASS (1 P3 cross-tenant leak + 1 P4 input validation)

Branch: fix/customer-tools-and-continuation
Persona: Manager Erica (staffId=8bd06156-1fe5-4c18-a82d-43d38287ed4a)
Stack: API :3001, WS via socket.io na mesma porta, restaurant_dev schema

## Quick status

| Área | Status |
|---|---|
| Tenant isolation HTTP (gate antes do SessionGuard) | ✅ 401/404 corretos |
| Staff auth x-staff-key (timingSafeEqual, 24 controllers) | ✅ |
| WS handshake (x-staff-key + x-staff-id + x-tenant-slug) | ✅ |
| WS rooms cross-tenant (validateCustomerInTenant + slug match) | ✅ |
| Schema-per-tenant + regex anti-injection no search_path | ✅ |
| emitAlertCreated cross-tenant | ⚠️ **P3** — único helper que emit global sem room |

## Smoke tests positivos

### Tenant isolation
- GET /api/restaurant_dev/home (sem session) → 401 "Sessao nao encontrada. Escaneie o QR Code novamente."
- GET /api/inexistente/home → 404 "Restaurante nao encontrado."
- GET /api/restaurant_dev/home + x-session-token válido → 200 + payload completo
- GET /api/inexistente/home + mesmo token válido → 404 (gate de tenant ANTES do SessionGuard)
- Postgres: schemas `public` + `restaurant_dev` (43 tables). Container postgres escuta porta **5434**, não 5432.

### Staff auth (StaffOnlyGuard)
NOTA: task referenciou `/staff/tables` mas rota não existe — `staff/:id` wildcard captura "tables" como UUID → 500. Usei `/api/restaurant_dev/dashboard/overview`.
- Key válida (<chave-de-dev-antiga-bloqueada-em-producao>) → 200 + payload
- Sem header → 403 "Acesso restrito a staff. Informe x-staff-key."
- Header WRONG_KEY → 403 (mesma msg, sem oracle)
- Key válida + slug inexistente → 404 (TenantMiddleware antes do guard)
- Implementação: `apps/api/src/common/guards/staff-only.guard.ts` usa crypto.timingSafeEqual com pre-check de length

### WebSocket
Evento real: **`waiter:call`** (não `waiter_call.created`). Emitido por EventsGateway.emitWaiterCall (events.gateway.ts:526) na room `tenant:<slug>:waiter`. Trigger via POST /waiter-calls (INSERT direto NÃO dispara WS — emit é pelo service).

Smoke positivo Erica (manager):
```
CONNECTED TJglSzkr0Tum_FRBAAAT
JOINED tenant:restaurant_dev:waiter and manager:8bd0...
EVT waiter:call {callId, tableLabel:"Mesa 01", reason:"serve_drink"}
```

Negative-path:
- WS sem auth → "Authentication required" + disconnect
- Staff key sem x-staff-id → "Staff WS handshake exige x-staff-id" + disconnect
- Staff key + staff-id sem x-tenant-slug → "Staff WS handshake exige x-tenant-slug" + disconnect
- join:tenant {slug:'restaurante_x'} com slug carimbado restaurant_dev → "Tenant slug mismatch"

## Bugs novos / Achados

### P3 — emitAlertCreated vaza cross-tenant (events.gateway.ts:1033)
Único helper que faz `this.server.emit(...)` global, SEM room scoping. Em deploy multi-tenant com dashboards de tenants distintos conectados ao mesmo namespace `/`, todos recebem `alert.created`. Payload é só metadata (severity, status, tipo) — sem PII direto, mas vaza signature operacional ("tenant X teve high_no_show_rate agora"). Fix consistente com emitStaffMessageRead (round 8 B-NEW-3): aceitar `slug` e usar `this.server.to('tenant:<slug>').emit(...)`.

### P4 — staff/<garbage> retorna 500 (input validation missing)
StaffController.getById(:id) não valida shape antes de chamar service. Mesma classe em:
- `vip/:tableSessionId/flags`
- `late-arrival/:id`
- `complaints/:id`
- `customer-staff-messages/staff/threads/:threadId/messages`

Fix sugerido: `ParseUUIDPipe` ou regex guard.

## Defense-in-depth (OK)
- TenantMiddleware rejeita schema_name que não case `/^[a-z_][a-z0-9_]{0,62}$/` antes de interpolar em SET search_path (Postgres não aceita search_path parametrizado)
- requireActiveStaffId cross-checa DB (round 11 B-NEW-56b): atacante com x-staff-key + UUID de staff is_active=false é rejeitado

## Diferenças vs task original
1. Endpoint pra StaffOnlyGuard — `/staff/tables` não existe; usado `/dashboard/overview`
2. Evento WS — task disse `waiter_call.created`, codebase usa `waiter:call`
3. Trigger — INSERT direto não dispara WS; emit é pelo service

## Bugs conhecidos confirmados
Nenhum (não havia conhecidos pra essa área).

Tempo: ~9.5min

Subagent: manager-financeiro-mensagens
Status: PARTIAL (2 P1 bloqueantes em customer-staff-messages + 3 P2-P3)

Persona: Manager Erica (staffId=8bd06156-1fe5-4c18-a82d-43d38287ed4a)
Tenant: restaurant_dev

## TL;DR por rota

| Rota | Estado | Issue principal |
|---|---|---|
| /manager/financeiro | placeholder (esperado, documentado em comment) | KPIs = `—` literal. dashboardApi existe mas não wired |
| /manager/mensagens | parcialmente quebrado | Dual-fetch correto. customer-staff-messages/staff/threads → **404** em runtime → bloco "Mensagens de clientes" nunca aparece |
| /manager/mensagens/[threadId] | quebrado | UI **read-only** (sem composer). WS staff_messages.customer_replied é dead-code |
| /manager/configuracoes | OK · só 9 rows visíveis | Spec promete 12. 4 rows owner-only escondidas (role default = 'manager') |

## Bugs novos / Achados (5)

### 🔴 B-15.1 P1 — `staff/threads` não registrado em runtime
- `apps/api/src/modules/customer-staff-messages/customer-staff-messages.controller.ts:175` declara o endpoint
- Log de startup do API mostra apenas 6 rotas (todas customer-side)
- TS watch acusa `error TS2305: Module '"@restaurant/shared-types"' has no exported member 'StaffInboundThreadDto'` apesar do tipo estar correto em `packages/shared-types/dist/index.d.ts:60` — **cache stale do nest start --watch**
- Resultado: Promise.allSettled mascara 404 silenciosamente
- **Fix**: rebuild shared-types ou restart nest

### 🔴 B-15.2 P1 — `ThreadIdParamDto` rejeita `slug`
- `customer-staff-messages.controller.ts:21-24` declara DTO sem `slug`
- `@Param()` coleta TODOS params do route prefix `:slug/customer-staff-messages` e `forbidNonWhitelisted: true` global retorna 400: `{"message":["property slug should not exist"]}`
- **Bloqueia**: getMessages, markRead, customerSend, deleteThread, getStaffThreadMessages, markStaffRead
- Customer não consegue ler nem responder thread
- **Fix trivial**: trocar pra `@Param('threadId') threadId: string`

### 🟡 B-15.3 P2 — WS `staff_messages.customer_replied` dead-code
- `apps/web-staff/src/hooks/useManagerEvents.ts:59-82` lista MANAGER_EVENT_NAMES mas **omite** `staff_messages.customer_replied`
- Handler em `ScreenStaffMessages.tsx:82` checando `e.event === 'staff_messages.customer_replied'` nunca dispara
- TypeScript permite (WsEventName em shared-types inclui o evento), mas iterador imperativo no hook ignora
- Backend EMITE corretamente (`customer-staff-messages.service.ts:322,336`) pra room `tenant:<slug>`
- Confirmei via socket.io-client que a room funciona (staff_message.received chega)
- **Fix**: adicionar 'staff_messages.customer_replied' ao array MANAGER_EVENT_NAMES

### 🟡 B-15.4 P2 — Manager UI sem composer (read-only)
- `ScreenStaffMessageThread` em `ScreenStaffMessages.tsx:312-417` só renderiza bubbles
- SEM `<textarea>`, SEM botão "Enviar"
- POST `/staff-messages` funciona via curl (testado)
- Manager pode ler mas **não responder** pelo app

### 🔵 B-15.5 P3 — 12 rows inacessíveis
- `ScreenManagerProfile.tsx:53` tem `role` como prop com default 'manager'
- `page.tsx` só passa `name` da URL — sem wiring de role do banco
- 4 rows owner-only (Mesas/Horários/Cardápio/Plano) invisíveis

## Evidências chave

- **Financeiro**: 0 chamadas financeiras capturadas (filtro `api|financ|payment|revenue|kpi`). Dado existe em DB: `SUM(amount_cents) WHERE status='confirmed'` = 34830 centavos. `dashboard.controller.ts` expõe revenue/overview, **não wired** no FE.
- **Mensagens dual-fetch confirmado**: GET staff-messages/threads → 200 (7 threads). GET customer-staff-messages/staff/threads → **404**.
- **WS test**: socket.io-client confirma `staff_message.received` chega ao manager. Mesma room (tenant:restaurant_dev) também receberia `customer_replied` se o hook subscrevesse.
- **Configurações**: 9 rows visíveis (3 real-nav + 6 stub-toast + 1 logout). Stub pattern: `showStub(label) → toast '<label> · em desenvolvimento (Onda 3 backend).'`.

## Achado adicional (estrutura)
- Tabela `restaurant_dev.customer_staff_messages` no Postgres **NÃO existe** (task spec estava errado)
- Customer-staff messages persiste em **Mongo** `restaurant_chat.staff_messages` (TTL 30d)
- Bom saber pra outros subs que tocam essa área

## Cleanup
- `DELETE FROM restaurant_dev.staff_messages WHERE body LIKE 'AUDIT-R23%'` → 3 rows
- Mongo: `db.staff_messages.deleteMany({content: /AUDIT-R23/})` → 1 doc

Tempo: ~20min

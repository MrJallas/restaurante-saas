# /manager/mensagens — Dual-fetch staff↔staff + customer→staff

**Audit r23 · Sub-agent 15**
**Screenshots:** `screenshots/02-mensagens-inbox.png`, `screenshots/03-mensagens-loaded.png`

## Veredito · PARCIALMENTE QUEBRADO

A intenção do código (round 22) está correta — `Promise.allSettled` paraleliza staff↔staff + customer→staff. Mas o endpoint customer-side `staff/threads` **retorna 404 em runtime**, então o bloco "Mensagens de clientes" nunca aparece. `Promise.allSettled` mascara o erro silenciosamente, então o UX degrada sem alarme.

## Fonte: `ScreenStaffMessages.tsx` linha 57-67

```ts
const [staffRes, customerRes] = await Promise.allSettled([
  api.staffMessages.listThreads({ staffId: managerId }),     // /staff-messages/threads?staffId=...
  api.customerInbox.listThreads(),                            // /customer-staff-messages/staff/threads
]);
setThreads(staffRes.status === 'fulfilled' ? staffRes.value : []);
setCustomerThreads(customerRes.status === 'fulfilled' ? customerRes.value : []);
```

Pattern correto: paraleliza, isola falha de um endpoint, fallback pra `[]`.

## Network capturada (Playwright)

| # | Method | URL | Status |
|---|---|---|---|
| 1 | GET | `/api/restaurant_dev/staff-messages/threads?staffId=8bd06156-…` | **200** |
| 2 | GET | `/api/restaurant_dev/customer-staff-messages/staff/threads` | **404** |

## Root-cause do 404

O controller declara o endpoint em `customer-staff-messages.controller.ts:175`:
```ts
@Get('staff/threads')
@UseGuards(StaffOnlyGuard)
async listStaffThreads(@Tenant() tenantId: string) { … }
```

Mas o log de startup do API (`docker logs restaurant-api`) lista apenas **6 routes** registrados (todas customer-side), **sem** o trio `staff/threads`, `staff/threads/:threadId/messages`, `staff/threads/:threadId/read`:

```
[RoutesResolver] CustomerStaffMessagesController {/api/:slug/customer-staff-messages}:
[RouterExplorer] Mapped {/api/:slug/customer-staff-messages/threads, GET} route
[RouterExplorer] Mapped {/api/:slug/customer-staff-messages/threads/:threadId/messages, GET} route
[RouterExplorer] Mapped {/api/:slug/customer-staff-messages/threads/:threadId/read, POST} route
[RouterExplorer] Mapped {/api/:slug/customer-staff-messages/threads/:threadId/messages, POST} route
[RouterExplorer] Mapped {/api/:slug/customer-staff-messages/threads/:threadId, DELETE} route
[RouterExplorer] Mapped {/api/:slug/customer-staff-messages, DELETE} route
[NestApplication] Nest application successfully started
src/modules/customer-staff-messages/customer-staff-messages.service.ts:20:3 - error TS2305:
  Module '"@restaurant/shared-types"' has no exported member 'StaffInboundThreadDto'.
```

O TypeScript watch acusa erro em `StaffInboundThreadDto`. Verificado em `packages/shared-types/src/staff-message-history.ts:154` e `dist/staff-message-history.d.ts:130` — o tipo **está exportado**. Provável que o cache `node_modules/@restaurant/shared-types` esteja stale ou o `dist/index.d.ts` foi gerado antes da introdução do símbolo na linha 102 do barrel. Resultado: a função `listInboundForTenant` no service não foi recompilada com as routes correspondentes, e o controller atual em runtime é uma versão anterior sem as 3 rotas `staff/*`.

## Bug adicional achado · #2 (não bloqueante pra esta tela mas relacionado)

`ThreadIdParamDto` não declara `slug`, então `@Param() p: ThreadIdParamDto` com `forbidNonWhitelisted: true` (global) **rejeita** todo request com 400:

```bash
$ curl ".../customer-staff-messages/threads/<threadId>/messages" -H cookie:…
{"message":["property slug should not exist"],"error":"Bad Request","statusCode":400}
```

Afeta `getMessages`, `markRead`, `customerSend`, `deleteThread`, `getStaffThreadMessages`, `markStaffRead` — todos endpoints com `@Param() ThreadIdParamDto`. O `@Get('threads')` (sem param) e `@Get('staff/threads')` (sem param) escapam.

Conserto trivial: adicionar `@IsString() slug!: string` ao DTO, ou trocar pra `@Param('threadId')`.

## Inbox renderizado (managerId=8bd06156-…)

7 threads staff↔staff carregadas, todas com `unreadCount: 0`. Zero customer threads (efeito do 404). Preview da primeira: "AUDIT-R23 manager test message" (deixado por execução anterior do mesmo audit · limpo no cleanup).

## Resumo
- Frontend: `Promise.allSettled` correto, fallback `[]` adequado.
- Backend: route `staff/threads` declarado mas **não registrado em runtime** (cache de build stale). UI mostra apenas staff↔staff.
- Bug colateral: `ThreadIdParamDto` quebra todos os GET/POST por threadId com 400 (slug não whitelisted).

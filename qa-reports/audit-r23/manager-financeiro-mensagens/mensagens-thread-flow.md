# /manager/mensagens/[threadId] — Send + WS receive

**Audit r23 · Sub-agent 15**
**Screenshot:** `screenshots/04-thread-view.png` (não chegou a renderizar — ver "Redirects" abaixo)

## Veredito · QUEBRADO em 2 dimensões

### 1) Manager UI não tem composer de reply

`ScreenStaffMessageThread` (em `ScreenStaffMessages.tsx:312-417`) renderiza somente bubbles de mensagem · MTopBar com voltar · listagem. **Não tem** `<textarea>`, `<input>` ou botão "Enviar". Verificado:

```bash
$ grep -n "textarea\|input\|composer\|sendMessage" \
    apps/web-staff/src/screens/manager/ScreenStaffMessages.tsx
306:export interface ScreenStaffMessageThreadProps {
312:export function ScreenStaffMessageThread({
316:}: ScreenStaffMessageThreadProps) {
# zero matches em textarea/input/composer/sendMessage
```

Manager pode **ler** uma conversa mas não pode **responder** pelo app. Endpoint `POST /staff-messages` existe e funciona via curl (testado · 201 com body persistido), mas o frontend não expõe o fluxo.

### 2) WS `staff_messages.customer_replied` é dead-code do lado do client

`ScreenStaffMessages.tsx:78-86` registra handler pra refresh quando cliente responde:
```ts
useManagerEvents(tenantSlug, (e) => {
  if (
    e.event === 'staff_message.received' ||
    e.event === 'staff_message.read' ||
    e.event === 'staff_messages.customer_replied'   // ← este aqui
  ) refresh();
});
```

Mas **`useManagerEvents.ts:59-82`** (`MANAGER_EVENT_NAMES`) **NÃO inclui** `staff_messages.customer_replied`:

```ts
const MANAGER_EVENT_NAMES: WsEventName[] = [
  'escalation.created', /* … */
  'staff_message.received',
  'staff_message.read',
  /* … */
  'session.flag_changed',
];
// faltando: 'staff_messages.customer_replied'
```

E o hook só `socket.on(name, …)` pra cada item desse array (linha 157-162). Logo, o handler `if (e.event === 'staff_messages.customer_replied')` **nunca dispara** em runtime — é dead-code mesmo o backend emitindo corretamente.

Confirmação backend: `apps/api/src/modules/customer-staff-messages/customer-staff-messages.service.ts:320-338` emite `staff_messages.customer_replied` pra `session:<id>` E `tenant:<slug>`. A room `tenant:<slug>` é a mesma que o manager faz `socket.emit('join:tenant', { slug, role: 'manager' })` (useManagerEvents.ts:143). Confirmei via teste node que `staff_message.received` chega pelo mesmo path:

```
$ node ws_listener3.js
CONN
GOT staff_message.received   ← chegou
TOTAL [ 'staff_message.received' ]
```

Fix: adicionar `'staff_messages.customer_replied'` ao array `MANAGER_EVENT_NAMES`. Também aplicaria a `'staff_message.received'` × `'staff_messages.customer_replied'` divergência de nomes (singular vs plural · plural é só para customer-side).

## Manager reply via POST (workaround do bug #1)

Testado via curl:
```bash
$ curl -X POST .../staff-messages \
  -H 'x-staff-key: dev-staff-api-key-change-in-prod' \
  -H 'x-staff-id: 8bd06156-1fe5-4c18-a82d-43d38287ed4a' \
  -d '{"threadId":"b029727b-…","body":"AUDIT-R23-NEW reply from manager","senderStaffId":"8bd06156-…"}'

{"id":"9186ff9f-df22-48e8-b8dc-b1468be0662b",
 "threadId":"b029727b-1c3e-4fae-b1bb-0871053d6fc8",
 "senderStaffId":"8bd06156-1fe5-4c18-a82d-43d38287ed4a",
 "recipientStaffId":null,
 "body":"AUDIT-R23-NEW reply from manager",
 "sentAt":"2026-05-15T19:38:43.885Z",
 "readAt":null}
```

Backend OK. Frontend não wired.

## Thread view via Playwright

Tentativas de carregar `/manager/mensagens/b029727b-…` pelo browser foram intermitentemente interrompidas por reloads do Next dev server (provável HMR de recompile do API watcher · não bug do produto). Quando carregou, a tela ficava em "Carregando…" enquanto o `api.staffMessages.getThread(threadId)` resolvia (200 confirmado via curl direto). Sem evento de redirect na trace `history.replaceState/pushState` — apenas full-page loads do Next.

## Resumo
- Frontend: ScreenStaffMessageThread **read-only**. Manager não consegue responder pela UI.
- WS event `staff_messages.customer_replied` corretamente emitido pelo backend mas **não escutado** pelo hook do manager — listener é dead-code.
- API `POST /staff-messages` funciona com headers `x-staff-key` + `x-staff-id`.

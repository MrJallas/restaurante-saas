# Routes tested — Waiter Home / Chamados / Mensagens / New-entry / Scan-QR

Audit R23 · branch `fix/customer-tools-and-continuation` · 2026-05-15
Waiter Ana `320de62c-073f-4e50-9f68-f5e9064c8bab` (role=waiter) ·
tenant `restaurant_dev` · web-staff `http://localhost:3002` ·
API `http://localhost:3001/api` (page.route rewrite from build-time
`192.168.43.12:3001` → `localhost:3001`).

## Coverage

| # | Route | File | Backend wired? | Render OK | Notes |
|---|---|---|---|---|---|
| 1 | `/waiter` | `apps/web-staff/src/app/waiter/page.tsx` → `ScreenHomeGrid` | YES — `GET /staff/my-tables`, `GET /waiter-calls/pending`, `GET /zone-pauses?waiterId=&active=true` (8s polling + WS) | YES | Header "Minhas mesas · 2 ABERTAS · 0 LIVRES", grid 2-col cards (Mesa 01/02 EM ANDAMENTO), urgent-call banner aparece quando há pending. FAB QR fixed `bottom: calc(76px + env(safe-area-inset-bottom))`. Bottom nav 5-slot (Mesas · Chamados · Novo · Turno · Eu) com badge `callsCount` na aba Chamados. |
| 2 | `/waiter/chamados` | `apps/web-staff/src/app/waiter/chamados/page.tsx` → `ScreenWaiterCalls` | **NO — MOCK_CALLS hardcoded** (5 rows). Filter "Minhas mesas" sempre 0. Banner "DADOS MOCK · backend GET /staff/calls real chega na Onda 4" no rodapé. | YES | Filtros visíveis: Todos·5 / Urgentes·3 / Pronto·1 / Minhas mesas·0. Cards com leftBorder colorida + icon+label uppercase + ts. Tap → `/waiter/call/[c.id]?type=…&tableNumber=…`. |
| 3 | `/waiter/call/[id]` | `apps/web-staff/src/app/waiter/call/[id]/page.tsx` → `ScreenWaiterCallDetail` | **NO — MOCK detail** (COPY_BY_TYPE). CTA "A caminho" chama `ack()` que só faz `setStubMsg('Chamado registrado · pendente persistência')` + `router.back()`. **NÃO chama `POST /waiter-calls/:id/acknowledge`.** | YES | Hero card colorido (tint por type), Resumo da mesa mock (Aberta há / Itens lançados / Última ação / Forma de pgto), banner "DADOS MOCK · backend GET /calls/:id chega na Onda 4". Botões: Voltar (secondary, router.back) · A caminho (primary, stub) · More icon (stub "Mais ações"). |
| 4 | `/waiter/mensagens` | `apps/web-staff/src/app/waiter/mensagens/page.tsx` → `ScreenStaffMessages` | YES — `GET /staff-messages/threads?staffId=` + WS `staff_message.received\|read`. Onclick thread → `/waiter/mensagens/[threadId]`. | YES | Header "Mensagens" com back + search icon (search é placeholder, sem handler). Filter chips: Todas · Não-lidas (unread badge dinâmico). Empty state "Nenhuma mensagem ainda" exibido quando `userId === ''`; API retorna 8 threads válidas via curl. **Nota: screenshot capturou pre-fetch state — backend lista funciona, só o screenshot pegou antes do load.** |
| 5 | `/waiter/new-entry` | `apps/web-staff/src/app/waiter/new-entry/page.tsx` → `ScreenWaiterNewEntry` | N/A — pure navigation chooser | YES | 3 cards · Cliente nova visita (→ `/waiter/scan-qr`) · Pedido direto (→ `/waiter/scan-qr/picker?direct=1`) · Reservar (→ `/host/reservations`). Bottom CTA "O QR DA MESA TÁ ILEGÍVEL? CONTACTAR GERENTE" (→ `/waiter/qr-issue`). Close icon top-left → `router.back()`. |
| 6 | `/waiter/scan-qr` | `apps/web-staff/src/app/waiter/scan-qr/page.tsx` → `ScreenWaiterScanQr` | **NO — pure UI viewfinder, sem MediaDevices/QR reader.** `onScanned` prop NUNCA é invocado. Único fallback funcional: link "Inserir número da mesa" → `/waiter/scan-qr/picker`. | YES (visual) | Dark theme fixed, viewfinder com 4 corner brackets + animated horizontal line (gPulse 1.6s). Close icon → `router.back()`. |
| 7 | `/waiter/qr-issue` | `apps/web-staff/src/app/waiter/qr-issue/page.tsx` → `ScreenWaiterReportQrIssue` | YES — `POST /qr-issues` testado (curl retornou `{"id":"041b7bea…","status":"open"}`). | YES | Stepper número da mesa (+/-), chips problema (QR borrado · Descolou · Rasgado · Sumiu · Outro), textarea 200 chars com counter. **Foto opcional usa `window.prompt('URL da foto (placeholder)')` — não há upload real.** CTA "Reportar pra gerente" + Cancelar. Estado `sent` mostra check verde "Reportado pra gerente". |
| 8 | `/waiter/table/[id]` | `apps/web-staff/src/app/waiter/table/[id]/page.tsx` → `ScreenTableDetail` | **NO — MOCK totals (R$ 287,50, MOCK_ITEMS de 6 itens).** CTAs "Marcar servido" e "Chamar reforço" chamam `showStub(...)` (stub Onda 4). | YES | Hero card preto com Total da conta + progress bar pagamento ("2 pagaram · 1 processando · 1 pendente"). Lista de itens pendentes com tag `PRONTO · SERVIR` + station (Cozinha/Bar). Banner "Aberta há" 42 min usa data mock. |

## Rotas adicionais cobertas (sub-rotas)

| Route | File | Status |
|---|---|---|
| `/waiter/scan-qr/picker` | `scan-qr/picker/page.tsx` → `ScreenWaiterTablePicker` | YES — `GET /staff/my-tables` real. "ATENDENDO ATUALMENTE" lista mesas 01/02 corretas, "DISPONÍVEIS" empty state ("Nenhuma mesa livre no momento"). |
| `/waiter/scan-qr/delivery-confirm` | `scan-qr/delivery-confirm/page.tsx` → `ScreenWaiterDeliveryConfirm` | YES — `PATCH /orders/:orderId/status {status:'delivered'}` wirado. **Items hardcoded como placeholder** + degrade silencioso se `orderId` query-param ausente (mostra erro "Pedido nao identificado neste fluxo · marque entregue pela aba Pedidos"). |
| `/waiter/eu` | `eu/page.tsx` → `ScreenWaiterProfile` | NÃO testado nesta auditoria (escopo era 8 rotas core, esta é tangencial) — possui handler de logout (`localStorage.removeItem('staffId'\|'staffRole')`). |
| `/waiter/notifications` | `notifications/page.tsx` | Referenciado por GIconBtn bell do Home/Chamados — não testado nesta passagem. |

## API endpoints validados (via curl com headers `x-staff-id`+`x-staff-role`+`x-staff-key`)

| Endpoint | Status | Resposta |
|---|---|---|
| `GET /restaurant_dev/staff/my-tables` | 200 | 2 mesas (M01 com session ativa) |
| `GET /restaurant_dev/waiter-calls/pending` | 200 | 1 chamado (insertado pra teste) |
| `GET /restaurant_dev/zone-pauses?waiterId=…&active=true` | 200 | `[]` (sem pausa ativa) |
| `POST /restaurant_dev/waiter-calls/:id/acknowledge` | 200 | `{status:'acknowledged'}` · **BUT `acknowledged_by` fica NULL no DB** |
| `POST /restaurant_dev/waiter-calls/:id/resolve` | 200 | `{status:'resolved'}` |
| `POST /restaurant_dev/qr-issues` | 201 | `{id, status:'open'}` |
| `GET /restaurant_dev/staff-messages/threads?staffId=…` | 200 | 8 threads |

Subagent: waiter-home-chamados
Status: PARTIAL (2 P0 críticos + 3 P1 + 2 P2 + 1 P2)

Branch: fix/customer-tools-and-continuation
Waiter: Ana (staffId=320de62c-073f-4e50-9f68-f5e9064c8bab)

## Routes (8/8 render, 4 com mock/sem wire)

| # | Rota | Render | Backend wired | Severidade |
|---|---|---|---|---|
| 1 | /waiter | OK | ✅ my-tables + waiter-calls/pending + zone-pauses (8s poll + WS) | OK |
| 2 | /waiter/chamados | OK | ❌ MOCK_CALLS hardcoded (5 rows) | **P1** |
| 3 | /waiter/call/[id] | OK | ❌ MOCK + CTA "A caminho" só faz toast + router.back() | **P0** |
| 4 | /waiter/mensagens | OK | ✅ staff-messages/threads (API retorna 8 threads) | OK |
| 5 | /waiter/new-entry | OK | N/A — chooser (3 cards + CTA QR ilegível) | OK |
| 6 | /waiter/scan-qr | OK (visual) | ❌ Pure viewfinder, sem camera/decoder | P1 |
| 7 | /waiter/qr-issue | OK | ✅ POST /qr-issues (foto = window.prompt stub) | OK / P2 |
| 8 | /waiter/table/[id] | OK | ❌ MOCK_ITEMS + totais hardcoded | P1 |

## Bugs novos / Achados

### 🚨 P0 — /waiter/call/[id] não persiste acknowledge
- `apps/web-staff/src/screens/waiter/ScreenWaiterCallDetail.tsx:89-93` `ack()` apenas `setStubMsg('Chamado registrado · pendente persistência')` + `router.back()`
- **MAS** endpoint real `POST /waiter-calls/:id/acknowledge` está implementado e FUNCIONA (curl retorna `{status:'acknowledged'}` e atualiza DB)
- Helper `acknowledgeCall` JÁ EXISTE em `apps/web-staff/src/lib/api/waiter.ts:50` — só **não é invocado**
- **Cliente vê chamado "em fila" indefinidamente** ← UX crítico
- **Fix**: ~5 linhas, trocar setStubMsg por acknowledgeCall(callId, { waiterName, etaMinutes })

### 🚨 P0 — acknowledged_by nunca populado
- `apps/api/src/modules/waiter-calls/waiter-calls.service.ts:213-238` recebe `AcknowledgeCallDto { waiterName?, etaMinutes? }` 
- Faz `UPDATE ... SET assigned_waiter_name=COALESCE($2, ...)` MAS coluna `acknowledged_by` existe no schema e NUNCA é gravada
- Verificado via psql após acknowledge → `NULL`
- **Permite impersonation** (qualquer staff seta waiterName livre)
- **Cega audit/forensics**
- **Fix**: adicionar `staffId` ao service + `SET acknowledged_by = $staffId`

### 🟡 P1 — /waiter/chamados ignora endpoint real
- `ScreenWaiterCalls.tsx:30` declara MOCK_CALLS com 5 rows hardcoded
- Banner "DADOS MOCK · backend GET /staff/calls real chega na Onda 4" no rodapé reconhece
- **MAS Home (/waiter) JÁ chama /waiter-calls/pending REAL** → **badge "Chamados" na tabbar mostra 1 (real) e a tela /waiter/chamados mostra 5 (mock)** → inconsistência VISÍVEL pro usuário
- **Fix**: trocar MOCK_CALLS por `listPendingCalls(tenantSlug)` (já existe, mesmo shape)

### 🟡 P1 — /waiter/scan-qr sem QR decoder
- `ScreenWaiterScanQr.tsx` é só viewfinder (4 brackets + linha animada)
- Nenhum getUserMedia, BarcodeDetector, ou lib QR
- Callback `onScanned` declarado mas nunca invocado
- Único caminho funcional: fallback "Inserir número da mesa" → picker

### 🟡 P1 — /waiter/table/[id] 100% mock
- `ScreenTableDetail.tsx:41-48` MOCK_ITEMS de 6 hardcoded
- Totais R$ 287,50 / R$ 143,76 hardcoded
- CTAs "Marcar servido" / "Chamar reforço" → showStub() toast Onda 4
- Header lista TODOs dos endpoints faltantes

### 🔵 P2 — /waiter/qr-issue foto via window.prompt
- `ScreenWaiterReportQrIssue.tsx:263` usa `window.prompt('URL da foto (placeholder)')` no lugar de file input + upload
- Backend aceita photo_url, só não tem fluxo pra produzi-la

### 🔵 P2 — /staff/my-tables ignora staff identity
- Tabela restaurant_dev.tables não tem coluna `assigned_waiter_id`
- Endpoint retorna TODAS sessions ativas do tenant
- Query `?waiterId=` da URL é cosmética
- OK pra MVP, mas filtro real precisa migração

### 🔵 P2 — Nav "Turno" botão fantasma
- `ScreenHomeGrid.tsx:24-28` e `ScreenWaiterCalls.tsx:249-253` só tratam home|me|calls|scan em onTabChange
- Tab "Turno" (id=`shift`) cai silenciosamente
- Não há rota /waiter/turno
- Botão fantasma sem handler

## OK confirmados (no novel bugs)
- Auth pattern (x-staff-id/x-staff-role via localStorage, lib/api.ts) ✅
- Home polling 8s + WS zone_pause.{started,ended} ✅
- B-NEW-14 race-fix em acknowledge (atomic UPDATE WHERE status=pending) ✅
- POST /qr-issues persiste reported_by_staff_id corretamente via header ✅
- PATCH /orders/:id/status wirado em /waiter/scan-qr/delivery-confirm (com degrade silencioso se orderId ausente) ✅
- 8 rotas/sub-rotas renderizam sem erros de console ✅

## Recomendações priorizadas
1. **P0 #1**: Wire `/waiter/call/[id]` ack() em `acknowledgeCall` (helper existe; ~5 linhas)
2. **P0 #2**: Adicionar staffId ao service de acknowledge + `SET acknowledged_by = $staffId`
3. **P1**: Trocar MOCK_CALLS por listPendingCalls em /waiter/chamados
4. **P1**: Implementar QR decoder em /waiter/scan-qr (BarcodeDetector + fallback)
5. **P1**: Wire /waiter/table/[id] aos endpoints /tables/:id + /orders + /payments
6. **P2**: Substituir window.prompt da foto por file input + signed-URL upload
7. **P2**: Adicionar rota /waiter/turno OU remover tab "Turno" do GBottomNav

Tempo: ~15.3min (174661 tokens, 168 tool uses)

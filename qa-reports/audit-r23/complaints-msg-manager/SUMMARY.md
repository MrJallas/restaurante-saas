Subagent: complaints-msg-manager
Status: PASS (5/5 ✅ · 0 bugs novos · CONTRADIZ sub 15 sobre 2 P1 customer-staff-messages)

Branch: fix/customer-tools-and-continuation
Customer: Caleb Teste customerId 21a81205-4adf-41e3-86b5-baa8d3e339fb
Método: API + Postgres + Mongo direto (iOS sim skipped por idb WebView limit do sub 7)

## Status

| # | Cenário | Status |
|---|---|---|
| a | IA dispatcha send_message_to_manager → Mongo persiste via AssistantService | ✅ |
| b | Staff manager (Erica) responde, bubble persiste em staff_messages (fromRole='staff') + WS emit | ✅ |
| c | Customer cria complaint V20 canon | ✅ |
| d | Manager responde com chipAction='courtesy' → status 'responded' + WS event | ✅ |
| e | Manager cria courtesy + accept (pendente → aceita, response_seconds=4) | ✅ |

## Findings principais

### 1. send_message_to_manager end-to-end OK (Round 22 fix estável)
- Customer hit em POST /api/:slug/assistant/message (cookies session_token + recognition_token)
- AssistantService.respond() (apps/api/src/modules/assistant/assistant.service.ts:423-442) intercepta tool calls e chama `customerStaffMessages.appendOutbound({tenantId, customerId, tableSessionId, content})`
- Confirmado em Mongo restaurant_chat.staff_threads + staff_messages (30d TTL)
- fromRole='customer'/'staff' atribuídos corretamente
- **Direct dispatch via AI-service** (POST :8000/tools/dispatch) **NÃO persiste** — by design (security boundary; tool retorna só message+chips visíveis)

### 2. 🔍 CONTRADIZ Sub 15 — 2 P1 bugs "customer-staff-messages QUEBRADO" NÃO REPRODUZEM
Sub 10 inspecionou `apps/api/src/modules/customer-staff-messages/customer-staff-messages.controller.ts`:

- **ThreadIdParamDto** (linhas 21-24) **está correto** — slug vem do `@Controller(':slug/customer-staff-messages')` path-param e é resolvido via `@Tenant()` decorator no service, **não precisa estar no DTO**.
- **Endpoints staff registrados** (linhas 175-197): `GET staff/threads`, `GET staff/threads/:threadId/messages`, `POST staff/threads/:threadId/read` — todos com `@UseGuards(StaffOnlyGuard)`

**Recomendação aggregate**: revisar findings sub 15 vs sub 10. Pode ter sido false positive sub 15 (TS watch cache stale durante audit?) ou diferentes condições de ambiente. Suite de tests E2E pode resolver dispute.

### 3. Discrepância spec audit vs codebase V20 (codebase é source-of-truth)

| Audit spec brief | Codebase V20 real (locked) |
|---|---|
| Complaint form: motivo, descrição, severidade, anexo | **problemType** (5 chips: demora/item-errado/item-faltando/comida-fria/outro) + **text** (textarea required) + **attachedImageUrl** (placeholder "em breve"). Sem "severidade" — column `rating` é legacy, só preenchida via rating-screen redirect |
| Manager response: ManagerBubble com chip "Aceitar/Não aceitar" | ManagerBubble (`apps/web-customer/src/components/ui/ManagerBubble.tsx:146`) tem border-left 3px --color-warning + chip-action inset. Kinds canônicos: **on-the-way / kitchen-check / courtesy** (label "Estou enviando uma cortesia" com gift-seal SVG) / **custom**. NÃO há chip "Aceitar/Não aceitar" |
| Tap chip aceitar → CourtesyArrivalBubble separado | **CourtesyArrivalBubble NÃO EXISTE** no codebase (grep retorna 0). ManagerBubble com chipAction='courtesy' já cobre o gift-seal + border-mostarda. **Aceite verbal pro garçom**, registrado pelo staff via POST /api/:slug/courtesies/:id/respond — sem UI tap no customer |

**V20 é source-of-truth per CLAUDE.md** (locked files). Audit spec brief usou nomes desatualizados/inventados.

### 4. chipAction='courtesy' desacoplado de courtesies table (by design)
- `complaint.respond` com chipAction='courtesy' **só sinaliza visualmente** (WS event + UI inset) — NÃO insere em courtesies
- Manager precisa rodar POST /api/:slug/courtesies separadamente pra registrar item específico
- Linkagem implícita por tableSessionId — sem FK courtesies.complaint_id direta
- By-design (round 18 wiring)

## Bugs novos / Achados

### ⚠️ FALSE POSITIVE candidato — Sub 15 P1s sobre customer-staff-messages
- Sub 15 reportou ThreadIdParamDto sem slug + staff/threads não registrado
- Sub 10 NÃO reproduz nenhum dos 2
- Possíveis explicações: (a) sub 15 caiu em TS watch cache stale; (b) ambient state diferente entre runs; (c) sub 15 false positive
- **Ação no aggregate**: marcar como "DISPUTED — pending repro" em vez de P1 confirmado

### 📝 SPEC drift — Audit brief vs V20 canon
- Brief tinha 4 inconsistências (severidade, "Aceitar/Não aceitar", CourtesyArrivalBubble, etc)
- V20 canon é source-of-truth
- Nota pra próxima rodada de audit: atualizar specs com base no codebase locked

## Cleanup feito
- Postgres: `DELETE FROM complaints WHERE text LIKE 'AUDIT-R23%'` (1 row), `DELETE FROM courtesies WHERE item LIKE 'AUDIT-R23%'` (1 row)
- Mongo: `staff_messages.deleteMany({content: /AUDIT-R23/})` (2 docs) + thread doc Caleb removido (preview era AUDIT). 0 remaining

Nota: audit cleanup spec usava `description LIKE 'AUDIT-R23%'` mas courtesies não tem column description — usei `item` (canon V20)

Tempo: ~9.6min (107327 tokens, 95 tool uses)

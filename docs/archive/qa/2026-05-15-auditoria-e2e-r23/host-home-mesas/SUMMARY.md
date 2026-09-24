Subagent: host-home-mesas
Status: PASS (10 rotas render OK · 2 P1 bugs novos · 4 papercuts P3)

Branch: fix/customer-tools-and-continuation (commit d0f0781)
Persona: Renata Host (a4c89ca7-86e6-4072-9432-449118a62fd4)
Viewport: 390×844 mobile

## Cobertura — 10 rotas /host*

| # | URL | HTTP | Render | Estado dos dados |
|---|---|---|---|---|
| 1 | /host | 200 | OK · counters reais | 10 livres / 2 em uso · bate DB |
| 2 | /host/waitlist | 200 | OK · filtro 1-2 testado | 3 entradas seed |
| 3 | /host/reservations | 200 | OK · tabs Todas/Aguardadas/Chegaram | 3 reservas (2 awaited + 1 arrived) |
| 4 | /host/swap?fromTableId=M02 | 200 | OK · DE/PRA picker + state-machine CTA | Source M1·2p / M2·1p · Target M3..M22 |
| 5 | /host/liberate/2 | 200 | OK · party-picker + Liberar | Header "Liberar mesa 2" · counter 4 |
| 6 | /host/late-arrival/[id] | 200 | ⚠️ **PARCIAL** Mesa undefined | API GET retorna shape errada |
| 7 | /host/notifications | 200 | OK · empty + manager-only pill (graceful 403) | — |
| 8 | /host/profile | 200 | OK + observação | Mostra "Recepcionista" não "Renata Host" |
| 9 | /host/turnos-historico | 200 | OK · 10 turnos mock | Mock data |
| 10 | /host/mensagens | 200 | OK · empty inbox + tabs Todas/Não-lidas | — |

16 botões totais no /host home — todos com onClick válido ✅

## Bugs novos / Achados

### 🔴 BUG-1 P1 — POST /host/tables/swap (legacy atomic) quebrado
- Endpoint cria swap request status='requested' e imediatamente tenta marcar 'completed'
- State-machine em `apps/api/src/modules/host/host.service.ts:507-517` rejeita `requested → completed` direto
- Cliente recebe HTTP 409 "Transicao requested -> completed invalida"
- **Deixa row órfã com status='requested'** na tabela
- Reproduz: `curl -X POST .../host/tables/swap -d '{"fromTable":1,"toTable":3}'`
- File: `apps/api/src/modules/host/host.controller.ts:130-150`
- **Workaround**: usar POST /host/swap-requests + 2× PATCH (requested → in_progress → completed). DB diff verifica que isso move corretamente table_sessions.table_id preservando status='active'

### 🔴 BUG-2 P1 — Late-arrival API contract drift
- API `GET /late-arrival-requests/:id` retorna shape diferente de `LateArrivalRequestDto` em `packages/shared-types/src/customer-host.ts`
- UI `/host/late-arrival/[id]` renderiza **"Mesa undefined"** e **"— pediu pra entrar"** (sem nome do cliente)
- Faltam na API: tableNumber, requesterName, visitContext, expiresAt (responde ttlExpiresAt), respondedAt (responde decidedAt), requestingCustomerId (responde customerId)
- File: `apps/api/src/modules/late-arrival/late-arrival.service.ts:316-335 mapRow()` — não joina com tables e customers
- TODO já reconhecido inline (linhas 82-94 e 244-253): "tableNumber + requesterName + visitContext are not joined here yet"

### 🔵 Papercuts (4 — P3 cada)

**PC-1**: `/host/swap?fromTableId=<uuid>` deep-link **não pré-seleciona** source chip. Usuário precisa clicar manualmente em Mesa 1 ou Mesa 2 mesmo vindo com fromTableId

**PC-2**: `/host/profile` mostra título "Recepcionista" em vez do nome individual ("Renata Host" foi setado em localStorage mas não renderizado)

**PC-3**: Tempo "30 min" em waitlist entries recém-criadas (DB tem wait_minutes: 0). Provavelmente placeholder mock fixo

**PC-4**: Botões "Liberar" nos cards de mesa não têm `aria-label` mencionando número da mesa. Acessibilidade reduzida

## API contract notes (descobertos durante testes)
- POST /host/waitlist: body usa `party` (não `partySize`)
- POST /host/reservations: body usa `when` (HH:MM ou ISO 8601); rejeita `scheduled_at`
- POST /host/tables/:n/liberate: body precisa `mode` enum `auto|manual_paid|manual_force`; rejeita `empty`
- Headers obrigatórios: x-staff-key, x-staff-id, x-staff-role
- Tenant slug correto: restaurant_dev (schema homônimo, postgres porta interna 5434)

## Workarounds aplicados
1. **LAN IP rewrite**: page.addInitScript() shim em window.fetch que reescreve <IP-da-LAN>:3001 → localhost:3001
2. **Persona via localStorage** em cada navegação (não persiste se page recarrega antes do init script)
3. **Browser compartilhado**: outros agents abriam tabs /waiter/* e /cozinha; workaround via tabs_new + tabs_select isolado

Tempo: ~60min (246925 tokens, 337 tool uses)

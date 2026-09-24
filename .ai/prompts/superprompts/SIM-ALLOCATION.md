# Sim Allocation + IDs (Wave coordination)

> Used by all subagents A-N. Read this before starting; do NOT use a sim/mesa/customer reserved for another wave.

## Sims iOS booted (8)
- sim 1:     iPhone 15 Pro  · ECCA308F-F4AA-4647-ADCF-0BE1F6A9F9D4
- sim 2:     iPhone 15 Pro Max  · EE3FA47E-F1BC-411D-9ABC-61F63CA95840
- sim 3:     iPhone 15  · 02F47780-6142-499E-ABA2-974ED03C7082
- sim 4:     iPhone 15 Plus  · 725EB341-DB70-45B0-AA1C-EE76819E6C3E
- sim 5:     iPhone 16 Pro  · 60ED4E4A-976B-4C6E-BE65-779B45EDA867
- sim 6:     iPhone 16 Pro Max  · FF595019-ACA4-47A7-80F2-BD0543A59D57
- sim 7:     iPhone 16  · 81914E00-6D98-480C-AE8F-C2F25D28590F
- sim 8:     iPhone 16 Plus  · 9DC52D20-1A99-4249-9826-9ED352439CB5

## Customer IDs (CPFs ATUALIZADOS 2026-05-09 — Subagent D achou que valores antigos eram inválidos check-digit BR)

| Customer | CPF (válido) | ID |
|---|---|---|
| Ana Pereira    | **11144477735** (já era válido) | 5ec9ccc0-e294-4d14-880b-95e842689a01 |
| Bruno Pacheco  | **22255588846** (era 22255588801) | 29bc0b71-58f2-4192-bc02-d6a84a9b26b7 |
| Carla Mendes   | **33366699957** (era 33399922200) | 26cd496e-cadc-410e-91dd-a94900065c89 |
| Diego Vargas   | **44477700083** (era 44411155566) | 38d9a0f4-a967-405f-b8bf-6ca9b4579e78 |
| Pedro Silva    | **55588811194** (era 55522266677) | 76e0565a-9f80-4c89-b008-4ae0be07d095 |
| Eduardo Vargas | **66600033398** (era 66633377788) | NÃO EXISTE — usado pra teste de novo cadastro |

**Atenção subagentes B-N**: usar CPFs novos. `/customer/welcome` rejeita CPFs inválidos via Brazilian check-digit. Workaround DB-direct (INSERT em session_participants) é aceito per spec adaptação.

## Bugs achados em Wave 1 (importantes pra próximas waves)

- **P0 (D-1)**: `apps/api/src/infra/ai/ai-service.client.ts` NÃO chama `/tools/dispatch`. `assistant_messages.tool_calls` SEMPRE NULL via API. Tool dispatch direto em `:8000/tools/dispatch` funciona. Subagentes que validam tool_calls via DB devem **dispatchar tools direto via :8000** OU documentar como blocker conhecido.
- **P0 (N-1)**: containers `restaurant-web-staff` e `restaurant-web-customer` montam worktree ERRADA (`pensive-ritchie-251016`, 28 commits atrás). Telas Eu novas só existem nesse worktree (`jolly-wing-8f1e21`) — Subagent N teve que `cp` arquivos pro worktree montado. **Próximas waves: testar pelo browser/sims contra `:3002/:3003` significa testar código stale.** Solução: alterar bind-mount em `docker-compose.yml` ou rebuild containers do worktree atual.
- **P1 (D-4)**: spec menciona tool `request_bill`; nome real no registry é `request_check`.
- **P1 (N-2)**: `/cozinha` header overflow horizontal no iPhone 15 Plus (430×932) — User-button cai fora.
- **P2 (D-3)**: `pixQrCode` retornado mesmo com `method=card` (data leak inocente).
- **P2 (N-3)**: `MAppBottomNav` engrenagem não preserva `?name=` ao navegar pra `/manager/configuracoes`.

## Staff IDs
- Ana Garcom (waiter):     320de62c-073f-4e50-9f68-f5e9064c8bab
- Bruno Garcom (waiter):   35c95cc6-312a-4cfb-b857-8fe77a7dd5d3
- Carlos Cozinha (cook):   787b5fea-c128-4696-812d-d91c1e5aad12
- Diana Cozinha (cook):    70c63f26-cf4f-4076-9623-6c3ce7228982
- Erica Gerente (manager): 8bd06156-1fe5-4c18-a82d-43d38287ed4a
- Renata Host (host):      a4c89ca7-86e6-4072-9432-449118a62fd4

## Tables (id → code)
M01 = cfabe098-510e-414d-97c4-e155f94d6abd
M02 = 6ad0bb73-37c9-490f-bad0-6e8416a9c04b
M03 = c39a8e13-c35b-4eb7-8315-cc32e3070ba9
M04 = c5c000fb-e620-4dc8-91dc-17e8e7a5a3a3
M05 = 55b2caa9-ff99-4b8e-bf00-b1e8918bad86
M06 = 3d5bc1cd-f558-4e5d-9e99-9cf7c69e6023
M07 = 7beb7eb5-def1-4d36-87c9-2a315ca6716d
M08 = 571b7b27-d6f4-4c55-bffc-8b11ccf8c80c
M13 = 6243085a-6105-4145-8e98-f4ac656643c8
M14 = 27043c50-482a-471c-af56-0a4ff1330573
M15 = d511fb1a-0e08-4f02-bada-616ced172401
M22 = e1c1bb84-cfa0-4b07-bf90-f9ecab10581a

## Wave plan

| Wave | Subagents | Mesas/Customers | Depende de |
|------|-----------|-----------------|------------|
| 1    | A, D, N   | M05/Pedro, M22/Ana+Bruno, telas Eu (várias) | nada |
| 2    | B, F, K   | M07/Carla, M14+M15/Ana+Bruno, transversal | wave 1 livrar mesas |
| 3    | C, E      | M14/Diego, M05/Ana+Eduardo | wave 2 livrar M14, M05 |
| 4    | G, I      | M14/Diego (continuação C), M07/Pedro | wave 3 (G ← C; I ← B free M07) |
| 5    | H, J, L, M| M05/Pedro KDS, Carla LGPD, push, edge | wave 4 livrar |

## App slug

- Tenant slug: **restaurant_dev** (mesmo nome do schema)
- Rotas: `/restaurant_dev/mesa/<code>`, `/restaurant_dev/home`, `/restaurant_dev/eu`, etc.
- API: `http://localhost:3001/api/restaurant_dev/...`

## Wave 1 assignment (disparada AGORA)

| Subagent | Sims | Mesa(s) | Customer(s) | Report |
|----------|------|---------|-------------|--------|
| **A** · onboarding+discovery | sim 1 (iPhone 15 Pro) | M05 | Pedro Silva | `qa-reports/e2e-cross-A-onboarding-discovery.md` |
| **D** · payment 3 modes | sims 5+6 (iPhone 16 Pro / 16 Pro Max) | M22 | Ana Pereira + Bruno Pacheco | `qa-reports/e2e-cross-D-payment.md` |
| **N** · telas Eu + UI smoke | sims 2,3,4,7 (iPhone 15 Plus, 15 Pro Max, 15, iPhone 16) | — (4 roles) | Pedro + staff | `qa-reports/e2e-cross-N-eu-screens.md` |

## Não usar nesta wave (reservado pra próximas)
- Mesa M07 (Wave 2 · Subagent B)
- Mesa M14 (Wave 2 · Subagent F → Wave 3 Subagent C)
- Mesa M15 (Wave 2 · Subagent F)
- Carla Mendes (Wave 2 · B → Wave 5 · J)
- Diego Vargas (Wave 3 · C → Wave 4 · G)
- Eduardo Vargas CPF 66633377788 (Wave 3 · E)

## Wave 2 assignment (pós-fix dos P0s · 2026-05-09)

**Pré-condições resolvidas**:
- ✅ CPFs válidos no DB (Bruno=22255588846, Carla=33366699957, Diego=44477700083, Pedro=55588811194)
- ✅ Containers `restaurant-api/web-staff/web-customer/ai-service` agora montam worktree atual `jolly-wing-8f1e21`
- ✅ Tool dispatch end-to-end validado: POST /assistant/message → IA dispara `view_menu` → persiste em `assistant_messages.tool_calls`. Smoke test de Pedro/M05 confirmou (visit_id `a7236bac-3374-4fc8-b9c4-2091fb58e983`)
- ✅ Mesas M05/M07/M14/M15/M22 fechadas e prontas pra Wave 2

| Subagent | Sims | Mesa(s) | Customer(s) | Report |
|----------|------|---------|-------------|--------|
| **B** · order lifecycle + KDS | sim 1 (iPhone 15 Pro `ECCA308F`) + Playwright cozinha | M07 | Carla Mendes (33366699957) | `qa-reports/e2e-cross-B-order-lifecycle.md` |
| **F** · table-merge + cooldown | sims 5+6 (iPhone 16 Pro `60ED4E4A` + 16 Pro Max `FF595019`) + Playwright manager | M14 + M15 | Ana Pereira + Bruno Pacheco | `qa-reports/e2e-cross-F-table-merge.md` |
| **K** · contextualização IA | sim 7 (iPhone 16 `81914E00`) | M22 | Pedro Silva | `qa-reports/e2e-cross-K-context-and-chips.md` |


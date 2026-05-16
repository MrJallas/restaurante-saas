# Kind dispatch — 8 calls × 6 kinds

Test harness: `docker exec restaurant-ai python3 -c '...'` against `http://localhost:8000/continuation` with `X-AI-Service-Key: dev-ai-service-key-change-in-prod`.

## Test 1 — GET endpoint (no rich slots)

Only `tenantId`, `isReturning`, `isVip`, `customerName`, `kind`, `favoriteItem` are accepted by `GET /continuation` (see `services/ai-service/main.py:537-573`).

| kind | unique variants seen (8 calls) | distribution | gap |
|---|---|---|---|
| `viu_menu` | vm1, vm2, vm3, vm4 | vm1=2, vm2=2, vm3=2, vm4=2 | OK — todos rotam (customerName=Caleb unlocks vm2) |
| `chamou_garcom` | cg1, cg2, cg3 | cg1=4, cg2=2, cg3=2 | `cg4` NUNCA aparece — requer `waitMinutes` (GET não aceita) |
| `abriu_pedido` | ap1, ap2, ap3 | ap1=3, ap2=3, ap3=2 | `ap4` NUNCA aparece — requer `customerName + waitMinutes` |
| `pagou` | pg1, pg2, pg3, pg4 | pg4=3, pg2=3, pg3=1, pg1=1 | OK — todos rotam |
| `voltou_sem_acao` (com favoriteItem) | vs1, vs2, vs3, vs4 | vs4=3, vs1=2, vs2=2, vs3=1 | OK — `favoriteItem` mapeado pra `last_item` |
| `pos_reclamacao` | pc_fallback | pc_fallback=8 | `pc1/pc2/pc3` NUNCA aparecem — requerem `managerName + avgResponseMin` (GET não aceita) |

## Test 2 — POST endpoint (rich slots presentes)

Mesmo cenário com `POST /continuation` + body rico (waitMinutes, managerName, avgResponseMin):

| kind | unique variants seen (8 calls) | distribution |
|---|---|---|
| `chamou_garcom` (+waitMinutes=8) | cg1, cg2, cg3, **cg4** | cg4=4, cg1=2, cg2=1, cg3=1 |
| `abriu_pedido` (+waitMinutes=12, customerName=Caleb) | ap1, ap2, ap3, **ap4** | ap1=3, ap2=3, ap3=1, ap4=1 |
| `pos_reclamacao` (+managerName=Erica, +avgResponseMin=4) | **pc1, pc2, pc3**, pc_fallback | pc3=3, pc_fallback=2, pc2=2, pc1=1 |

POST entrega rotação completa quando os slots ricos são fornecidos. **GET é restrito** — usado pelo `home.service.ts`.

## Findings

1. **GET endpoint NÃO aceita slots ricos.** `waitMinutes`, `managerName`, `avgResponseMin`, `lastItem`, `lastOrderSummary`, `tableLabel` ficam de fora da query string aceita por `continuation_get(...)` em `main.py:537-545`. Apenas POST aceita.

2. **Round 19 C1 (`requires_slots` filter) funciona corretamente.** Quando slots ausentes, variante rica é excluída → caem nas variantes sem `requires_slots`. Sem essa filtragem renderizaria `"Tempo médio agora ~ min."` com espaço órfão.

3. **Variant rotation aleatória balanceada por `weight`.** Cada variante com `weight=1.0` aparece ~equal; `weight=0.8` aparece menos (vm4, cg4, ap4, pg4 — apenas a 4ª variante de cada kind).

4. **`pos_reclamacao` via `home.service.ts` SEMPRE cai no `pc_fallback`** (GET endpoint não forwarda `managerName`/`avgResponseMin`). Só via `POST /:slug/continuation` (continuation.service.ts) o pool rico abre.

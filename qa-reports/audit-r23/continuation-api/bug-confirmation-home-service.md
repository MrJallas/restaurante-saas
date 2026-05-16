# Bug investigation — `home.service.ts` `kind` missing

## Claim from PR description

> `apps/api/src/modules/home/home.service.ts` linhas ~150-220 **NÃO passa `kind`** pro `/continuation`.

## Status: **PARTIALLY OUTDATED** — bug already fixed in current branch, but a related gap remains.

## Evidence

### 1. Current code DOES pass `kind` when inferred

File: `apps/api/src/modules/home/home.service.ts:186-224`

```ts
const inferred = await this.inferContinuationKind({
  sessionId,
  customerId,
  isReturning,
  kindHint: continuationSignals.kindHint,
  hasDraftOrder: continuationSignals.hasDraftOrder === true,
});
const params = new URLSearchParams({
  tenantId: continuationSignals.tenantId || process.env.TENANT_ID || 'restaurant_dev',
  isReturning: String(isReturning),
  isVip: 'false',
  customerName: nome,
});
if (inferred.kind) params.set('kind', inferred.kind);          // ← LINHA 202
if (inferred.favoriteItem) params.set('favoriteItem', inferred.favoriteItem);
```

`inferContinuationKind()` (lines 254-321) consults DB signals em ordem de prioridade:
1. Payment confirmed last 10min → `pagou`
2. `hasDraftOrder` flag → `abriu_pedido`
3. Active order last 30min → `abriu_pedido` (+ favoriteItem do summariseOrder)
4. Waiter call pending last 30min → `chamou_garcom`
5. `kindHint === 'viu_menu'` → `viu_menu`
6. `isReturning` || `kindHint === 'voltou_sem_acao'` → `voltou_sem_acao`
7. None → `kind: null` (omits `kind` param)

### 2. Live reproduction

Setup: valid session token `f6d41d20-89b4-4946-8bc0-87e940b60b85` (Mesa 01, customer registered, no orders/payments).

**Case A — no kindHint, no DB signal:**
```
curl http://localhost:3001/api/restaurant_dev/home -H "x-session-token: f6d41d20..."
```
AI service log: `GET /continuation?tenantId=restaurant_dev&isReturning=false&isVip=false&customerName=visitante HTTP/1.1 200 OK`
→ `kind` ausente CORRETAMENTE (sem signal pra inferir) — AI cai em segment-based selection (`n1`).

**Case B — explicit `x-continuation-kind-hint: viu_menu`:**
```
curl http://localhost:3001/api/restaurant_dev/home -H "x-session-token: f6d41d20..." -H "x-continuation-kind-hint: viu_menu"
```
AI service log: `GET /continuation?tenantId=restaurant_dev&isReturning=false&isVip=false&customerName=visitante&kind=viu_menu HTTP/1.1 200 OK`
→ `kind=viu_menu` forwarded corretamente. Response: `vm1` template (`Tava bisbilhotando o menu?...`).

**Conclusão Case A/B**: o bug "NÃO passa kind" não reproduz mais. O sinal está sendo derivado e forwarded.

## Gap remanescente — slots ricos NÃO são propagados

`home.service.ts:196-203` apenas envia `tenantId`, `isReturning`, `isVip`, `customerName`, `kind`, `favoriteItem`.

**Não envia** `waitMinutes`, `managerName`, `avgResponseMin`, `lastItem`, `tableLabel`. Resultado:

| Variante | Slot necessário | Acessível via `/home`? |
|---|---|---|
| `cg4` (chamou_garcom rich) | `waitMinutes` | NÃO — sempre filtrada |
| `ap4` (abriu_pedido rich) | `customerName + waitMinutes` | NÃO — waitMinutes ausente |
| `pc1/pc2/pc3` (pos_reclamacao rich) | `managerName + avgResponseMin` | NÃO — `home.service.ts` nem detecta `pos_reclamacao` em `inferContinuationKind` |

Por outro lado, `apps/api/src/modules/continuation/continuation.service.ts:420-491` (rota `POST /:slug/continuation`) **enriquece corretamente** com `managerName`, `avgResponseMin`, `waitMinutes` (Round 19 C2) e usa POST. Então a UI que chama essa rota tem acesso ao pool completo.

## Recomendação

Opções:
1. **Trocar GET → POST em `home.service.ts`** e forwardar todos os slots (alinhando com a rota `:slug/continuation` que já faz isso). Match com `forwardToAi()` em `continuation.service.ts:420`.
2. **Estender o handler `continuation_get` em `main.py:537-545`** pra aceitar query params adicionais (`waitMinutes`, `managerName`, etc.). Backwards-compatible.
3. **Deletar a path `/home` continuation fetch e centralizar tudo em `:slug/continuation`.** Reduz duplicação (`inferContinuationKind` em home.service.ts duplica `deriveKindAndSlots` em continuation.service.ts — 80% overlap).

## File:line

- `apps/api/src/modules/home/home.service.ts:186-224` — GET continuation fetch (sem slots ricos)
- `apps/api/src/modules/home/home.service.ts:254-321` — `inferContinuationKind` (não detecta `pos_reclamacao`)
- `apps/api/src/modules/continuation/continuation.service.ts:420-499` — POST forward com slots ricos (referência correta)
- `services/ai-service/main.py:537-583` — GET endpoint só aceita 6 query params

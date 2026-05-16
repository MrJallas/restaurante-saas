Subagent: continuation-api
Status: PASS (1 GAP identificado, 0 regressões V20)

Branch: fix/customer-tools-and-continuation (HEAD d0f0781)
Tests live: verificação live confirma todos os 4 reports existentes nessa pasta

## Quick status

| Aspecto | Status |
|---|---|
| Pool inventory 5 kinds V20 × 4 variants | ✅ 20 templates + pos_reclamacao (3 rich + fallback) + 7 segments legacy |
| Rotação 8 dispatches/kind (GET sem slots ricos) | ✅ viu_menu/pagou completo; parcial em chamou_garcom/abriu_pedido/voltou_sem_acao (variantes ricas excluídas) |
| Bug "home.service.ts NÃO passa kind" (claim original) | ⚠️ **OUTDATED** — JÁ FIXADO em commit 5edb454 desse branch |
| Round 4 C-NEW-4 fallback (voltou_sem_acao sem last_item) | ✅ template neutro renderiza |
| Round 19 C1 requires_slots filter | ✅ zero `{slot}` literal nos 5 kinds V20 |
| peguei_conta (6º kind listado no PR) | ⚠️ **NÃO EXISTE** — silent fallback pra returning:regular idle_nudge |

## Top 3 findings

### 1. Bug home.service.ts JÁ FIXADO neste branch — NÃO REABRIR
- Commit `5edb454 "fix customer tools and continuation kind"` adicionou `inferContinuationKind(...)` + `params.set('kind', inferred.kind)` em `apps/api/src/modules/home/home.service.ts:189-202`
- Live repro: GET /api/restaurant_dev/home com header `x-continuation-kind-hint: viu_menu` → AI log mostra `GET /continuation?...&kind=chamou_garcom` (DB signal prevalece) → response cg2 "A caminho da sua mesa, visitante."
- Bug existia em `main` (linhas 168-200 sem kind), fix está no branch atual

### 2. GAP real — GET /continuation não aceita slots ricos
- `services/ai-service/main.py:537-545` só recebe: tenantId, customerId, isReturning, isVip, customerName, kind, favoriteItem
- Faltam: **managerName, avgResponseMin, waitMinutes, lastItem, tableLabel**
- Consequência: via `GET /home`, variantes ricas **cg4, ap4, vs1, vs2, pc1, pc2, pc3 NUNCA são selecionadas** (filtradas por requires_slots)
- POST `/:slug/continuation` forwarda slots desde Round 19 C2 — única rota pro pool completo
- **Fix sugerido (P2)**: estender continuation_get(...) com params restantes, backwards-compatible

### 3. peguei_conta é silent fallback pra returning:regular
- `grep -rn peguei_conta` retorna 0 hits no codebase
- `_segment_for_kind` (continuation.py:482-486) mapeia kind desconhecido → "returning:regular"
- `GET /continuation?kind=peguei_conta` retorna r1/r2 idle_nudge ("Quer pedir o de novo?") — wrong context
- **Fix sugerido (P3)**: logar WARN no AI service quando kind recebido não está em DEFAULTS

## Dispatch rotation (8 dispatches/kind, GET sem slots)

| kind | Variantes vistas | Vazios |
|---|---|---|
| viu_menu | vm1, vm2, vm3, vm4 | — |
| chamou_garcom | cg1, cg2, cg3 | **cg4** (waitMinutes não forwarded) |
| abriu_pedido | ap1, ap2, ap3 | **ap4** (precisa waitMinutes) |
| pagou | pg1, pg2, pg3, pg4 | — |
| voltou_sem_acao (sem lastItem) | vs3, vs4 | **vs1, vs2** (last_item ausente) |
| peguei_conta (não existe) | r1, r2 idle_nudge | — wrong segment |

## Bugs novos / Achados

- **P2 GAP**: `services/ai-service/main.py:537-545` — GET /continuation sem slots ricos; via GET /home pool rico inacessível
- **P3**: `services/ai-service/services/continuation.py:482-486` — kind desconhecido silently mapeado pra returning:regular; vale WARN log
- **MINOR ortográfico**: `vm2` com customerName="" leak "Algum prato te chamou atenção, ? Posso ajudar." — protegido apenas pelo filter eligible_pool, então safe na rota real

## Bugs conhecidos confirmados → DESCARTADO

- "home.service.ts NÃO passa kind" → OUTDATED, já fixado em 5edb454 (este branch)

Tempo: ~5.3min

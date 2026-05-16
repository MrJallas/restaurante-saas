Subagent: placebo-regression-scan
Status: PASS (0 P1 regressions · 9 baseline confirmed · 3 NEW P2 placebos)

Branch: fix/customer-tools-and-continuation
Personas: Manager Erica · Host Renata · Waiter Ana · Cook Diana

## TL;DR

- **No P1 regressions** — earlier transient findings (/manager/table-menu, /manager/stat) eram false positives durante React hydration; re-scan com 1.5s settle limpou
- **Round 19 v3 baseline confirmado**: 8 toggle divs `/host/notificacoes-prefs` + 1 toggle `/host/seguranca` = 9 placebos baseline UNCHANGED, non-blocking (design placeholders pending backend)
- **3 NEW P2 placebos** descobertos (round 19 scanou 42 rotas, este audit scanou 61):
  - Search icon (`aria-label="Buscar"`) sem onClick em /host/mensagens, /waiter/scan-qr/picker
  - "Mais" overflow icon em /waiter/mensagens/[threadId]
- /waiter/mensagens Buscar icon era pre-existing (round 18 flagged)

## Métricas

| Metric | Round 19 v3 | r23 |
|---|---:|---:|
| Routes scanned | 42 | 61 |
| Routes w/ placebos | 2 | 6 |
| Raw placebo count | 28 | 32 |
| Unique placebo affordances | 9 | 12 |

## Per-route diff vs Round 19 v3

| Route | v3 | r23 | Status |
|---|---:|---:|---|
| /host/notificacoes-prefs | 24 (8 toggles) | 24 (8 toggles) | ✅ unchanged, non-blocking |
| /host/seguranca | 4 (1 toggle) | 4 (1 toggle) | ✅ unchanged, non-blocking |
| /host/mensagens | — | 1 (Buscar icon) | ⚠️ NEW P2 |
| /waiter/mensagens | (known) 1 | 1 (Buscar icon) | ➖ pre-existing P2 |
| /waiter/mensagens/[threadId] | not scanned | 1 (Mais icon) | ⚠️ NEW P2 |
| /waiter/scan-qr/picker | not scanned | 1 (Buscar icon) | ⚠️ NEW P2 |
| All other 53 routes | 0 | 0 | ✅ unchanged |

## Bugs novos / Achados

### 🟡 P2 — 3 dead-click icons em messaging UI staff
- **Buscar icon** (`<button aria-label="Buscar">`) sem onClick em 3 rotas:
  - /host/mensagens (NEW)
  - /waiter/mensagens (pre-existing round 18)
  - /waiter/scan-qr/picker (NEW)
- **Mais icon** (`<button aria-label="Mais">`) overflow menu sem onClick em /waiter/mensagens/[threadId] (NEW)
- Shared header search icon nunca wirado em messaging UI
- Visualmente convida click, mas é dead-click

**Fix**: wire search icon (3 routes) e Mais overflow icon (1 route) OU remover os botões se não planejado

### ✅ Round 19 v3 baseline confirmado (não regressão)
- /host/notificacoes-prefs: 8 toggle divs (4 PUSH + 2 SOM + 1 LOCK SCREEN + 1 VIBRAÇÃO) — unchanged, non-blocking, awaiting backend
- /host/seguranca: 1 toggle "Pedir código a cada login" (2FA) — unchanged, non-blocking

## Notable methodology issue

### Routing flakiness durante scan
- Playwright `wait_for(3.5s)` causou URLs settle em rotas diferentes (`/manager/operacoes/atencao` settling em `/manager`, etc)
- Root cause: **React hydration timing × Playwright snapshot timing** — snapshots embedded fire durante WS reconnect/hydrate window, `useManagerEvents` WS-driven `refresh()` re-renderiza disparando nav
- **NÃO é P1 app bug** afetando real users — é test-tool interaction
- Mitigação: 1.5s settle determinístico dentro de page.evaluate captura post-hydration estável

### Por que false positives pareciam reais
- `__reactProps$<fiber>` keys NÃO attached antes de hydration completar
- Probing buttons pre-hydration → `props.onClick === undefined` → todos flagged como placebo
- Post-hydration → handlers materialize → 0 placebos
- 1.5s settle captura corretamente

## Probe metodologia

```js
// Per route: navigate → wait 1.5s for hydration → enumerate
document.querySelectorAll('button, a[href], [role="button"], [onclick]').forEach(el => {
  const fiber = Object.keys(el).find(k => k.startsWith('__reactProps$'));
  const props = fiber ? el[fiber] : {};
  const hasHandler = !!(props.onClick || props.onMouseDown || props.onPointerDown ||
                        el.onclick || el.getAttribute('href'));
  const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
  // placebo = !hasHandler && !disabled
});
// + cursor:pointer div toggles (deduped by text)
```

## Recomendações
- Wire Buscar search icon (3 rotas) e Mais overflow icon (1 rota) OR remover os botões se não planejado
- No action required para 9 known toggle placebos (matches v3 baseline, awaiting backend)
- Opcional: investigar React/WS interaction que causa mid-hydration navigation sob probes fast-fire

Tempo: ~42.6min (312326 tokens, 346 tool uses)

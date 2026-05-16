# Routes Tested · manager-home-operacoes

Auditoria E2E em `http://localhost:3002` (web-staff) com persona Erica
Gerente (`staffId=8bd06156-1fe5-4c18-a82d-43d38287ed4a`,
`staffRole=manager`).

`localStorage.staffId` e `localStorage.staffRole` setados via
`browser_evaluate` antes de cada navegação. API base
`http://localhost:3001/api`, tenant `restaurant_dev`.

## Rotas testadas

| # | Rota | Status | Buttons | onClick real | Stubs | Placebos | Screenshot |
|---|------|--------|---------|--------------|-------|----------|------------|
| 1 | `/manager` (Painel) | 200 + hydrate | 19* | 19 | 6 | 0 visíveis · **3 condicionais** (ver findings) | `screenshots/01-home.png` |
| 2 | `/manager/operacoes?tab=alerts` | 200 + hydrate | 27 | 27 | 8 (via onAction) | 0 | `screenshots/02-operacoes-alerts.png` |
| 3 | `/manager/operacoes?tab=map` | 200 + hydrate | 25 | 25 | 0 | 0 | `screenshots/03-operacoes-map.png` |
| 4 | `/manager/operacoes?tab=funnel` | 200 + hydrate | 11 | 11 | 0 | 0 | `screenshots/04-operacoes-funnel.png` |
| 5 | `/manager/operacoes/criticos` | 200 + hydrate | 12 | 12 | 5 | 0 | `screenshots/05-criticos.png` |
| 6 | `/manager/operacoes/atencao` | 200 + hydrate | 11 | 11 | 5 | 0 | `screenshots/06-atencao.png` |
| 7 | `/manager/operacoes/mesas-ativas` | 200 + hydrate | 20 | 20 | 0 | 0 | `screenshots/07-mesas-ativas.png` |
| 8 | `/manager/operacoes/em-alerta` | 200 + hydrate | 12 | 12 | 1 | 0 | `screenshots/08-em-alerta.png` |

\* `/manager` button count varia: 19 quando seção "Em curso" vazia (caso
das screenshots), até ~30+ quando 4 complaints + 3 merges renderizam.

**Totais:** 137 clickables · 137 com `onClick` (0 noop via fiber probe) ·
25 stubs (handlers reais que abrem toast "em desenvolvimento") · **0
placebos detectados pela fiber inspection**, **3 placebos potenciais
descobertos via code audit** (ver findings).

## Observações por rota

### `/manager` (Painel) — Round 18 home

- **Header Notifications bell** tem onClick → `router.push("/manager/notifications")`
  (round 19 fix verificado em `primitives.tsx:668`).
- Quando `/complaints` e `/table-merge-requests` retornam dados (caso
  presente: 4 complaints + 3 merges pending), aparecem 4+3 cards em
  "Em curso". Cada card wrapper `<div role="button">` tem onClick =
  `onTap` = `() => router.push(op.toRoute)`.
- Botões internos do card são `PillBtn`s com `onClick = onPrimary` ou
  `onSecondary`. ScreenManagerHomeA passa só `onTap` + `onPrimary`
  — **`onSecondary` é NUNCA passado**. Resultado: botões "Encaminhar"
  (em complaint cards), "+5 min" (em pause-orders), "Cancelar"/"Reenviar"
  (em kitchen-reorder/contact-client/courtesy) **fazem stopPropagation
  + chamam undefined → não fazem nada**. São functional placebos.
- 3 alerts mock (DEFAULT_ALERTS) com botões `Avisar cozinha`,
  `Contactar cliente`, `Realocar mesa`, `Chamar garçom`, `Entregar agora`,
  `Avisar garçom`. Esses 6 são **stubs reais** — chamam `showStub` que
  exibe toast "em desenvolvimento (Onda 3 backend)".
- Botão `X` (Dispensar) em cada alert é REAL — chama `dismissAlert(id)`
  que filtra do state.
- Botões `Ver todos →` e `Ver mais →` navegam pra `/manager/alertas` e
  `/manager/equipe` respectivamente.
- Bottom-nav 5 itens com badge `3` em Operação refletindo alerts.length.

### `/manager/operacoes?tab=alerts`

- 3 sub-tabs (Alertas · Mapa · Funil) com badge 4 em Alertas; cada tab
  faz `setActive("...")` (state local).
- 2 KPI chips clickáveis: `Críticos` → `/manager/operacoes/criticos`,
  `Atenção` → `/manager/operacoes/atencao`. Cada um tem botão `?`
  adicional `(e) => { e.stopPropagation(); onHelp(); }` (real).
- 4 alert cards (FALLBACK_ALERTS mock; DB.alerts está vazia) com
  `Dispensar alerta` (real → `onDismiss?.(a.id)`) + 2 ações inline
  cada (`onAction?.(a.actions[N])`).
- 8 botões "ações inline" wired ao prop `onAction` que vem do
  `<OpsAlerts onAction={showStub}>`. Toast "em desenvolvimento (Onda 3
  backend)". Stubs com handler real e UX visível — não placebos.

### `/manager/operacoes?tab=map`

- 2 KPI chips: `Mesas ativas 10/12` → `/manager/operacoes/mesas-ativas`,
  `Em alerta 3 (1 críticas)` → `/manager/operacoes/em-alerta`.
- 10 botões de mesa (1, 2, 3, 4, 6, 7, 8, 9, 11, 12) com onClick →
  `/manager/mesa/${t.n}`. Mesa 5 e 10 renderizadas como DIV não-clickable
  (estado "livre").
- Dados são MOCK FALLBACK_TABLES (não API real). 12 mesas no DB
  (cross-check OK) mas o screen não fetcha — usa hardcoded.

### `/manager/operacoes?tab=funnel`

- 5 etapas mock (Pedido lançado 0.3m/142 · Confirmado 0.2m/142 · Em
  preparo 14m/138 CRÍTICO · Pronto 0.5m/134 · Entregue 6m/130). Sem
  botões de ação (só os 3 sub-tabs + bottom-nav + quick-actions).
- Card "O QUE FAZER AGORA" com texto "Verifique a cozinha — pratos
  quentes estão 17% acima da meta." Sem botão CTA.

### `/manager/operacoes/criticos` (V9 drill-down)

- Hero `2` críticos vermelho.
- 2 alert cards (FALLBACK_CRITICALS) cada com 2 ações stub:
  `Resolver`, `Avisar Caleb`, `Atender agora`, `Realocar` — todas via
  `showStub`.
- 2 ActionPills: `Resolver todos em sequência` (stub) e `Avisar todos
  os garçons da praça` (REAL → `/manager/mensagens?slug=...`).
- `useEffect` fetcha `complaints.list()` real e substitui o fallback se
  retornar items não-resolved. No DB tem 4 complaints com `responded`
  ou `closed` — se todas carregassem, lista vira 4 items reais.

### `/manager/operacoes/atencao` (V9 drill-down)

- Hero `2` atencao (mostarda).
- 2 alert cards (FALLBACK_ATTENTION): `Avisar Olivia`, `Realocar`,
  `Adiantar`, `Avisar cozinha` — todos stubs.
- 1 ActionPill: `Adiantar todos` (stub).
- **Sem fetch real** — só usa mock. TODO(round19) wire
  `GET /:slug/alerts?severity=med`.

### `/manager/operacoes/mesas-ativas` (V9 drill-down)

- Hero `13/16` ativas (mock).
- 13 botões de mesa por seção (Salão 8 + Varanda 5), cada onClick →
  `/manager/mesa/${t.n}` (via openTable function).
- 1 ActionPill: `Ver no Mapa →` → `/manager/operacoes?tab=map` (real).
- **Sem fetch real** — usa FALLBACK_SECTIONS hardcoded. TODO(round19)
  wire `GET /:slug/tables/open`.

### `/manager/operacoes/em-alerta` (V9 drill-down)

- Hero `4` em alerta · `2 CRÍTICAS · 2 LENTAS`.
- 4 alert table cards (FALLBACK_ALERT_TABLES) com onClick → `openTable(n)`.
- 2 ActionPills: `Realocar mesas críticas` (stub) + `Mensagem direta
  pros garçons das críticas` (real → `/manager/mensagens?slug=...`).

## Anomalia conhecida do tooling

**Playwright MCP snapshot/screenshot drift:** snapshots e screenshots
disparam um clique compositor-level em algum elemento da viewport,
fazendo o router.push do botão impactado redirecionar a página. Isso
caused URLs em probes consecutivos a divergir (ex.: navigate /manager
→ probe captura `/manager/equipe` ou `/manager/cortesias` etc).
**Não é bug do app — é instabilidade do tool.** Mitigação aplicada:
screenshot imediatamente após navigate, sem snapshot intermediário.

## Findings críticos

### F1 · Placebos em MInProgressCard (medium severity)

Arquivo: `apps/web-staff/src/components/manager/MInProgressCard.tsx`

`PillBtn` linha 97-101: `onClick={(e) => { stop(e); onClick?.(); }}`.
Quando a prop `onClick` (vinda de `onSecondary`) é `undefined`, optional
chaining no-ops e o `stop(e)` previne propagação ao wrapper. Logo: nada
acontece visualmente além do CSS hover.

Botões afetados (renderizam quando o kind correspondente aparece em
`/manager`):
- **complaint kind**: "Encaminhar" (linha 557) · esperado quando há
  complaints não-resolved (4 no DB)
- **pause-orders kind**: "+5 min" (linha 544)
- **kitchen-reorder/contact-client/courtesy kinds**: "Cancelar"/"Reenviar"/
  "Cancelar envio" (linha 578)

ScreenManagerHomeA L386-388:
```tsx
onTap={() => router.push(op.toRoute)}
onPrimary={() => router.push(op.toRoute)}
// onSecondary não é passado
```

**Fix sugerido:** ou (a) remover os botões "Encaminhar"/"+5 min"/"Cancelar"
do MInProgressCard quando `onSecondary === undefined`, ou (b) ScreenManagerHomeA
passa `onSecondary={() => router.push(op.toRoute)}` (mesma rota do Responder)
ou (c) abrir uma sheet/modal de encaminhamento real.

### F2 · Drill-downs sem dados reais (low severity)

`/atencao`, `/mesas-ativas`, `/em-alerta` usam FALLBACK_* hardcoded. Não
chamam API. TODO(round19) já tracked nos arquivos de screen como
comentário.

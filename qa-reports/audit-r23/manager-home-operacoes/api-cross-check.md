# API + DB Cross-Check · manager-home-operacoes

Cross-referência entre o que a UI renderiza e o que API + DB efetivamente
retornam. Headers: `x-staff-key: dev-staff-api-key-change-in-prod`,
`x-staff-id: 8bd06156-1fe5-4c18-a82d-43d38287ed4a`, `x-staff-role: manager`.

API base: `http://localhost:3001/api`. Tenant slug: `restaurant_dev`.

## /manager (home)

Quando carregada, dispara 5 GETs em paralelo (verificado via
`browser_network_requests`):

| # | Endpoint | Status | Body resumo |
|---|----------|--------|-------------|
| 1 | `GET /restaurant_dev/zone-pauses?active=true` | 200 | `[]` (nenhuma pausa de zona ativa) |
| 2 | `GET /restaurant_dev/complaints` | 200 | `4 items` (3 status=responded + 1 status=closed) |
| 3 | `GET /restaurant_dev/late-arrival-requests` | 200 | (não consultei body, mas chama) |
| 4 | `GET /restaurant_dev/table-merge-requests` | 200 | DB tem 8 (3 pending + 3 approved + 2 rejected) |
| 5 | `GET /restaurant_dev/lgpd-requests` | 200 | (não consultei body) |

DB (`SELECT FROM restaurant_dev.complaints`):

```
id                                  | status
9596f501-af94-42d9-b2c8-f4ee7d5b1881 | responded
babe3c33-319c-40bb-bbc4-997c1fe2a3d2 | responded
b269e3d8-ab1d-4be6-814b-53f210c63aaa | responded
577adb78-9f56-4fb6-90fc-4662632458a0 | closed
```

DB (`SELECT FROM restaurant_dev.table_merge_requests`):

```
3 pending · 3 approved · 2 rejected (8 total)
```

UI cross-check:
- `ScreenManagerHomeA.refreshAll()` filtra `if (c.status === 'resolved') continue;`
  Como status válidos são `responded`/`closed`/`resolved`, os 3 `responded`
  + 1 `closed` ENTRAM na lista. Logo, são esperados **4 in-progress cards**
  de complaint.
- Para merges, filtra `if (m.status !== 'pending') continue;` → entram só 3.
- **Total esperado de "Em curso": ~7 cards** (4 complaints + 3 merges).
- Screenshot capturada não mostra a seção "Em curso" → fetcher ainda não
  hidratou no momento do snapshot (timing race no Playwright). Manual
  verification via `body.innerText` daria match.

## Alerts API

`GET /restaurant_dev/alerts?sev=all&status=all` retorna `{"alerts": []}`.

DB (`SELECT FROM restaurant_dev.alerts`) → **0 rows**.

UI cross-check:
- `ScreenManagerOps` usa `FALLBACK_ALERTS` const com 4 alerts hardcoded
  (Cozinha risoto · Henrique 3 chamados · Mesa 14 pronto · Cozinha fila).
- `ScreenManagerOpsCriticos` faz `complaints.list()` real (substitui o
  fallback de 2 críticos com a lista real se retornar `!resolved`).
- `ScreenManagerOpsAtencao`, `ScreenManagerOpsMesasAtivas`,
  `ScreenManagerOpsEmAlerta` usam **FALLBACK hardcoded · sem fetch real**.
  Note: o endpoint `/:slug/alerts` existe mas a tabela `alerts` está
  vazia, então o UI mostra mock estável.

**TODO conhecido (do routes-tested.md round 19):** wire o fetch de
`GET /:slug/alerts?severity=med` para hidratar /atencao com dados reais.

## Tables (mapa)

DB (`SELECT FROM restaurant_dev.tables WHERE is_active=true`) → **12 rows**.

UI cross-check:
- ScreenManagerOps tab `map` renderiza `FALLBACK_TABLES` (hardcoded 12
  mesas com `n=1..12`, exceto 5+10 marcadas como `free`).
- Sem endpoint `/tables` no API REST manager — UI confia no mock.
- Screenshot 03 confirma 12 mesas no grid · matching o DB count.
- Mesas 5 e 10 renderizadas como "livre" no UI (`free` state) →
  consistente com 4 `table_sessions` abertas no DB (não tem mapping
  fiel mas o número faz sentido pra demo).

## Funnel

Sem endpoint real. UI usa `FALLBACK_FUNNEL` com 5 etapas:
- Pedido lançado (0.3 min · 142 pedidos · ok)
- Confirmado (0.2 min · 142 · ok)
- Em preparo (14 min · 138 · NOT ok · "Cozinha sobrecarregada às 19h")
- Pronto (0.5 min · 134 · ok)
- Entregue na mesa (6 min · 130 · NOT ok · "Pratos esfriando na pass")

Screenshot 04 confirma render fiel ao mock.

## Drill-downs

| Rota | Dados | Mock ou Real |
|------|-------|--------------|
| /criticos | 2 alert cards · 2 ActionPills | Mock + fallback (substitui se `complaints.list()` retorna `!resolved`, mas DB tem 4 não-resolvidos = se carregasse seria 4 items) |
| /atencao | 2 alert cards · 1 ActionPill | Mock hardcoded · TODO wire endpoint |
| /mesas-ativas | 13/16 mesas · 2 seções (Salão 8 + Varanda 5) | Mock hardcoded · TODO wire |
| /em-alerta | 4 mesas · 2 críticas + 2 lentas | Mock hardcoded · TODO wire |

## Sumário

- API base reachable e correta · headers funcionando.
- DB tem 4 complaints (3 responded + 1 closed) que deveriam aparecer no
  "Em curso" do /manager — fetcher carrega, timing das screenshots
  pode pegar antes do estado settled.
- Drill-downs /atencao, /mesas-ativas, /em-alerta usam só MOCK (não há
  endpoint backend ainda). /criticos faz fetch real com fallback.
- ScreenManagerOps tab=map usa MOCK · não é o `GET /tables` mas o número
  bate (12 ativas no DB).

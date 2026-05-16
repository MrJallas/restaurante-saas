Subagent: manager-home-operacoes
Status: PASS (3 functional placebos descobertos via code audit, não silent placebos noop)

Persona: Manager Erica (staffId=8bd06156-1fe5-4c18-a82d-43d38287ed4a)
Tenant: restaurant_dev
Viewport: 414×896 (mobile)

## Veredito

| Métrica | Valor |
|---|---|
| Rotas auditadas | 8/8 (todas 200 + hydrate) |
| Clickables totais | 137 |
| Buttons com onClick fiber-real | 137/137 ✅ |
| Noop placebos detectados via fiber `() => {}` | **0** |
| Functional placebos descobertos via code audit | **3 condicionais** ⚠️ |
| Stubs (handler real chama showStub → toast "em desenvolvimento") | 25 (Onda 3 TODO) |

## Findings em ordem de prioridade

### F1 (MEDIUM) — MInProgressCard tem 3 functional placebos
File: `apps/web-staff/src/components/manager/MInProgressCard.tsx`

- L97-101 `PillBtn`: `onClick={(e) => { stop(e); onClick?.(); }}` — quando prop `onClick` (vinda de `onSecondary` do MInProgressCard) é `undefined`, handler stopPropagationa e não faz nada — **placebo silencioso**
- L557 (kind `complaint`): `<PillBtn label="Encaminhar" onClick={onSecondary} />` — **VAI renderizar quando há complaints não-resolvidos** (DB tem 4 atualmente: 3 responded + 1 closed)
- L544 (kind `pause-orders`): `<PillBtn label="+5 min" onClick={onSecondary} />`
- L578 (kinds `kitchen-reorder`, `contact-client`, `courtesy`): Cancelar/Reenviar/Cancelar envio com `onClick={onSecondary}`

`apps/web-staff/src/screens/manager/ScreenManagerHomeA.tsx` L386-388 só passa `onTap` + `onPrimary`. **`onSecondary` NUNCA é passado** para nenhum kind de card.

**Fix sugerido**: ou remover botões secundários quando `onSecondary === undefined`, ou ScreenManagerHomeA passa onSecondary com handler real (ex.: abrir sheet "Encaminhar para outro manager" pra complaints).

### F2 (LOW) — Drill-downs sem fetch real (já tracked)
- `/atencao`, `/mesas-ativas`, `/em-alerta` usam só FALLBACK mock
- TODO(round19) já tracked nos arquivos de screen
- `/criticos` é o único drill-down com fetch real (complaints.list() !resolved)

### F3 (LOW) — Tab `map` em /operacoes é mock
- `FALLBACK_TABLES` em `ScreenManagerOps.tsx:92` hardcoded com 12 mesas
- Count bate com `SELECT COUNT(*) FROM restaurant_dev.tables WHERE is_active=true` (12)
- Dados de tempo/garçom/valor são fake

### F4 (INFO) — Tabela alerts vazia no DB
- `SELECT * FROM restaurant_dev.alerts` → 0 rows
- Endpoint `GET /:slug/alerts` retorna `{alerts:[]}`
- UI usa FALLBACK_ALERTS em todas rotas de alerts

## Cross-check (API + DB)

| Item | UI | DB | Match |
|---|---|---|---|
| 12 mesas no mapa | render 12 | 12 active | mock OK |
| 3 alerts home | render 3 | 0 | mock |
| Bell → /manager/notifications | confirmado primitives.tsx:668 | n/a | ✅ |
| 4 KPI canônicos em /operacoes/* | criticos/atencao/mesas-ativas/em-alerta | n/a | ✅ |
| Funnel chart 5 stages | render | mock | mock |
| 2 ActionPills em /criticos | Resolver todos (stub) + Avisar garçons (real → /mensagens) | n/a | ✅ |
| Bottom-nav 5 itens | OK 8 rotas | n/a | ✅ |
| 4 complaints DB | NÃO render em /manager (timing race ou refresh não settled) | 4 (3 responded + 1 closed) | parcial — código correto mas screenshot pegou antes do hydrate |

## Bugs novos

- 🆕 **MEDIUM** `apps/web-staff/src/components/manager/MInProgressCard.tsx:97-101, 544, 557, 578` — PillBtn com onSecondary undefined cria 3 functional placebos quando ScreenManagerHomeA não passa o prop

## Notas tooling
Playwright MCP `browser_take_screenshot` e `browser_snapshot` causaram URL drift consistente — disparam clique compositor-level em algum elemento da viewport, fazendo router.push redirecionar. NÃO é bug do app. Mitigação: navigate → screenshot imediato → fiber probe em janela curta.

Tempo: ~18.7min

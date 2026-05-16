Subagent: manager-alertas-cortesias
Status: PASS (alertas Onda 4 TODO, cortesias+compensate gold-standard, kitchen-reorder ≠ drag-drop)

Persona: Manager Erica (staffId=8bd06156-1fe5-4c18-a82d-43d38287ed4a)
Tenant: restaurant_dev

## Wiring scorecard

| Surface | Real | Stub toast | Local-only state |
|---|---:|---:|---:|
| /manager/alertas | 11 | 13 | 6 (Dispensar) |
| /manager/cortesias | all | — | — |
| /manager/compensate | all | — | — |
| /manager/kitchen-reorder | nav | — | all (mock data) |
| /manager/chamado/[id]?kind=complaint | all | — | — |
| /manager/chamado/[id]?kind=generic | — | — | placeholder |

## Key findings

### F1 — /manager/alertas: 29 botões confirmados, 13 são stubs Onda 4
- 2 topbar + 4 filter + 6 alerts × 3 + 5 nav = 29 buttons
- 12 alert action buttons + 1 Buscar são pure toast stubs: `"X · em desenvolvimento (Onda 4 backend)."`
- 6 Dispensar removes card from local state only (não persiste)
- DEFAULT_ALERTS é hardcoded mock; backend Onda 4 endpoints não existem

### F2 — /manager/cortesias + /manager/compensate: GOLD-STANDARD real
- POST AUDIT-R23-Fondant teste via API
- Renderizou imediatamente em /manager/cortesias?tab=history (KPI Hoje:1 Pendentes:1, card "Mesa 1 · há 2 min · Sobremesa · pendente por Erica Gerente")
- 6 cortesia types verified: Sobremesa/Drink/Couvert/Desconto/Mensagem/Outro
- Manager name resolved server-side ✅

### F3 — /manager/kitchen-reorder NÃO é drag-drop
- É select+confirm flow com mock data
- State machine `select→sent→accepted` verified (3-second setTimeout stub entre sent e accepted)
- **`PATCH /orders/:id/queue-position` NUNCA dispara** (confirmado via network inspection)
- Nenhum GET on mount

### F4 — /manager/chamado/[id] bifurcado
- `kind=complaint` = totalmente wired (list-fetch + resolve + respond + 4 chip actions + contact sheet — testado com complaint id 9596f501-...)
- `kind=generic` = dashed `Detalhes do chamado #{id}` placeholder

### F5 — Schema waiter_calls SEM coluna `notes`
- Rubric `INSERT INTO waiter_calls ... notes='AUDIT-R23-test'` impossível
- Usado pending existente (1669bbc7-...) pra teste kind=generic
- Screen não carrega waiter_calls de fato

### F6 — Labels "Aceitar/Acompanhar/Resolver" não existem verbatim
- Análogo (complaint variant): "Contactar / Enviar resposta / Marcar como resolvido"

### F7 — Env mismatch deployment
- web-staff buildado com `NEXT_PUBLIC_API_URL=http://192.168.43.12:3001/api`
- Não resolve da audit machine
- Workaround: Playwright `page.route` rewrite 192.168.43.12:3001 → localhost:3001
- **Não é code bug — deployment-time env mismatch** (precisa rebuild com URL correto pra prod)

## Bugs novos

- 🆕 **P3** `apps/web-staff/src/screens/manager/ScreenManagerAlertas.tsx` (ou similar) — 12 alert action buttons + 1 Buscar pure toast Onda 4 TODO (não bug, é planejado, mas vale tracking)
- 🆕 **P2** `apps/web-staff/src/screens/manager/ScreenManagerKitchenReorder.tsx` — implementação atual é select+confirm mock; intent original seria drag-drop com PATCH /orders/:id/queue-position. Decisão UX precisa
- 🆕 **P2** `apps/web-staff/src/app/manager/chamado/[id]/page.tsx` — kind=generic é placeholder dashed; ou deprecate ou implementar Aceitar/Acompanhar/Resolver real pra waiter_calls
- 🆕 **DEPLOY** NEXT_PUBLIC_API_URL hardcoded em build (192.168.43.12) — quebra em qualquer máquina que não seja a build machine. Fix antes de prod-ish deploy

## Recomendações
1. Wire alertas a endpoints reais em Onda 4 (GET /alerts, POST /alerts/:id/dismiss, POST /alerts/:id/action)
2. Decidir kitchen-reorder UX: drag-drop real com PATCH ou wire POST /kitchen/reorder + WS
3. Deprecate kind=generic chamado OR implement waiter_calls flow real
4. Fix baked-in NEXT_PUBLIC_API_URL antes de qualquer prod deploy

## Cleanup
- 1 cortesia AUDIT-R23-Fondant teste deletada
- Verified 0 rows com prefix AUDIT-R23 remaining
- Nenhum waiter_calls row criado (schema mismatch impediu)

Tempo: ~19.1min

Subagent: manager-mesa-timeline
Status: PASS (3 PARTIALs · 1 HIGH novo · 3 MEDIUM · 2 LOW · 2 INFO)

Persona: Manager Erica (staffId=8bd06156-1fe5-4c18-a82d-43d38287ed4a)
Tenant: restaurant_dev

## 5 cenários

| # | Cenário | Status |
|---|---|---|
| 1 | /manager/mesa/[n] redirect | ✅ PASS |
| 2 | Table-menu 6 actions | ✅ PASS (1 FUNCTIONAL + 1 disabled + 4 STUB toast) |
| 3 | /manager/timeline/[orderId] | ⚠️ PARTIAL (mock DEFAULT_STEPS, orderId ignorado) |
| 4 | /manager/stat/[kind]/[id] | ⚠️ PARTIAL (5/8 kinds com bugs mapping) |
| 5 | /manager/pausa-zona | ✅ PASS (live end-to-end OK) |

## Detalhes por cenário

### (1) Mesa redirect — PASS
- `/manager/mesa/1` (number) → redirect `/manager/table-menu/4a19456c-...?slug=restaurant_dev&tableNumber=1` ✅
- `/manager/mesa/M01` (code literal) → ErrorState "Numero de mesa invalido." (parseInt('M01',10)=NaN em `apps/web-staff/src/app/manager/mesa/[n]/page.tsx:49`)
- `/manager/mesa/3` (livre) → FreeTable Hero V11
- `/manager/mesa/999` → NotFound Hero V11

### (2) Table-menu 6 actions — PASS
- "Mandar cortesia" → `router.push('/manager/compensate?...')` ✅ FUNCIONAL
- "Contactar cliente" → DISABLED (sem customerId na URL)
- "Ver timeline da mesa" → STUB toast (não linka pra /manager/timeline/[orderId] existente)
- "Imprimir conta", "Transferir mesa", "Fechar mesa" → STUB toast
- 0 placebos silenciosos (todos com toast feedback)

### (3) Timeline — PARTIAL
- UI renderiza DEFAULT_STEPS MOCK (6 etapas fixas, Mesa 11 hardcoded)
- `orderId` recebido mas prefixo `_orderId` = não usado
- Backend `/orders/:id/timeline` Onda 4 TODO (linhas 8-14 do source)
- DB `order_status_history` JÁ TEM dados necessários (testado em 3 orders)

### (4) Stat drill — PARTIAL
8 kinds probed:
- `complaint`, `late-arrival`, `merge`: renderizam com `undefined` / `Invalid Date` (mapping issue — ver HIGH abaixo)
- `lgpd`: API HANG (não resolveu em 6s)
- `escalation`, `qr-issue`, `generic-call`: useEffect sem branch → "Não encontrado." sempre
- `revenue`: NÃO existe no enum StatKind (já documentado em sub 16 anterior)

### (5) Pausa-zona — PASS live
- 4 botões fixos 5/10/15/30 min + waiter picker (Ana, Bruno) + textarea + CTA dinâmica
- Submit Playwright: POST /api/restaurant_dev/zone-pauses → HTTP 201
- Response: id=5fb47c36-..., waiterId=Ana, startedBy=Erica, reason=AUDIT-R23-cozinha-sobrecarregada, active=true
- DB cross-check: row presente, ends_at - started_at = 10 min
- UI: "PAUSAS ATIVAS · 1 · ATIVA · 09:58 · Encerrar agora" com countdown
- Cleanup OK (DELETE 1 row, 0 restantes)

## Bugs novos / Achados (8 total — destaques)

### 🔴 HIGH — Mapping de DTO faltando em complaints/late-arrival/table-merge
- `apps/api/src/modules/complaints/complaints.service.ts:348+` `mapRow` não denormaliza:
  - `tableNumber`
  - `customerName`
  - `description`
  - `createdAt`
- Frontend `ComplaintDto` em `packages/shared-types/src/complaint.ts:61-77` espera esses campos
- Resultado: stat drill mostra `undefined` / `Invalid Date`
- Mesma situação em `late-arrival.service.ts`, `table-merge.service.ts`
- TODO marker existente em `complaints.service.ts:62`
- **Fix**: adicionar JOIN com sessions/customers/tables + alias dos campos

### 🟡 MEDIUM — Stat detail useEffect sem branches
- `apps/web-staff/src/screens/manager/ScreenManagerStatDetail.tsx:60-86` useEffect SEM branches para `escalation`, `qr-issue`, `generic-call`
- Fallback render só dispara se data != null
- Fica em "Não encontrado." sempre
- **Fix**: adicionar fetchers ou hide a essas opções no link

### 🟡 MEDIUM — api.lgpd.list() hang/timeout
- Não resolveu em 6s
- Sem repro local rápido — investigar endpoint LGPD

### 🟡 MEDIUM — Timeline orderId ignorado (Onda 4 TODO)
- `apps/web-staff/src/screens/manager/ScreenManagerTableTimeline.tsx:62` `_orderId` prefixed
- Mock DEFAULT_STEPS fixo
- Backend `/orders/:id/timeline` não implementado
- DB `order_status_history` pronto pra alimentar

### 🔵 LOW (Onda 3) — Ver timeline stub
- `ScreenManagerTableMenu.tsx:278-284` "Ver timeline da mesa" é stub toast
- Não linka pra `/manager/timeline/[orderId]` JÁ existente
- Wire faltando

### 🔵 LOW — /manager/mesa/M01 cai em ErrorState
- `apps/web-staff/src/app/manager/mesa/[n]/page.tsx:53-56`
- Copy genérico "Numero de mesa invalido."
- Detectar prefixo `M\d+` e sugerir forma correta seria UX win

### ℹ️ INFO — PUBLIC_HOST=192.168.43.12 mismatch (bug recorrente)
- `.env` aponta LAN antiga; browser não alcança
- Playwright precisou page.route rewrite → localhost
- Affecta apenas dev em host disconectada da LAN configurada
- **Já reportado por subs 14, 15** — bug deploy compartilhado

### ℹ️ INFO — Pausa-zona sem custom duration
- Type-level `ZonePauseDurationMinutes = 5|10|15|30` (decisão Round 18)

Tempo: ~30min (252840 total_tokens · 255 tool_uses)

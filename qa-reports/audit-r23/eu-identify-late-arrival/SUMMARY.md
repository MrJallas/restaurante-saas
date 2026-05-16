Subagent: eu-identify-late-arrival
Status: PASS (3 PASS · 2 PARTIAL · 4 achados — 2 P2 + 2 P3)

Sim: iPhone 17 Pro C3DC39B2 via idb localhost:10883
Branch: fix/customer-tools-and-continuation
Customer: Caleb Teste CPF 12345678909

## Resultado por cenário

| # | Cenário | Status | Nota |
|---|---|---|---|
| a | /eu perfil customer | ⚠️ PARTIAL | Guard CTA OK (P0 #13 fix). FE NÃO renderiza total_visits (107) nem last_visit_at |
| b | Logout handleLogout | ⚠️ PARTIAL | Só limpa sessionStorage. Cookies recognition_token (1 ano) e session_token httpOnly persistem. SEM invalidação server-side |
| c | /identify CPF lookup late-arrival | ✅ PASS | POST /customer/identify OK · rate-limit 5/15min/IP · canonicalName retornado |
| d | /waiting-approval fallback genérico | ✅ PASS | Guard sem session redireciona · 3 modes × 4 states cobertos · 5 events WS consumidos |
| e | view_courtesy tool dispatch | ✅ PASS | Silent navigation fallback (P0 #6 — endpoint /courtesy não existe ainda). 2 chips canônicos Round 4 §C-NEW-3 |

## V20 canon /identify × WelcomeModal — 100% compliance ✅
- Tokens, tipografia, layout (`grid place-items-center h-[100dvh]`), card max-w-[420px]
- FieldShell, helper mono uppercase
- PillButton filled com seta canon →
- Label **"Seu nome"** (cláusula 4 CLAUDE.md OK)
- Idênticos a WelcomeModal

## Bugs novos / Achados (4)

### 🟡 P2 — /eu não exibe total_visits nem last_visit_at
- Dados existem no DB (Caleb: total_visits=107, last_visit_at=2026-05-15 20:45:05)
- Provavelmente já chegam via useSession
- FE `ScreenCustomerMe.tsx` só usa `isReturning` booleano
- **Fix sugerido**: add stat tile abaixo do avatar tipo "107 visitas · última: 15 mai"

### 🟡 P2 — Logout cosmético (privacy concern)
- `ScreenCustomerMe.tsx:39-46` `handleLogout()` só `sessionStorage.clear()`
- **Cookies recognition_token (1 ano) e session_token (httpOnly) PERSISTEM**
- Nenhum endpoint server-side chamado pra invalidar visit/session
- **Próximo QR scan reconhece o customer via cookie** → cliente não consegue "sair" de verdade
- **Fix sugerido**: POST a endpoint que faça:
  - `res.clearCookie('recognition_token')`
  - `res.clearCookie('session_token')`
  - Invalidar visit no Postgres

### 🔵 P3 — view_courtesy é fallback hardcoded
- `services/ai-service/services/tools/view_courtesy.py` retorna literal
- Quando endpoint /courtesy for criado, wirar api_client.get(...) em vez do return literal
- Round 4 §C-NEW-3 chips canônicos OK por enquanto

### 🔵 P3 — FieldShell duplicado inline
- `WelcomeModal.tsx:214` e `ScreenCustomerIdentifyBeforeJoin.tsx:242`
- Comentários nos 2 arquivos pedem extract pra `components/ui/FieldShell.tsx`
- Refactor visual-preservante recomendado

## DB cross-check
- customers Caleb: total_visits=107, last_visit_at=2026-05-15 20:45:05, canonicalName="Caleb Teste"
- late_arrival_requests: 5 rows recentes, status enum approved/rejected/expired observados, TTL ~60s
- Schema bate com WS events consumidos pelo FE

## Brief inconsistências corrigidas
- `view_courtesy` chamada brief tinha `context:{...}` aninhado — endpoint espera flat top-level `tenantId/customerId/isStaff` (corrigi no teste)
- Brief diz "/eu renderiza nome + total_visits + lastVisit summary" — FE atual só exibe nome (vide achado #1)

Tempo: ~6.2min (82711 tokens, 54 tool uses)

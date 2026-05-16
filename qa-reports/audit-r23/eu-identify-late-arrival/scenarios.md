# Cenários a-e · /eu + /identify + late-arrival + view_courtesy

Audit R23 · `fix/customer-tools-and-continuation`. Sim iPhone 17 Pro `C3DC39B2-F4B2-4CC0-8743-CABF01ED9BCA`. Cap 50 tool uses.

## (a) `/eu` perfil customer · WARN

**Source**: `apps/web-customer/src/app/[slug]/eu/page.tsx` → `apps/web-customer/src/screens/feedback-and-history/ScreenCustomerMe.tsx`.

**Comportamento observado**: sem session (sim "cold"), `/eu` NÃO crasha — renderiza um **guard CTA "Identifique-se pra acessar seu perfil" → botão "Identificar agora"** que despacha pra `/identify`. Header AppShell com `‹` back e `≡` menu também aparecem (screenshot `02-eu.png`). Esse é o fix do **P0 #13** (linhas 50-83).

**Quando o customerId está hidratado** (linhas 85+):
- Avatar 88×88 com iniciais (`getInitials`)
- Nome + role "Cliente" (+ " · Conhecido da casa" se `isReturning`)
- Card "Sessão atual" com `tableLabel` + `participants.length`
- Atalhos: Mensagens equipe / Conversas IA / Meus pedidos / Reclamações
- Privacidade: "Apagar minhas conversas" → `/{slug}/assistente?prefill=Quero+apagar+meus+dados`
- "Trocar perfil" → `/{slug}` · "Sair da mesa" → handleLogout (cenário b)

**total_visits / lastVisit**: ⚠️ **NÃO renderizados** na tela `Eu`. O ScreenCustomerMe.tsx só usa `session.isReturning` (booleano) — não consome `total_visits` nem `last_visit_at` do `customers`. O brief diz "Renderiza nome + total_visits + lastVisit summary", mas o source não exibe esses campos. Considerar:
  - Adicionar um stat tile "X visitas · última: <data>" abaixo do avatar.
  - DB confirma que os dados existem (`total_visits=107`, `last_visit_at=2026-05-15`).

**Status**: ✅ guard CTA funciona · ⚠️ falta exibir total_visits/lastVisit.

---

## (b) Logout · limpa sessão + cookies · ⚠️

**Source**: `ScreenCustomerMe.tsx:39-46`.

```ts
const handleLogout = () => {
  try { window.sessionStorage.clear(); } catch { /* ignore */ }
  router.push('/');
};
```

**Análise**:
- ✅ Limpa `window.sessionStorage` (onde `session_token` mora — verificado em `lib/storage`).
- ❌ **NÃO limpa cookies** httpOnly `recognition_token` e `session_token`. Esses cookies só somem via `Max-Age=0` setado server-side ou via expiração natural.
- ❌ **NÃO chama** um endpoint `/customer/logout` que invalide o session server-side.
- ❌ `localStorage` também não é limpo (recognitionToken legado mora lá se setado via `setRecognitionToken`).

**Consequência prática**: o "logout" tira o customer do contexto local **mas o cookie `recognition_token` persiste no browser por 1 ano** (RECOGNITION_COOKIE_MAX_AGE = 365 dias) — qualquer scan/identify subsequente vai reconhecer o customer de novo. Para um logout completo, faltam:
1. POST a endpoint que faça `res.clearCookie('recognition_token')` + `res.clearCookie('session_token')`
2. Limpar `localStorage` (sem ser só `sessionStorage`)
3. Invalidar visit_id / session_id no Postgres (set `ended_at=NOW()`)

**Status**: ⚠️ logout parcial · só limpa client-side sessionStorage.

---

## (c) `/identify` late-arrival CPF lookup · ✅

**Source**: `apps/web-customer/src/app/[slug]/identify/page.tsx` → `ScreenCustomerIdentifyBeforeJoin.tsx` (LOCKED V20).

**Guard sem session**: `useEffect` em `identify/page.tsx:28-36` faz `if (!getSessionToken()) router.replace('/${slug}')`. Quando aberto direto na URL sem ter scaneado QR antes, redireciona pra slug-index "Escaneie o QR da mesa" (screenshot `01-identify.png`).

**CPF lookup via API** (verificado direto):
```
POST /api/restaurant_dev/customer/identify
{"name":"Caleb","cpf":"12345678909"}
→ 200 {"customerId":"21a81205-4adf-41e3-86b5-baa8d3e339fb",
       "isReturning":true,
       "canonicalName":"Caleb Teste",
       "customer":{"customerId":"21a81205...","name":"Caleb Teste","totalVisits":107}}
```

- ✅ Encontrou customer existente (`isReturning:true`)
- ✅ Retorna `canonicalName` "Caleb Teste" (mesmo que input "Caleb") — o screen mostra "Bem-vindo de volta, Caleb Teste!" via `setReturningName` (linhas 100-106) e espera 1.8s antes de navegar pra `/waiting-approval`
- ✅ Rate-limit: 5 attempts / 15min / IP (Round 6 B-NEW-11, lines 36-38 do controller)

**Status**: ✅ endpoint + UI canon V20 funcionam · "qual mesa juntar" é exibido pelo host na tela `/host/approve/join` (não nesse fluxo).

---

## (d) `/waiting-approval` fallback genérico · ✅

**Source**: `apps/web-customer/src/app/[slug]/waiting-approval/page.tsx` → `ScreenCustomerWaitingApproval.tsx`.

**Guard sem session**: `useEffect` (linhas 35-39) faz `if (!getSessionToken()) router.replace('/${slug}')` — comportamento idêntico ao /identify. Screenshot `03-waiting-approval.png` mostra redirect pra slug-index.

**3 modes suportados** (linha 10): `late-arrival | merge-target | merge-origin`.

**4 visual states**: `waiting | approved | rejected | expired` com copy específica por mode×state (lines 158-214):
- Pulse balloon + countdown durante `waiting`
- CheckMark verde + redirect 1.1s em `approved`
- Sleep z em `rejected/expired` com "Chamar recepcionista" / "Tentar de novo"

**Eventos WS consumidos** (lines 93-146):
- `late_arrival.approved | rejected | expired` (matched on `requestId`)
- `table_merge.approved | rejected` (com `side==='both'` filter)
- `escalation.advanced` → flips eyebrow pra "Recepcionista vai decidir"

**DB cross-check**: `late_arrival_requests` tem 5 rows recentes com mix expired/rejected/approved — vide `db-cross-check.md`.

**Status**: ✅ screen + WS handlers + 4-state matrix completos.

---

## (e) `view_courtesy` dispatch · ✅ (fallback funciona)

```bash
$ docker exec restaurant-ai python3 -c "..." 
{"name":"view_courtesy","silent":false,"requiresText":false,"router":false,
 "result":{
   "message":"Não consegui consultar suas cortesias agora. Quer que eu chame o garçom pra confirmar?",
   "chips":[
     {"id":"courtesy-call-waiter","label":"Chamar garçom","action":"send","payload":"chamar o garçom"},
     {"id":"courtesy-view-order","label":"Ver pedido","action":"send","payload":"ver meu pedido"}
   ],
   "silent":false,
   "actionPayload":{"status":"not_implemented","tool":"view_courtesy","fallbackChip":"chamar garçom"},
   "routerTarget":null,"error":null}}
```

**Análise** (`services/ai-service/services/tools/view_courtesy.py:1-37`):
- ⚠️ **Implementação fake** propositadamente — o tool é **silent navigation hint** (P0 #6).
- Endpoint `/courtesy` no `apps/api` **NÃO EXISTE** ainda (cortesias vivem como `complaints` com `resolution_kind='courtesy'`).
- ✅ Retorna **2 chips canônicos** (Round 4 §C-NEW-3): `courtesy-call-waiter` + `courtesy-view-order`.
- ✅ Não issue 404 backend — o LLM não loopa.
- ❌ Não mostra histórico real de brindes (TODO).

**Payload format**: a chamada do brief usava `'context':{...}` aninhado, mas o endpoint espera fields top-level (`tenantId`, `customerId`, `isStaff` direto). Resolvido nesse audit retestando com payload correto.

**Status**: ✅ tool dispatch responde graciosamente · ⚠️ não consulta histórico real (P0 #6 documentado).

---

## Resumo
| Cenário | Status |
|---|---|
| (a) `/eu` perfil | ⚠️ guard OK · falta total_visits/lastVisit display |
| (b) Logout | ⚠️ só limpa sessionStorage · cookies persistem |
| (c) `/identify` | ✅ guard OK · API responde isReturning + canonicalName |
| (d) `/waiting-approval` | ✅ guard OK · 3 modes × 4 states completos |
| (e) `view_courtesy` | ✅ fallback canônico · 2 chips · sem 404 backend |

# Security follow-ups

> Estado do hardening avaliado durante o fechamento do re-scan OWASP
> (2026-07-05, branch `fix/framework-bugfixes`). §A/§B/§C TODOS fechados no
> código; resta APENAS a observação operacional de prod do §A (`unsafe-eval` no
> report-uri após o launch) — nada de código pendente. LLM01 re-fechado por
> construção (o LLM nunca decide join), não por gate heurístico.

## ✅ FECHADO

- **ws@8.18.3 → 8.21.0** (advisories GHSA-58qx uninitialized-mem + GHSA-96hv DoS):
  bump de PATCH `engine.io` 6.6.6→6.6.9 (pina ws~8.21) + `socket.io-adapter`
  2.5.6→2.5.8 (idem), ambos dentro do range `~6.6.0`/`~2.5.2` do socket.io@4.8.3 →
  zero breaking, sem override. Validar WS no boot (smoke KDS/staff/customer).
- **X-Powered-By**: `poweredByHeader: false` nos 2 FE.
- **middleware→proxy** (deprecação Next 16): `middleware.ts`→`proxy.ts`,
  `middleware()`→`proxy()` (o TV-gate; `config.matcher` idêntico). Build sem
  deprecation.
- **highlight sticky do salon-map**: casava por `sessionId` (removido no A07) →
  por `num` (`highlightTableNum`).
- **Permissions-Policy** (enforce, per-app): web-customer `geolocation=(self)`
  (fluxo de mesa) + câmera/mic/pagamento/usb OFF; web-staff `camera=(self)`
  (scan-qr) + geoloc/mic/pagamento/usb OFF.
- **CSP em `Content-Security-Policy-Report-Only`** nos 2 FE: baseline seguro
  (`object-src none`, `base-uri self`, `frame-ancestors none`, form-action self;
  script/style com `unsafe-inline` que o Next precisa hoje). NÃO bloqueia nada —
  é a etapa 1 do rollout. **Promover pra enforce** exige nonces (o Next injeta
  script inline) + observar reports; ver §A abaixo.
- **salon/tables/adjacent** + **table-merge (create/approve/reject)**: vazavam
  `table_sessions.id` de OUTRA mesa pro CLIENTE (hijack customer→customer) →
  cortados (testes `salon.service.test.ts`, `table-merge.controller.test.ts`).
- **tv-unlock XFF-bypass** (regressão do Next 16): backstop global + teste.
- **[A07 RAIZ] x-session-token SEPARADO do table_sessions.id** (decisão do dono,
  opção B): `token = HMAC(SESSION_TOKEN_SECRET, sessionId)`. O id vira
  identificador de recurso INÓCUO (seguro de expor em QUALQUER DTO — host/tables,
  session-timeline, etc.); a credencial é o token, que nunca sai. Determinístico
  (multi-device reusa uma chave; invalidação por id computa o token). SessionGuard
  intocado. Sessões pré-split seguem no TTL 4h (zero disrupção). **Isso fecha a
  família A07 na raiz — o §B "navegar-por-número" abaixo virou DESNECESSÁRIO.**
  Prova E2E: token→200, id→401. `session-auth-token.ts` + testes; API 710/710.

## ⏳ RESTA

### §A. CSP enforce — FEITO (nonce-based); resta só a observação de prod
CSP agora é ENFORCE com nonce per-request no `src/proxy.ts` dos 2 FE:
`script-src 'self' 'nonce-X' 'strict-dynamic'` bloqueia `<script>` injetado sem o
nonce. `style-src 'unsafe-inline'` mantido (React `style={{}}` + styled-jsx).
Validado no preview (renderiza, zero violação de CSP). **Resta (observação, não
código):** em prod o `'unsafe-eval'` é removido (dev mantém pro HMR) — se alguma
lib usar eval em prod, o report surge; adicionar um `report-uri`/endpoint de
coleta e observar antes do launch. Se algo quebrar, re-permitir `'unsafe-eval'`
no prod é o fallback documentado.

### §B. ~~nav-id staff~~ — RESOLVIDO pela separação token↔id (ver "✅ FECHADO")
Antes o `table_sessions.id` era o `x-session-token`, então expô-lo pro staff
(host/tables, session-timeline) permitia forjar a sessão do cliente. A opção B
(HMAC, escolhida pelo dono) separou os dois: o id agora é inócuo. **Não é mais
necessário** o refactor "navegar-por-número" — o staff pode continuar usando o id
como chave de navegação/recurso, porque ele deixou de ser credencial. §B fechado.
- Nota opcional (limpeza, NÃO segurança): as remoções defensivas do id no
  salon/adjacent e table-merge (feitas antes) poderiam ser revertidas já que o id
  é seguro — mas o cliente não precisa dele mesmo, então ficam (menos superfície).
- Config de PROD: setar `SESSION_TOKEN_SECRET` no ambiente (hoje cai no default de
  dev). Rotacioná-lo desloga todo mundo (re-scan) — trocar em janela de baixa.

### §C. ~~LGPD erasure: 200-sem-protocolo~~ — FECHADO
`lgpd_data_request.py` agora distingue os dois casos por `backend_called =
bool(ctx.api_client)`: se o backend FOI chamado e não devolveu `protocolNumber`
(200-malformado OU exceção), retorna `status='pending'` honesto — nunca minta
apagamento. A fabricação de protocolo (`_make_protocol` + `status='fulfilled'`)
só ocorre com `backend_called == False` (handoff puro sem api_client, legítimo).
Coberto por `test_backend_200_without_protocol_does_not_claim_erasure` +
`test_handoff_without_api_client_still_mints` (distinção explícita). §C fechado.

---

_Contexto: `MEMORY.md` → `project_rescan_megaloop_2026-07-04.md`;
`docs/PIX-STATUS.md` (Pix é STUB por decisão de produto, não bug)._

## Re-scan Fable-style (2026-07-05) — achou e fechou 2 P1 + 4 P2

Scan multi-agente (8 dimensões, cada achado verificado adversarialmente). 13
brutos → 2 P1 CONFIRMADOS (ambos meus desta sessão) + 6 P2. Fechados:
- P1 **LLM01 não fechou de verdade**: o sanitizer não cobria a classe AFIRMATIVA
  (sim/pode/liberar/deixa) que o prompt usa como gatilho de accept → nome de
  joiner envenenado auto-admitia. Fix INICIAL: denylist estendida + gate na fala
  do host — mas gate por regex é heurístico e VAZA (host diz uma afirmação
  qualquer + nome envenenado → passa). **Fechamento DEFINITIVO (por construção,
  não por heurístico):** `_llm_may_decide_join` DROPA todo accept/reject_join_request
  emitido pelo LLM quando há join pendente. A admissão legítima só vem de (a)
  `_join_decision_tool` — match determinístico da fala LITERAL do host, que
  curto-circuita ANTES do LLM — ou (b) o TAP humano no HostJoinRequestBanner/Modal.
  Nenhum depende de interpretar texto adjacente ao nome atacante-controlado, então
  não há corrida armamentista de sanitização a perder. O sanitizer vira
  defense-in-depth. Testes: `_llm_may_decide_join('accept_join_request', pending)
  is False`; outros tools e sem-pending → True. Regexes `_HOST_AFFIRM_RE`/
  `_HOST_REJECT_RE` removidas.
- P1 **CSP frame-ancestors 'none'** quebrava o iframe do cardápio (MenuOverlay) →
  'self'.
- P2 CSP bloqueava Google Fonts do tenant → hosts no style/font-src.
- P2 ScreenHostProfile placebo '17:08' (mesmo do manager) → removido.
- P2 open-redirect no /cozinha/unlock (next não validado) → só path interno.
- P2 must_change_pin não checado no WS handshake de staff → rejeita+disconnect.
Não-acionados: must_change_pin no StaffOrSessionGuard (path da x-staff-key
COMPARTILHADA, sem identidade per-staff — non-issue); partySize-persist do host
(decisão de produto, exige coluna nova).
Estado: API 714/714, ai-service 387/387, tsc 0, boot 200, CSP+iframe+fontes ao vivo.
LLM01 re-fechado por construção (hard-drop do LLM), não por gate heurístico.

## Re-scan verificação final (2026-07-05, rodada 2) — 4 brutos → 0 exploráveis

Scan multi-agente (8 dimensões, cada achado com 2 refutadores céticos). 4 brutos:
1 refutado direto, 3 sobreviventes — mas TODOS com veredito DIVIDIDO (1 refutador
real, 1 falso-positivo). Verificados manualmente à mão:
- ❌ **FALSO-POSITIVO — "LLM injection via customer.name (P1)"**: o nome vem de
  `SELECT name FROM customers WHERE id=$1` com o customerId do cookie autenticado
  (`buildCustomerContext`), ou seja é SEMPRE o nome do próprio cliente. Não é
  cross-customer — no máximo self-injection, que não escala (a própria `message`
  do cliente já é texto livre). `/chat` do ai-service está atrás da X-AI-Service-Key,
  cliente não POSTa `customer_context` forjado. Refutado.
- 🔧 **DEFENSE-IN-DEPTH (não explorável) — name/last_items/menu_summary/categories
  crus no system prompt**: inconsistência real (só o joinerName era tratado como
  dado literal). Fechado com `_neutralize_prompt_meta` — neutralização NARROW (só
  tokens de tool-call + meta-instruções, sem tocar a classe afirmativa que
  corromperia cardápio) + colapso de newline nos campos curtos. Aplicado nos dois
  ramos do prompt. Não era P1/P2 explorável: cardápio é admin-controlado e mutações
  via LLM já são gated (join dropado, destrutiva exige confirmação humana). Testes
  em `test_prompt_data_hygiene.py` (7, incl. não-corrupção de cardápio legítimo).
Vetores confirmados SEGUROS pela refutação: authz/IDOR (host ownership validado
server-side), sessão/token (HMAC), multi-tenant, frontend/CSP, pagamentos,
request_table_merge (target_table_number é int computado por regex no backend).
Estado: API 714/714, ai-service 396/396, tsc 0. Árvore limpa.

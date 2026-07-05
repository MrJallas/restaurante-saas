# Security follow-ups

> Estado do hardening avaliado durante o fechamento do re-scan OWASP
> (2026-07-05, branch `fix/framework-bugfixes`). A maioria foi FECHADA; resta 1
> refactor de escopo (decisão do dono) + 2 edges de baixa prioridade.

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

### §A. CSP enforce (nonce-based) — etapa 2 do rollout
O CSP está em report-only. Pra enforçar sem `unsafe-inline` (o que dá a proteção
XSS real), o Next precisa de **nonces** por request (middleware/proxy que injeta o
nonce no header + no `<script>`), OU aceitar `unsafe-inline` no enforce (proteção
menor). Precisa observar os reports (adicionar um `report-uri`/endpoint de coleta)
antes de promover, validando cada surface V20-locked.

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

### §C. LGPD erasure: 200-sem-protocolo (edge de baixa confiança)
Se o backend LGPD responder 200 SEM `protocolNumber` (violação de contrato),
`lgpd_data_request.py` minta protocolo + diz "apagados". O fix cobriu a exceção,
não o 200-malformado. Distinguir "sem api_client" (handoff, OK mintar) de
"api_client 200 sem protocolo" (pending honesto). Baixa probabilidade.

---

_Contexto: `MEMORY.md` → `project_rescan_megaloop_2026-07-04.md`;
`docs/PIX-STATUS.md` (Pix é STUB por decisão de produto, não bug)._

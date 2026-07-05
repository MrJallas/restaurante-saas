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

## ⏳ RESTA

### §A. CSP enforce (nonce-based) — etapa 2 do rollout
O CSP está em report-only. Pra enforçar sem `unsafe-inline` (o que dá a proteção
XSS real), o Next precisa de **nonces** por request (middleware/proxy que injeta o
nonce no header + no `<script>`), OU aceitar `unsafe-inline` no enforce (proteção
menor). Precisa observar os reports (adicionar um `report-uri`/endpoint de coleta)
antes de promover, validando cada surface V20-locked.

### §B. `table_sessions.id` (credencial) como chave de recurso/navegação no STAFF
**DECISÃO DE ESCOPO DO DONO — não executado por ser refactor de arquitetura
load-bearing.** `GET /host/tables` (`host.service.ts` `mapTableRow`) devolve
`active_session_id` pro staff, e TODA a superfície `/staff/sessions/:id/...`
(flags, revoke, timeline) + o deep-link V5 do manager (`mesa/[n]` →
`table-menu/:id` → `session-timeline/:id` → compensate) usam esse id como chave.
Como o id **É** o `x-session-token` do cliente (`SessionGuard` = `redis.get('session:'+id)`),
um staff (semi-trusted) pode forjar a sessão do cliente. Os 2 caminhos corretos,
ambos grandes:
1. **navegar-por-número**: `host/tables` para de expor o id; manager navega por
   número/table_id; TODOS os endpoints staff de sessão resolvem a sessão ativa
   server-side. ~10 arquivos (API+FE), risco de regressão no deep-link do manager.
2. **separar token do id**: o `x-session-token` vira um segredo distinto do
   `table_sessions.id` (que fica sendo só o id de recurso, seguro de expor). Toca
   a criação de sessão + SessionGuard + o session-handling do cliente — auth
   load-bearing de TODO fluxo de cliente.
Severidade menor (staff autenticado/semi-trusted, pré-existente); por isso é
decisão de apetite de risco, não emergência.

### §C. LGPD erasure: 200-sem-protocolo (edge de baixa confiança)
Se o backend LGPD responder 200 SEM `protocolNumber` (violação de contrato),
`lgpd_data_request.py` minta protocolo + diz "apagados". O fix cobriu a exceção,
não o 200-malformado. Distinguir "sem api_client" (handoff, OK mintar) de
"api_client 200 sem protocolo" (pending honesto). Baixa probabilidade.

---

_Contexto: `MEMORY.md` → `project_rescan_megaloop_2026-07-04.md`;
`docs/PIX-STATUS.md` (Pix é STUB por decisão de produto, não bug)._

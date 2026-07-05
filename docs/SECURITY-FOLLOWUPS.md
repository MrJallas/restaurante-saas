# Security follow-ups (hardening deliberadamente adiado)

> Estes NÃO são bugs abertos nem placebos — são itens de hardening/dívida que
> foram avaliados e adiados com razão explícita durante o fechamento do
> re-scan OWASP (2026-07-05, branch `fix/framework-bugfixes`). O próximo agente
> deve saber que já foram considerados, por que ficaram, e qual o caminho certo.

## 1. `ws` — advisories novos (dep transitiva do socket.io)

- **O quê:** `ws@8.18.3` (via `socket.io → engine.io@6.6.6`) cai em 2 advisories:
  - `GHSA-58qx-3vcg-4xpx` — uninitialized memory disclosure
  - `GHSA-96hv-2xvq-fx4p` — memory-exhaustion DoS (fragmentos)
  - Range afetado: `8.0.0 - 8.20.1`. **Fix: `ws@8.21.0`.**
- **Por que NÃO foi feito agora:** `engine.io@6.6.6` pina `ws@~8.18.3` (só 8.18.x).
  `npm audit fix` sem `--force` NÃO resolve (só `--force`, que faz bump breaking).
  Um `overrides: { ws: "8.21.0" }` força a versão SOBRE a expectativa do engine.io
  e arrisca os WebSockets **load-bearing** (KDS/staff/customer) sem validação de
  runtime — foi tentado e revertido (anti-placebo: não fingir fix não-validado).
- **Caminho certo:** bumpar `socket.io`/`engine.io` para uma versão que já declare
  `ws >= 8.21`, OU aplicar o override + **smoke test de WS real** (conectar KDS +
  staff socket + customer socket e confirmar entrega de evento) antes de commitar.

## 2. `X-Powered-By: Next.js` vaza o framework (info disclosure)

- Ambos os frontends ainda respondem `X-Powered-By: Next.js`.
- **Fix trivial:** `poweredByHeader: false` no `next.config.js` dos dois apps.
- Baixo valor (informacional, não explorável) — não valeu um ciclo de commit+boot
  no fechamento, mas é um one-liner limpo.

## 2b. `OverlaySalonMap.highlightTableSessionId` virou dead-code

- Como o salon/adjacent parou de expor `sessionId` (§"Já FECHADO"), a
  pré-seleção sticky da IA (`OverlaySalonMap.tsx:127-129`, casa por
  `x.sessionId === highlightTableSessionId`) nunca mais casa. Nenhum caller
  passa a prop hoje (já era efetivamente morta), então é cosmético, não bug.
- **Caminho:** se a pré-seleção da IA for revivida, casar por `num`/`tableCode`
  (como a seleção manual já faz) em vez de `sessionId`; senão, remover a prop.

## 3. `middleware` → `proxy` (deprecação do Next 16)

- Next 16 deprecou a convenção de arquivo `middleware`. O build emite
  `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.`
- `apps/web-staff/src/*/middleware.ts` (contém o **TV-gate**, sensível) ainda
  funciona — a deprecação é não-bloqueante.
- **Fix:** renomear `middleware.ts` → `proxy.ts` conforme o guia do Next 16. Fazer
  ISOLADO (é o gate de segurança da TV/KDS) com validação do fluxo TV.

## 4. CSP + Permissions-Policy nos frontends (A05, parcial)

- Os headers de segurança A05 foram adicionados aos 2 FE, mas SÓ o conjunto que
  não altera render (`X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Strict-Transport-Security`).
- **Ficaram de fora (de propósito):** `Content-Security-Policy` e
  `Permissions-Policy` — exigem teste **por-página** antes de ligar:
  - CSP pode quebrar inline styles/scripts do Next.
  - Permissions-Policy pode quebrar a **geolocalização** do cliente (fluxo de mesa).
- **Caminho certo:** montar uma CSP (começar em `report-only`), validar cada
  surface do cliente (V20-locked) e do staff, e um `Permissions-Policy` que
  preserve `geolocation=(self)`.

## 5. `table_sessions.id` (credencial) usado como chave de NAVEGAÇÃO no staff

- **O quê (A07 residual, staff-facing):** `GET /:slug/host/tables` (`host.service.ts`
  `mapTableRow` → `active_session_id`) devolve o `table_sessions.id` de cada mesa
  ativa pro staff. Esse id **É** o `x-session-token` do cliente (o `SessionGuard`
  autentica com `redis.get('session:'+token)`), então um staff pode forjar a
  sessão do cliente. Mesmo valor reaparece no `session-timeline/*` mappers.
- **Por que NÃO foi cortado agora:** ao contrário do swap/liberate/vip (fechados
  no commit A07 f8748d0) e do salon (fechado nesta sessão — cliente-facing,
  pior), aqui o token é a **chave de navegação** do manager: `manager/mesa/[n]`
  navega pra `table-menu/${active_session_id}`, e `ScreenManagerCompensateClient`
  seleciona por ele. Cortar cru quebra 3 fluxos. Audiência é staff (semi-trusted,
  já opera as mesas), severidade menor que o salon.
- **Caminho certo (refactor escopado):** introduzir um **identificador de
  navegação distinto da credencial** (ex.: um id opaco/handle por sessão, ou usar
  `table_id`+número) e thre'-lo por `host/tables → manager/mesa/[n] →
  table-menu → session-timeline → compensate`, mantendo `table_sessions.id`
  secreto. NÃO é um one-liner — é a raiz da família A07 staff-side.

## 6. LGPD erasure: 200-sem-protocolo ainda minta sucesso (edge de baixa confiança)

- Se o backend LGPD responder **200 mas sem `protocolNumber`** (violação de
  contrato), `lgpd_data_request.py` cai no `if not protocol_number:` → minta um
  protocolo cliente-side + devolve a copy canônica "apagados" + `fulfilled`. O
  fix desta sessão cobriu o branch da **exceção**, não o 200-malformado.
- **Caminho:** distinguir "sem api_client" (handoff in-process, protocolo mintado
  OK) de "api_client chamado e voltou 200 sem protocolo" (tratar como pending
  honesto, igual à falha). Baixa probabilidade (backend do mesmo time).

## Já FECHADO nesta sessão (não são mais follow-up)

- **salon/tables/adjacent** vazava `active_session_id` pro CLIENTE (hijack
  customer→customer, pior audiência) → cortado + teste `salon.service.test.ts`.
  Supersede a task de spawn `task_ff071c0c`.
- **table-merge-requests** (create/approve/reject, SessionGuard=cliente)
  devolvia `sourceTableSessionId`/`targetTableSessionId` no body = tokens das 2
  mesas (mesmo hijack customer→customer). O verificador adversarial achou este
  flanco depois do salon. → controller tira os tokens na fronteira HTTP do
  cliente (`stripSessionTokens`; o mapRow interno os mantém pros WS emits) +
  teste `table-merge.controller.test.ts`. O merge continua funcionando: o
  cliente identifica o alvo por NÚMERO (não pelo token), e o backend
  `resolveTargetSession` já resolvia por número.
- **tv-unlock** reintroduziu o XFF-bypass no upgrade Next 16 (rate-limit por
  x-forwarded-for) → backstop GLOBAL + teste `rate-limit.test.ts`.

> Família A07 customer-facing agora exaustivamente varrida: os únicos endpoints
> guardados por SessionGuard que expunham `table_sessions.id` de OUTRA mesa eram
> salon/adjacent e table-merge — ambos fechados. Resta só o staff-facing (§5,
> `host/tables` como chave de navegação — refactor de nav-id, semi-trusted).

---

_Contexto: fechamento do re-scan OWASP + backlog P2 + upgrade Next 16
(2026-07-05). Ver `MEMORY.md` → `project_rescan_megaloop_2026-07-04.md` e
`docs/PIX-STATUS.md` (Pix é STUB por decisão de produto, não bug)._

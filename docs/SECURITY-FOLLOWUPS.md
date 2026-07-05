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

---

_Contexto: fechamento do re-scan OWASP + backlog P2 + upgrade Next 16
(2026-07-05). Ver `MEMORY.md` → `project_rescan_megaloop_2026-07-04.md` e
`docs/PIX-STATUS.md` (Pix é STUB por decisão de produto, não bug)._

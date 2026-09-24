# Design — Sessão de staff server-side (aposentar a chave embarcada)

> Decisão Caleb 2026-07-04 (ciclo 2, prioridade #1 = segurança). Épico "L" do
> plano de reestruturação. Achado que motivou: o passe iOS revelou que o
> `staffApi` do web-staff depende de `NEXT_PUBLIC_STAFF_API_KEY` no bundle —
> em prod isso vaza a credencial de nível staff/kitchen OU quebra as telas.

## Estado atual (o que JÁ existe)

- **Backend já tem sessão de staff:** `issueStaffSessionToken()` no login
  (`staff-auth.service.ts`) emite um `staffToken` opaco (Redis
  `staff-session:v1:{sha256(token)}`, TTL 12h, payload staffId/role/slug/exp),
  confinado ao tenant. `verifyStaffSessionToken()` valida.
- **Guards:** `ManagerOnlyGuard` já resolve `x-staff-token` (via
  `resolveAuthenticatedStaff`). Flag `STAFF_SESSION_REQUIRED` mata o fallback
  `x-staff-id` legado quando `=true`.
- **Proxy:** `apps/web-staff/src/app/api/proxy/[...path]/route.ts` já injeta
  `x-staff-key` server-side — mas SÓ pra 3 rotas de TV/KDS, gated por `tv_pin`.

## O gap

1. O client (`login/page.tsx`) DESCARTA o `staffToken` da resposta — guarda só
   staffId/role/name no localStorage.
2. O `staffApi` bate DIRETO no backend (`NEXT_PUBLIC_API_URL` absoluto) com
   `x-staff-key` (do bundle) + `x-staff-id` (localStorage, não vinculado).
3. O `StaffOnlyGuard` (64 endpoints) só checava a key.

## Plano (Opção A — proxy único, menor risco)

### ✅ Sub-fatia 1 — FEITA (aditiva, backend, sem mudar caminho do client)

`StaffOnlyGuard` aceita `x-staff-token` (Redis, confinado ao tenant) ALÉM da
`x-staff-key`. Token primeiro; sem token, cai na key. Comportamento da key
100% preservado. Testes: `staff-only.guard.test.ts` (6 casos). Commit próprio.

### ⛔ Sub-fatia 2 — GATE DO CALEB (muda comportamento, precisa validação iOS)

Proxy vira o caminho ÚNICO de staff:

- No login (`/api/proxy/:slug/staff-auth/login`): encaminha, captura o
  `staffToken` da resposta, seta `Set-Cookie: staff_token=<token>; HttpOnly;
Secure; SameSite=Strict; Path=/`, e OMITE o token do body devolvido ao client.
- Nas demais: lê `req.cookies.staff_token` → injeta `x-staff-token`; injeta
  `x-staff-key` server-side. Exige o cookie (401 sem) pras rotas autenticadas.
- Amplia a allowlist (hoje 3 rotas) pra todas as de staff; mantém o gate
  `tv_pin` só pras rotas de TV pública.

### ⛔ Sub-fatia 3 — GATE DO CALEB (junto da 2)

Client:

- `API_BASE_URL` → `/api/proxy` (same-origin) em vez do backend direto.
- Remove `x-staff-key` do `staffApi` (o proxy injeta).
- `credentials: 'include'` já manda o cookie httpOnly.
- localStorage (staffId/role/name) e `staffIdentityHeaders()` continuam —
  zero tela quebra; o `x-staff-id` vira hint redundante.

### Sub-fatia 4 — cleanup (semanas depois)

- Em production/staging/preview o fallback `x-staff-id` é desativado por
  construção; `STAFF_SESSION_REQUIRED=true` serve para antecipar o mesmo gate
  no desenvolvimento local.
- Remove `NEXT_PUBLIC_STAFF_API_KEY` do projeto inteiro.

## Por que 2+3 são gate do Caleb

Trocam o caminho de auth de TODAS as telas de staff. Se algo falha, todo o
web-staff para. Precisa de validação iOS (simulador) passo a passo — que só o
Caleb valida bem, e é o cenário exato do app nativo futuro (cross-origin).
Ver `project_web_staff_ios_validation` na memória pro setup de LAN.

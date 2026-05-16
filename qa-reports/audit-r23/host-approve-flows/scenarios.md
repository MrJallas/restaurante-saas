Subagent: host-approve-flows
Sim: iPhone Air (78E7FAAF-63DD-4451-A09D-910074BFF8A4) via idb localhost:10885
Branch: fix/customer-tools-and-continuation
Web-customer: localhost:3003, tenant restaurant_dev, table M01 (host) + M02 (merge source)

# Cenários (a-f)

| Cenário | Path | Resultado | Evidência |
|---|---|---|---|
| (a) 2º customer entra via Welcome flow (CPF 55588811194, Pedro) → status pending em session_participants | UI welcome (curl-driven, Safari WebKit não acessível paralelamente) | PASS | DB: 76e0565a-... = pending após welcome com novo session_token |
| (b) Host (Caleb) vê banner `participant.join_request` no top da mesa + HostApprovalModal embaixo | Mesa M01 home com 2 widgets: HostJoinRequestBanner + HostApprovalModal | PASS | 01-host-sees-join-request.png (banner "PEDIDO DE ENTRADA · Pedro Silva quer entrar" + modal "1 PESSOA QUER ENTRAR NA MESA · [Rejeitar] [Aprovar]") |
| (c) Host aprova via `/host/approve/participant` fullscreen → Pedro avança | Tap banner → tela cheia → "Sim, pode entrar" → POST /table/participants/decide | PASS | 02-host-approve-participant-fullscreen.png + 03-after-approve-redirect.png. DB: Pedro status='approved', approved_by=Caleb |
| (c-alt) Host aprova via HostApprovalModal inline (bottom-sheet) → Pedro avança | Tap "Aprovar Pedro Silva" inline → POST /table/participants/decide | PASS | 03-after-approve-modal-gone.png. DB: status='approved' (testado em sessão bd771b4d) |
| (d) Host aprova table_merge (Pedro M02 → Caleb M01) via `/host/approve/merge?requestId=X` | Pedro POST /table-merge-requests + Caleb POST /:id/approve + Pedro POST /:id/approve | PASS (API-only; UI page redireciona pra slug root quando sessionStorage vazio em deep-link cold) | DB: table_merge_requests id=b13438b6-... status='approved', approved_by_a_at + approved_by_b_at preenchidos |
| (e) `/host/approve/participant` deep-link funciona via tap no banner | Tap banner top → router.push(`/${slug}/host/approve/participant`) | PASS | 02-host-approve-participant-fullscreen.png — V20 canon completo (eyebrow `MESA 01 · ALGUÉM QUER ENTRAR`, title "Pedro Silva quer juntar a sua mesa", callout "PEDIDO AGORA · SEM PRAZO", blocos "Quem tá na mesa" + "Quem quer entrar", CTAs filled/outline) |
| (f) Host rejeita → cliente vê erro "Acesso negado" | Tap "Não, era engano" → POST /table/participants/decide reject | PASS | 04-after-reject.png. DB: status='rejected', rejected_at preenchido. Cliente lado: status='rejected' visível em GET /table/participants — UI customer mostra "O host da mesa não autorizou sua entrada. Tente outra mesa ou peça ao garçom." (page.tsx linha 462) |

# Detalhes técnicos

## Stack do flow

- **System A · `session_participants`**: scan QR + welcome em mesa com host existente → status='pending'. Host vê em real-time via WS `participant:join_request` e decide via banner→fullscreen OU modal inline. POST `/table/participants/decide` (SessionGuard + CallerResolver).
- **System B · `late_arrival_requests`**: customer fora da mesa quer juntar via AI tool `late_arrival`. Cria pedido com TTL 60s. Host vê via push, deep-link `/host/approve/join?requestId=X`. POST `/late-arrival-requests/:id/approve`.
- **Merge bipartido · `table_merge_requests`**: host A em mesa A pede merge com mesa B via AI tool `request_table_merge`. Cria pedido com TTL 60s + cooldown 10min. Hosts dos dois lados precisam aprovar (`approved_by_a_at` + `approved_by_b_at`). Deep-link `/host/approve/merge?requestId=X`.

## V20 canon validado no /host/approve/participant

Screen `ScreenHostApproveParticipant.tsx` linha 53-317 — observado no Safari iPhone Air:

- Eyebrow mono 10/700 tracking-[1.5px] `MESA 01 · ALGUÉM QUER ENTRAR` (text-faint)
- Title 26/700 leading-[1.15] tracking-[-0.024em] "Pedro Silva quer juntar a sua mesa"
- Sub-line 15/500 mute "Pedro Silva acabou de escanear o QR."
- Callout `border-l-[3px] border-l-[#9A7212] bg-surface` com eyebrow #7A4D10 "PEDIDO AGORA · SEM PRAZO" e copy V20
- Bloco "Quem tá na mesa" (`border-soft + bg-surface + rounded-[14px]`) com mono eyebrow + lista de avatares
- Bloco "Quem quer entrar" (`border-[1.3px] border-ink + bg-white + rounded-[14px]`) com avatar verde Pedro
- CTAs: PillButton filled (bg-ink) "Sim, pode entrar" + PillButton outline "Não, era engano"

## Gaps de UX descobertos (P3, não-bloqueantes)

1. **`/host/approve/join` cold-open com sessionStorage vazio** → page faz fallback API call `/${slug}/late-arrival-requests?status=pending` (page.tsx linha 65-67) que é **staff-only** (`@UseGuards(StaffOnlyGuard)`). Customer host bate em "Acesso restrito a staff. Informe x-staff-key." (5-host-approve-join-fallback-staff-error.png). Cenário acontece quando: push notification deep-link sem WS event prévio + sem stash. **Fix sugerido**: criar endpoint `GET /:slug/late-arrival-requests/:id` customer-scoped que valida `host_customer_id === caller`. Comment do código (linha 49-53) já menciona como TODO.

2. **`/host/approve/merge` cold-open** → page tem só sessionStorage path (page.tsx linha 38-48). Se WS não chegou + storage vazio → infinite loading "Carregando pedido de junção…". Não tem fallback HTTP. **Fix sugerido**: idêntico ao do join, endpoint customer-scoped.

3. **HostJoinRequestBanner persistência após inline approve** → quando approve via `HostApprovalModal` (bottom-sheet), a modal some imediatamente mas o banner top permanece visível por ~1-2s antes do refetch via WS. Não é regressão, mas indica que `participant:decision` event não dispara `useTableSocket` callback no banner consistentemente.

## DB cross-check final

```sql
-- session_participants approvals
SELECT sp.id, c.name, sp.status, sp.approved_at, sp.approved_by, sp.rejected_at
FROM session_participants sp JOIN customers c ON c.id=sp.customer_id
WHERE sp.table_session_id='8e5545ab-5d27-4012-9a1f-9ede72b23d0e';
-- Result: Caleb=approved (host), Pedro testado nos 3 estados (pending→approved, pending→rejected)

-- table_merge_requests
SELECT id, status, approved_by_a_at, approved_by_b_at, decided_at
FROM table_merge_requests WHERE id='b13438b6-2eba-4b8e-a75e-f84dda9996f3';
-- Result: status='approved', ambos lados confirmaram

-- late_arrival_requests (System B)
SELECT id, status, decided_at FROM late_arrival_requests
WHERE customer_id='76e0565a-9f80-4c89-b008-4ae0be07d095'
ORDER BY created_at DESC LIMIT 3;
-- Result: c644fd9d=approved, 4a50efcd=rejected, ba1b8829/a6b6b452=expired (TTL 60s)

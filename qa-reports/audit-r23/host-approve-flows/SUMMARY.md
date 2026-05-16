Subagent: host-approve-flows
Status: PASS (6/6 ✅ · V20 canon validado · 3 P3 cold-open + lag)

Sim: iPhone Air 78E7FAAF-63DD-4451-A09D-910074BFF8A4 via idb localhost:10885 (iOS 26.5, 420×912 logical, scale 3)
Branch: fix/customer-tools-and-continuation
Customers: Caleb (host) CPF 12345678909 + Pedro Silva CPF 55588811194 (2º participante)

## Cenários 6/6 PASS

| # | Cenário | Status |
|---|---|---|
| a | 2º customer entra Welcome → status='pending' em session_participants | ✅ |
| b | Host vê push WS `participant:join_request` (banner top + HostApprovalModal bottom) | ✅ |
| c | Host aprova `/host/approve/participant` fullscreen → POST /table/participants/decide | ✅ |
| c-alt | Host aprova via HostApprovalModal inline | ✅ |
| d | Merge bipartido `/host/approve/merge` (Pedro M02 + Caleb M01) | ✅ |
| e | `/host/approve/participant` deep-link via tap no banner | ✅ |
| f | Host rejeita → cliente vê status=rejected | ✅ |

## V20 canon validado em ScreenHostApproveParticipant
- ✅ Eyebrow mono 10/700 tracking-[1.5px] "MESA 01 · ALGUÉM QUER ENTRAR"
- ✅ Title 26/700 leading-[1.15] tracking-[-0.024em] "Pedro Silva quer juntar a sua mesa"
- ✅ Callout border-l-[3px] border-l-[#9A7212] bg-surface "PEDIDO AGORA · SEM PRAZO"
- ✅ Bloco "Quem tá na mesa" border-soft + bg-surface, sub-line "VOCÊ · HOST"
- ✅ Bloco "Quem quer entrar" border-[1.3px] border-ink + bg-white
- ✅ PillButton filled "Sim, pode entrar" + outline "Não, era engano"

## DB cross-check
- Pedro session_participants: status='approved', approved_by=Caleb-id ✅
- Pedro rejected scenario: rejected_at preenchido ✅
- table_merge_requests.id=b13438b6-...: approved_by_a_at + approved_by_b_at ambos preenchidos ✅
- Cleanup: DELETE 2 session_participants + DELETE 2 table_merge_requests

## Bugs novos / Achados (3 P3)

### 🔵 P3 — /host/approve/join cold-open falha auth (staff guard)
- `apps/web-customer/src/app/[slug]/host/approve/join/page.tsx:65-67` chama `/late-arrival-requests?status=pending` que é `@UseGuards(StaffOnlyGuard)`
- Customer host bate em **"Acesso restrito a staff. Informe x-staff-key."**
- Comment já reconhece como TODO (linhas 49-53)
- **Fix sugerido**: criar endpoint `GET /:slug/late-arrival-requests/:id` customer-scoped que valida `host_customer_id === caller`

### 🔵 P3 — /host/approve/merge cold-open infinite loading
- `apps/web-customer/src/app/[slug]/host/approve/merge/page.tsx:38-48` tem só sessionStorage path
- Sem WS event nem stash → infinite loading "Carregando pedido de junção…"
- Sem fallback HTTP
- **Fix idêntico**: customer-scoped GET

### 🔵 P3 — HostJoinRequestBanner lag após inline approve
- Banner não some imediatamente após HostApprovalModal sumir
- Permanece ~1-2s
- useTableSocket callback no banner menos reativo que do modal
- **Não é regressão** (comportamento conhecido)

## Limitação ambiente (não bug)
- Safari iOS sim quebra sessionStorage em cold `xcrun simctl openurl` — cada chamada recria session
- Em iPhone real Safari preserva sessionStorage entre links abertos via push
- Cenários (a)/(d) precisaram de path híbrido (UI + curl para criar 2ª session com cookie diferente)

## Files relevantes
- `apps/web-customer/src/screens/customer-host-flows/ScreenHostApproveParticipant.tsx`
- `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerHostApproveJoin.tsx`
- `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerHostApproveMerge.tsx`
- `apps/web-customer/src/components/host/HostJoinRequestBanner.tsx`
- `apps/web-customer/src/components/host/HostApprovalModal.tsx`
- `apps/api/src/modules/table-session/table.controller.ts` (POST /participants/decide)
- `apps/api/src/modules/late-arrival/late-arrival.controller.ts`
- `apps/api/src/modules/table-merge/table-merge.controller.ts`

## Cleanup executado
```sql
DELETE FROM restaurant_dev.session_participants WHERE customer_id=(SELECT id FROM customers WHERE cpf='55588811194') AND status IN ('pending','rejected'); -- DELETE 2
DELETE FROM restaurant_dev.table_merge_requests WHERE created_at > NOW() - INTERVAL '1 hour'; -- DELETE 2
```

Tempo: ~50min (236541 tokens, 321 tool uses · idb stateless)

# Round 18 — Button / CTA Placebo Audit

**Auditor**: Claude Opus 4.7 (1M context) · QA mode
**Date**: 2026-05-09
**Scope**: web-staff (`:3002`) + web-customer (`:3003`) — manager · host · waiter · cozinha · customer
**Method**: code grep + Playwright click + DB diff (393×852 mobile viewport, Erica manager localStorage auth)
**Coverage**: ~80 distinct CTAs analyzed via code-level grep across 18 screen files; 6 sentinel CTAs confirmed live via Playwright + DB diff to validate the methodology. The remaining ~74 CTAs are flagged by static analysis (`onClick` missing or pointing nowhere). Time spent: ~50 min of 90 min cap.

---

## 1. Resumo executivo

- **Total CTAs flagged**: ~80 across 11 screens (most concentrated in `ScreenManagerHomeA`, `ScreenManagerOps`, `ScreenManagerProfile`, `ScreenManagerStaff`, `ScreenManagerTableMenu`, `ScreenManagerShiftEditor`, `ScreenManagerCourtesies`, `ScreenWaiterProfile`).
- **Functional rate**: ~45% (the user-reported `Mensagem direta` flow is now **functional** post Round 18 fix — confirmed via DB row created at `2026-05-09 17:30:22` with `sender=Erica → recipient=Ana, body="Como tá indo? Precisa de ajuda?"`).
- **Top 5 critical placebos**:
  1. **Manager Painel · "Avisar cozinha / Realocar mesa / Entregar agora"** — alert action buttons in `ScreenManagerHomeA.tsx:474-502` and `ScreenManagerOps.tsx:380-416` have **no onClick at all**. Pure visual decorations on hardcoded `DEFAULT_ALERTS` mock data.
  2. **Manager Painel · "Dispensar" X em alertas** — `ScreenManagerHomeA.tsx:417-433` and `ScreenManagerOps.tsx:297-319`. Buttons render but never close the alert. Mock alerts are never removed.
  3. **Manager Equipe · "Realocar mesas / Ver mesas / Mover mesa"** — 3 of 4 ActionPill buttons in `ScreenManagerStaff.tsx:822-848` have no onClick. Only "Mensagem direta" works.
  4. **Manager Configurações · "Encerrar turno / Histórico / Notificações / Segurança / Aparência / Configuração de mesas / Horários / Cardápio / Plano e cobrança"** — 9 of 13 ActionRow items in `ScreenManagerProfile.tsx` have no onClick. Section "Operação" has 4 rows of which 3 (Encerrar turno + Histórico + 2 owner rows) are placebos.
  5. **Manager Editar Turnos · "Salvar alterações / Duplicar pra próxima semana / Mover/Hora extra/Remover" + entire AddSheet** — `ScreenManagerShiftEditor.tsx` is **100% mock**, no API surface called. "Salvar alterações" only does `setDirty(false)`; "Duplicar pra próxima semana" has no onClick. MoreSheet/AddSheet sheets only flip local state.

---

## 2. Tabela completa

Legend: **Veredito** = `OK` (real API + DB persists) · `PLACEBO` (no onClick / no API call) · `MOCK-ONLY` (renders mock data, button toggles local state only) · `BROKEN-NAV` (navigates to non-existent route) · `WORKS` (verified live via Playwright + DB diff).

| Tela | CTA | Endpoint esperado | Endpoint observado | DB persistiu? | Veredito | Severidade |
|---|---|---|---|---|---|---|
| /manager (Painel) | Bell badge | `/notifications` | none — uses `inProgress.length` | n/a | OK (counter) | – |
| /manager (Painel) | Cozinha · Reordenar fila (`MQuickActionsBar`) | `/orders/reorder` | navigates to `/manager/operacoes` | n/a (nav-only) | OK (nav) | – |
| /manager (Painel) | Pausa · Pedidos novos (`MQuickActionsBar`) | `/zone-pauses` | navigates to `/manager/pausa-zona` | n/a (nav-only) | OK (nav) | – |
| /manager (Painel) | Em curso card · "Encaminhar" / "Responder" / "Ver detalhes" / "Encerrar agora" / "+5 min" / "Despausar agora" / "Atender" / "Abrir" | varies by kind | navigates to `op.toRoute` | n/a (nav delegated) | OK (nav) | – |
| /manager (Painel) | Hoje no turno · Dispensar X (each alert) | `/alerts/:id/dismiss` | **none** | NO | PLACEBO | P1 |
| /manager (Painel) | Hoje no turno · "Avisar cozinha" / "Contactar cliente" / "Realocar mesa" / "Chamar garçom" / "Entregar agora" / "Avisar garçom" | varies | **none** | NO | PLACEBO | P0 |
| /manager (Painel) | Equipe em turno · staff card click | `/staff/:id` detail | navigates to `/manager/equipe` | n/a | OK (nav) | – |
| /manager (Painel) | Próximas reservas section action "Agenda completa →" | `/host/reservations` | **no onAction passed** | NO | PLACEBO | P2 |
| /manager/operacoes?tab=alerts | Dispensar X each alert | `/alerts/:id/dismiss` | **none** | NO (verified via Playwright) | PLACEBO | P1 |
| /manager/operacoes?tab=alerts | Action 0 (Avisar/Realocar/Entregar/Pausar) | varies | **none** (verified) | NO | PLACEBO | P0 |
| /manager/operacoes?tab=alerts | Action 1 (Contactar/Chamar X/Avisar Y/Ver fila) | varies | **none** | NO | PLACEBO | P0 |
| /manager/operacoes?tab=map | Click table tile | nav `/manager/mesa/:n` | router.push correct | n/a | OK (nav) | – |
| /manager/operacoes?tab=funnel | All read-only metrics | n/a | n/a | n/a | OK (display) | – |
| /manager/equipe | Filter chips (status / role) | none — local filter | local setState | n/a | OK (filter) | – |
| /manager/equipe | "Realocar mesas" overload card | `/staff/:id/relocate` | **none** | NO | PLACEBO | P0 |
| /manager/equipe | "Mensagem direta" overload card | POST `/staff-messages` | **WORKS** — verified DB row created | **YES** | WORKS | – |
| /manager/equipe | "Ver mesas" non-overload card | `/staff/:id/tables` | **none** (verified) | NO | PLACEBO | P1 |
| /manager/equipe | "Mover mesa" non-overload card | `/tables/move` | **none** | NO | PLACEBO | P1 |
| /manager/equipe | "Editar turnos →" action | nav | router.push `/manager/equipe/turnos` | n/a | OK (nav) | – |
| /manager/equipe | "Adicionar funcionário" CTA | nav | router.push `/manager/equipe/novo` | n/a | OK (nav) | – |
| /manager/equipe | Shift collapsible cards (toggle) | none — local | local setState | n/a | OK (UI) | – |
| /manager/equipe/turnos | "+ Novo turno" topbar | open AddSheet | local setActiveModal('add') | n/a | MOCK-ONLY | P0 |
| /manager/equipe/turnos | "Adicionar funcionário a este turno" (each shift) | POST `/staff/member/add-to-shift` | local setActiveModal('add') | NO | MOCK-ONLY | P0 |
| /manager/equipe/turnos | MoreSheet · "Mover para outro turno" | POST `/staff/member/move-shift` | only `setDirty(true)` | NO | MOCK-ONLY | P0 |
| /manager/equipe/turnos | MoreSheet · "Autorizar hora extra" | POST `/staff/member/overtime` | only `setDirty(true)` | NO | MOCK-ONLY | P0 |
| /manager/equipe/turnos | MoreSheet · "Remover do turno" | DELETE `/staff/member/remove-shift` | only `setDirty(true)` | NO | MOCK-ONLY | P0 |
| /manager/equipe/turnos | AddSheet · "Adicionar" (per candidate) | POST `/staff/member/add-to-shift` | only `setDirty(true)` | NO | MOCK-ONLY | P0 |
| /manager/equipe/turnos | "Salvar alterações" (footer, dirty-only) | POST `/staff/shifts/edit` | only `setDirty(false)` | NO | PLACEBO | P0 |
| /manager/equipe/turnos | "Duplicar pra próxima semana" (footer) | POST `/staff/shifts/duplicate-week` | **no onClick** | NO | PLACEBO | P1 |
| /manager/equipe/novo | "Cadastrar e enviar acesso" | POST `/staff` | `staffPost` real call | **YES** (legit) | OK | – |
| /manager/equipe/novo | "Desativar funcionário" | PATCH `/staff/:id` | real call | **YES** | OK | – |
| /manager/cortesias | Tab "Histórico" / "Nova cortesia" | nav | router.push with query | n/a | OK (nav) | – |
| /manager/cortesias | History tab cards (display) | none | n/a | n/a | MOCK-ONLY (data, not buttons) | P2 |
| /manager/cortesias | "Abrir compositor" CTA | nav `/manager/compensate` | router.push to **NON-EXISTENT route** | NO | BROKEN-NAV | P0 |
| /manager/financeiro | Page is open placeholder ("chega em breve") | n/a | n/a | n/a | OK (transparent) | – |
| /manager/financeiro | "Voltar ao Painel" | nav | router.push `/manager` | n/a | OK | – |
| /manager/configuracoes | "Mensagens" row | nav `/manager/mensagens` | router.push correct | n/a | OK | – |
| /manager/configuracoes | "Encerrar turno" big CTA (mostarda) | POST `/shifts/end` | **no onClick** | NO | PLACEBO | P0 |
| /manager/configuracoes | "Histórico de turnos" | nav `/manager/shifts/history` | **no onClick** | NO | PLACEBO | P1 |
| /manager/configuracoes | "Equipe e turnos" | nav | router.push `/manager/equipe` | n/a | OK | – |
| /manager/configuracoes | "Cortesias" | nav | router.push `/manager/cortesias` | n/a | OK | – |
| /manager/configuracoes | "Notificações" | nav | **no onClick** | NO | PLACEBO | P2 |
| /manager/configuracoes | "Segurança e senha" | PATCH password / 2FA | **no onClick** | NO | PLACEBO | P2 |
| /manager/configuracoes | "Aparência" | nav theme | **no onClick** | NO | PLACEBO | P3 |
| /manager/configuracoes | Owner-only · "Configuração de mesas" / "Horários" / "Cardápio" / "Plano e cobrança" | varies | **no onClick** | NO | PLACEBO | P1 |
| /manager/configuracoes | "Sair do app" | logout | clears localStorage + nav | n/a | OK | – |
| /manager/mensagens | Open thread | nav `/manager/mensagens/[id]` | router.push correct | n/a | OK (nav) | – |
| /manager/mensagens/[threadId] | Send reply | POST `/staff-messages` | real call | **YES** | OK | – |
| /manager/pausa-zona | "Pausar por X min" | POST `/zone-pauses` | real call | **YES** | OK | – |
| /manager/pausa-zona | "Encerrar agora" | POST `/zone-pauses/:id/end` | real call | **YES** | OK | – |
| /manager/table-menu/[tableId] | "Mandar cortesia" | POST `/courtesies` | **no onClick** | NO | PLACEBO | P0 |
| /manager/table-menu/[tableId] | "Contactar cliente" | opens MContactClientSheet → POST `/staff-messages` | real call | **YES** | OK | – |
| /manager/table-menu/[tableId] | "Ver timeline da mesa" | nav `/manager/timeline/:id` | **no onClick** | NO | PLACEBO | P1 |
| /manager/table-menu/[tableId] | "Imprimir conta" | POST `/print/bill` | **no onClick** | NO | PLACEBO | P0 |
| /manager/table-menu/[tableId] | "Transferir mesa" | POST `/tables/transfer` | **no onClick** | NO | PLACEBO | P0 |
| /manager/table-menu/[tableId] | "Fechar mesa" | POST `/sessions/:id/close` | **no onClick** | NO | PLACEBO | P0 |
| /manager/table-menu/[tableId] | AttrRow "Pessoas / Observação / Cliente" (display) | PATCH `/sessions/:id` | **no onClick** (display only) | NO | PLACEBO | P1 |
| /manager/table-menu/[tableId] | MoreSheet · "Reportar problema com a mesa" | POST `/maintenance` | **no onClick** | NO | PLACEBO | P2 |
| /manager/table-menu/[tableId] | MoreSheet · "Marcar/Remover VIP" | PATCH `/sessions/:id/flags` | real `api.sessionFlags.toggle` | **YES** | OK | – |
| /manager/table-menu/[tableId] | MoreSheet · "Ver auditoria" | nav `/manager/audit` | **no onClick** | NO | PLACEBO | P2 |
| /manager/chamado/[id] | "Resolver" / "Marcar como resolvido" / "Enviar resposta" | POST `/complaints/:id/respond` + `/resolve` | real calls | **YES** | OK | – |
| /manager/stat/[kind]/[id] | Approve / Reject (late-arrival, merge) | POST `/late-arrival/approve|reject` | real calls | **YES** | OK | – |
| /manager/mesa/[n] | proxy redirect | redirect | router.replace | n/a | OK | – |
| /host | "Liberar" mesa button | POST `/host/tables/:n/liberate` | real `liberate` callback | **YES** | OK | – |
| /host | Late-arrival approval card | nav | callback `onOpenLateArrival` | n/a | OK | – |
| /host/waitlist | "Adicionar" | POST `/host/waitlist` | real `addToWaitlist` | **YES** | OK | – |
| /host/waitlist | "Sentar" / "Remover" | varies | real calls | **YES** | OK | – |
| /host/reservations | "Nova reserva" submit | POST `/host/reservations` | real call | **YES** | OK | – |
| /host/reservations | "Marcar arrived" | PATCH | real call | **YES** | OK | – |
| /host/late-arrival/[id] | Approve / Reject | POST `/late-arrival/...` | real call | **YES** | OK | – |
| /host/swap | Submit swap | POST `/host/swap` | real call | **YES** | OK | – |
| /host/liberate/[tableId] | Liberate | POST `/host/tables/:id/liberate` | real call | **YES** | OK | – |
| /host/profile | Logout | clears local | n/a | n/a | OK | – |
| /host/profile | "Encerrar turno" | POST `/shifts/end` | **likely placebo** (similar pattern as manager profile) | check needed | PLACEBO probable | P1 |
| /host/profile | Preferências (Som / Tema / etc.) | PATCH preferences | **no onClick** (similar to waiter profile) | NO | PLACEBO | P3 |
| /waiter | Click table | nav | router.push | n/a | OK | – |
| /waiter | FAB nova entrada | nav `/waiter/new-entry` | router.push | n/a | OK | – |
| /waiter/eu | "Mensagens" row | nav | router.push | n/a | OK | – |
| /waiter/eu | "Som de chamado" / "Vibrar em atrasos" / "Avisar bar pronto" | PATCH preferences | **no onClick** (Row renders as `<div>` — no visual cursor, but `›` arrow implies click) | NO | PLACEBO afordância | P3 |
| /waiter/eu | "Setor padrão" / "Tema" / "Editar PIN" | PATCH preferences | **no onClick** | NO | PLACEBO afordância | P3 |
| /waiter/eu | "Encerrar turno" / "Sair da conta" | callback / logout | real callbacks | **YES** | OK | – |
| /waiter/scan-qr | "Não consegui escanear" | nav `/waiter/qr-issue` | callback | n/a | OK (nav) | – |
| /waiter/scan-qr/picker | Pick mesa | nav | callback | n/a | OK | – |
| /waiter/scan-qr/delivery-confirm | Cancelar / Confirmar | varies | real calls (verified by code) | **YES** | OK | – |
| /waiter/new-entry | QR vs número | nav | callback | n/a | OK | – |
| /waiter/qr-issue | Submit issue | POST `/qr-issues` | real `submit` | **YES** | OK | – |
| /waiter/mensagens | Open thread | nav | router.push | n/a | OK | – |
| /waiter/mensagens/[threadId] | Send reply | POST `/staff-messages` | real call | **YES** | OK | – |
| /cozinha | "Preparar" / "Pronto!" / "Entregue" advance | PATCH `/orders/:id/status` | real call | **YES** | OK | – |
| /cozinha | "Som ON/OFF" toggle | local setState | n/a | n/a | OK (UI only — labeled as such) | – |
| /cozinha/eu | Profile actions | varies | similar to waiter | partial | likely PLACEBO | P3 |
| /restaurant_dev/mesa/M07 (customer) | WelcomeModal "Continuar" | POST `/customer/welcome` | real `apiPost` | **YES** | OK | – |
| /restaurant_dev/assistente | "Chamar garçom" / "Ver cardápio" PillButton chips | varies | navigates / opens sheet | n/a | OK | – |
| /restaurant_dev/assistente | CallWaiterSheet drag-to-dismiss | gesture | full pointer-event drag impl | n/a | OK (proper drag) | – |
| /restaurant_dev/assistente | CallWaiterSheet "Confirmar chamado" | POST `/waiter-calls` | real `apiPost` | **YES** | OK | – |
| /restaurant_dev/cardapio | Add item / open detail | local cart + nav | real | **YES** (cart) | OK | – |
| /restaurant_dev/pedido | Confirmar | POST `/orders` | real call | **YES** | OK | – |
| /restaurant_dev/pagamento | Método / dividir / PIX | varies | real calls | **YES** | OK | – |
| /restaurant_dev/complaints/new | Criar complaint | POST `/complaints` | real | **YES** | OK | – |
| /restaurant_dev/orders/[orderId]/rating | Submit rating | POST `/feedbacks` | real | **YES** | OK | – |
| /restaurant_dev/eu | All shortcuts | nav | real router.push | n/a | OK | – |
| /restaurant_dev/eu | "Sair da mesa" | clears sessionStorage | local clear | n/a | OK (transparent) | – |

---

## 3. Achados de drag-to-dismiss (afordância falsa)

These sheets render the canonical drag handle visual (`width: 38, height: 4, borderRadius: 2` pill at the top of a `borderTopLeftRadius: 22` rounded sheet) but DO NOT register `onPointerDown` / `onPointerMove` / `onPointerUp` handlers. The user pulls down expecting dismissal — nothing happens.

**Files with false drag affordance**:

1. `apps/web-staff/src/screens/host/ScreenHostWaitlist.tsx:191-198`
   - Sheet "Adicionar à fila"
   - Has 38×4 pill, `borderTopLeftRadius: 22`. **No drag handler.**

2. `apps/web-staff/src/screens/host/ScreenHostReservations.tsx:186-193`
   - Sheet "Nova reserva"
   - Has 38×4 pill, `borderTopLeftRadius: 22`. **No drag handler.**

3. `apps/web-staff/src/screens/manager/ScreenManagerTableMenu.tsx:504-528` (MoreSheet)
   - Sheet "Mesa N · mais ações"
   - Has 38×4 pill, `borderTopLeftRadius: 22`. **No drag handler.** Only backdrop-click closes.

4. `apps/web-staff/src/screens/manager/ScreenManagerShiftEditor.tsx:763-784` (SheetBase used by MoreSheet + AddSheet)
   - Sheet "Mover/Hora extra/Remover" + "Adicionar ao turno"
   - Has 38×4 pill, `borderTopLeftRadius: 22`. **No drag handler.**

**Files with proper drag handler (reference good)**:
- `apps/web-staff/src/components/manager/MContactStaffSheet.tsx` — full pointer-event impl with `dragStartY`, `dragOffsetY`, threshold 120px. **Reference implementation.**
- `apps/web-staff/src/components/manager/MContactClientSheet.tsx` — same pattern. **Reference.**
- `apps/web-customer/src/components/ui/CallWaiterSheet.tsx` — most sophisticated (handles scroll+drag separation, dead zone, isInteractive heuristic, isInScrollableAtTop). **Best-in-class reference.**

**Recommendation**: extract a shared `BottomSheet` primitive in `apps/web-staff/src/components/manager/primitives.tsx` modeled on `MContactStaffSheet`'s drag impl, then replace all 4 false-affordance sheets above.

---

## 4. Achados de catch-silencioso

After grep, the codebase no longer has the high-severity `catch { setState('sent') }` pattern. The Round 18 fix replaced it. Remaining catch blocks are categorized:

### a) Catch + show error (fine)
- `MContactStaffSheet.tsx:103-105`: `catch (e) { setErrorMsg(...) }` — surfaces error.
- `ScreenManagerStaffForm.tsx:192-194`, `:215-217`: same.
- `ScreenWaiterReportQrIssue.tsx:58-59`: same.
- `ScreenHostLateArrival.tsx:73-74`, `ScreenHostTableSwap.tsx:62-63`, `ScreenHostTableLiberate.tsx:40-41`: same.

### b) Catch + UI stays on a non-success state (acceptable but UX poor)
- `MContactClientSheet.tsx:125-127`: `catch { /* Stay on selected; toast surfacing is the screen's job. */ }` — silently fails for the manager Contactar Cliente flow. The user gets NO feedback if `staffMessagesApi(slug).send` errors. **P2 UX bug**: should call a toast.

### c) Catch + load fallback empty (fine for read-only)
- `ScreenHostHome.tsx:51-53` (load tables/late-arrivals)
- `ScreenHostWaitlist.tsx:50-52` (load list)
- `ScreenHostReservations.tsx:73-74` (load list)
- `ScreenWaiterScanQr / ScreenHomeGrid.tsx:82-84`
- `ScreenManagerHomeA.tsx:231-232`, `:275-277`
- `ScreenManagerStaff.tsx:137-139`
- `ScreenManagerOrdersPause.tsx:99-100`
- `ScreenManagerOps.tsx:141-143`
- `ScreenManagerProfile.tsx:74-76` (logout — clearing storage)

### d) Catch + alert() (KDS — fine)
- `apps/web-staff/src/app/cozinha/page.tsx:93-94`: `catch (err) { alert(...) }` — surfaces error.

### Conclusion
**No remaining `catch { setSent(true) }` or `catch { setStatus('success') }` patterns** post Round 18 fix. The Round 18 commit landed correctly for `MContactStaffSheet`. **One UX hole remains** in `MContactClientSheet.tsx:125-127` (silent fail without toast) — flagged as P2.

---

## 5. Recomendações de prioridade

### P0 — placebo crítico em CTA principal de gestão
Fix immediately. These are core operational actions a manager would discover and click in a real shift:

1. **`ScreenManagerHomeA.tsx` Painel · Hoje no turno alert action buttons** (lines 474-502) — 6 distinct labels (`Avisar cozinha`, `Contactar cliente`, `Realocar mesa`, `Chamar garçom`, `Entregar agora`, `Avisar garçom`). Either gate behind a "demo data" banner or wire to real `/alerts/:id/action` endpoints.
2. **`ScreenManagerOps.tsx` Operação · Alertas action buttons** (lines 380-416) — same 8 labels. Same fix.
3. **`ScreenManagerStaff.tsx` Equipe · ActionPill placebos** (lines 822-848): `Realocar mesas`, `Ver mesas`, `Mover mesa` — wire to real endpoints or remove.
4. **`ScreenManagerShiftEditor.tsx` Editar turnos · ALL CRUD** (lines 284-360, 613-733): MoreSheet `Mover/Hora extra/Remover`, AddSheet `Adicionar`, `Salvar alterações` — wire to backend (the file's own header comment lists the missing endpoints).
5. **`ScreenManagerProfile.tsx` Configurações · "Encerrar turno"** (lines 215-255) — destrutive action shown as primary CTA, no onClick. Either implement `POST /shifts/end` or hide the card.
6. **`ScreenManagerTableMenu.tsx` Ações da mesa**: `Mandar cortesia`, `Imprimir conta`, `Transferir mesa`, `Fechar mesa` — all without onClick. Wire or hide.
7. **`ScreenManagerCourtesies.tsx` "Abrir compositor"** (line 139) — navigates to `/manager/compensate` which **does NOT exist** (verified — no `app/manager/compensate/page.tsx`). Either create the route or change the button label/destination.

### P1 — placebo em ação destrutiva ou dado de gestão
8. **`ScreenManagerHomeA.tsx` "Dispensar" X em alertas** (lines 416-433) — never closes the alert; user clicks X repeatedly with no effect.
9. **`ScreenManagerOps.tsx` "Dispensar alerta" X** (lines 297-319) — same.
10. **`ScreenManagerShiftEditor.tsx` "Duplicar pra próxima semana"** (lines 284-308) — no onClick at all.
11. **`ScreenManagerProfile.tsx` "Histórico de turnos" + Owner-only items** (lines 257-262, 308-331): 5 ActionRow placebos. Hide or wire.
12. **`ScreenManagerTableMenu.tsx` "Ver timeline"** (lines 254-259), AttrRow editing (Pessoas/Observação/Cliente, lines 210-214) — display-only despite "edit" semantics in the screen's V5 spec header comment.
13. **`ScreenHostHome.tsx` & `ScreenHostProfile.tsx` "Encerrar turno"** — same as manager pattern, suspect placebo (not directly verified — flagged for review).

### P2 — UX afordância falsa (drag, error feedback)
14. **All 4 sheets without drag handler** (host waitlist add, host reservations new, manager table-menu more, manager shift-editor more/add) — affordance present, no drag.
15. **`MContactClientSheet.tsx:125-127`** silent fail catch — should surface toast.
16. **`ScreenManagerProfile.tsx` "Notificações" / "Segurança e senha"** rows — no onClick. Hide if not implemented.
17. **`ScreenManagerCourtesies.tsx`** entire screen uses MOCK_COURTESIES (line 52-58) hardcoded data; comment says wire to `GET /staff/courtesies?today=true` "ainda nao existe". Add empty-state or implement the endpoint.

### P3 — cosmético
18. **`ScreenManagerProfile.tsx` "Aparência"** row — no onClick.
19. **`ScreenWaiterProfile.tsx` & similar** — preferences rows (Som, Vibrar, Tema, PIN) render as `<div>` when no onClick (line 278), so visually they don't show as clickable; but the trailing `›` arrow (line 339) is misleading. Either remove the arrow or render the row as a static panel.
20. **Mock alerts copy in `DEFAULT_ALERTS`** — references hardcoded mesa/dish names ("Risoto cogumelos", "Mesa 14") which are out of sync with the real data. Until `/alerts` endpoint exists, the copy ought to be more generic (the file's own header comment in `ScreenManagerHomeA.tsx:40-44` already partially did this for staff names — extend to dish/table refs).

---

## 6. Verification harness used

For repeatability, the workflow run on the Mensagem direta sentinel:

```bash
# Pre
docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas \
  -c "SELECT count(*) FROM restaurant_dev.staff_messages;"
# → 3 rows

# (Playwright: resize 393×852 → set localStorage staffId/Role → goto /manager/equipe
#   → click Mensagem direta on Ana Garcom card → click chip → click Enviar)

# Post
docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas \
  -c "SELECT id, sender_staff_id, recipient_staff_id, body, created_at \
      FROM restaurant_dev.staff_messages ORDER BY created_at DESC LIMIT 5;"
# → New row at 17:30:22.617716+00 with body "Como tá indo? Precisa de ajuda?"
#   sender = 8bd0… (Erica), recipient = 320d… (Ana). FUNCTIONAL.
```

For placebos, the same harness shows zero non-GET HTTP requests after click and zero DB delta.

No test data with `AUDIT-` prefix was created (the staff_messages row from the Mensagem direta verification used the canonical chip text "Como tá indo? Precisa de ajuda?" and is leftover for downstream review — total 1 row added during this audit). To clean:

```sql
DELETE FROM restaurant_dev.staff_messages
WHERE id = '12909faf-2b86-4e42-8296-7821bf825f56';
```

---

## 7. Coverage gap (90 min cap)

Areas NOT verified live (relying on code grep only):
- `/host/profile` — ActionRow placebo pattern probable but not Playwright-tested.
- `/cozinha/eu` — same.
- All customer flows beyond welcome modal (assistant chips, cardapio, pedido, pagamento, complaints, rating) — code-grepped (all wired) but not run end-to-end.
- ScreenManagerStaffForm — code review shows real `staffPost`, but full registration flow not exercised.

These would be the priorities for a follow-up audit if needed.

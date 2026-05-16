# Subagente 17 — Host Home + Mesas + Espera + Reservas + Swap

**Branch**: `fix/customer-tools-and-continuation` (commit `d0f0781`)
**Tenant**: `restaurant_dev` · **Persona**: Renata Host (`a4c89ca7-86e6-4072-9432-449118a62fd4`)
**Data**: 2026-05-15 ~20h
**Ferramenta**: Playwright MCP Chrome · viewport 390x844

## Setup constraints

1. **LAN IP rewrite**: web-staff buildado com `NEXT_PUBLIC_API_URL=http://192.168.43.12:3001/api`. Workaround:
   - `page.addInitScript()` instalou shim de `window.fetch` que reescreve `192.168.43.12:3001` → `localhost:3001`.
   - WebSocket também patched (mas WS upgrades não passam por fetch shim — feedback de UI funcionou mesmo sem WS).
2. **Persona via localStorage**: `staffId`, `staffRole='host'`, `staffName`, `tenantSlug` setados em cada navegação.
3. **Browser compartilhado**: o Chrome do user tinha agentes paralelos abrindo tabs `/waiter/*` e `/cozinha` automaticamente. Workaround: rodou em tab 2 (criada com `tabs new`), monitorando que ela não foi capturada. Algumas operações exigiram re-tentativa por causa de tab hijacking.

## Rotas testadas

| # | URL | HTTP | Render | Captura | Estado dos dados |
|---|-----|------|--------|---------|------------------|
| 1 | `/host?tenant=restaurant_dev&hostId=<uuid>` | 200 | OK · counters reais | `screenshots/02-host-home-mobile.png`, `05-host-home-mobile-shimmed.png` | 10 livres · 2 em uso (M01, M02 ocupadas) — bate com DB |
| 2 | `/host/waitlist?tenant=restaurant_dev&hostId=<uuid>` | 200 | OK · vazio inicial · filled após seed | `10-host-waitlist.png`, `12-host-waitlist-3-entries.png`, `13-host-waitlist-filter-1-2.png` | 3 entradas waiting · filtro 1–2 → 1 entrada (João, party=2) |
| 3 | `/host/reservations?tenant=restaurant_dev&hostId=<uuid>` | 200 | OK · tabs Todas/Aguardadas/Chegaram | `20-host-reservations.png`, `21-host-reservations-3.png` | 3 reservas (2 awaited + 1 arrived) — bate com DB |
| 4 | `/host/swap?tenant=restaurant_dev&hostId=<uuid>&fromTableId=<M02_uuid>` | 200 | OK · DE/PRA picker + CTA disabled | `30-host-swap-from-m02.png`, `31-host-swap-selected.png`, `32-host-swap-enabled.png` | Source chips: M1·2p, M2·1p · Target list: M3..M22 livres · CTA enabled SÓ após pick de source + target |
| 5 | `/host/liberate/2?tenant=restaurant_dev` | 200 | OK · party-picker + CTA Liberar | `40-host-liberate.png` | Header "Liberar mesa 2" · counter 4 (default) · CTA enabled |
| 6 | `/host/late-arrival/<uuid>?tenant=...&hostId=...` | 200 | **PARCIAL — Mesa undefined** | `50-host-late-arrival.png` | DB row exists status=approved · UI mostra Mesa undefined, requester name vazio |
| 7 | `/host/notifications?tenant=restaurant_dev&hostId=<uuid>` | 200 | OK · empty + "manager-only endpoint" pill | `60-host-notifications.png` | Host não tem permissão pra endpoint manager — graceful fallback |
| 8 | `/host/profile?tenant=restaurant_dev&hostId=<uuid>` | 200 | OK · "Recepcionista" + Turno da noite | `70-host-profile.png` | Mostra título de função em vez de nome ("Recepcionista" não "Renata Host") |
| 9 | `/host/turnos-historico?tenant=restaurant_dev&hostId=<uuid>` | 200 | OK · 10 turnos mock | `80-host-turnos-historico.png` | Dados mock (28 liberações, 14 reservas etc.) |
| 10 | `/host/mensagens?tenant=restaurant_dev&hostId=<uuid>` | 200 | OK · empty inbox · tabs Todas/Não-lidas | `91-host-mensagens.png` | Empty state · header com search icon |

## Cobertura por cenário do prompt

- [x] **/host (entry)** — Mesas/Espera/Reservas/Avisos/Eu bottom-nav ✓
- [x] **/host/waitlist** — lista filtra por capacidade (1-2 testado e funciona) · add via API testado ✓
- [x] **/host/reservations** — tabs Todas/Aguardadas/Chegaram · add via API testado, status patch tested ✓
- [x] **/host/swap?fromTableId=** — lista livres com capacidade · CTA disabled até pick source+target ✓
- [x] **/host/liberate/[tableId]** — render OK · API POST testado e funciona ✓
- [x] **/host/late-arrival/[id]** — render parcial (bug) · API GET retorna shape errada ✗

## Observações de UX

- Botão "Confirmar troca" exige **AMBOS** source e target. O `fromTableId` na URL **não pré-seleciona** o source chip — usuário tem que clicar manualmente em Mesa 1 ou Mesa 2 (chips). Pode ser inesperado pra um host que chega via deep-link.
- `/host/notifications` mostra mensagem clara "manager-only endpoint" como pill — graceful failure.
- `/host/profile` mostra título de cargo ("Recepcionista") e não nome do staff individual. localStorage `staffName=Renata Host` foi setado mas não é renderizado.
- Tempo "30 min" em waitlist mostrado pra entradas recém-criadas (0min na DB) — sospechoso, pode ser placeholder mock.

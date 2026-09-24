Subagent: host-profile-settings
Status: PASS (5/5 OK · 0 regressões · 0 bugs novos · 1 placebo parcial Aparência)

Branch: fix/customer-tools-and-continuation
Host: Renata (staffId=a4c89ca7-86e6-4072-9432-449118a62fd4)
Viewport: 390×844 (mobile)

## Routes 5/5 OK

| Rota | HTTP | Status |
|---|---|---|
| /host/profile | 200 | 4 ActionRows com onClick real — Round 18 fix CONFIRMADO |
| /host/turnos-historico | 200 | Mock honesto (10 shifts hardcoded) — TODO documentado |
| /host/notificacoes-prefs | 200 | 8 inputs REAIS + onChange + localStorage — fix CONFIRMADO |
| /host/seguranca | 200 | 2FA toggle FUNCIONAL + stub toast honesto |
| /host/aparencia | 200 | **PLACEBO PARCIAL** (F1) |

## vs Round 19 baseline — 3 PROGRESSOS confirmados

### ✅ Progresso 1: 4 ActionRows /host/profile (round 18 placebo)
**CONFIRMED FIXED**. Probe react fiber em todos: `hasOnClick: true`. Source `ScreenHostProfile.tsx:244-278` usa `navTo(...)` preservando `?tenant=&hostId=` via useSearchParams.

### ✅ Progresso 2: 8 toggles /notificacoes-prefs (round 18/19 placebo)
**CONFIRMED FIXED**. Live probe + live click confirmaram que são `<input type="checkbox">` reais. Click em "Som de espera longa": `before:false → after:true`, `localStorage.host:notifPrefs:sound.long_wait="1"`.

Eyebrow honesto: "Configurações ficam neste dispositivo. Sincronização com sua conta chega no round 19."

**⚠️ NOTA - CONFLITO COM SUB 25**: Sub 25 (placebo regression scan) reportou /host/notificacoes-prefs com 8 placebos baseline UNCHANGED. Sub 18 (este) probou live e confirmou 8 inputs reais com onChange. Provável false positive do sub 25 — provável probe durante React hydration ANTES dos handlers materializarem. Sub 18 é mais confiável aqui (probe + click test direto).

### ✅ Progresso 3: 2FA toggle /seguranca (round 19 placebo)
**SEMI-FIX**: live click flipou state, `localStorage.host:security:2fa="1"`, toast com mensagem stub honesta: "2FA marcado como ativo (stub). Endpoint POST /auth/2fa/enable chega no round 19."

Sessões ativas (2 mock entries) também têm comportamento stub explícito.

## Findings (1 placebo parcial novo)

### 🟡 F1 P3 — /host/aparencia placebo parcial (tema não aplica global)
- 3 botões `aria-pressed` (Claro/Escuro/Automático) renderizam OK
- Click muda aria-pressed + `localStorage.host:appearance` (`"dark"`, `"auto"`) corretamente
- Success banner honesto: "Preferência salva. Aplicação global do tema chega no round 19."
- **PORÉM** `document.body` continua `rgb(246, 245, 242)` (light token) mesmo após selecionar Escuro/Automático
- **5 host screens** têm `const dark = false;` hardcoded:
  - `ScreenHostAppearance.tsx:31`
  - `ScreenHostNotificationPrefs.tsx:59`
  - `ScreenHostProfile.tsx:65`
  - `ScreenHostSecurity.tsx:36`
  - `ScreenHostTurnosHistorico.tsx:60`
- Source TODO documentado (ScreenHostAppearance.tsx:178-179): `TODO(round19): consumir essa preferência globalmente no staff app · hoje só persiste; cada screen ainda usa dark={false} hardcoded`

**Fix sugerido**: implementar ThemeProvider que lê `localStorage.host:appearance` + passa pra `useG(dark)` em todas as screens, ou esconder rota até funcional

### ℹ️ F2 — NEXT_PUBLIC_API_URL=<IP-da-LAN> spam (já reportado por subs 13/14/15/16)
- Console spam: `ERR_INSUFFICIENT_RESOURCES @ http://<IP-da-LAN>:3001/api/restaurant_dev/complaints`
- Não impacta as 5 rotas auditadas (todas mock + localStorage)

### ℹ️ F3 P3 — /host/turnos-historico mock declarado (não placebo)
- MOCK_SHIFTS hardcoded em ScreenHostTurnosHistorico.tsx:30-41 (10 turnos D-1 a D-10)
- TODO header (linha 7-9): `TODO(round19): wire GET /:slug/host/turnos-history`
- Expand inline funciona (click → setExpandedId reveals 4 KPI tiles: Mesas/Reservas/Walk-ins/Espera média)

## Recomendações
1. NÃO tocar fix de profile ActionRows (sólido)
2. Implementar ThemeProvider pra fechar débito da Aparência (ou esconder rota)
3. Wire endpoints declarados nos stubs: POST /auth/2fa/enable, POST /users/me/preferences, GET /:slug/host/turnos-history
4. Separar disclaimers stub em badge persistente vs banner verde transitório

Tempo: ~25min (135693 tokens, 131 tool uses)

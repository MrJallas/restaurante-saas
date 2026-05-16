# Placebos vs round 19 baseline · Round 23

Round 18 reportou 4 ActionRows placebo em `/host/profile`. Round 19 disse
"100% fixed". Round 18/19 também alegou 8 toggles div sem handler em
`/host/notificacoes-prefs` e 1 toggle 2FA placebo em `/host/seguranca`.

## TL;DR

| Categoria round 19 disse | Status round 23 |
|---|---|
| 4 ActionRows /host/profile placebo | **CONFIRMED FIXED** — todos têm `onClick` real + navegam corretamente |
| 8 toggles div sem handler /host/notificacoes-prefs | **CONFIRMED FIXED** — são `<input type=checkbox>` reais com `onChange` + localStorage persist |
| 1 toggle 2FA placebo /host/seguranca | **PARTIAL FIX** — toggle funciona localmente (state + localStorage + toast); backend ainda é stub explícito |
| Aparência theme switching | **PLACEBO PARCIAL** — selecionar funciona + salva preferência, **mas tema NÃO é aplicado globalmente** |

Nenhuma regressão encontrada. Aparência continua como reportado no source
(`TODO(round19): consumir essa preferência globalmente`).

---

## 1. /host/profile · 4 ActionRows (round 18 placebos)

### Probe (react fiber)

```
[
  { text: "MensagensHistórico", hasOnClick: true, type: "button" },
  { text: "Histórico de turnosLiberações...", hasOnClick: true, type: "button" },
  { text: "NotificaçõesAvisos do turno...", hasOnClick: true, type: "button" },
  { text: "Segurança e senhaTrocar senha...", hasOnClick: true, type: "button" },
  { text: "AparênciaModo claro...", hasOnClick: true, type: "button" },
  { text: "Sair do app", hasOnClick: true, type: "button" }
]
```

Source `ScreenHostProfile.tsx` linhas 244-278 todos usam `navTo(...)`:
- Histórico → `navTo('/host/turnos-historico')`
- Notificações → `navTo('/host/notificacoes-prefs')`
- Segurança → `navTo('/host/seguranca')`
- Aparência → `navTo('/host/aparencia')`

`navTo` preserva `?tenant=` e `?hostId=` via `useSearchParams`. **Round 19
fix confirmado.** Screenshot: `screenshots/01-profile.png`.

---

## 2. /host/turnos-historico · dados reais ou mock?

**MOCK** — array `MOCK_SHIFTS` hardcoded com 10 turnos (D-1 a D-10), datas
`2026-04-30` a `2026-05-09`, padrão turno noite. Cada row expande para
mostrar 4 KPI tiles (Mesas liberadas, Reservas atendidas, Walk-ins,
Espera média).

Source `ScreenHostTurnosHistorico.tsx:30-41`:
```ts
const MOCK_SHIFTS: ShiftEntry[] = [
  { id: 's-1', date: '2026-05-09', weekday: 'Sex', ...tablesReleased: 28, reservations: 14, walkins: 6, avgWaitMin: 8 },
  ...
];
```

TODO honesto no header: `TODO(round19): wire GET /:slug/host/turnos-history
— hoje só renderiza mock fixo`. Hero KPI mostra `10 turnos` corretamente.
**Expand inline funciona** (click no row → `setExpandedId` reveals 4 KPI
tiles). Screenshot: `screenshots/06-turnos-historico-real.png`.

**Não é placebo** — é mock explícito com flag de TODO documentado. Não há
botão "Carregar mais" nem fetch real, mas o UX funciona como protótipo.

---

## 3. /host/notificacoes-prefs · 8 toggles

Round 18/19 alegou: "div sem handler". **Round 23 corrige**: já são
`<input type="checkbox">` reais com `onChange` + `aria-label` + persistência
em `localStorage`.

### Probe react fiber (todos 8)

```
[
  { idx: 0, label: "Mesa liberada", hasInput: true, hasOnChange: true, ariaLabel: "Mesa liberada", checked: true },
  { idx: 1, label: "Espera longa", hasInput: true, hasOnChange: true, ariaLabel: "Espera longa", checked: true },
  { idx: 2, label: "Reserva próxima", hasInput: true, hasOnChange: true, ariaLabel: "Reserva próxima", checked: true },
  { idx: 3, label: "Chegada tardia", hasInput: true, hasOnChange: true, ariaLabel: "Chegada tardia", checked: true },
  { idx: 4, label: "Tocar som em alertas", hasInput: true, hasOnChange: true, ariaLabel: "Tocar som em alertas", checked: true },
  { idx: 5, label: "Som de espera longa", hasInput: true, hasOnChange: true, ariaLabel: "Som de espera longa", checked: false },
  { idx: 6, label: "Mostrar conteúdo na tela bloqueada", hasInput: true, hasOnChange: true, ariaLabel: "Mostrar conteúdo na tela bloqueada", checked: false },
  { idx: 7, label: "Vibração forte", hasInput: true, hasOnChange: true, ariaLabel: "Vibração forte", checked: true }
]
```

### Live click test (toggle "Som de espera longa")

```
{ before: false, after: true, storedValue: "1" }
```

- DOM state realmente flipou
- `localStorage.host:notifPrefs:sound.long_wait` recebeu `"1"`
- onChange handler fez a mutação esperada

Source `ScreenHostNotificationPrefs.tsx:212-251`: `<input
type="checkbox" checked={checked} onChange={onChange} ...>` envolto em
`<label>` clicável. **Não é placebo** — é localStorage real com
disclosure honesta no eyebrow: "Configurações ficam neste dispositivo.
Sincronização com sua conta chega no round 19."

Screenshot: `screenshots/07-notif-prefs.png` (oito toggles visíveis).

**Avaliação**: round 19 já corrigiu; round 23 confirma. Se algum bug-hunt
anterior listou esses toggles como "div placebo", está **desatualizado** —
o code path com `<input>` real é o que está rodando hoje.

---

## 4. /host/seguranca · 2FA "Pedir código a cada login"

### Probe (antes de clicar)

```
{ hasTwoFaInput: true, inputType: "checkbox", hasOnChange: true, checked: false }
```

### Live click test

```
{ before: false, after: true, stored: "1",
  toast: "2FA marcado como ativo (stub). Endpoint POST /auth/2fa/enable chega no round 19." }
```

- Input flipou ✅
- `localStorage.host:security:2fa` → `"1"` ✅
- Toast in-screen apareceu por 3.2s ✅
- **Backend continua stub explícito** — toast deixa claro

Source `ScreenHostSecurity.tsx:58-74`:
```ts
const handle2fa = () => {
  setTwoFa((prev) => {
    const next = !prev;
    window.localStorage.setItem(STORAGE_2FA, next ? '1' : '0');
    setToast({
      kind: 'info',
      text: next
        ? '2FA marcado como ativo (stub). Endpoint POST /auth/2fa/enable chega no round 19.'
        : '2FA marcado como inativo (stub). Endpoint POST /auth/2fa/disable chega no round 19.',
    });
    return next;
  });
};
```

**Não é placebo silencioso** — feedback de stub-state é explícito ao
usuário via toast. Estado persiste local. Backend é honest TODO. Sessões
ativas (mock list com 2 entries) também são placebo declarado: "Encerrar"
funciona localmente mas mostra toast "stub".

Screenshots: `screenshots/08-seguranca.png` (antes), `screenshots/10-seguranca-clean.png` (depois — 2FA ON).

---

## 5. Resumo final

- **0 regressões** em relação a round 19
- **0 placebos silenciosos** — todos os stubs têm toast/eyebrow honesto
- **1 limitação documentada**: Aparência salva preferência mas não aplica
  tema globalmente (TODO honesto no source, ver `theme-test.md`)

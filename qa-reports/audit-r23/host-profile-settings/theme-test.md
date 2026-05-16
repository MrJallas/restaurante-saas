# Theme test · /host/aparencia · Round 23

## Veredito

**PLACEBO PARCIAL** — selecionar funciona em estado local + localStorage,
**mas o tema NÃO é aplicado globalmente**. App continua em modo claro
mesmo após escolher "Escuro" ou "Automático".

## Probe (estado inicial)

```
{
  url: "http://localhost:3002/host/aparencia?...",
  h1: "Aparência",
  options: [
    { label: "Claro", pressed: "true", hasOnClick: true },
    { label: "Escuro", pressed: "false", hasOnClick: true },
    { label: "Automático", pressed: "false", hasOnClick: true }
  ],
  currentMode: null (localStorage vazio)
}
```

3 opções como `<button aria-pressed>`, default "Claro".

## Click "Escuro" então click "Automático"

```
{
  after: [ "false", "false", "true" ],  // Automático selecionado
  stored: "auto",                       // localStorage atualizado
  bodyBg: "rgba(0, 0, 0, 0)",          // body transparente
  sample: [
    "rgb(246, 245, 242)",  // bg ainda LIGHT
    "rgb(246, 245, 242)",  // bg ainda LIGHT
    ...
  ]
}
```

- aria-pressed DOM state flipa corretamente após delay (sync click +
  500ms read)
- `localStorage.host:appearance` recebe `"dark"` / `"auto"` conforme
  clique
- **MAS** cor de fundo continua `rgb(246, 245, 242)` (token light)

Success banner aparece honestamente:

> Preferência salva. Aplicação global do tema chega no round 19.

Source `ScreenHostAppearance.tsx:30-56`:

```ts
const [mode, setMode] = useState<Mode>('light');
const [savedAt, setSavedAt] = useState<number | null>(null);

const choose = (next: Mode) => {
  setMode(next);
  window.localStorage.setItem(STORAGE_KEY, next);
  setSavedAt(Date.now());
};
```

**Não há provider/context que consome `host:appearance`.** O state `mode`
é puramente local pra esta tela.

Source TODO documentado (linha 178-179):

```
TODO(round19): consumir essa preferência globalmente no staff app · hoje
só persiste; cada screen ainda usa dark={false} hardcoded.
```

E de fato, em **todas as 5 screens auditadas** (Profile, Turnos, Notif,
Seguranca, Aparencia) há `const dark = false;` hardcoded no início:

```bash
grep -n "const dark = false" apps/web-staff/src/screens/host/*.tsx
ScreenHostAppearance.tsx:31:  const dark = false;
ScreenHostNotificationPrefs.tsx:59:  const dark = false;
ScreenHostProfile.tsx:65:  const dark = false;
ScreenHostSecurity.tsx:36:  const dark = false;
ScreenHostTurnosHistorico.tsx:60:  const dark = false;
```

## Avaliação UX

| Aspecto | Status |
|---|---|
| Visual: 3 options renderizam com radio styling | OK |
| Click muda seleção visual + aria-pressed | OK |
| localStorage persiste escolha | OK |
| Success banner avisa que tema global chega round 19 | OK (honest) |
| Tema realmente trocar light↔dark↔auto | **FALTA** |

Não é placebo silencioso — banner verde declara explicitamente que
"Aplicação global do tema chega no round 19". Mas se um QA cético testar
sem ler o banner, vai concluir "feature quebrada" porque tema não muda.

**Recomendação**: ou implementar o provider de tema (round 19 pendente),
ou esconder a tela `/host/aparencia` da home + ActionRow profile até
estar funcional. Hoje a feature passa o smell test só porque o disclaimer
é gentil.

Screenshots:
- `screenshots/11-aparencia.png` (estado inicial · Claro selecionado, app light)
- `screenshots/12-aparencia-after-auto.png` (Automático selecionado, app STILL light + success banner)

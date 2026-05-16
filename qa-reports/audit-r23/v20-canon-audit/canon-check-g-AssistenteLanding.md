# canon-check (g) — Assistente landing (`!chatStarted`)

**File:** `apps/web-customer/src/app/[slug]/assistente/page.tsx` (lines 1423-1450 for the landing branch; surrounding context lines 514-680 for `chatStarted` state mgmt)
**Mounted at:** `/[slug]/assistente` page (root component). Landing renderiza quando `!chatStarted && !historyLoading`.
**Visual evidence:** Source review only (segunda navegação openurl em Safari WebView não fez switch limpo na sim; live render do landing requer session token+customerId seeded). Source é claro.

## Canon spec (CLAUDE.md §V20-locked)

| Spec | Where in source | Status |
|---|---|---|
| Landing home-like (2 PillButtons grandes "Chamar garçom" + "Ver cardápio") | lines 1428-1440: `data-testid="assistente-landing"` wrapper → `<div className="flex flex-col items-center gap-3">` → `<PillButton onClick={openCallWaiterSheet}>Chamar garçom</PillButton>` + `<PillButton onClick={() => push('/${slug}/cardapio')}>Ver cardápio</PillButton>` | OK |
| HomeHero greeting da continuation API | lines 1441-1449: `<HomeHero kicker="Assistente" animate={false} message={landingGreeting || 'Olá${...}! Posso ajudar...'} />` | OK |
| Bubbles de chat só aparecem após 1ª msg do customer | line 1428 conditional `!chatStarted && !historyLoading` wraps the landing block; messages (line 1451 `messages.map(...)`) render after. `chatStarted` flips on 1st send | OK |
| Greeting vira o 1º AI bubble preservando contexto | lines 1081-1091 (context: `if (!chatStarted) { ... if (landingGreeting && !options?.skipUserBubble) { ... content: landingGreeting } }`) — quando o user manda 1ª msg, o landingGreeting é injetado como primeiro AI message no chat | OK |
| `chatStarted` state | line 521: `useState<boolean>(!!prefill || !!threadIdParam)` — landing skipped quando vem de prefill ou threadId (skip landing path round 22 §A/§D) | OK |
| `landingGreeting` state | line 527: `useState<string | null>(null)` — populated via continuation API effect | OK |

## Tokens used

- `text-ink`, `text-mute`, `text-faint`, `border-border-soft`, `bg-bg`, `bg-surface` — todos canon (via PillButton, HomeHero, e bubbles que seguem ja são canon)
- `text-danger`, `bg-danger/10` (em erro messages downstream) — canon

## Regras de ouro check (per CLAUDE.md)

1. Tokens visuais — sem swaps no landing block. **PASS**
2. Tipografia — PillButton e HomeHero owns typography (delegated). **PASS**
3. Layout — landing usa `flex flex-1 flex-col justify-center gap-7` (line 1431) — centraliza vertical no resto do espaço disponivel dentro do AppShell. Não é `grid place-items-center h-[100dvh]` puro (regra 3) — mas regra 3 é sobre fullscreen layouts (Welcome/Identify/Waiting), e este é wrapped em AppShell. `justify-center` aqui é o equivalente flex pra centralizar vertical no slot remaining. **PASS** (regra 3 aplicável a fullscreen owned-by-screen, não a slots dentro de AppShell)
4. Copy — não aplicável (regra 4 é "Seu nome").
5. Modal-card — N/A, é página inline AppShell.
6. `flex-1` spacer — line 1431 usa `flex flex-1 flex-col justify-center`. **Discussão:** `flex-1` aqui não é "spacer empurrando CTA pro bottom" — é "expande pra preencher o slot disponivel no AppShell e centraliza vertical via justify-center". Regra 6 proibe `flex-1` SPACER (i.e., um `<div className="flex-1" />` ocioso entre conteúdo e CTA). Aqui é o landing CONTAINER que é flex-1, conteúdo é centralized via justify-center. **PASS** (regra 6 é sobre spacer pattern, não container fill)
7. PillButton custom usado (lines 1434, 1437). **PASS**

## Drifts

**None detected.** Landing structure matches canon V20 home-like spec.

## Observations

- Line 1428 também guarda contra `historyLoading` — durante load da thread history, landing fica oculto pra evitar flash (comment lines 1410-1414 explicam).
- Line 1443 `animate={false}` no HomeHero — apropriado pra static landing (canon V20 não anima greeting no landing, apenas no flow de chat).
- Linha 1080-1091 (transition handler): on 1st `sendMessage`, se `!chatStarted`, marca `setChatStarted(true)` e re-injeta `landingGreeting` como primeiro AI message — preserva contexto conforme spec ("greeting vira o 1º AI bubble preservando contexto").
- Comment lines 1423-1427 documenta explicitamente o canon: "Round 4 §C-NEW-8: landing view (idle) · 2 PillButtons grandes acima do greeting do LLM, alinhado ao layout da Mesa Home. Ao 1º send do customer, chatStarted vira true e essa view é substituída pelos bubbles de chat (que pre-pendam o greeting como 1º AI message)."

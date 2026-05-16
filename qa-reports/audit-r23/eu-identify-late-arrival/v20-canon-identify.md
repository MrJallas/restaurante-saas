# V20 canon · `/identify` vs `WelcomeModal`

Compare `ScreenCustomerIdentifyBeforeJoin.tsx` (LOCKED — V20 canon source) com `WelcomeModal.tsx` (também V20 canon — Round 4 §C-NEW-7).

CLAUDE.md cláusula 4 manda **NÃO** trocar copy "Seu nome" → "Seu primeiro nome". Cláusulas 1-3 mandam preservar tokens, tipografia e layout.

## Matriz de comparação

| Elemento | WelcomeModal | IdentifyBeforeJoin | Match? |
|---|---|---|---|
| Container outer | `fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-bg` | `bg-bg` (sem fixed — é uma page, não modal) | ✅ (esperado: page vs modal) |
| Grid centralizado | `grid h-[100dvh] min-h-dvh w-full place-items-center px-[22px] py-8` | `grid h-[100dvh] min-h-dvh w-full place-items-center px-[22px] py-8` | ✅ idêntico |
| Card width | `w-full max-w-[420px]` | `w-full max-w-[420px]` | ✅ |
| Eyebrow | `font-mono text-[10px] uppercase tracking-[1.5px] text-faint` ("MESA N · BEM-VINDO") | `font-mono text-[10px] uppercase tracking-[1.5px] text-faint` ("Acabou de escanear · alguém já está nesta mesa") | ✅ classes idênticas · copy contextual |
| Title | `mt-[14px] text-[26px] font-bold leading-[1.15] tracking-[-0.024em] text-ink text-pretty` ("Pra começar, quem é você?") | `mt-[14px] text-[26px] font-bold leading-[1.15] tracking-[-0.024em] text-ink text-pretty` ("Quem é você?") | ✅ classes idênticas · copy contextual |
| Sub paragraph | `mt-[12px] max-w-[320px] text-[15px] font-medium leading-[1.5] tracking-[-0.005em] text-mute text-pretty` | `mt-[12px] max-w-[320px] text-[15px] font-medium leading-[1.5] tracking-[-0.005em] text-mute text-pretty` | ✅ |
| Inputs wrapper | `mt-[24px] flex flex-col gap-[18px]` | `mt-[24px] flex flex-col gap-[18px]` | ✅ |
| FieldShell label "Seu nome" | ✅ canon V20 | ✅ canon V20 (NÃO "Seu primeiro nome" — cláusula 4 respeitada) | ✅ |
| FieldShell label "Seu CPF" | ✅ | ✅ | ✅ |
| FieldShell focused border | `border-[1.6px] border-ink` quando focado | `border-[1.6px] border-ink` quando focado | ✅ |
| FieldShell idle border | `border-border-soft` | `border-border-soft` | ✅ |
| FieldShell radius/min-height | `rounded-[14px] min-h-[56px]` | `rounded-[14px] min-h-[56px]` | ✅ |
| Input text class | `w-full bg-transparent text-[17px] font-medium tracking-[-0.012em] text-ink outline-none placeholder:text-faint` | `w-full bg-transparent text-[17px] font-medium tracking-[-0.012em] text-ink outline-none placeholder:text-faint` | ✅ |
| Name input attrs | `autoCapitalize="words" autoComplete="given-name" autoCorrect="off" spellCheck={false} enterKeyHint="next"` | idem | ✅ |
| Title-case onBlur | ✅ `capitalizeName` no blur (não no change) | ✅ idem | ✅ |
| Helper mono uppercase | `mt-[14px] font-mono text-[10px] font-bold uppercase leading-[1.5] tracking-[0.8px] text-faint text-pretty` ("Só pra mesa saber quem é · CPF nos ajuda…") | mesmas classes · mesma copy | ✅ |
| CTA PillButton | `variant="filled" fullWidth … mt-[28px] py-4 text-[15.5px]` + seta `→` canon | mesmas props + seta `→` canon | ✅ |
| CTA inner content | `<span className="inline-flex items-center gap-1.5">{loading ? 'Processando…' : 'Continuar'}{!loading && <span aria-hidden>→</span>}</span>` | idem (label "Validando…" vs "Processando…") | ✅ (label loading varia) |
| Error block | `mt-3 rounded-[12px] border border-danger/30 bg-danger/5 px-3 py-2.5 text-[12px] leading-[1.5] text-danger` | idem | ✅ |
| FieldShell helper (inline) | local function `FieldShell` (idêntica) | local function `FieldShell` (idêntica) | ✅ — TODO: extrair pra `components/ui/FieldShell.tsx` (comentário nos dois arquivos) |

## Diferenças intencionais (não regressões)

1. **Eyebrow copy**: Welcome usa "MESA N · BEM-VINDO" (cold scan); Identify usa "Acabou de escanear · alguém já está nesta mesa" (B chegou tarde e a mesa já tem A). Ambos seguem o pattern mono uppercase 10px.
2. **Title copy**: Welcome "Pra começar, quem é você?" · Identify "Quem é você?". Mais curto na late-arrival porque o eyebrow já dá contexto.
3. **Sub paragraph copy**: Welcome menciona restaurante; Identify menciona host da mesa (`hostName ? ... : ...`).
4. **Welcome adicional**: `setRecognitionToken` + `onComplete` callback (modal lifecycle); Identify usa `setCustomer` + `router.push(redirectTo)`.
5. **Identify adicional**: `returningName` toast verde "Bem-vindo de volta, X!" antes do navigate (1.8s) — não existe no Welcome porque é o primeiro contato.

## Veredito V20

**`ScreenCustomerIdentifyBeforeJoin.tsx` está 100% em compliance com canon V20 do WelcomeModal**. Tokens, tipografia, layout, label "Seu nome", FieldShell pattern, helper mono uppercase, PillButton filled com seta canon, `grid place-items-center h-[100dvh]` — todos preservados.

**Nenhuma regressão detectada**. Os dois arquivos compartilham 100% do shell visual; só copy varia para o contexto (cold welcome vs late-arrival join).

**Status**: ✅ V20 canon respeitado.

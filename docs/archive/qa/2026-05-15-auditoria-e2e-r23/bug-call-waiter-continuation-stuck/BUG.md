# Bug — CallWaiterSheet drag-dismiss + continuation stuck em `chamou_garcom`

**Reporter**: User (Caleb)
**Reproduzido em**: iPhone 17e iOS 26.5 (gravação 41s)
**Branch**: `fix/customer-tools-and-continuation`
**Data**: 2026-05-15
**Severidade**: P1 (ambos)

## Vídeo da reprodução (preservar — não copiado)

**Path original** (mantido pelo user):
```
~/Desktop/Gravação de Tela 2026-05-15 às 17.09.23.mov
```

### Como o Codex pode assistir o vídeo

A skill `/watch` (instalada em `~/.claude/skills/watch/`) baixa/processa o vídeo, extrai frames como JPEGs auto-escalados, e gera um relatório com transcript. Pra rodar:

```bash
# Com Whisper API (transcript completo se houver áudio)
python3 "~/.claude/skills/watch/scripts/watch.py" \
  "~/Desktop/Gravação de Tela 2026-05-15 às 17.09.23.mov"

# Frames-only (screen recording sem narração — mais rápido, não precisa API key)
python3 "~/.claude/skills/watch/scripts/watch.py" \
  "~/Desktop/Gravação de Tela 2026-05-15 às 17.09.23.mov" \
  --no-whisper
```

Output: 40 frames em `/var/folders/.../watch-XXXX/frames/frame_NNNN.jpg`, cronológicos com timestamp `t=MM:SS`. Read cada frame com o tool `Read` (renderiza JPEG visualmente). Pra audit pontual de um trecho, use `--start MM:SS --end MM:SS`.

Documentação completa: `~/.claude/skills/watch/SKILL.md`.

---

## Resumo do problema (texto do user)

> "Quando você clica em chamar o garçom e chama realmente, ele não atualiza o texto quando o drag vai pra baixo como se o usuário tivesse puxado pra baixo o menu, ele não muda o texto e só muda o texto quando vai pra outra tela só que entra em conflito com a mensagem que eu deveria receber ao entrar no cardápio, ele trava na mensagem do chamado garçom."

## Sequência cronológica observada (frame-by-frame)

| t | Frame | Estado | Texto assistente no chat |
|---|---|---|---|
| 0-4s | 1-5 | Chamado disparado (typewriter em progresso) | "Pronto, chamado disparado. Tempo médio agora ~0 min." |
| 4-5s | 5-6 | Chamado completo (kind=chamou_garcom variant cg1) | "Avisei o garçom — ele tá indo aí. Quer ir vendo a próxima rodada enquanto isso?" |
| 6-8s | 7-8 | Tap "Chamar garçom" → sheet abre com 5 motivos (race: já há call ativo) | ↑ |
| 8-13s | 9-11 | Sheet pula pra `ScreenCustomerWaiterCallWaiting` · tempo 0s→12s · motivo "Fazer pedido" | ↑ |
| 14s | 15 | Cardápio aberto (rota direta /cardapio) | — |
| 15-17s | 17-19 | Volta /assistente | "A caminho da sua mesa, Caleb Teste. Posso adiantar algo enquanto isso?" (variant cg2/cg4 com slot customerName) |
| 18-23s | 21-23 | Reabre sheet "Aguardando" (timer mantém estado) | ↑ (background não muda) |
| **24s** | **25** | **DRAG-DISMISS da sheet** (handle puxado pra baixo) | ↑ **NÃO atualiza** ← **Bug A** |
| 26s | 27 | Hamburger menu aberto | ↑ |
| 27s | 30 | Cardápio aberto (via hamburger menu) | — |
| **29s** | **33** | Volta /assistente após visitar /cardapio | **"Garçom notificado. Enquanto rola, quer ver bebidas ou sobremesas?"** ← **Bug B** (deveria ser kind=viu_menu) |
| 33-40s | 36-40 | Texto preso · NUNCA atualiza pra viu_menu | ↑ ← **Bug B persiste** |

## 🐛 Bug A — Sheet drag-dismiss não dispara refresh do continuation

**Sintoma**: ao fazer drag-dismiss da sheet "Aguardando garçom" (frame 25), o texto do `/assistente` por trás permanece estático ("A caminho da sua mesa, Caleb Teste..."). Só atualiza ao trocar de rota.

**Root cause provável**: o callback `onDismiss` (drag completed) da sheet não revalida o SWR/SWR-like que alimenta o continuation bubble. Sheet é overlay local; closing não emite signal pra Home/Assistente.

**Locais sugeridos pra investigar**:
- `apps/web-customer/src/components/ui/CallWaiterSheet.tsx` — handler `onClose` / `onDismiss` (drag final)
- `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx` — chamar `mutate('/home')` quando sheet fecha
- Alternativa: sheet emite custom event `waiter:sheet:closed` que UIStateProvider/parent captura pra disparar revalidate

**Fix sugerido**: no callback de close (qualquer rota: drag, tap backdrop, tap Cancelar), chamar `swr.mutate('/api/restaurant_dev/home')` OU forwardar via context que `/assistente` escuta.

**Severidade**: P1 (cosmético-de-fluxo — usuário vê estado defasado até navegar)

---

## 🐛 Bug B — Continuation trava em `chamou_garcom` mesmo após viu_menu

**Sintoma**: após user visitar `/cardapio` (rota direta) e voltar pro `/assistente`, o texto que aparece é continuation `kind=chamou_garcom` (variant cg2: "Garçom notificado. Enquanto rola, quer ver bebidas ou sobremesas?"). Deveria ser `kind=viu_menu` (variant vm1/vm3: "Quer que eu monte uma sugestão?" / "Algum prato te chamou atenção, Caleb?").

**Root cause provável**: `apps/api/src/modules/home/home.service.ts` na função `inferContinuationKind(...)` (linhas ~189-202 conforme sub 22 audit). A lógica de prioridade dá precedência ao `waiter_call ACTIVE` sobre `recently_viewed_menu`:

```ts
// Pseudocódigo provável (a verificar)
if (hasActiveWaiterCall) return 'chamou_garcom';   // ← sempre ganha enquanto call pending/assigned
if (recentlyViewedMenu)  return 'viu_menu';
```

Enquanto o waiter_call está `pending`/`assigned`, `chamou_garcom` sobrepõe qualquer outro signal — mesmo o explícito de user ter visitado `/cardapio`.

**Locais sugeridos pra investigar**:
- `apps/api/src/modules/home/home.service.ts:189-202` — `inferContinuationKind(...)` priorities
- `apps/api/src/modules/home/home.controller.ts:30-43` — forward de `x-continuation-kind-hint` + `x-draft-order-count` (já existe per sub 22 audit; verificar se prevalece sobre DB state)
- `apps/web-customer/src/app/[slug]/assistente/page.tsx` — confirmar se o FE seta `x-continuation-kind-hint: viu_menu` ao voltar de /cardapio

**Fix sugerido (3 opções)**:
1. **Quick win**: `x-continuation-kind-hint: viu_menu` enviado pelo FE **prevalece sobre DB state** quando presente. Lógica: hint = user intent declarada, DB state = inferência.
2. **Combinado**: criar novo kind `viu_menu_com_chamado_ativo` que diz "vi cardápio enquanto espero garçom" — narrativa mais fiel ao fluxo real.
3. **Re-priorizar**: `recently_viewed_menu` (visita /cardapio < 60s atrás) vence `waiter_call_active`. Lógica: signal mais recente ganha.

**Severidade**: P1 (UX confuso — usuário pergunta "mas eu acabei de ver o cardápio, por que ele ainda me oferece como se o garçom não tivesse chegado?")

---

## Cross-reference com audit r23

Esse bug confirma findings do sub 22 (Continuation API audit):
- `qa-reports/audit-r23/continuation-api/SUMMARY.md`
- Bug original do super-prompt ("home.service.ts NÃO passa kind") foi **outdated** (já fixado em commit 5edb454), mas a **lógica de prioridade dentro de `inferContinuationKind`** ainda tem este edge case não coberto pelos testes existentes.

Também relaciona-se com sub 3 (CallWaiterSheet) — que validou os 5 motivos canon V20 e drag-dismiss limpo, MAS não testou interação com continuation atualização (cenário cross-component).

## Recomendação de teste pra fix

1. Adicionar regression test:
   - Seed: customer com waiter_call `status=pending` + `last_viewed_menu_at` mais recente que `waiter_call.created_at`
   - Assert: `inferContinuationKind` retorna `viu_menu` (ou novo kind combinado), não `chamou_garcom`
2. E2E:
   - Cypress/Playwright: simular fluxo do vídeo (chamar garçom → visitar /cardapio → voltar /assistente)
   - Assert: bubble text contém variante `viu_menu` pool, não `chamou_garcom`

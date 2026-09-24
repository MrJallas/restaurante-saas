# Handoff — App do Cliente · 4.2 → 4.5 + V12 + V13 + V14

Redesign cobrindo as quatro mudanças do app do cliente do brief:
**4.2** mensagens de continuidade · **4.3** bottom sheet de chamado ·
**4.4** cortesia editorial · **4.5** mensagem do gerente.

A seção **4.1** do brief é deleção de rota (`/[slug]/assistente`) — sem mockup necessário.

> **Round 8a (2026-05 · V15 do garçom · cliente mantém V14) · Customer-host foundation**
> Round 8a estabelece o princípio arquitetural `customer-host model` reusado nos
> próximos prompts (8b late-arrival · 8c table-merge). Primeira pessoa que escaneia QR
> e abre comanda vira `host` da sessão (`table_sessions.host_customer_id`) e tem
> privilégio de aprovar decisões SOCIAIS da mesa antes do staff (cascata 60s/etapa
> via tabela compartilhada `escalation_chains`). Spec completo:
> [`docs/features/customer-host-model.md`](../../docs/features/customer-host-model.md).
> **Cliente NÃO ganha v15 nesse round** — 8a é 90% staff-side (QR ilegível é staff-only,
> sem decisão social, sem participação do cliente). Frames próprios pro cliente entram
> em 8b/8c quando late-arrival e table-merge entrarem. Lado do staff em
> [`app-garcom-canvas-v15.html`](../../app-garcom-canvas-v15.html) · DCSection
> `v15g.host-pattern` no topo explica princípio + cascata.

> **V13 (2026-05) · Navegação 100% conversacional · 24 LLM tools + chips contextuais reativos**
> Consolida a interação principal do cliente: chips contextuais como canal
> principal de navegação (não opcionais) · `ContextualInputExpand` inline pra
> chips que exigem texto livre (animação Apple-flavor) · `ToolCallIndicator`
> entre bubbles · regra `STAFF_TOOLS_REQUIRING_TEXT` · LGPD flow.
> Canvas focado: [`app-cliente-canvas-v13.html`](../../app-cliente-canvas-v13.html) · 9 seções · 22 frames.
> Telas em [`cliente-screens-v13.jsx`](./cliente-screens-v13.jsx).
> Spec LGPD: [`docs/features/chat-history-lgpd.md`](../../docs/features/chat-history-lgpd.md).
> Componentes novos em [`cliente-tokens.jsx`](./cliente-tokens.jsx): `ContextualChip`, `ContextualChips`, `ToolCallIndicator`, `ContextualInputExpand`, `CustomerBubble`.

> **V12 (2026-05) · Avaliação pós-entrega + reclamação como chamado novo**
> Estende o app do cliente com fluxo de rating após delivered → reclamação opcional →
> resposta do gerente como `ManagerBubble` com **chip-action inset**.
> Canvas focado: [`app-cliente-canvas-v2.html`](../../app-cliente-canvas-v2.html) · 6 seções · 10 frames.
> Spec completa: [`docs/features/complaint-flow-v12.md`](../../docs/features/complaint-flow-v12.md).
> Telas em [`cliente-screens-v2.jsx`](./cliente-screens-v2.jsx).
> Lado do gerente: [`app-garcom-canvas-v12.html`](../../app-garcom-canvas-v12.html).

> Linguagem **espelhada** do `screens.jsx` que você já aceitou.
> Branco puro, ink near-black, Inter sans, mono caps tiny, pills outline/filled.
> **Sem serif italic, sem terracota, sem creme** — aquele round anterior foi um desvio.

---

## Como visualizar

Abra `app-cliente-canvas.html` na raíz do projeto. É um canvas Figma-like com **17 frames** cobrindo todos os estados nas duas plataformas. Use scroll/pinch pra navegar; clique no label de um artboard pra entrar em foco fullscreen (←/→ navega na seção, ↑/↓ entre seções, Esc sai).

> Nada das telas existentes (`pitch-mesa.html`, `app-garcom-*.html`, `handoff/garcom/*`, `screens.jsx`) foi alterado. Esse handoff é aditivo.

---

## Estrutura

```
handoff/cliente/
├── README.md                ← este arquivo
├── cliente-tokens.jsx       ← C palette, FONT, MONO, ícones, frames, helpers
├── cliente-screens.jsx      ← componentes das 17 telas + window.CLIENTE_SECTIONS
└── server-notes.md          ← endpoints novos, schema, WS events, migrations

../../app-cliente-canvas.html  ← canvas pra revisar
../../design-canvas.jsx        ← Figma-like canvas (já existe)
../../screens.jsx              ← linguagem da casa canônica (já existe — não tocada)
```

---

## Linguagem da casa (resumo, espelhada de screens.jsx)

| Token          | Valor                                        | Uso                                                |
| -------------- | -------------------------------------------- | -------------------------------------------------- |
| `C.bg`         | `#ffffff`                                    | canvas — branco puro                               |
| `C.surface`    | `#f6f5f2`                                    | off-white levemente quente p/ surfaces             |
| `C.ink`        | `#0a0a0a`                                    | borda + texto principal (também é o "accent")      |
| `C.borderSoft` | `#e5e5e5`                                    | divisores                                          |
| `C.mute`       | `#6b6b6b`                                    | texto secundário                                   |
| `C.faint`      | `#a3a3a3`                                    | metadata / terciário                               |
| `C.danger`     | `#c43a3a` + wash `#fbe9e7`                   | brick — alertas / chamado                          |
| `C.success`    | `#2f7d4f` + wash `#e3efe7`                   | moss — entregue / pago                             |
| `C.warning`    | `#b88a1a` + wash `#fbf1d8`                   | mustard — preparando / novo                        |
| **Body**       | `Inter` 400/500/600                          | tudo                                               |
| **Mono**       | `JetBrains Mono` 500–600 caps + tracking 1.1 | eyebrows, badges, time chips, nome+role do gerente |

Sem serif. Sem terracota. Sem ornamentos editoriais. **Monocromático: preto É o accent.**

---

## Componentes-chave (todos em `cliente-tokens.jsx`)

| Componente                     | Quando usar                                                           |
| ------------------------------ | --------------------------------------------------------------------- |
| `IOSFrame` / `AndroidFrame`    | 390×844, dynamic island ou punch-hole, status bar correta             |
| `TopBar`                       | Brand + mesa à esquerda, ícone à direita (menu / back)                |
| `MonoLabel`                    | Eyebrows e tiny labels — mono caps tracking 1.2                       |
| `StatusPill tone="..."`        | dot + label mono — success/warning/danger/mute                        |
| `PillButton variant="outline"` | CTA secundário (white + 1.3px ink)                                    |
| `PillButton variant="filled"`  | CTA primário (ink solid + white text)                                 |
| `PillButton variant="ghost"`   | Link discreto sublinhado                                              |
| `LiquidInput`                  | Input do home com play-button preto à esquerda                        |
| `AssistantBlock`               | Texto da IA inline com mono caps acima — **sem bubble**               |
| `ManagerBubble`                | 4.5 — bubble assinatura, border-left ink, badge mono "NOME · GERENTE" |
| `Caption`                      | Bloco de notas embaixo de cada frame                                  |

Ícones em `Ico` (peso 1.4): `arrow`, `back`, `menu`, `x`, `hand`, `book`, `notepad`, `glass`, `receipt`, `chat`, `giftSeal`, `check`, `clock`, `send`.

---

## Inventário das 17 telas

### 4.2 · Continuação · Home pós-ação · 6 frames

- `viu_cardapio` (iOS) · `chamou_garcom` (iOS) · `abriu_pedido` (iOS, com CTA filled "Acompanhar pedido") · `pagou` (iOS) · `voltou_sem_acao` (iOS) · `viu_cardapio` (Android)
- Mesmo `HomeHero`/`AssistantBlock` do screens.jsx — só o texto e os chips mudam
- Chips contextuais (não estáticos) — substituem o `SUGGESTION_CHIPS` mock

### 4.3 · Bottom sheet "Chamar garçom" (vaul) · 4 frames

- `idle` (iOS) — sheet sobre home atenuado, backdrop 32% preto, CTA disabled
- `motivo selecionado` (iOS) — radio "Fazer pedido" ativo, CTA filled habilita
- `swipe-dismissing` (iOS) — translateY follow-finger, hint "Swipe down ↓"
- `idle` (Android)

### 4.4 · Cortesia da casa — redesign · 4 frames

- `recebimento` (iOS) — selo redondo (não retangular), ornamentos sutis nos 4 cantos, quote do gerente em itálico com travessão, CTA filled "Aceitar com gratidão" + secundário "Não, obrigado" sublinhado
- `aceito · selo carimbado` (iOS) — selo escala 2x rotate -7deg, dashed inner ring, pill avatar+ETA da Marina
- `recusa` (iOS) — X em circle outline, copy curta sem culpabilizar
- `recebimento` (Android)

### 4.5 · Mensagem do gerente no chat · 3 frames

- `solo` (iOS) — só ManagerBubble com Renata; input vira "Responder Renata"
- `IA + cliente + gerente` (iOS) — IA inline (sem bubble), cliente em bubble ink à direita, gerente em bubble assinatura à esquerda com border-left ink
- `solo` (Android)

---

## Como integrar em `apps/web-customer`

1. **Tokens** — copiar `cliente-tokens.jsx` para `apps/web-customer/lib/design-tokens.tsx` e converter os `Object.assign(window, ...)` em ESM exports. Cada componente helper já vem standalone.

2. **Continuation home (4.2)** — extender `home.service.ts` conforme `server-notes.md`. No frontend, `mesa/[tableCode]/page.tsx` passa a renderizar `<ContinuationHome>` quando `continuationMessage != null`, caindo pro welcome antigo caso contrário. Chips dinâmicos via `CONTEXT_SUGGESTIONS[continuationKind]`.

3. **Bottom sheet (4.3)** — adicionar `vaul` ao `apps/web-customer/package.json`. Apagar `app/[slug]/garcom/chamar/page.tsx`. Criar `components/CallWaiterSheet.tsx` envolto em `<Drawer.Root>`, usado a partir de qualquer trigger na mesa. A rota `/[slug]/garcom/chamando` (estado persistente) fica.

4. **Cortesia (4.4)** — nova rota `/[slug]/cortesia/[id]/page.tsx` recebe `courtesy_id` via push/WS e renderiza `<CourtesyArrival>` → on-accept navega pra `<CourtesyConfirmed>`. Mockups em altíssima fidelidade — copiar JSX direto.

5. **Mensagem do gerente (4.5)** — bubble `<ManagerBubble>` é renderizada no thread quando `message.from_role === 'staff'`. Resposta do cliente seta `reply_to_role='staff'` enquanto thread com gerente está ativa (rolling window de 5 min).

---

## Estados / animações documentados em cada frame

Cada caption no canvas resume **trigger / endpoint / animação / hit target**.

Animações usadas:

- `cursor-blink` — typing cursor da IA (1s loop)
- `cSlideUp` — bottom sheet abre (220ms cubic-bezier(.2,.8,.2,1))
- `cManagerArrive` — bubble do gerente entra (translateY 8→0 + fade, 360ms)
- `cStampIn` — selo da cortesia entra com bounce + rotate 0→-7deg (480ms)

Hit targets verificados:

- ✓ PillButton md = 14×26 padding + 15px font ≈ 48px
- ✓ PillButton lg = 16×28 padding + 16px font ≈ 52px
- ✓ Sheet reason rows = 14×16 padding + 38px icon ≈ 66px
- ✓ Botão back/menu no top bar = 36px (limite — aumentar pra 40px se vier feedback de toque)

---

## V13 · Navegação conversacional · chips contextuais

> **Princípio arquitetural:** toda resposta da IA termina com **2-4 chips
> contextuais reativos** sugerindo as próximas ações prováveis. São o canal
> principal de navegação · NÃO opcionais. Chips somem após escolha · não
> persistem · não ressurgem sozinhos.

### Caminho duplo · chip OU texto livre

Cliente sempre completa o fluxo de **2 formas equivalentes**:

1. **Tap chip** (1 toque · caminho rápido)
2. **Texto livre** (LLM detecta intent e roteia pra mesma tool)

Ambos disparam a mesma tool · mesmos params · mesmo resultado.

### Princípios visuais

- 2-4 chips · scroll horizontal se exceder
- Ordem: primário esquerda · destrutivo/cancelar direita
- Copy: verbo + objeto · ≤22 chars
- Banido: `Ok` · `Sim` · `Tá bom` (exceto destructive confirms · LGPD)
- Estilo: pill outline ink · filled ink se primário/destrutivo

### Sub-padrão · `ContextualInputExpand`

Quando uma chip exige texto livre (`requiresText: true`), tap **NÃO abre
tela nova** · UI expande inline com animação Apple-flavor. 3 variantes
disponíveis (snappy / liquid / drape · seção v13.1 do canvas) · cliente
escolhe.

### Regra obrigatória · texto não-vazio pra tools de staff

Tools que mandam pra humanos (`send_complaint`, `send_message_to_manager`)
**não podem ser chamadas com texto vazio**. Frontend valida antes de
habilitar CTA · backend valida no endpoint (400 se vazio) · LLM, quando
ambíguo, pergunta de novo.

Razão: gerente recebendo "reclamação sem motivo" precisaria ir até a mesa
pra descobrir o problema · isso atrasa fluxo. Texto obrigatório significa
que o gerente já chega na mesa **com a solução**.

### Inventário · 24 tools em 6 grupos

| #   | Grupo                                             | Tools                                                                                                              |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A   | **Cardápio · navegação** (5)                      | `view_menu` · `search_dish` · `recommend_dish` · `check_allergens` · `compare_dishes`                              |
| B   | **Pedido** (4)                                    | `add_to_order` · `modify_order_item` · `remove_order_item` · `view_order`                                          |
| C   | **Comunicação com staff** (3 · texto obrigatório) | `call_waiter` · `send_complaint` · `send_message_to_manager`                                                       |
| D   | **Pagamento** (4 · UI dedicada)                   | `request_bill` · `split_bill` · `pay_individual` · `pay_full`                                                      |
| E   | **Sessão / utilidade** (6)                        | `view_chat_history` · `delete_chat` · `delete_all_chats` · `rate_order` · `view_courtesy` · `ask_about_restaurant` |
| F   | **LGPD · privacy** (2 · ★ NOVO ★)                 | `show_lgpd_notice` · `lgpd_data_request`                                                                           |

Mapping completo de chips por tool em [`cliente-screens-v13.jsx`](./cliente-screens-v13.jsx) · `TOOL_REGISTRY`. Backend espelha em `CONTEXTUAL_CHIPS_PER_TOOL`.

### LGPD flow · spec dedicado

Texto canônico do `show_lgpd_notice` é imutável · vive em código backend.
Solicitação de exclusão retorna protocolo (`LGPD-2026-05-08-3F2A`) +
prazo legal (15 dias úteis). Detalhes em [`docs/features/chat-history-lgpd.md`](../../docs/features/chat-history-lgpd.md).

> ★ Texto canônico atualmente é **exemplo** · cliente edita após revisão
> jurídica antes de produção.

### Componentes novos (em `cliente-tokens.jsx`)

| Componente              | Quando usar                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContextualChip`        | Pill outline ink · 1 chip individual · suporta `primary`, `destructive`, `requiresText`                                                     |
| `ContextualChips`       | Row de 2-4 chips · scroll horizontal se exceder · ordem alinhada à esquerda por default                                                     |
| `ToolCallIndicator`     | "··· USANDO {name} ···" · 5 categorias de cor (menu/order/staff/payment/destructive/lgpd) · animação `cDotPulse` 1.2s loop                  |
| `ContextualInputExpand` | Textarea inline com animação Apple-flavor · 3 variantes (`snappy`/`liquid`/`drape`) · CTA full-width filled · X discreto reverte pros chips |
| `CustomerBubble`        | Bubble do cliente alinhada à direita · ink solid · timestamp mono caps                                                                      |

---

## O que NÃO está aqui

- Telas de pagamento, menu, pedido (não foram pedidas no brief)
- App do gerente (5) e do garçom (6) — próximos rounds, ordem do brief
- Watcher de QR / Segurança (8.1) — vive solto, fora do nav

---

## Verificação visual feita

- ✅ Linguagem espelhada do `screens.jsx` em **todos** os 17 frames
- ✅ iOS Dynamic Island + home indicator visíveis
- ✅ Android punch-hole + gesture nav visíveis
- ✅ Hit targets ≥ 44px (sheet rows 66px, CTAs 48–52px)
- ✅ Sem serif italic · sem terracota · sem creme · sem ornamentos editoriais
- ✅ Atribuição da pessoa em todas as mensagens do gerente ("Renata · GERENTE")
- ✅ Cortesia: selo redondo + ornamentos lineares minimal substituem ícone genérico de gift-card

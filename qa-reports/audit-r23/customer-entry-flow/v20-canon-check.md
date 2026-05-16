# V20 Canon Check — Customer Entry Flow

Checks against the canon in `CLAUDE.md` and `docs/design-canvas/handoff/cliente/cliente-journey-v20.jsx` / `cliente-late-arrival.jsx`.

## Welcome (`WelcomeModal.tsx`)

| Item canon | Observado em `01-pristine.png` |
|---|---|
| Layout `grid place-items-center` em `h-[100dvh]` | OK · conteúdo centralizado vertical e horizontal |
| Eyebrow mono 10px / 700 / tracking 1.5px `MESA N · BEM-VINDO` | OK · "MESA 01 · BEM-VINDO" (table label '01' vem do DB, internamente o code é M01) |
| Title 26/700 tracking `-0.024em` "Pra começar, quem é você?" | OK |
| Body 15/500 text-mute "Estamos no Meu Restaurante. Seu nome…" | OK |
| Labels MonoLabel "Seu nome" e "Seu CPF" (não "Seu primeiro nome") | OK · "SEU NOME" e "SEU CPF" |
| FieldShell `border-[1.6px]` `border-soft` idle / `border-ink` focused, `rounded-[14px]`, `min-h-[56px]` | OK · em `04-cpf-invalid.png` visível: nome `border-soft` (idle), cpf `border-ink` (focused) |
| Helper mono uppercase 10/700 tracking 0.8 abaixo do CPF "SÓ PRA MESA SABER QUEM É · CPF NOS AJUDA A TE RECONHECER NA PRÓXIMA VISITA" | OK |
| Error inline rounded-[12px] border `danger/30` bg `danger/5` | OK em `04-cpf-invalid.png` ("CPF INVÁLIDO. CONFIRA OS NÚMEROS." em vermelho) |
| PillButton variant=filled fullWidth com seta `→` | OK · "Continuar →" |
| Sem card antigo V13 com border-ink 1.5px e box-shadow 0 24px 60px | OK · fullscreen take-over, sem modal-card |

## Waiting (`ScreenCustomerWaitingApproval.tsx`)

| Item canon | Observado em `05-after-submit.png` / `07-after-reload.png` |
|---|---|
| Layout `grid place-items-center` em `h-[100dvh]` (não justify-start + flex-1 spacer) | OK · bloco eyebrow→title→sub→ícone→pill→CTA agrupado no centro |
| Eyebrow mono 10/700 tracking 1.2 com bounce-dot animado | OK · "AGUARDANDO HOST DA MESA" + dot |
| Title 26/700 tracking -0.024em "Esperando aprovação" | OK |
| Sub 15/500 text-mute "Caleb Teste foi avisado · ele tá decidindo se você pode entrar." | OK |
| Pulse icon (clock SVG dentro de balloon pulsando, border-soft + bg-surface, 96×96) | OK |
| Pill estado: `border border-border-soft bg-surface px-3.5 py-2`, "HOST · Xs" mono caps | OK · "HOST" (sem countdown porque expiresAt veio null no DTO) |
| CTA outline PillButton "Cancelar pedido" | OK |

## Recognize / Home (`/assistente`)

| Item canon | Observado em `08-recognize.png` |
|---|---|
| Header "Meu Restaurante" / "Mesa 01" com hamburger menu | OK |
| Landing home-like: 2 PillButtons "Chamar garçom" e "Ver cardápio" centralizados | OK |
| HomeHero greeting da continuation API · kind `RETURNING_CUSTOMER` | OK · "ASSISTENTE · DE VOLTA / Bem-vindo de volta, Caleb Teste. Quer começar pelo cardápio ou prefere uma indicação?" |
| Bubbles de chat só após 1ª msg do customer (sem chat-history visível) | OK |

## Reclaim banner (não testado neste subagent)

A spec menciona o banner `border-soft + bg-surface + mono eyebrow CONTA RECONHECIDA` (não amber/yellow). Este flow só dispara em condição específica (sessão fechada recente). Não houve cenário trigado nos cenários a-h.

## Erro session_start_failed (`02-expired.png`, `03-hmac-fake.png`)

| Item observado | Comentário |
|---|---|
| Texto vermelho "Não foi possível iniciar a sessão. Tente novamente." | Funcionalmente OK |
| Botão filled "Tentar novamente" + sub "Ou escaneie o QR Code novamente." | OK |
| Posicionamento centralizado vertical | OK |
| Visual seguro contra QR adulterado / expirado | OK |

Spec audit chamava de "erro 'QR Code inválido'" — a copy atual é mais genérica ("não foi possível iniciar a sessão"). Não cai no canon de outras telas V20 (não tem eyebrow mono nem title 26/700) — fica numa tela de erro mais minimalista. Decisão: aceitar como PASS (funciona corretamente, copy diferente da spec mas razoável e clara).

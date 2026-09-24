# Software do restaurante — Canvas completo de UI

Canvas de design com TODAS as telas dos 3 apps nativos (garçom · recepcionista · gerente) e telas web do cliente. Pareado com o app do cliente (cardápio digital + pagamento), com o KDS da cozinha/bar (`../tv-cozinha-bar.html`) e com o backend (NestJS multi-tenant).

> **Round 2026-05 V15 · Round 8a · Customer-host foundation + QR ilegível (staff-only)** (canvas focado: `app-garcom-canvas-v15.html`)
>
> 1. **Princípio arquitetural · `customer-host model`** — primeira pessoa que escaneia QR e abre comanda vira `host` da sessão (`table_sessions.host_customer_id` uuid REFERENCES customers · NULL se walkin). Tem privilégio de aprovar **decisões sociais** da mesa (late-arrival · table-merge) antes do staff. Cascata padrão (60s/etapa, 240s totais): customer-host → recepcionista → manager → garçom → sistema age fallback. Implementada via tabela compartilhada `escalation_chains` (`type` · `current_step` · `steps` jsonb · WS events `escalation.{created,approved,rejected,escalated_to_staff,timeout}`). Reusada nos próximos 2 prompts (8b late-arrival · 8c table-merge). DCSection nova `v15g.host-pattern` no topo do canvas explica o princípio e diagrama da cascata. Spec completo: [`docs/features/customer-host-model.md`](../../docs/features/customer-host-model.md). **Cliente não ganha v15 nesse round** — 8a é 90% staff-side (QR ilegível é staff-only); customer-host só desbloqueia frames próprios pro cliente em 8b/8c.
> 2. **`Call.type` ganha `'qr-issue'`** — atenção mostarda (não crítico · diferente do `complaint` que é vermelho saturado). QR ilegível **pula etapa 1 da cascata** porque é problema operacional (sem decisão social): manager (60s) → outro manager (60s) → dono (120s) → pendência fria (garçom continua com Inserir manualmente). Aparece em 3 lugares: Painel · Em curso (`MQrIssueInProgressCard` border-left mostarda · 2 ações inline "Tô indo verificar"/"Já mandei reimprimir"), Operação · Alertas (card no topo do KPI Atenção · ícone QR riscado custom + pill mono "ATENÇÃO · QR ILEGÍVEL"), e Push lockscreen (border mostarda em opacidade reduzida · som notification médio · pulse haptic leve · NÃO pulsa visual · diferente do complaint).
> 3. **`ScreenWaiterReportQrIssue` (sheet vaul · novo)** — disparado pelo footer mono caps "QR ILEGÍVEL? CONTACTAR GERENTE" do `ScreenWaiterNewEntry` (V4) que vira tap target real. Eyebrow "REPORTAR QR · TRATTORIA LUNA" · stepper `−[14]+` em mesa + link "Não sei o número" (abre lista) · `ContextualInputExpand` opcional pra descrição (max 200 chars · placeholder "QR borrado · descolou…") · CTA filled ink "Reportar pra gerente". Pós-envio o sheet shrinka mostrando eyebrow verde "ENVIADO · 19:42" + bubble preview + pill mostarda em pulse "AGUARDANDO RESPOSTA DO GERENTE..." · auto-fecha em 5s.
> 4. **`ScreenCallDetail` aceita `type="qr-issue"`** — hero mostarda lavado com pill "QR ILEGÍVEL · MESA 14" + ícone QR riscado 48×48 + headline "Mariana reportou agora" + reminder mono tiny "CONTINUA USANDO INSERIR MANUALMENTE" (lembrete operacional pro gerente). Bubble da garçonete com a fala. **4 chips empilhados**: `Tô indo verificar · 2 min` (primário mostarda · mais usado) · `Já mandei reimprimir` · `Use mesa X temporariamente` (abre picker de mesa livre · realloc digital) · `Custom · escrever do meu jeito`.
> 5. **Resposta do gerente volta como bubble normal na thread Mensagens (V11)** — sem mudança visual nem chip-action inset (esse é dos casos onde a infra V10/V11 cobre tudo). O que muda é que o backend dispara push manager-message específico ("Renata respondeu sobre o QR") com som distinto. Backend grava em `assistant_messages` com `from_role="staff"`, `to_role="staff"`, `to_staff_id=<garçonete>`, `metadata: { qrIssueId, escalationChainId }`.
> 6. **Telas em [`garcom-qr-issue.jsx`](./garcom-qr-issue.jsx)** · 2 DCSections com 10 frames totais (2 princípio + 8 staff-qr-issue · 7 iOS + 1 Android paridade no sheet de report).

> **Round 2026-05 V12 · Reclamação como tipo de chamado** (canvas focado: `app-garcom-canvas-v12.html`)
>
> 1. **`Call.type` ganha `'complaint'`** — reclamação pós-entrega do cliente vira chamado novo, igual aos outros tipos (chamou-garcom, pediu-conta, etc.). Aparece em 3 lugares: Painel · Em curso (`MInProgressCard kind="complaint"` · pattern V4 · border-left brick), Operação · Alertas (card crítico no topo · pattern dos outros alertas), e Push lockscreen (som crítico · pulse haptic forte · **NÃO silencia em zone-pause** · always-deliver).
> 2. **`ScreenCallDetail` aceita `type="complaint"`** — hero brick lavado com pill mono caps "RECLAMAÇÃO · CALEB · MESA 14" + estrelas filled brick + meta mono "HÁ 2 MIN · NÃO LIDA AINDA". Bloco "O que ele disse" mostra bubble do cliente com chip do tipo (`DEMORA`/`ITEM ERRADO`/etc.) + fala em quotes + assinatura. Bloco "Resposta rápida" tem 4 chips empilhados: `Já estou indo · 2 min` (primário brick · mais usado) · `Vou verificar com a cozinha · 3 min` · `Mando uma cortesia pela espera` (atalho pro fluxo `ScreenManagerCompensateClient` do V5) · `Custom · escrever do meu jeito` (abre composer textarea). Após enviar, `MInProgressCard` vira `state="resolved-summary"` por 30s mostrando read receipt em tempo real ("Caleb leu há 12 s · pode marcar como resolvida") antes de auto-some — pattern V4 reusado.
> 3. **MoreSheet do header** — "Marcar como resolvida (sem responder)" · "Encaminhar pra outro gerente" (`POST /staff/complaints/:id/forward`) · "Reportar problema com sistema".
> 4. **Backend** — nova tabela `complaints` (com index parcial em unresolved), endpoints `/staff/complaints/...`, WS events `complaint.{created,responded,read,resolved}`, push channel separado com som "humano respondendo" (não usar som de IA). Spec completa: [`docs/features/complaint-flow-v12.md`](../../docs/features/complaint-flow-v12.md). Telas em [`garcom-complaint.jsx`](./garcom-complaint.jsx). Lado do cliente: [`app-cliente-canvas-v2.html`](../../app-cliente-canvas-v2.html).

> **Round 2026-05 V10 · Mensagens · histórico + chat threads + Eu da host** (resolvido neste documento · canvas: `app-garcom-canvas-v10.html`)
>
> 1. **Caixa de mensagens completa entre funcionários (★ V10 ★)** — substitui a `ScreenStaffMessageDetail` (V9 · "mensagem isolada") por DUAS telas novas: `ScreenStaffMessages` (lista de threads agrupada por interlocutor · busca expandível · 4 filtros chip Todas/Não-lidas/Equipe/Arquivadas · long-press abre MoreSheet · empty state) + `ScreenStaffMessageThread` (chat completo com bubbles, eyebrow + role do emissor, agrupamento de sequências · date separators mono caps · sticky banner de zone-pause ativa só pro garçom · composer textarea com contador 0/240 + botão circular ink filled · read receipts viewport-based via WS · MoreSheet pesquisar/silenciar/arquivar/reportar). Comportamento idêntico pros 3 roles · só muda o conteúdo. `ScreenStaffMessageDetail` está DEPRECATED — push e item de Chamados levam direto pra thread (deep-link via `senderId`).
> 2. **ActionRow "Mensagens" no Eu dos 3 roles** — entrada nova no bloco OPERAÇÃO de cada Eu: `ScreenManagerSettings` (badge 3 · gerente vê todas), `ScreenProfile` (badge 1 · garçom Mariana vê thread da Renata), e o NOVO `ScreenHostProfile` (sem badge · host tem 0 não-lidas no estado padrão).
> 3. **5ª aba "Eu" do `HBottomNav` ativada (★ V10 ★)** — recepcionista ganha paridade visual com o garçom/gerente. `ScreenHostProfile` é minimalista (Hero + KPI rápido de mesas liberadas no turno + OPERAÇÃO com Mensagens + Histórico de turnos · CONTA + Sair). Sem encerrar turno, sem financeiro, sem cortesia — recepção tem poucas alavancas próprias.
> 4. **Variante chip-action na thread** — quando o gerente escolhe o chip "Pause os pedidos novos das suas mesas por 5 min" do `MContactStaffSheet`, backend gera uma bubble especial dentro da thread com card mostarda "ZONE-PAUSE · 5 MIN" + CTA "Ver pausa →" (abre `ScreenManagerOrdersPause` em modo zone). Primeira instância de "ato de operação dentro do chat" — pattern reusável pra Prompt 8 (cascade QR ilegível · recepção dispara shortcut pro garçom).
> 5. **Schema · `thread_id` em `assistant_messages`** — uuid determinístico por par de staff_ids (`uuid_v5(LEAST(a), GREATEST(b))` garante simetria). Novos endpoints `GET /staff/messages/threads`, `GET /threads/:id/messages`, `POST /messages/:id/read`, `POST /threads/:id/archive`. Eventos WS: `message.received` (estendido com `thread_id`), `message.read` (NOVO · agrupa em janela de 200ms), `thread.archived`. Ver `server-notes.md` 5.7-bis.
> 6. **Read receipt viewport-based** — V9 marcava como lido ao abrir tela isolada. V10 marca quando a bubble entra em viewport (IntersectionObserver threshold 0.6 · skip mensagens > 24h por privacy). Backend agrupa reads em janela de 200ms antes de emitir WS pro emissor.
> 7. **`docs/features/zone-pause.md` ganhou seção "Pedido manual lançado pelo garçom durante a pausa"** — confirma que zone-pause **NÃO BARRA** o garçom de lançar pedido manual (cliente chamou na faixa, pediu de boca). Pedido manual entra no MESMO congelador (`orders.status='pending_zone_pause'`) que pedidos do cardápio digital. Toast discreto mostarda "Pedido entra no fluxo quando a pausa encerrar (em 4:23)" · sem cor de erro · cliente nunca vê esse aviso.

> **Round 2026-05 V9 · cleanup + Operação KPI detail + staff messaging round-trip** (resolvido neste documento · canvas: `app-garcom-canvas-v9.html`)
>
> 1. **Cleanup · variantes B/C da Equipe apagadas** — `ScreenManagerStaff` simplificado · prop `variant` e prop `bDetailOpen` removidas · DCSection `mgr-staff-variants` apagada do canvas. Variante A (3 KPIs compact com saúde no CARGA MÉDIA) é a canônica. DCSection "Painel · telas que abrem dos atalhos" também apagada (modelo obsoleto desde V4 · telas em si — `ScreenManagerAlertsAll`, `ScreenManagerKitchenReorder`, `ScreenManagerOrdersPause` — continuam vivas em outras seções).
> 2. **Operação KPI detail (★ V9 ★)** — `ScreenManagerStatDetail` estende de 3 → 7 variantes. Os 4 KPIs da Operação (Críticos · Atenção · Mesas Ativas · Em Alerta) ganham tap-target real no `?` (long-press mantém tooltip). Cada variante tem hero contextual, lista granular com tap-through, ações específicas e fórmula. Back preserva sub-tab origem (Equipe vs Operação · `mgr-staff` vs `mgr-ops`).
> 3. **Staff messaging round-trip (★ V9 ★)** — gerente envia mensagem direta pro garçom via `MContactStaffSheet` (espelha `MContactClientSheet`). Garçom recebe push `manager-message` (som discreto · silenciado durante zone-pause), aparece na aba Chamados como item de tipo `manager-message` (ink em fundo branco · ícone chat balloon), tap abre `ScreenStaffMessageDetail` (hero ink em fundo creme + bloco "O que ela vê de você agora" + chips de resposta rápida + ações Responder/Marcar como lido). Read receipt via WS atualiza o sent-state do MContactStaffSheet de "Aguardando leitura..." mostarda → "Lido às 19:43" verde. Backend: `assistant_messages` ganha colunas `to_role` + `to_staff_id` + `read_at` (ver `server-notes.md` 5.7).
> 4. **Copy "Pausar pedidos novos da praça dele" reescrita** — virou "Pausar mesas do Caleb por 5 min" + sub "Só as mesas que ele atende · resto do salão funciona normal". Modal vaul de confirmação com chip-row de duração 5/10/15/30 min. Dispara fluxo `zone-pause` (ver `docs/features/zone-pause.md`).
> 5. **Doc reference · `zone-pause.md`** adicionado na seção Feature specs.

> **Round 2026-05 · pendências de correção** (resolvido neste documento)
>
> 1. **'Cortesia mesa' → 'Contactar cliente'** em todos os mocks de alerta (default secundária dos cards de Operação) — abre nova sheet `MContactClientSheet` (vaul-style sobreposto à Operação atual).
> 2. **Cortesia fora da barra "Agir agora"** (vira 2 cards: Cozinha · Pausa). Cortesia continua como ação contextual via MoreSheet de alerta · chip da sheet · histórico em `Eu › Cortesias`.
> 3. **Tipo `'message'` removido** do `ScreenManagerCompensateClient` — comunicação pura sem brinde fica em `MContactClientSheet` / `POST /staff/messages`. Cortesia = freebie material só (`dessert · drink · couvert · discount`).
> 4. **Pausa de garçom apagada** — `ScreenManagerStaffPause` + push de fim de pausa + ações `Pausar 5 min` / `Pausar` no MoreSheet e nos cards de funcionário.
> 5. **Segurança QR (watcher) movida pra `prototypes/seguranca-qr/`** — `ScreenManagerSecurity` + `ScreenManagerSecurityAudit` saem do app do gerente. Backend permanece intacto.
> 6. **Análise de reserva apagada** — `ScreenHostReservationDraft` + aviso "Nova reserva no WhatsApp · análise pronta". Bot do WhatsApp captura todos os campos obrigatórios (nome, telefone, CPF, data, hora) antes de criar a reserva. Não há fluxo de revisão de draft.
> 7. **Camada ACK no `/classify`** documentada em `cliente/server-notes.md` — quarta camada do guardrail entre greeting e regex, captura "ok / tá / valeu / 👍" e devolve resposta curta do pool sem chamar LLM.
> 8. **Endpoint `POST /smart-suggestions`** documentado em `garcom/server-notes.md` — pool determinístico por situação (`pedido_atrasado`, `chamado_sem_resposta`, `cliente_novo_aguardando`, `pagamento_demorado`) com LLM fallback, mesmo guardrail de 3 camadas do `/classify`.

> **Round 2026-05 V3 · quick wins de limpeza** (resolvido neste documento)
>
> 1. **Operação · Alertas densificada** — KPI tile 140→80px (help vira tooltip `?`), `MQuickActionsBar` 88→56px (1 linha · variant `stacked` default + variant `inline` alternativa no canvas), alert card 150-170→~108px (X dispense canto, pill mono caps inline, sub truncate). Resultado: ~5-6 alertas + KPIs visíveis no viewport (era ~2-3). Antes/depois lado a lado nos primeiros frames da seção `mgr-ops`.
> 2. **Aba "Novo" do `GBottomNav` virou entrada principal pro scanner** — ícone `Icon.qr` (viewfinder · 4 cantos em L), tap abre `ScreenWaiterScanQr` em modal fullscreen sobre a aba ativa. Variação alternativa: FAB flutuante de scan QR na `ScreenHomeGrid` (prop `fab`).
> 3. **Home com variação única (Grade)** — `ScreenHomeList` e `ScreenHomeMap` deletados. Toggle de variação + persistência em localStorage também saíram. `ScreenHomeGrid` é a tela inicial; `CallRow` ficou (segue sendo usado em screens-b).
> 4. **"Minhas folgas" removida** do bloco Operação da aba Eu — produto não vai gerenciar folga.
> 5. **`ScreenCustomerCompensation` deletada do canvas do garçom** — vista do cliente da cortesia mora em `handoff/cliente/cliente-screens.jsx` (`CourtesyArrival` + `CourtesyConfirmed`), single source of truth. A cópia anterior aqui usava o estilo antigo (cream + serif Iowan + orange + confetti) e divergia do estilo aceito do cliente. Wrappers HTML redundantes (`-corrections`, `-handoff-2`, etc.) também consolidados em 1 wrapper canônico.

> **Round 2026-05 V6 · Equipe unificada + Editor de turnos placeholder** (resolvido neste documento · canvas: `app-garcom-canvas-v6.html`)
>
> 1. **`ScreenManagerStaff` unificada** — `ScreenManagerStaffList` (StaffList simples · aba Equipe default) + `ScreenManagerShiftBoard` (3 KPIs + sugestão IA + cards expandidos com ações inline · acessada via "Ver mais →" pattern morto) + `ScreenManagerShiftSchedule` (timeline 12-24h com swimlanes) **fundidas em uma única tela** top-level. Estrutura em 8 blocos: Hero · 3 KPIs · banner IA · busca + 2 rows de chips · cards de funcionário com métricas + ações contextuais ao status · turnos do dia compactos · próximos eventos · CTA fixa. Gerente sem cabeça técnica lê uma tela hierarquizada melhor do que 3 telas com sub-rotas órfãs.
> 2. **KPI clarity (★ Q resolvido ★)** — `MESAS/PESSOA · 4,6` virou `CARGA MÉDIA · 4,6 mesas/garçom` com sub explicativo "média entre quem está em campo" e tooltip detalhado: "Total de mesas abertas dividido pelos funcionários em campo · meta < 5,0".
> 3. **Escala compacta (★ S resolvido ★)** — timeline com swimlanes 12h-24h removida (difícil de ler). Substituída por lista compacta de turnos do dia (3-4 linhas com mono caps + nº de funcionários + pill ATUAL). Tap expande inline mostrando avatar + nome + função em mono — sem nova rota. Botão "Editar turnos →" abre `ScreenManagerShiftEditor` (placeholder pra V6 futura).
> 4. **Banner de sugestão IA com personalidade preservada** — "Caleb está com 7 mesas e Henrique com 5. Mova 1 mesa do Caleb para o Henrique para equilibrar." Tom não-técnico mantido (esse é o ouro da tela). Bloco oculta totalmente quando não há sugestão · não mostra empty state vazio.
> 5. **Routing simplificado** — Painel "Ver mais →" Equipe agora abre `mgr-staff` direto (filtrado em "Em turno"). Eu › "Equipe e escala" virou "Equipe e turnos" e também aponta pra `mgr-staff`. Operação · alertas que mencionam garçom específico deep-linkam pro card. `mgr-staff-tools` (sub-section que tinha ShiftBoard + ShiftSchedule) deletada inteira.
> 6. **Feature specs no README** — adicionada seção "Feature specs" referenciando `docs/features/vip-customer.md` no repo principal. Algumas features desenhadas no canvas precisam de spec dedicado de backend/lógica antes de virarem código (entry: MoreSheet do TableMenu · impacta `priorityOf()` no balanceador).

> **Round 2026-05 V4 · Painel redesign + padrão "Em curso" + chooser do Novo** (resolvido neste documento · canvas: `app-garcom-canvas-v4.html`)
>
> 1. **Painel (`ScreenManagerHomeA`) reorganizada em 6 blocos** — Hero (saudação + AO VIVO) · Ferramentas rápidas 2 cards (Cozinha · Pausa · era 3) · **Em curso ★ NOVO ★** · Hoje no turno (alertas compactos · 3 mostrados) · Equipe em turno · Próximas reservas. Mesmo formato de `MQuickActionsBar` que ficou na Operação V3 (~56px stacked), unificando a linguagem das ferramentas rápidas em todo o app do gerente. Cortesia saiu do Painel — vai pro menu da mesa no Prompt 5; continua acessível via chip da `MContactClientSheet` ou `Eu › Cortesias`.
> 2. **Padrão arquitetural NOVO · "Em curso" (`MInProgressCard`)** — toda operação async que o gerente dispara (pausa rodando, reorder cozinha aguardando aceite, mensagem ao cliente aguardando leitura, cortesia aguardando aceite) vira um card persistente na seção "Em curso" do Painel até resolver. Tap no corpo abre tela cheia preservando estado. Ações rápidas inline (+5 min · Despausar · Cancelar · Reenviar · Cancelar envio) cabem em 1 toque sem o gerente leaving o Painel. Border-left tematica (mostarda = pausa-active · azul = waiting · verde = resolved). Seção INTEIRA OCULTA quando 0 operações.
> 3. **Pausa ativa indicada inline na Ferramenta rápida** — quando há pausa ativa, o card "Pausa" da `MQuickActionsBar` ganha bolinha mostarda pulsando no canto sup direito + sub muda de "Pedidos novos" pra "04:23 restantes" em mono. Garante que o gerente saiba do estado mesmo se rolar pelo Painel sem ver "Em curso".
> 4. **Padrão NOVO · Post-mortem leve (`MOpSummary`)** — quando uma operação async termina (auto ou manual via "Despausar agora"), card no Painel vira `state="resolved-summary"` por ~30s mostrando o que melhorou (KPIs antes/depois compactos), antes de sumir. Tap em "Ver detalhes" abre `ScreenManagerOrdersPauseSummary` (tela cheia · `MOpSummary` template) com duração + 3 KPI tiles antes/depois (fila/saída/pedidos que entraram) + timeline real + sugestão IA de próximo passo. Template REUSÁVEL — mapeado pra `kitchen-reorder` ("Cozinha aceitou em 23s · 2 pedidos puxados pra frente"), `contact-client` ("Cliente leu em 1m12s") e `courtesy` ("Cliente aceitou em 32s · garçom Olivia avisada"); cada uma terá seu próprio template de KPI/timeline em rounds futuros.
> 5. **Aba "Novo" abre chooser (`ScreenWaiterNewEntry`)** — antes ia direto pro `ScreenWaiterScanQr` (V3), agora abre uma tela intermediária com 2 caminhos: "Escanear QR da mesa" (primário ink filled · `Icon.qr` 40px) ou "Pegar mesa pelo número" (secundário outline · keypad 40px). Footer discreto sublinhado mono caps tiny: "QR ilegível? Contactar gerente". Para mesas que o garçom JÁ atende, escanear é desnecessário — o chooser custa 1s de cognição e elimina ~30% das vezes que o garçom abria scanner pra usar "Inserir manualmente". Callback do `GBottomNav` renomeado de `onScan` pra `onNewEntry`. FAB opcional do `ScreenHomeGrid` agora também abre o chooser (não direto o scanner).
> 6. **Scanner · "Inserir manualmente" reduzido a text link** — quem chega no scanner já fez a escolha de escanear no chooser. O fallback no rodapé é só pra emergência (QR ilegível, câmera com problema), e por isso virou link sublinhado discreto (Inter 13/600) com eyebrow mono caps tiny "QR ilegível?" — não mais pill full-width.

## Como o canvas está organizado

O canvas (`app-garcom.html`) está agrupado por **role** com um `<RoleHeader>` grande no início de cada grupo. Cada header mostra:

- **Ícone tinted** do role (🧊 garçom · 🚪 recepcionista · 🏢 gerente · 🔀 cross-cutting)
- **Bottom nav esquemática** do app daquele role (em pílulas)
- **Lista de todas as telas** que vivem naquele grupo, em ordem de leitura

### Ordem de leitura do canvas (de cima pra baixo)

```
INTRO geral
├─ ROLE 1 · GARÇOM (app nativo iOS+Android)
│    push · login · forgot · home (Grade · única) · mesa · chamado
│    garcom-flow (scan + picker + delivery confirm) · pedido (3 var) · turno + perfil
│
├─ ROLE 2 · GERENTE (app nativo iOS+Android · 5 abas)
│    Bottom nav: Painel · Operação · Equipe · Financeiro · Eu
│    Painel (1ª aba) · atalhos do Painel
│    Operação (2ª aba · sub-tabs Alertas/Mapa/Funil) · Timeline da mesa
│    Equipe (3ª aba · ★ V6 · unificada · turnos do dia inclusos ★) + Form · Desempenho
│    Financeiro (4ª aba) · Eu (5ª aba · perfil/turno/sair)
│    Ferramentas: Reordenar cozinha · Pausar pedidos · Cortesia (contextual)
│    Sheet · Contactar cliente (sobre Operação · 4 estados)
│    Lista de alertas
│
├─ ROLE 3 · RECEPCIONISTA (app nativo iOS+Android · 5 abas)
│    Bottom nav: Mesas · Espera · Reservas · Avisos · Eu (★ V10 · 5ª aba ★)
│    Home (Pra liberar + Mapa) · Liberar walkin · Liberar reserva (smart fit) · Trocar mesa
│    Lista de espera · Reservas (do bot WhatsApp · sem fluxo de revisão de draft)
│    Eu · perfil minimalista (V10) · Mensagens (V10)
│
├─ MENSAGENS · CAIXA COMPLETA · 3 ROLES (★ V10 ★)
│    Lista de threads + chat-style com bubbles, sticky pause banner, chip-action
│    Comportamento idêntico pros 3 roles · só muda o conteúdo
│
└─ CROSS-CUTTING · telas que envolvem 2+ papéis
     Cascata de notificações (lock screens 3 papéis × iOS+Android)
     Cascata in-app (3 versões do detalhe + central de avisos)
     Menus dos 3 pontinhos (4 contextos)
```

## Arquivos do design

- `app-garcom.html` — entrypoint standalone (canvas com todas as telas)
- `garcom-app.jsx` — montagem do canvas, DCSections e RoleHeaders
- `garcom-tokens.jsx` — design tokens, ícones, dados mock, MoreSheet compartilhado
- `garcom-screens-a.jsx` — login, recuperação de senha, home (Grade · variação única, com FAB opcional de scan QR)
- `garcom-screens-b.jsx` — detalhe da mesa, detalhe do chamado, pedido manual, turno, perfil + **NewEntry chooser ★ V4 ★** + scan QR + picker manual + delivery confirm
- `garcom-screens-c.jsx` — gerente · primitives (MBottomNav 5 abas · MAppHeader · MStat · MSection · MPill · **MInProgressCard ★ V4 ★** · `M_INPROGRESS` presets) + telas Painel · **Equipe ★ V6 unificada ★** · ShiftEditor (placeholder V6) · StaffForm · Eu
- `garcom-screens-d.jsx` — gerente · sub-screens e telas-ferramenta: StaffDetail · Ops (3 sub-tabs) · Finance · TableTimeline · TableMenu · AlertsAll · KitchenReorder · OrdersPause · **OrdersPauseSummary ★ V4 ★** · **MOpSummary ★ V4 template reusável ★** · CompensateClient · MContactClientSheet
- `garcom-screens-host.jsx` — telas do app da recepcionista
- `garcom-push.jsx` — telas de push notification (lockscreen) — todos os cenários
- `garcom-complaint.jsx` — ★ V12 ★ Reclamação como `Call.type='complaint'` (push crítico · MComplaintInProgressCard · ScreenComplaintDetail com 4 chips)
- `garcom-qr-issue.jsx` — ★ V15 · round 8a ★ QR ilegível como `Call.type='qr-issue'` (mostarda · não crítico) + frames de princípio do customer-host model (cascata `escalation_chains`)
- `ios-frame.jsx` / `android-frame.jsx` — bezels de device
- `design-canvas.jsx` — canvas Figma-like

---

## ⭐ Balanceamento inteligente de chamados (PRIORIDADE)

> **Esta é a lógica central do app.** O garçom não escolhe ordem dos chamados manualmente — o **backend balanceia** e o app só mostra o que vier marcado como `priority: 'high' | 'medium' | 'low'`.

### Princípio

A "prioridade alta" não é fixa por tipo de chamado. Ela é **derivada da demanda atual de cada estação** (cozinha, bar, salão). Quem está mais saturado dita o que vira urgente.

### Estações monitoradas

| Estação     | O que conta como "demanda"                                                    |
| ----------- | ----------------------------------------------------------------------------- |
| **Cozinha** | nº de pedidos com `status = preparando` + nº de pedidos com `elapsedMin > 10` |
| **Bar**     | nº de drinks com `status = preparando` + nº de drinks com `elapsedMin > 5`    |
| **Salão**   | nº de chamados ativos do tipo `chamou-garcom` + `pediu-conta`                 |

### Regras de saturação (configuráveis por restaurante)

```ts
type StationLoad = {
  station: 'cozinha' | 'bar' | 'salao';
  queueDepth: number; // quantos itens na fila
  oldestElapsedMin: number;
  staffCount: number; // garçons/cozinheiros logados
};

// Saturação relativa = quão sobrecarregada está a estação
function saturation(load: StationLoad): number {
  // ratio fila por funcionário, ponderado pelo item mais antigo
  return load.queueDepth / Math.max(load.staffCount, 1) + load.oldestElapsedMin / 10;
}

// Limiar para virar 'high' (ajustar com base em dados reais)
const HIGH_THRESHOLD = 3.0;
const MED_THRESHOLD = 1.5;
```

### Como o backend deriva `priority` de cada chamado

```ts
function priorityOf(call: Call, loads: Record<Station, StationLoad>): Priority {
  const sat = saturation(loads[call.sourceStation]);

  // Casos sempre 'high' independente de carga:
  if (call.type === 'pediu-conta' && call.elapsedMin > 5) return 'high';
  if (call.type === 'pronto-cozinha' && call.elapsedMin > 3) return 'high'; // comida esfriando
  if (call.flags?.includes('vip')) return 'high';
  if (call.flags?.includes('alergia')) return 'high';

  // Caso geral: deriva da saturação da estação de origem
  if (sat >= HIGH_THRESHOLD) return 'high';
  if (sat >= MED_THRESHOLD) return 'medium';
  return 'low';
}
```

### Exemplo prático

- Cozinha com 8 pedidos atrasados, 2 cozinheiros → `saturation ≈ 5` → **todos os chamados `pronto-cozinha` viram `high`**, com badge vermelho pulsante. Garçons priorizam servir.
- Salão com 6 mesas chamando ao mesmo tempo, 2 garçons → `saturation ≈ 4` → **chamados `chamou-garcom` ganham prioridade alta** sobre os de cozinha. Sistema empurra garçons para o salão.
- Bar tranquilo, cozinha tranquila, 1 cliente pediu mais bebida → `priority: 'low'`. Sem badge, fica no final da lista.

### O que o app do garçom mostra para cada nível

| Priority | Visual no card de chamado                    | Visual no detalhe do chamado                                         |
| -------- | -------------------------------------------- | -------------------------------------------------------------------- |
| `high`   | borda vermelha + dot pulsando + posição topo | badge **"Prioridade alta"** branco/vermelho com dot pulsante no hero |
| `medium` | borda âmbar                                  | sem badge, hero normal                                               |
| `low`    | borda neutra                                 | sem badge, hero normal                                               |

> Quando vários chamados estão `high`, o backend ainda ordena por: 1) `vip` 2) `alergia` 3) `elapsedMin` desc 4) tipo (`pronto-cozinha` > `pediu-conta` > `chamou-garcom`).

### Eventos do backend que reavaliam prioridade

```
station_load_changed   — alguma estação subiu ou desceu de saturação
call_created           — novo chamado entrou
call_resolved          — chamado fechado, recalcula fila
staff_clock_in / out   — funcionário entrou ou saiu, muda staffCount
```

O front deve reescutar e re-renderizar — **não calcular prioridade no cliente**. O cliente só lê `call.priority` que vem do backend.

### Distribuição entre garçons

Além de priorizar, o backend escolhe **qual garçom** recebe o push:

1. Garçom designado da mesa (se houver atribuição prévia)
2. Senão, garçom mais próximo (zonas) com menor carga atual
3. Fallback: broadcast para todos do turno após 30s sem aceite

Quando o garçom toca **"A caminho"**, o sistema marca `acceptedBy` e remove o chamado da fila dos outros.

---

## Telas — visão geral

> Todas as telas são preservadas no canvas (`app-garcom.html`). Cada uma tem ID
> de seção e artboards iOS + Android. A ordem abaixo segue o **fluxo real** que
> um garçom faz no turno — login → ver mesas → entrar na mesa → tirar pedido
> → entregar → fechar turno.

### 1. Login (`ScreenLogin`) · seção `login`

- Identificação por **CPF + senha**
- "Manter conectado" + "Esqueci a senha"
- 3 variantes no canvas: padrão, primeiro acesso (senha provisória do gerente), senha incorreta (erro inline + contador de tentativas)
- Biometria opcional após o primeiro login (Face ID / impressão digital)

### 2. Recuperação de senha · seção `forgot`

- `ScreenForgotPassword` — escolhe canal (SMS · e-mail · WhatsApp) com contatos mascarados
- Código 6 dígitos com timer de reenvio (10 min)
- `ScreenSetNewPassword` — nova senha com barra de força + checklist de requisitos + alerta de logout em outros dispositivos

### 3. Home / Minhas mesas · seção `home`

**Variação única (Grade).** Lista por prioridade e Mapa do salão saíram no V3 (2026-05) — não pagaram a complexidade do toggle. `ScreenHomeGrid` é a entrada do garçom no turno.

- Cards em 2 colunas com nº da mesa (grande), status (pill), tempo aberta, valor parcial.
- Banner superior em `dangerBg` com contagem de chamados ativos do salão.
- Mesa livre fica esmaecida (`opacity: 0.5`).
- Mesa nova pulsa o border (`gAlertPulse`).

**Entradas pra mesa (3 portas):** ver fluxograma da seção "Fluxo do garçom" abaixo. Aba **Novo** da bottom nav é a entrada principal — V4 (2026-05): tap abre `ScreenWaiterNewEntry` (chooser de QR/número), não mais o scanner direto. `ScreenHomeGrid` aceita prop `fab` que liga um FAB flutuante (V4: também aponta pro chooser, mesma rota da aba Novo).

### 4. Nova interação (`ScreenWaiterNewEntry`) ★ V4 ★ · seção `garcom-flow`

**Chooser de 2 caminhos · entrada da aba Novo.** Antes a aba ia direto pro scanner; agora abre essa tela intermediária pra que o garçom decida entre escanear ou pegar a mesa pelo número.

- Header minimal: X discreto à esquerda + título mono caps tiny `NOVA INTERAÇÃO` no centro
- Hero centralizado: "Como vai começar?" (Inter 24/800) + sub "Toda nova ação na mesa começa lendo o QR ou inserindo o número."
- 2 cards-botão grandes stacked (gap 12px):
  - **Card 1 · Escanear QR da mesa** (primário · ink filled · texto branco · `Icon.qr` 40px à esquerda · arrow direita) → abre `ScreenWaiterScanQr` modal sobre essa tela
  - **Card 2 · Pegar mesa pelo número** (secundário · `surface` outline · keypad SVG 40px) → abre `ScreenWaiterTablePicker` direto (sem passar pelo scanner)
- Footer discreto: link sublinhado mono caps tiny `O QR DA MESA TÁ ILEGÍVEL? CONTACTAR GERENTE` — escape route, não CTA
- Por que: pra mesas que o garçom JÁ atende, escanear é desnecessário (basta o número). O chooser custa 1s de cognição mas elimina ~30% das vezes que o garçom abria o scanner pra usar "Inserir manualmente"

### 5. Escanear QR da mesa (`ScreenWaiterScanQr`) · seção `garcom-flow`

**1ª opção do chooser.** Toda nova ação (lançar pedido, abrir conta, conferir pagamento) que precisa do QR fixo gravado a laser na mesa cai aqui.

- Câmera fullscreen (fundo preto · não respeita tema escuro/claro), viewfinder com 4 cantos brancos e linha de scan animada
- Instrução curta: _"Posicione o QR code da mesa dentro da moldura para começar o atendimento."_
- V4 (2026-05): "Inserir manualmente" foi reduzido a TEXT LINK discreto sublinhado (não mais pill full-width) — quem chega aqui já fez a escolha de escanear no chooser; esse fallback é só pra emergência (QR ilegível, câmera com problema). Eyebrow mono caps tiny acima: "QR ILEGÍVEL?"

### 6. Escolher mesa manualmente (`ScreenWaiterTablePicker`) · seção `garcom-flow`

**2ª opção do chooser** (V4) — antes só era acessível pelo "Inserir manualmente" do scanner. Mostra mesas que o garçom já atende em destaque (cards pretos), mesas livres logo abaixo (cards claros). Cada linha mostra capacidade.

- Topbar: _Escolher mesa · CABRAL · TURNO 18H–02H_ + busca
- Seção **ATENDENDO ATUALMENTE** — mesas com `occupied > 0` que pertencem ao garçom logado. Cada linha: nº grande em pílula preta, label "X pessoas", contagem ocupação/capacidade ("3 ocupando · 1 livre")
- Seção **DISPONÍVEIS** — mesas livres no salão. Empty state se nenhuma livre
- Tap entra na mesa → abre `ScreenTableDetail`

### 7. Detalhe da mesa (`ScreenTableDetail`) · seção `mesa`

- **Card preto** com total da conta, valor por pessoa, e barra de progresso de pagamento
- Mostra quantas pessoas pagaram **via app mobile** (Pix · app, Crédito · app)
- **Histórico unificado em timeline** com 3 tipos de evento:
  - **Pedidos** (cozinha/bar) com itens e observações
  - **Chamados de garçom** (pediu conta, chamou garçom, pediu bebida)
  - **Pagamentos** (quem pagou, valor, método, status pago/processando)
- **Sem ações de adicionar/dividir/fechar a conta** — esta tela é leitura
- Pagamentos vêm da integração com o app do cliente (mesmo restaurante)
- Menu **3 pontinhos** (`MoreSheet`): Imprimir conta · Transferir mesa · Reportar problema

### 8. Detalhe do chamado (`ScreenCallDetail`) · seção `chamado`

Tela única que se adapta ao tipo de chamado via prop `type`. Cor do hero comunica a tonalidade:

| Tipo             | Hero              | Hint principal                                                                          |
| ---------------- | ----------------- | --------------------------------------------------------------------------------------- |
| `pediu-conta`    | azul (info)       | _"Lembre-se de levar a maquininha de cartão"_ (banner amarelo destacado)                |
| `chamou-garcom`  | vermelho (danger) | "Cliente acionou o botão. Sem motivo informado."                                        |
| `pronto-cozinha` | verde (success)   | "Bandeja na bancada de retirada." → CTA "Vou servir" abre `ScreenWaiterDeliveryConfirm` |

- Badge **"Prioridade alta"** branco/vermelho com dot pulsante quando `priority === 'high'` (ver seção ⭐)
- Botões: **A caminho** / **Vou servir** (primary) + **Voltar** (secondary)
- Lista outros chamados ativos no salão para contexto
- Menu **3 pontinhos** (`MoreSheet`): Repassar para colega · Avisar gerente · Resolver sem ir lá

### 9. Confirmar entrega (`ScreenWaiterDeliveryConfirm`) · seção `garcom-flow`

**Handshake final do ciclo de pedido.** Garçom retira a bandeja pronta da cozinha (chamado `pronto-cozinha`), leva pra mesa e usa esta tela na presença do cliente para validar que veio tudo certo.

- Hero verde grande: _"Pedido entregue · Mesa 12 · há 32 minutos"_
- Subtexto: _"Confirme com os seus clientes se está tudo certo antes de marcar como entregue."_
- Lista de itens da bandeja com quantidade em pílula + nome + observação ("sem cogumelos")
- **Lembrete amarelo** com `!`: _"Se o cliente apontar item errado ou faltando, toque Cancelar e abra chamado para a cozinha antes de sair da mesa."_
- Rodapé fixo com 2 ações:
  - **Cancelar** (secundário · 1/3) → volta sem mudar status
  - **Confirmar entrega** (primário · 2/3 · preto) → marca pedido como `servido` no KDS + remove chamado da fila

### 10. Pedido manual — 3 abordagens · seção `pedido`

- **Quick** (`ScreenOrderQuick`) — grade de chips do cardápio rápido + comanda em sheet (snap default ou full)
- **Search** (`ScreenOrderSearch`) — busca + lista estilo POS
- **Item detalhado** (`ScreenOrderItem`) — modificadores, observações livres

### 11. Histórico do turno (`ScreenShift`) · seção `extras`

- Resumo do que aconteceu no turno: nº de mesas, valor médio, gorjetas, atendimentos
- Botão de fechar turno (handoff para o gerente)

### 12. Perfil (`ScreenProfile`) · seção `extras`

- Dados pessoais, troca de senha, configurações de notificação, sair

### 13. Push notifications · seção `push`

- Lockscreen iOS + Android com 4 tipos: chamou garçom, pediu conta, pronto cozinha, pronto bar
- 3 cenários: pilha completa (multi-stack), urgente isolado, único
- Texto curto, ação rápida (deslizar para abrir)

---

## Fluxo do garçom — do login ao pedido entregue

```
                            Login
                              ↓
                    Home · Minhas mesas (Grade)
                              ↓
   ┌──────────────────────────┼──────────────────────────┐
   │ toque direto no card     │ aba "Novo" do bottom nav │
   │ (mesa que já atende)     │ (ou FAB opcional)         │
   ▼                          ▼
   detalhe da mesa     ScreenWaiterNewEntry ★ V4 ★
   (leitura)           (chooser de 2 caminhos)
                              ↓
                    ┌─────────┴─────────┐
                    ▼                   ▼
              Escanear QR        Pegar mesa pelo nº
              (Card 1 ink)       (Card 2 outline)
                    ↓                   ↓
              ScanQr → mesa     TablePicker → mesa
                    ↘                  ↙
                     detalhe da mesa
                              ↓ (chamado entrou)
                       Detalhe do chamado
                              ↓
   ┌──────────┬──────────────┬─────────────┬───────────┐
   │          │              │             │           │
 chamou   pediu-conta   pronto-cozinha   pronto-bar    │
   │          │              │             │           │
   ▼          ▼              ▼             ▼           │
ir na mesa  levar        Vou servir →   servir         │
            maquininha        ↓                        │
                       Confirmar entrega               │
                              ↓                        │
                          servido (KDS)                │
```

**3 portas de entrada na mesa (V4):**

1. **Toque direto no card da Home** — mesa que o garçom já atende (`ScreenHomeGrid`).
2. **Aba Novo (bottom nav · ícone QR viewfinder)** — entrada principal · V4: tap abre `ScreenWaiterNewEntry` (chooser) em modal fullscreen sobre a aba ativa. De lá:
   - **Escanear QR** (1ª opção · primário ink filled) → abre `ScreenWaiterScanQr`
   - **Pegar mesa pelo número** (2ª opção · outline) → abre `ScreenWaiterTablePicker` direto
3. **FAB opcional na `ScreenHomeGrid`** (prop `fab`) — abre o mesmo chooser. Atalho secundário pra quem não usa a aba Novo.

Fallback raro: text link "Inserir número da mesa" no rodapé do scanner (V4 · reduzido a link sublinhado discreto · não mais pill full-width) — pra emergência quando o QR está ilegível ou a câmera tem problema. Quem chega no scanner já fez a escolha "Escanear QR" no chooser; esse fallback é só pra não travar o garçom em campo.

**2 fluxos de saída do chamado pronto:**

1. Servir comida → `ScreenWaiterDeliveryConfirm` → cliente valida → `servido`
2. Bebida (sem hand-off de validação) → marca direto como `servido`

---

## Modelo de dados — chamados (`Call`)

```ts
type CallType =
  | 'chamou-garcom' // cliente pediu atendimento genérico
  | 'pediu-conta' // cliente quer fechar a conta
  | 'pronto-cozinha' // cozinha avisou que tem prato pronto
  | 'pronto-bar' // bar avisou que tem drink pronto
  | 'mais-bebida'; // cliente pediu mais bebida pelo cardápio digital

type Priority = 'high' | 'medium' | 'low';

type Call = {
  id: string;
  type: CallType;
  table: number;
  partySize: number;
  createdAt: string; // ISO
  elapsedMin: number; // calculado no backend
  priority: Priority; // ⭐ derivado da saturação — ver seção acima
  sourceStation: 'cozinha' | 'bar' | 'salao';
  acceptedBy: string | null; // userId do garçom que tocou "A caminho"
  flags?: ('vip' | 'alergia' | 'reincidente')[];
  context?: {
    billAmount?: number; // para 'pediu-conta'
    items?: { n: string; q: number }[]; // para 'pronto-cozinha/bar'
    note?: string; // texto livre do cliente
  };
};
```

---

## Modelo de dados — mesa (`Table`)

```ts
type Payment = {
  id: string;
  who: string; // nome do cliente que pagou (do app mobile)
  amount: number;
  method: 'pix-app' | 'credit-app' | 'debit-app' | 'cash' | 'card-pos';
  when: string; // ISO
  status: 'pago' | 'processando' | 'falhou';
};

type Order = {
  id: string; // ex: '#0142'
  station: 'cozinha' | 'bar';
  status: 'novo' | 'preparando' | 'pronto' | 'servido' | 'atrasado';
  when: string;
  items: { q: number; n: string; note: string | null }[];
};

type Table = {
  number: number;
  partySize: number;
  openedAt: string;
  totalAmount: number; // soma da comanda
  paidAmount: number; // soma de payments com status === 'pago'
  payments: Payment[]; // todos, inclusive 'processando'
  orders: Order[];
  calls: Call[]; // chamados gerados por essa mesa
  assignedWaiter?: string;
};

// Histórico unificado para a tela de detalhe da mesa
function timelineFor(table: Table): TimelineEvent[] {
  return [
    ...table.orders.map((o) => ({ kind: 'order', when: o.when, ...o })),
    ...table.calls.map((c) => ({ kind: 'call', when: c.createdAt, ...c })),
    ...table.payments.map((p) => ({ kind: 'payment', when: p.when, ...p })),
  ].sort((a, b) => b.when.localeCompare(a.when)); // mais recente primeiro
}
```

---

## Realtime — sockets

```js
const ws = new WebSocket(`wss://api.restaurante.com/waiter/${userId}`);

ws.onmessage = (e) => {
  const ev = JSON.parse(e.data);
  switch (ev.type) {
    case 'call_assigned': // chamado direcionado a este garçom
      showPushNotification(ev.call);
      addToCallList(ev.call);
      break;
    case 'call_priority_changed': // backend recalculou prioridade
      updateCallPriority(ev.callId, ev.priority);
      break;
    case 'call_taken_by_other': // outro garçom tocou "A caminho" antes
      removeCall(ev.callId);
      break;
    case 'payment_received': // cliente pagou pelo app
      updateTablePayments(ev.tableId, ev.payment);
      break;
    case 'order_status_changed': // KDS marcou pronto, etc
      updateOrder(ev.tableId, ev.order);
      break;
    case 'table_assigned': // gerente atribuiu nova mesa
      addTable(ev.table);
      break;
  }
};
```

---

## Endpoints sugeridos

```
# Login + sessão
POST /auth/login                  — { cpf, password } → { token, waiter }
POST /auth/forgot                 — { cpf } → mascarado: { channels: ['sms','email','whatsapp'], hint }
POST /auth/forgot/send            — { cpf, channel } → envia código de 6 dígitos
POST /auth/forgot/verify          — { cpf, code } → token temporário de reset
POST /auth/reset                  — { resetToken, newPassword }

# Home / mesas / chamados
GET  /waiter/me/tables            — mesas atribuídas no turno (alimenta Home grade/lista/mapa)
GET  /waiter/me/calls             — chamados ativos (já priorizados — ver seção ⭐)
POST /waiter/me/calls/:id/accept  — toca "A caminho", marca acceptedBy
POST /waiter/me/calls/:id/reject  — sinaliza ao backend que não pode atender (re-rotear)
POST /waiter/me/calls/:id/forward — repassa chamado pra colega (do MoreSheet)

# Entrada na mesa (scan QR / picker manual)
POST /waiter/me/table/scan        — { qrPayload, signature } → resolve table.number e abre/recupera sessão; valida HMAC fixo da mesa
GET  /waiter/me/tables/available  — lista mesas livres do salão (alimenta seção DISPONÍVEIS do picker)
POST /waiter/me/tables/:n/enter   — registra que o garçom abriu detalhe da mesa (analytics + lock leve para evitar conflito)

# Detalhe da mesa
GET  /tables/:n                   — detalhe completo (orders + calls + payments)
POST /tables/:n/orders            — lança pedido manual

# Confirmar entrega
POST /orders/:id/served           — { confirmedBy, atTable: true } → marca pedido como 'servido' no KDS, fecha chamado pronto-cozinha; idempotente

# Turno
GET  /waiter/me/shift              — resumo do turno atual
POST /waiter/me/shift/close        — fecha turno
```

### Sobre o QR fixo + scan

O QR gravado a laser na mesa NÃO tem timestamp — é permanente e sua assinatura HMAC é fixa por mesa (`tables.qrHmacSecret`). Detalhes da arquitetura, threat model e camadas de proteção (rate limit + risk scoring + aprovação do garçom no 1º pedido) estão na seção **"QR fixo + 3 camadas de proteção"** mais abaixo. Para o app do garçom, isso significa:

- O scan **sempre** valida a HMAC contra o secret da mesa antes de continuar
- Se o garçom escanear um QR de outra mesa por engano, `POST /waiter/me/table/scan` retorna `409 wrong-table` com a label da mesa real → app pergunta "Você quis dizer Mesa 14?"
- Se o QR estiver corrompido ou ilegível, `Inserir manualmente` (`ScreenWaiterTablePicker`) é o caminho garantido

---

## Design tokens (referência)

```js
const C = {
  bg: '#ffffff', // fundo claro / dark: #0a0a0a
  ink: '#0a0a0a', // texto principal
  mute: '#6b6b6b', // texto secundário
  borderSoft: '#e5e5e5', // bordas
  borderFaint: '#f0efeb', // separadores
  success: '#2f7d4f', // pago / pronto
  successBg: '#f0f7f2',
  warn: '#d4a017', // processando / médio
  danger: '#c43a3a', // prioridade alta / atrasado
  info: '#3a6ec4', // bebida / aviso
};
```

- Fonte: **Inter** 400/500/600/700/800
- Bordas: 1.5px `#0a0a0a` ou `#e5e5e5`
- Radius: 12–16px em cards, 100px em pills
- Animação `gPulse`: 1.2s ease-in-out infinite (badge de prioridade alta)
- Tema escuro: dark mode espelha tudo invertendo bg/ink

---

## Acessibilidade

- Hit areas mínimas de 44×44px (botões, FAB, chips)
- Contraste mínimo 4.5:1 em texto sobre cor de status
- Badge "Prioridade alta" também tem **dot pulsando** + cor de borda — não depende só da cor (daltonismo)
- Push notifications devem incluir vibração + som curto (se permitido pelo SO)

---

## Feature specs (pra implementação · Claude Code)

Algumas features desenhadas no canvas precisam de spec dedicado de backend / lógica de negócio antes de virarem código. Esses specs ficam em `docs/features/` no repo principal:

- [`cliente-vip.md`](../../../../produto/funcionalidades/cliente-vip.md) — Marcação de sessão como VIP · entry point: MoreSheet do `ScreenManagerTableMenu` · impacta `priorityOf()` no balanceador de chamados.
- [`zone-pause.md`](../../docs/features/zone-pause.md) — Pausa de pedidos novos só nas mesas atendidas por um waiter específico · entry point: `ScreenManagerStatDetail` variante `sobrecarga` · ação "Pausar mesas do Caleb por 5 min" · ALTERNATIVO via chip do `MContactStaffSheet` que vira chip-action bubble na thread (V10) · backend usa tabela `zone_pauses` + WebSocket events `zone_pause.started` / `zone_pause.released` / `zone_pause.expiring_soon`. ★ V10 · seção nova "Pedido manual lançado pelo garçom durante a pausa" — garçom NÃO é barrado de lançar pedido manual; pedido entra no mesmo congelador que pedidos do cardápio digital · toast discreto avisa que entra no fluxo quando a pausa encerrar.
- [`customer-host-model.md`](../../docs/features/customer-host-model.md) — ★ V15 · ROUND 8a ★ Princípio arquitetural reusado em 3 flows (qr-issue · late-arrival · table-merge). A primeira pessoa que escaneia o QR e abre comanda vira `host` da sessão (`table_sessions.host_customer_id`) e tem privilégio de aprovar decisões SOCIAIS da mesa antes do staff. Cascata 60s/etapa via tabela compartilhada `escalation_chains` (type · current_step · steps jsonb) · eventos WS `escalation.{created,approved,rejected,escalated_to_staff,timeout}`. **QR ilegível pula a etapa 1** porque é problema operacional (sem decisão social) · cascata vira manager → outro manager → dono → pendência fria. Telas do staff side em [`garcom-qr-issue.jsx`](./garcom-qr-issue.jsx).

> Quando for implementar uma dessas, leia o spec primeiro — define schema, endpoints, eventos WS e edge cases. Não inferir do canvas — canvas só mostra UX, não o cálculo.

---

# 🧑‍💼 App do Gerente

O gerente usa o **mesmo app** do garçom (mesmo binário mobile, iOS + Android), com perfil `role: 'manager'`. Em horário de pico ele **assume mesas igual a um garçom** — não há separação de UI para isso. As telas extras de gerência aparecem como **rotas adicionais** quando o backend devolve `role: 'manager'`.

## Bottom nav · 5 abas (refatoração 2026-05)

```
┌─────────┬───────────┬─────────┬────────────┬─────┐
│ Painel  │ Operação  │ Equipe  │ Financeiro │ Eu  │
│   📊    │    🔥     │   👤    │     💰     │  ⚙  │
└─────────┴───────────┴─────────┴────────────┴─────┘
```

| Aba               | Abre                             | Sub-tabs / sub-telas                                                                                                |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Painel**        | `ScreenManagerHomeA`             | — (orientado a comando · V4: 6 blocos · Hero · 2 ferramentas · **Em curso ★ NOVO ★** · alertas · equipe · reservas) |
| **Operação**      | `ScreenManagerOps`               | sub-tabs `alerts` (default) · `map` · `funnel` + barra "Agir agora" fixa                                            |
| **Equipe** ★ V6 ★ | `ScreenManagerStaff` (unificada) | sub-telas: StaffDetail · StaffForm · ShiftEditor (placeholder V6)                                                   |
| **Financeiro**    | `ScreenManagerFinance`           | — (4 KPIs com help · top categorias · métodos · ranking)                                                            |
| **Eu**            | `ScreenManagerSettings`          | — (perfil + turno + conta + estabelecimento + sair)                                                                 |

**Mudanças desde a refatoração 2026-05:**

- "Eu" virou **5ª aba normal** (era sub-tela acessada tocando o nome no header).
- "Salão" e "Gargalos" foram **fundidos em "Operação"** com 3 sub-tabs.
- "Operação" carrega uma **barra "Agir agora"** fixa entre o conteúdo e a bottom nav, com **2 ferramentas-chave** (Cozinha · Pausa). Cortesia saiu da barra (decisão deliberada · não é mais "ferramenta rápida"). Acesso à cortesia: (1) MoreSheet do alerta · 3 pontinhos → "Mandar cortesia"; (2) chip "Quer uma cortesia pela espera?" dentro da sheet "Contactar cliente"; (3) `Eu › Cortesias` (histórico + criar manualmente).
- **V4 (2026-05) · Painel reorganizado em 6 blocos** com nova seção "Em curso" pra operações async aguardando review. Cortesia também SAIU do Painel (era o 3º card de ferramenta rápida) — vai pro menu da mesa no Prompt 5. Ferramentas rápidas do Painel ficam Cozinha · Pausa, idênticas à barra "Agir agora" da Operação. O card Pausa ganha indicador inline (countdown mono + bolinha mostarda) quando há pausa ativa.

## Mapa de entrada das telas-ferramenta

```
        Painel · Ferramentas rápidas (topo · 2 cards · V4)
           ┌──────────┬─────────┐
           ▼          ▼
       Cozinha    Pausa  ★ pausa ativa: countdown inline + bolinha mostarda
   (Reorder)  (OrdersPause)
           ▲          ▲
           │          │
        Operação · barra "Agir agora" (rodapé)
        (mesmas 2 ferramentas, sempre acessíveis)

   Painel · seção "Em curso" ★ V4 ★ (cards persistentes de ops async)
        ↳ tap no card pause-active     → OrdersPause (estado preservado)
        ↳ tap no card kitchen-reorder  → Reorder (estado preservado)
        ↳ tap no card contact-client   → MContactClientSheet sent
        ↳ tap no card courtesy         → Compensate sent
        ↳ tap em "Ver detalhes" no card resolved-summary → OrdersPauseSummary

   Operação · alerta · ação default "Contactar cliente" → MContactClientSheet
        ↳ chip "Quer uma cortesia pela espera?" → Compensate
   Operação · alerta "kitchen-slow" → ação inline "Avisar cozinha" → Reorder
   Operação · alerta "kitchen-queue" → ação inline "Pausar pedidos" → OrdersPause

   ★ V5 ★  TableMenu (entrada principal de qualquer mesa específica)
   ─────────────────────────────────────────────────────────────────
   Operação · Mapa · toque em qualquer mesa → ScreenManagerTableMenu
   Equipe · "Ver mesas" do garçom · toque em mesa → ScreenManagerTableMenu
   Painel · alerta que referencia mesa · toque "Mesa N" → ScreenManagerTableMenu
   ScreenHostHome · Mapa · toque em mesa ocupada/liberada/alerta
       → ScreenManagerTableMenu (role="host")

   ScreenManagerTableMenu · ações (manager):
        ↳ "Mandar cortesia"      → Compensate (preselectedTable=N)
        ↳ "Contactar cliente"    → MContactClientSheet
        ↳ "Ver timeline da mesa" → Timeline da mesa
        ↳ "Imprimir conta"       → ação em-tela
        ↳ "Transferir mesa"      → ScreenHostTableSwap
        ↳ "Fechar mesa"          → CloseTableModal (destrutiva)
        ↳ MoreSheet              → Reportar problema · VIP · Auditoria
   ScreenManagerTableMenu · ações (host):
        ↳ "Trocar pra outra mesa"  → ScreenHostTableSwap
        ↳ "Avisar gerente"          → mensagem in-app
        ↳ "Cancelar liberação"      → confirma + volta mesa pra livre

   Cortesia · 3 caminhos legítimos (V5 consolidado):
        (1) TableMenu · ação "Mandar cortesia" → Compensate (com preselected)
        (2) MContactClientSheet · chip → Compensate (com contexto da mesa)
        (3) Eu > Cortesias > Nova cortesia → Compensate (cold path · escolhe mesa)

   ★ V8 ★  Equipe — Editar turnos + KPI detail
   ─────────────────────────────────────────────────
   Equipe · "Turnos de hoje" → "Editar turnos →" → ScreenManagerShiftEditor
        ↳ 3 cards expandíveis · default NOITE expandido
        ↳ 3-pontinhos do membro → MoreSheet com 3 ações
            "Mover para outro turno"  → modal move (radios)
            "Autorizar hora extra"    → modal overtime (chips de duração)
            "Remover do turno"        → modal remove (destrutivo)
        ↳ "+ Adicionar funcionário"   → modal add (lista disponível)
        ↳ Topbar "+ Novo turno"       → modal add (mesmo target)
        ↳ Footer "Duplicar pra próxima semana" → ação em-tela
        ↳ Footer "Salvar alterações" (state-aware) → commit explícito

   Equipe · KPI tap (★ V8 ★ tooltip → tela de detalhe):
        ↳ Tap curto em `?` do KPI EM CAMPO   → mgr-stat-detail-em-campo
        ↳ Tap curto em `?` do KPI SOBRECARGA  → mgr-stat-detail-sobrecarga
        ↳ Tap curto em `?` do KPI CARGA MÉDIA → mgr-stat-detail-carga-media
        ↳ Long-press / hover → tooltip mantém comportamento V7
        ↳ Variante C · mini-pills mono caps são tap-targets também
        ↳ Tela de detalhe roda template ScreenManagerStatDetail
            kpiKind=em-campo    · ações Avisar / Folga retro / Substituir
            kpiKind=sobrecarga  · ações Aplicar sugestão / Realocar / Msg / Pausar praça
            kpiKind=carga-media · ações condicionais (só em above-target)
```

> **Removido na refatoração V3:** `StaffPause` (pausa visível por garçom), `Security` + `SecurityAudit` (mora em `prototypes/seguranca-qr/`).
> **Removido em V4:** entrada Painel · "Cortesia" (atalho rápido) — migrou pro Menu da Mesa em V5.
> **Removido em V5:** entrada Operação · alerta · MoreSheet → "Mandar cortesia" — Cortesia agora só pelos 3 caminhos do diagrama acima. OpsAlertsV2Ref (mock pré-compactação V2) também removido.

## Design language unificado (top-level screens)

As 4 primeiras telas (Painel · Operação · Equipe · Financeiro) compartilham `MAppHeader` em `garcom-screens-c.jsx`:

- **MTopBar** com título da seção + ícone de sino (alertas) à direita. **NÃO tem botão de voltar** — top-level screens são raízes.
- **Saudação personalizada**: "Boa noite," + nome ("Renata Albuquerque") em fonte grande.
- **Indicador AO VIVO** com bolinha verde pulsando: "AO VIVO · TURNO DA NOITE · 19:42".
- Logo abaixo, **grade de KPIs** (`MStat` com `help` text em linguagem comum — gerente não-técnico precisa entender sem aula).

A 5ª tela (Eu) tem header próprio focado no perfil — avatar 76px + nome + role/turno + bolinha "em turno desde 17:02".

**Sub-screens** seguem padrão diferente — `MTopBar` com **botão de voltar** + título focado na ação. Cada sub-tela mantém a bottom nav com a aba pai ativa pra preservar contexto.

## Tabela de telas do gerente

| Tela                                       | Componente                                                | Tipo                                                  | ID seção (canvas)     | Descrição funcional                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Variantes                                                                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Painel** ★ V4 ★                          | `ScreenManagerHomeA`                                      | 1ª aba                                                | `mgr-home`            | 6 blocos: Hero (saudação + AO VIVO) · 2 Ferramentas rápidas (Cozinha/Pausa · pausa ganha countdown inline) · **Em curso** (cards de ops async com border-left tematica · oculta quando 0) · Alertas (3 compactos) · Equipe em turno · Próximas reservas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `inProgress=[]`                                                                                                                                                                          |
| **Operação**                               | `ScreenManagerOps`                                        | 2ª aba                                                | `mgr-ops`             | Sub-tabs Alertas (default · KPIs Críticos/Atenção + lista com ações inline) · Mapa (grid 4×N de mesas · ★ V5 ★ tap em qualquer mesa abre Menu da Mesa · não mais Timeline direto) · Funil (etapas com barras + sugestão IA) · Barra "Agir agora" fixa. V5 cleanup: comparativos ANTES/DEPOIS/VARIAÇÃO removidos (a versão canônica é o V3-bis)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `tab=alerts/map/funnel`                                                                                                                                                                  |
| **Equipe** ★ V6 ★                          | `ScreenManagerStaff`                                      | 3ª aba                                                | `mgr-staff`           | Tela unificada · 8 blocos: Hero (saudação + AO VIVO) · 3 KPIs ricos (Em campo · Sobrecarga · **Carga média ★ Q resolvido ★** com sub "média entre quem está em campo") · banner IA com personalidade ("Caleb está com 7 mesas...") oculto quando vazio · busca + 2 rows de chips (status + função) · lista de funcionários unificada (header simples + 3 métricas em mono + ações pills 36px contextuais ao status) · turnos do dia compactos com expand inline (★ S resolvido ★) · próximos eventos · CTA fixa "+ Adicionar". Funde o que era StaffList + ShiftBoard + ShiftSchedule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `bannerHidden`, `expandedShift`, `searchEmptyState`                                                                                                                                      |
| **Financeiro**                             | `ScreenManagerFinance`                                    | 4ª aba                                                | `mgr-finance`         | Hero receita + tendência · mini-chart por hora · 4 KPIs com help · top 3 categorias com barras · métodos de pagamento (App vs Maquininha) · ranking 3 garçons · **sem exportar**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                        |
| **Eu**                                     | `ScreenManagerSettings`                                   | 5ª aba                                                | `mgr-settings`        | Hero (avatar + nome + turno) · KPI vendas no SEU turno · Operação (Encerrar turno destrutivo · Histórico · Equipe · ★ V5 ★ Cortesias) · Conta · Estabelecimento (só donos) · Sair                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `role=manager/owner`                                                                                                                                                                     |
| Desempenho individual                      | `ScreenManagerStaffDetail`                                | sub (Equipe)                                          | `mgr-perf`            | Performance de 1 garçom · 4 KPIs com help · gráfico 7 dias · comparativo equipe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                                                        |
| **Editar turnos** ★ V8 ★                   | `ScreenManagerShiftEditor`                                | sub (Equipe)                                          | `mgr-shift-editor`    | Tela funcional acessada por "Editar turnos →" da seção "Turnos de hoje" da Equipe. 3 cards expandíveis (Manhã · Tarde · Noite — atual default expandido) com header mono caps + sub de função-count. Cada membro tem 3-pontinhos → MoreSheet com 3 ações ("Mover para outro turno", "Autorizar hora extra", "Remover do turno" destrutiva). Linha "+ Adicionar funcionário" no fim do card. Topbar tem CTA "+ Novo turno". Footer fixo: "Duplicar pra próxima semana" outline + "Salvar alterações" filled (state-aware · só visível com mudanças pendentes). Auto-save indicator mostarda discreto no topbar. Substitui o placeholder V6/V7                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `defaultExpanded='manha'/'tarde'/'noite'/'all'`, `emptyShift`, `modal='more'/'move'/'overtime'/'remove'/'add'`, `hasChanges`                                                             |
| **KPI detail** ★ V8+V9 ★                   | `ScreenManagerStatDetail`                                 | sub (Equipe + Operação)                               | `mgr-stat-detail`     | Tela template aberta por tap curto nos `?` dos 7 KPIs (3 da Equipe + 4 da Operação) — long-press mantém o tooltip. Estrutura comum: Hero (valor grande + sub colorido + contexto + timestamp mono) · "Quem/Onde" · "O que fazer agora" (ações pills) · "Como esse número é calculado" (fórmula curta). **7 variantes** via prop `kpiKind`: **(Equipe · V8)** em-campo · sobrecarga · carga-media. **(Operação · V9)** criticos (lista de alertas críticos · 2 ações inline · macro "Resolver todos em sequência" + push genérico) · atencao (alertas a 80% da meta · estado vazio "ATÉ AGORA NADA EM ATENÇÃO" se 0) · mesas-ativas (mesas agrupadas por seção do salão · tap → Menu da Mesa · botão "Ver no Mapa") · em-alerta (mesas críticas/lentas · tap → Menu da Mesa · realocar críticas + mensagem direta multi-target). ★ V9 ★ — copy "Pausar pedidos novos da praça dele" reescrito como "Pausar mesas do Caleb por 5 min" + sub explicando · `pauseConfirm` mostra modal vaul de confirmação com chip-row de duração 5/10/15/30 min. Back preserva sub-tab origem (Equipe vs Operação). | `kpiKind='em-campo'/'sobrecarga'/'carga-media'/'criticos'/'atencao'/'mesas-ativas'/'em-alerta'`, `state='default'/'within-target'/'above-target'/'below-target'/'empty'`, `pauseConfirm` |
| Form de funcionário                        | `ScreenManagerStaffForm`                                  | sub (Equipe)                                          | `mgr-staff`           | Cadastro/edição · gera senha provisória por SMS · pode desativar (não exclui)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `mode=create/edit`                                                                                                                                                                       |
| **Menu da Mesa** ★ V5 ★                    | `ScreenManagerTableMenu`                                  | sub (Operação · Equipe · Painel)                      | `mgr-table-menu`      | Tela cheia que abre ao tocar QUALQUER mesa específica. **Hero** (Mesa N + status pill + tagline mono caps) · **Atributos editáveis** (PESSOAS NA MESA com stepper + modal de capacidade excedida · OBSERVAÇÃO · CLIENTE) · **Ações** (6 linhas pra manager: Cortesia / Contactar / Timeline / Imprimir / Transferir / Fechar · 3 linhas pra host: Trocar / Avisar / Cancelar liberação) · MoreSheet (ações secundárias). Substitui o tap-direto-pra-Timeline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `role=manager/host`, `modal=capacity/observation/client/more/closeConfirm`, `state=normal/exceeded`, `partyOverride`                                                                     |
| Timeline da mesa                           | `ScreenManagerTableTimeline`                              | sub (ação do Menu da Mesa)                            | `mgr-table-timeline`  | HERO com tempo parado · ação sugerida em 3 passos · timeline real do pedido · chamados. ★ V5 ★ Antes era a tela default ao tocar uma mesa lenta · agora é uma das ações dentro do Menu da Mesa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                                                                                                                                                        |
| Lista de alertas                           | `ScreenManagerAlertsAll`                                  | sub (Operação)                                        | `mgr-alerts-all`      | KPIs Críticos/Atenção · 4 filtros chip · lista com 2 ações inline + dispensar · histórico do dia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                        |
| Reordenar cozinha                          | `ScreenManagerKitchenReorder`                             | ferramenta                                            | `mgr-kitchen-reorder` | 3 estados: select (escolher pedidos) → sent (aguardando) → accepted (cozinha aceitou + garçons avisados)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `state=select/sent/accepted`                                                                                                                                                             |
| Pausar pedidos                             | `ScreenManagerOrdersPause`                                | ferramenta                                            | `mgr-orders-pause`    | 2 estados: confirm (escolher 5/10/15/30 min) → active (countdown grande + stats em tempo real). V4: "Despausar agora" no footer dispara `resolved-summary` no Painel + abre `OrdersPauseSummary`. **Cliente não vê pausa** — ETA aumenta silenciosamente                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `state=confirm/active`                                                                                                                                                                   |
| Resumo pós-pausa ★ V4 ★                    | `ScreenManagerOrdersPauseSummary` (`MOpSummary` template) | post-mortem                                           | `mgr-pause-summary`   | Tela cheia aberta de "Ver detalhes" no card resolved-summary do Painel ou do push de retomada. Hero verde com janela (21:08-21:13) + 3 KPI tiles antes/depois (fila/saída/entraram) + timeline real dos eventos durante + sugestão IA de próximo passo + Voltar pro Painel. Template REUSÁVEL pra reorder/contact/courtesy em rounds futuros                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                                                                                        |
| Cortesia                                   | `ScreenManagerCompensateClient`                           | ferramenta                                            | `mgr-compensate`      | 3 estados: select (mesa + 4 tipos: dessert/drink/couvert/discount) → sent (aguardando cliente abrir no web-customer) → accepted (cliente aceitou · push pro garçom). ★ V5 ★ Aceita prop `preselectedTable={n}` quando vem do Menu da Mesa — mostra a mesa de origem com ring verde + badge "DO MENU" + hint banner. Migração de Cortesia consolidada: vive em (1) Menu da Mesa · ação primária; (2) MContactClientSheet · chip; (3) Eu > Cortesias · cold path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `state=select/sent/accepted`, `preselectedTable`                                                                                                                                         |
| **Cortesias** ★ V5 ★                       | `ScreenManagerCourtesies`                                 | sub (Eu > Operação)                                   | `mgr-courtesies`      | Tab segmentada: HISTÓRICO (3 mini-tiles Hoje/Aceitas/Pendentes + lista cronológica das cortesias enviadas com mesa/tipo/status pill aceita/pendente/recusada/gerente/timestamp/tempo de resposta) · NOVA CORTESIA (cold path: hero verde + 3 caminhos numerados + CTA "Abrir compositor de cortesia" → CompensateClient sem mesa pré-selecionada). Existe pra fechar a migração de Cortesia (saiu da MQuickActionsBar V3 e do Painel · Ferramentas rápidas V4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `tab=history/new`                                                                                                                                                                        |
| Sheet Contactar cliente                    | `MContactClientSheet`                                     | sheet (sobre Operação)                                | `mgr-contact-client`  | 4 estados: idle (4 sugestões + textarea + CTA disabled) → selected (chip selected + textarea pré-preenchida + CTA enabled) → sent (sheet shrinka · "Aguardando leitura..." pulse · ações Voltar/Reenviar). Sugestões via `POST /smart-suggestions` (pool determinístico + LLM fallback). Chip "Quer uma cortesia pela espera?" continua sendo entrada legítima de Cortesia a partir desse fluxo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `state=idle/selected/sent`, `andro`                                                                                                                                                      |
| **Sheet Mensagem direta pra staff** ★ V9 ★ | `MContactStaffSheet`                                      | sheet (sobre StatDetail · cards Equipe · StaffDetail) | `mgr-contact-staff`   | 2 estados: idle (4 sugestões staff-context "Como tá indo?" / "Vou te mandar reforço · 5 min" / "Pause os pedidos novos das suas mesas por 5 min" link pro zone-pause / "Foca nas mesas X e Y") + textarea · sent (preview ManagerBubble + "Aguardando leitura..." pulse mostarda · vira "Lido às 19:43" verde quando chega `manager.message.read` via WS). Round-trip espelhado: garçom recebe push manager-message → tap abre `ScreenStaffMessageDetail` → "Responder" volta como bubble invertido aqui                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `state=idle/sent`, `andro`, `target`                                                                                                                                                     |

**Removido na refatoração 2026-05:**

- ~~`ScreenManagerFloor`~~ — virou sub-tab "Mapa" dentro de `ScreenManagerOps`.
- ~~`ScreenManagerBottlenecks`~~ — renomeado pra `ScreenManagerOps` (3 sub-tabs).
- ~~`ScreenManagerHomeB`/`HomeC`~~ — opções 2 e 3 do Painel não escolhidas.

**Removido nesse round (decisão produto):**

- ~~`ScreenManagerStaffPause`~~ — pausa de garçom (telas + push de fim de pausa) saiu inteiramente. Ações "Pausar 5 min" / "Pausar" também sumiram do MoreSheet do funcionário e dos cards de Equipe. Coluna `staff_users.is_paused` no DB pode ficar — não roteamos UI nem endpoints públicos pra ela.
- ~~`ScreenManagerSecurity`~~ + ~~`ScreenManagerSecurityAudit`~~ — moveram pra `prototypes/seguranca-qr/` aguardando definição de produto sobre onde plugar.
- ~~Tipo `'message'`~~ em `ScreenManagerCompensateClient.types` — separação cortesia (freebie material) vs comunicação (canal `/staff/messages`).

**Removido em V6 (2026-05) · merge das 3 telas de Equipe:**

- ~~`ScreenManagerStaffList`~~ — funcionalidade migrou pra `ScreenManagerStaff` (tela top-level unificada).
- ~~`ScreenManagerShiftBoard`~~ — funcionalidade migrou pra `ScreenManagerStaff` (3 KPIs ricos · sugestão IA · cards com métricas inline + ações contextuais ao status).
- ~~`ScreenManagerShiftSchedule`~~ — timeline com swimlanes 12-24h substituída por lista compacta de turnos do dia (★ S resolvido ★) que vive como bloco da `ScreenManagerStaff`. Gerente sem cabeça pra timeline visual lê melhor uma lista expandable.
- ~~Sub-section `mgr-staff-tools`~~ no canvas (era contêiner das 2 sub-telas acima).
- ~~Helper `StaffRow`~~ exportado em screens-c.jsx — substituído pelo card unificado interno do `ScreenManagerStaff`.

> O gerente também acessa **todas** as telas do garçom (login, mesas, chamados, pedido manual, perfil) — basta o backend devolver o role correto e liberar as rotas.

---

## ⭐ Padrão arquitetural · Menu da Mesa (★ V5 · 2026-05 ★)

> **Princípio.** Tap em qualquer mesa específica vai pro **Menu da Mesa**, não pra tela de uma única ferramenta. A tela é um hub de ações sobre aquela mesa, dividido entre atributos editáveis e ações role-aware.

### Por que existe

Antes do V5, tap numa mesa lenta da Operação ia direto pra Timeline da mesa — diagnóstico, mas nada mais. Pra fazer outra coisa (cortesia, contactar, transferir, fechar), o gerente tinha que voltar e abrir a ferramenta separada e re-selecionar a mesa. Multiplica fricção numa operação onde tempo importa.

V5 inverte: **a mesa é o objeto principal**, as ferramentas viram ações dela. Menu da Mesa é o objeto que segura todas as operações que envolvem aquela mesa específica. Cortesia, Contactar, Timeline, Transferir, Fechar — todas saem daqui.

Resultado tangível: a partir do V5, **5 das 6 ações do gerente sobre uma mesa são acessíveis em 2 toques** (Mapa → mesa → ação). Antes era 3+ (Mapa → mesa → voltar → Painel/Operação → ferramenta → re-selecionar mesa).

### Componentes

**`ScreenManagerTableMenu`** — tela cheia em `garcom-screens-d.jsx`.

| Prop            | Valores                                                                                           | Uso                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `role`          | `'manager'` (default) \| `'host'`                                                                 | Define o conjunto de ações exibidas. Manager tem 6, host tem 3 (focado em estado da mesa, não financeiro).                         |
| `state`         | `'normal'` (default) \| `'exceeded'`                                                              | Visual da Linha 1 (PESSOAS NA MESA). Em `exceeded`, mostra "+1 EXCEDENTE" em mostarda no sub do label.                             |
| `partyOverride` | `number \| null`                                                                                  | Sobrescreve o party de exemplo (5 quando vem com `state="exceeded"`, 4 default).                                                   |
| `modal`         | `null` (default) \| `'capacity'` \| `'observation'` \| `'client'` \| `'more'` \| `'closeConfirm'` | Renderiza um vaul-style sheet sobre a tela atual. Vaul = drag handle no topo + 22px corner radius + backdrop 42% preto + blur 2px. |

**Modais embutidos** (todos no mesmo arquivo):

- `CapacityExceededModal` — confirma que juntaram cadeiras / expandiram a mesa. Visual de 5 cadeirinhas (4 ink + 1 mostarda dashed) + 2 CTAs stacked (Confirmar ink filled · Cancelar outline) + sub mono caps tiny "A COMANDA DA MESA ACEITA TODOS OS PEDIDOS DAS X PESSOAS NA MESMA CONTA".
- `TextEditModal` — genérico pra Observação (textarea multiline) e Cliente (input single-line). Cursor piscante visual + 2 CTAs (Cancelar outline · Salvar ink filled). Aceita `hint` opcional pro Cliente: "Salvo só nesta sessão · vira contato no DB com confirmação do cliente".
- `CloseTableModal` — destrutiva. Eyebrow vermelho "AÇÃO DESTRUTIVA" + sub explica "só faz isso depois que a conta foi paga" + CTA principal vermelha + Cancelar outline.

### UX notes · stepper de party-size

Caso de uso real que motivou: **mesa de 4 lugares vira mesa de 6 quando os clientes juntam cadeiras de outra mesa próxima**. Sistema não pode bloquear — precisa aceitar a comanda dos 6 sem fricção, mas confirmar que a intenção é real (não tap acidental).

Comportamento:

- `−` desabilita em party = 1 (mesa precisa de pelo menos 1 pessoa pra existir).
- `+` continua sempre habilitado, **incluindo quando excede capacidade**.
- Na primeira vez que `+` faz `party > seats`, dispara o `CapacityExceededModal`. Confirma → atualiza party + sub muda pra "MESA COMPORTA X · +N EXCEDENTE" em mostarda. Cancela → mantém party em `seats` e fecha o modal.
- Modal não aparece em incrementos posteriores (já confirmou intenção).
- Decremento de volta pra `party === seats` faz a sub voltar pra "MESA COMPORTA X" sem mostarda.

Mensagem do modal — **copy revisada**:

> **Mais pessoas que a capacidade da mesa**
>
> Mesa 14 comporta **4 lugares** · você está marcando **5 pessoas**. Confirma que juntaram cadeiras ou expandiram a mesa?
>
> [Sim · 5 pessoas na mesa 14] (ink filled)
> [Cancelar · manter em 4] (outline)
>
> A COMANDA DA MESA ACEITA TODOS OS PEDIDOS DAS 5 PESSOAS NA MESMA CONTA.

A escolha de palavras "juntaram cadeiras ou expandiram a mesa" é deliberada — fala a língua do salão (cliente real fez isso), não jargão técnico ("override capacity"). Sub mono caps tiny no rodapé tira a dúvida operacional ("vai entrar tudo na mesma conta?") sem precisar abrir help.

### Regras de role · entradas e ações permitidas

**Manager:**

- Entradas: Operação · Mapa (qualquer mesa ocupada) · Equipe · "Ver mesas" do garçom · Painel · alertas que referenciam mesa
- Ações primárias: Mandar cortesia · Contactar cliente · Ver timeline · Imprimir conta · Transferir mesa · Fechar mesa
- MoreSheet (3 pontinhos): Reportar problema com a mesa · Marcar como VIP nessa sessão · Ver auditoria

**Host (recepcionista):**

- Entradas: ScreenHostHome · Mapa (mesas ocupada / liberada / em alerta — **não** as livres, que vão pelo fluxo de Liberar mesa)
- Ações reduzidas: Trocar pra outra mesa · Avisar gerente · Cancelar liberação (mostarda)
- **NÃO vê:** Mandar cortesia · Imprimir conta · Fechar mesa · Ver timeline (essas pertencem ao gerente/garçom).
- Linha 1 (party size) **continua editável** pelo host — mesma lógica de stepper + capacity modal. Caso comum dele: família chegou em 5 mas a reserva era pra 4.

### Backend · o que precisa existir

```
GET    /tables/:n                         → estado completo da mesa (party, seats, observation, customer, status, ticket, openedAt)
PATCH  /tables/:n                         → { party?, observation?, customer? }
POST   /tables/:n/print-bill              → retorna print job ID
POST   /tables/:n/close                   → encerra sessão · 422 se conta não paga
POST   /tables/:n/transfer                → reusa /host/tables/:from/swap (mesma transação atômica)
POST   /tables/:n/courtesy                → atalho · cria order tipo 'courtesy' + dispara Compensate flow
GET    /tables/:n/audit                   → quem abriu/fechou/transferiu/marcou VIP
```

Coluna nova:

```sql
ALTER TABLE tables ADD COLUMN party_excedente INT DEFAULT 0;     -- registra "+ N excedente" pro relatório
ALTER TABLE tables ADD COLUMN observation TEXT;                  -- texto livre · sessão atual
ALTER TABLE tables ADD COLUMN customer_id BIGINT NULL;           -- só quando vira contato confirmado
ALTER TABLE tables ADD COLUMN customer_label VARCHAR(100);       -- nome livre da sessão (não no DB de contatos)
ALTER TABLE tables ADD COLUMN vip_session BOOLEAN DEFAULT false; -- "marcar como VIP nessa sessão"
```

Nada disso migra entre sessões — `customer_label`, `observation`, `vip_session`, `party_excedente` resetam quando a mesa é fechada.

---

## ⭐ Padrão arquitetural · "Em curso" + post-mortem leve (V4 · 2026-05)

> **Princípio.** Quando o gerente dispara uma operação que aguarda resposta de outra parte (cozinha, cliente, garçom), essa operação vira um **card persistente** no Painel até resolver. Tap no card volta pra tela cheia da operação **sem perder progresso**. Ações rápidas inline cancelam ou agem sem entrar.

### Por que existe

V3 deixou 3 problemas órfãos:

1. **Operações async ficam órfãs.** Quando o gerente dispara reordenar cozinha, pausa, cortesia ou contactar cliente, ele fica preso na tela de espera. Se sai, perde visibilidade.
2. **Pausa não tem affordance no Painel.** Gerente precisava ir pra Operação > Agir agora > Pausa pra ver countdown ou despausar.
3. **Não há feedback do que melhorou.** Quando uma operação termina (auto ou manual), o gerente não vê o impacto.

V4 resolve os 3 com um padrão único.

### Componentes

| Componente                        | Tipo         | Onde mora              | Função                                                                                                                                       |
| --------------------------------- | ------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `MInProgressCard`                 | card         | `garcom-screens-c.jsx` | Card persistente na seção "Em curso" do Painel. 4 kinds × 3 states. Tap abre tela cheia, ações inline cancelam/agem sem entrar               |
| `MOpSummary`                      | template     | `garcom-screens-d.jsx` | Template REUSÁVEL de tela cheia post-mortem · topbar + hero + KPIs antes/depois + timeline + sugestão IA + voltar. Aceita props declarativos |
| `ScreenManagerOrdersPauseSummary` | screen       | `garcom-screens-d.jsx` | Concretização de `MOpSummary` pra pausa. Reusável depois pra reorder, contact, courtesy                                                      |
| `M_INPROGRESS`                    | mock presets | `garcom-screens-c.jsx` | 5 presets pra demonstrar variantes no canvas: pauseActive, reorderWaiting, contactWaiting, courtesyWaiting, pauseSummary                     |

### `MInProgressCard` · variantes

| `kind`            | `state`            | Quando aparece                        | Conteúdo principal                                                                                                                              | Ações inline                                                      | Tap no corpo                                          |
| ----------------- | ------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| `pause-orders`    | `active`           | `OrdersPause` ativa                   | Eyebrow `PAUSA · RETOMA SOZINHO` · countdown grande mono `04:23` · barra de progresso · sub `Pausada às 21:08 · termina 21:13`                  | `+5 min` (outline) · `Despausar agora` (filled ink)               | abre `ScreenManagerOrdersPause`                       |
| `kitchen-reorder` | `waiting`          | `KitchenReorder` aguardando cozinha   | Eyebrow `REORDENAR · AGUARDANDO COZINHA` · spinner azul + `Resposta esperada em ~30s` · sub mostra os pedidos a puxar                           | `Cancelar` (outline)                                              | abre `ScreenManagerKitchenReorder` no estado atual    |
| `contact-client`  | `waiting`          | Mensagem enviada · aguardando leitura | Eyebrow `MENSAGEM · MESA 14 · AGUARDANDO LEITURA` · pulse mostarda · preview da mensagem em 1 linha truncada                                    | `Reenviar` (outline)                                              | abre `MContactClientSheet` no estado `sent`           |
| `courtesy`        | `waiting`          | `CompensateClient` enviada            | Eyebrow `CORTESIA · MESA 14 · AGUARDANDO ACEITAR` · resumo do item em 1 linha · spinner azul                                                    | `Cancelar envio` (outline)                                        | abre `ScreenManagerCompensateClient` no estado `sent` |
| `pause-orders`    | `resolved-summary` | Pausa terminou (auto ou manual)       | Eyebrow `PAUSA TERMINOU · DURAÇÃO 5 MIN` verde · headline "Cozinha caiu de 11 pra 7 pedidos" · sub mono "Saída média era 22 min · agora 14 min" | `Ver detalhes` (outline · abre `OrdersPauseSummary`) · X dispense | mesmo de "Ver detalhes"                               |

**Regras de visualização:**

- Border-left 3px tematica: pause-active = mostarda `#9A7212` · waiting = azul `#3B5FBE` · resolved = verde `#1E8C5A`
- Cards stackam verticalmente (não em scroll horizontal — é estado importante)
- Quando `inProgress.length === 0`, a seção INTEIRA oculta (não mostrar empty state — não polui)
- Card `resolved-summary` substitui o card ativo por ~30s antes de sumir; auto-some se nada acontecer

**Indicador inline na ferramenta rápida.** Quando há `pause-orders.active` no `inProgress`, o card "Pausa" da `MQuickActionsBar` no Painel ganha:

- Background mostarda claro (era surface)
- Bolinha mostarda pulsando no canto sup direito
- Sub muda de "Pedidos novos" pra "04:23 restantes" em mono tabular

Garante que o gerente saiba do estado mesmo se rolar pelo Painel sem ver "Em curso".

### `MOpSummary` · template de post-mortem

API declarativa:

```ts
<MOpSummary
  topbarTitle="Resumo da pausa"
  hero={{ kicker, title }}                    // hero verde com duração + janela
  kpis={[                                     // 1 a 4 tiles compactos lado a lado
    { label, before, after, delta, accent },  // tile com antes→depois
    { label, value, sub, accent },            // tile com valor único
  ]}
  timeline={[                                 // eventos durante a operação
    { time, text, dot },                      // dot por status (verde/mostarda/azul)
  ]}
  suggestion={{                               // próximo passo IA (opcional)
    text, ctaLabel, onCta,
  }}
  onBack onClose
/>
```

Hoje `ScreenManagerOrdersPauseSummary` usa esse template com:

- Hero: "Você pausou 5 min entre 21:08 e 21:13"
- KPIs: Fila da cozinha (11→7) · Saída média (22min→14min) · Entraram na fila (3)
- Timeline: 5 eventos entre 21:08 e 21:13
- Sugestão: "Saída ainda alta. Reordenar cozinha pra puxar mesa 14 pra frente?" + CTA `Reordenar cozinha agora` → `mgr-kitchen-reorder`

**Reuso futuro** (mapeado, não implementado):

| Operação resolvida       | Possível conteúdo                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `kitchen-reorder` aceita | "Cozinha aceitou em 23s · 2 pedidos puxados pra frente · Garçons Olivia + Caleb avisados" + KPIs (tempo de espera mesa 14: 22→8 min) |
| `contact-client` lida    | "Cliente leu em 1m12s" + KPI (resposta do cliente, se houve) + timeline (enviado → entregue ao device → lido)                        |
| `courtesy` aceita        | "Cliente aceitou em 32s · Garçom Olivia avisada · entrega em ~5min" + frase do cliente + KPI (tempo de aceite)                       |

Cada uma com seu próprio template; o componente `MOpSummary` aceita props para acomodar todas.

### Fluxo arquitetural completo

```
   Gerente dispara operação async (OrdersPause / Reorder / ContactClient / Compensate)
                                    ↓
   Backend cria registro com state=active|waiting + push WebSocket pro app do gerente
                                    ↓
   App adiciona card em inProgress[] do Painel · seção "Em curso" mostra
                                    ↓
   Gerente pode:
        ┌─ tap no card → tela cheia preserva estado (volta pro Painel sem perder progresso)
        ├─ ações inline (cancelar / +5 min / reenviar) → resolve sem entrar
        └─ ignorar · operação resolve sozinha
                                    ↓
   Backend emite evento de resolução · app substitui card por state=resolved-summary
                                    ↓
   Card resolved-summary fica visível ~30s · gerente vê impacto
                                    ↓
        ┌─ tap em "Ver detalhes" → MOpSummary fullscreen com KPIs/timeline/sugestão
        └─ X dispense → card some imediatamente
                                    ↓
   Auto-some após 30s · seção "Em curso" volta a esconder se 0 ops
```

### Backend · o que precisa existir

- [ ] Tabela `manager_in_progress_ops` (ou similar) — registra ops async ativas com `manager_id`, `kind`, `state`, `created_at`, `resolved_at`, `payload jsonb`
- [ ] Endpoint `GET /manager/in-progress` — devolve lista de ops ativas + recém-resolvidas (últimos 30s) pra reidratar o Painel ao abrir
- [ ] WebSocket events:
  - `op:created` — operação nova entrou em curso
  - `op:state-changed` — operação mudou de `active` pra `waiting`, ou ganhou novo TTL
  - `op:resolved` — operação terminou (auto ou manual) · payload inclui resumo (KPIs antes/depois, timeline)
  - `op:dismissed` — gerente dispensou o resumo manualmente
- [ ] Enriquecedor de KPIs antes/depois — calcula deltas pra cada `kind` ao resolver. Pra `pause-orders`: snapshot da fila/saída antes + janela de eventos durante + nova snapshot ao retomar.

---

## ⭐ Detecção automática de gargalos (PRIORIDADE)

> **Esta é a feature central do app do gerente.** Toda a métrica é derivada de **timestamps que o backend já registra** — não precisa criar estado novo, só queries em cima de `order_status_history` e `waiter_calls`.

### Dados disponíveis

#### Ciclo de vida do pedido (`orders` + `order_status_history`)

| Etapa                  | Status                 | Timestamp                         |
| ---------------------- | ---------------------- | --------------------------------- |
| Cliente fez pedido     | `pending_confirmation` | `orders.created_at`               |
| Auto-confirmação (15s) | `received`             | `order_status_history.created_at` |
| Cozinha começou        | `in_progress`          | `order_status_history.created_at` |
| Prato pronto           | `ready`                | `order_status_history.created_at` |
| Entregue na mesa       | `delivered`            | `order_status_history.created_at` |
| Cancelado              | `cancelled`            | `order_status_history.created_at` |

Cada transição grava `from_status`, `to_status`, `changed_by`, `created_at` em `order_status_history`.

#### Chamados de garçom (`waiter_calls`)

| Momento                   | Campo             |
| ------------------------- | ----------------- |
| Cliente chamou            | `created_at`      |
| Garçom acusou recebimento | `acknowledged_at` |
| Resolvido                 | `resolved_at`     |
| Cancelado pelo cliente    | `cancelled_at`    |

Campos extras: `reason`, `assigned_waiter_name`, `eta_minutes`.

### Métricas calculáveis (queries diretas no banco)

| Gargalo                          | Cálculo                                                  |
| -------------------------------- | -------------------------------------------------------- |
| Tempo de aceite da cozinha       | `in_progress.created_at − received.created_at`           |
| Tempo de preparo                 | `ready.created_at − in_progress.created_at`              |
| Tempo de entrega (pronto → mesa) | `delivered.created_at − ready.created_at`                |
| Tempo total do pedido            | `delivered.created_at − orders.created_at`               |
| Tempo de resposta do garçom      | `waiter_calls.acknowledged_at − waiter_calls.created_at` |
| Tempo de resolução do chamado    | `waiter_calls.resolved_at − waiter_calls.created_at`     |

### Funções a implementar no backend

```ts
type FunnelStage = {
  stage: 'received' | 'in_progress' | 'ready' | 'delivered';
  median: number; // minutos
  p95: number; // minutos
  count: number; // nº de pedidos
  ok: boolean; // dentro da meta?
};

type Bottleneck = {
  funnel: FunnelStage[];
  alerts: Alert[];
  heatmap: TableHeat[];
};

// 1. Funil — média e P95 por etapa, janela configurável
async function getFunnel(window: 'today' | '7d' | '30d'): Promise<FunnelStage[]> {
  // SELECT em order_status_history, agrupando pares consecutivos
  // por order_id, calculando deltas e agregando por to_status
}

// 2. Heatmap — tempo médio entre etapas POR MESA (últimas 2h)
async function getTableHeatmap(): Promise<TableHeat[]> {
  // join orders → tables, calcula avg(deltas) por table_id
}

// 3. Alertas em tempo real — eventos que excedem limiar
async function getAlerts(): Promise<Alert[]> {
  // detecção:
  //   - kitchen-slow:  pedido com status=in_progress há > 18 min
  //   - waiter-late:   chamado sem acknowledged_at há > 4 min
  //   - table-cold:    status=ready há > 5 min sem virar delivered
  //   - kitchen-queue: count(status=in_progress) > capacity_limit
}
```

### Metas configuráveis (sugestão de defaults)

```ts
const TARGETS = {
  receivedMaxMin: 1, // confirmação automática
  prepMaxMin: 12, // tempo de preparo médio
  passToTableMaxMin: 5, // pronto → mesa
  callAckMaxMin: 2, // tempo de aceite do chamado
  callResolveMaxMin: 6, // tempo de resolução
  kitchenCapacity: 8, // pedidos em paralelo
};
```

Cada gargalo é "ok" se `median <= meta` E `p95 <= meta * 2`.

### Eventos real-time

O backend já emite via WebSocket: `order:created`, `order:status`, `order:new`, `order:ready`, `order:claimed`, `waiter:call`, `waiter:acknowledged`. **Adicionar:**

- `bottleneck:detected` — quando um alerta novo cruza limiar
- `bottleneck:resolved` — quando o problema some
- `funnel:updated` — push da nova métrica de funil (a cada 60s)

### O que ainda **não existe** e precisa ser criado

- [ ] Tabela de **alertas persistidos** (`bottleneck_alerts`) — pra histórico e dispensa
- [ ] Job recorrente (a cada 60s) que recalcula funnel + heatmap e popula cache
- [ ] Tabela de **metas por restaurante** (`restaurant_targets`) — hoje os limiares estão hardcoded
- [ ] Endpoint `GET /manager/bottlenecks?window=today|7d|30d`
- [ ] Endpoint `GET /manager/floor` — snapshot de todas as mesas com waiter, tempo, valor
- [ ] Endpoint `GET /manager/staff/:id/performance?window=...`

### Barra "Agir agora" · onde os menus de ferramenta aparecem

> **Problema que isso resolve.** Eu vi que tinha as telas (`KitchenReorder`, `OrdersPause`, `CompensateClient`) mas ninguém sabia onde clicar pra abrir. Solução: barra fixa "Agir agora" entre o conteúdo do Gargalos e a bottom nav, com **3 cards-botão tinted** que sempre estão na tela do gerente quando ele está diagnosticando problema.

```
┌─────────────────────────────┐
│   Gargalos · Funil          │
│   ...                       │
│                             │
│                             │
├─────────────────────────────┤  ← borda
│ AGIR AGORA                  │
│ ┌────┐ ┌────┐ ┌────┐        │
│ │🔥  │ │⏱  │ │🎁  │        │
│ │Co- │ │Pa- │ │Cor-│        │  ← 3 cards 33% cada
│ │zinha│ │usa │ │tesia│      │
│ └────┘ └────┘ └────┘        │
├─────────────────────────────┤  ← borda
│ Painel Salão Garg Equip Fin │  ← bottom nav
└─────────────────────────────┘
```

Componente em `garcom-screens-d.jsx::MQuickActionsBar`. Aparece em **todas as 3 abas** do Gargalos (Funil / Mapa / Alertas) — gerente sempre tem as 3 ferramentas a 1 toque, sem voltar pro Painel.

#### Mapa de entrada das telas-ferramenta (resumo)

| Tela                            | De onde abre                                                                                                                                                                                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ScreenManagerKitchenReorder`   | (1) Painel · Ferramentas rápidas → Cozinha. (2) **Operação · Agir agora → Cozinha** (qualquer aba). (3) Timeline da mesa lenta → "Avisar cozinha" (vem com 1 pedido pré-selecionado).                                                                                                                |
| `ScreenManagerOrdersPause`      | (1) Painel · Ferramentas rápidas → Pausa. (2) **Operação · Agir agora → Pausa**. (3) Sugestão automática do Funil "pause pedidos novos por 5 min" → tap abre.                                                                                                                                        |
| `ScreenManagerCompensateClient` | (1) Card de alerta · MoreSheet · "Mandar cortesia" (entrada terciária). (2) Sheet `MContactClientSheet` · chip "Quer uma cortesia pela espera?". (3) Eu › Cortesias (histórico + criar manualmente). **Cortesia NÃO é mais ferramenta rápida** — é decisão deliberada do gerente, contextual à mesa. |
| `MContactClientSheet`           | Card de alerta na Operação · ação default secundária "Contactar cliente" (substituiu o antigo "Cortesia mesa"). Bottom-sheet vaul-style sobreposto à Operação atual.                                                                                                                                 |

> **Decisão de UX.** A barra é **fixa nos Gargalos**, não nas outras telas top-level. Salão é mapa de mesas (já tem TableTimeline ao toque) · Equipe é foco em pessoas (não operação) · Financeiro é dashboard de leitura (não age). Painel tem as Ferramentas rápidas no topo. Gargalos é a tela de diagnóstico — onde o gerente DESCOBRE o problema; portanto onde precisa AGIR. Adicionar a barra em todas as telas vira ruído visual.

---

## Cadastro de funcionários

Form em `ScreenManagerStaffForm`. Campos:

- Nome completo, CPF (validado), telefone, e-mail
- Função: garçom, cozinheiro, bartender, caixa, gerente
- Turno padrão: manhã, tarde, noite

Ao salvar:

1. Backend gera **senha provisória de 6 dígitos**
2. Envia por **SMS** para o telefone cadastrado
3. Marca o usuário como `must_change_password: true`
4. No primeiro login (já implementado em `ScreenLogin firstTime`), o app força troca de senha

**Desativar ≠ excluir.** Ao desativar, marca `active: false` e preserva todo o histórico de vendas, chamados e turnos. CPF não pode ser reusado.

### Endpoints sugeridos

```
GET    /manager/staff                — lista (filtros: role, status, shift)
GET    /manager/staff/:id            — detalhe + métricas
POST   /manager/staff                — criar (gera senha + envia SMS)
PATCH  /manager/staff/:id            — editar
DELETE /manager/staff/:id            — soft delete (active=false)
GET    /manager/staff/:id/performance?window=today|7d|30d
```

---

## Permissões / role-based access

```ts
type Role = 'waiter' | 'manager' | 'kitchen' | 'bartender' | 'host';

const PERMISSIONS = {
  manager: ['*'], // acesso total
  waiter: ['tables:read', 'tables:write', 'calls:*'], // só ver/agir nas próprias
  kitchen: ['orders:read', 'orders:status'], // só altera status do pedido
  bartender: ['orders:read', 'orders:status'],
  host: ['tables:read', 'tables:release', 'reservations:*', 'alerts:host'],
};
```

Frontend esconde rotas com base em `user.role`. Backend valida em **cada endpoint** — nunca confiar só no client.

---

# 🎟️ App da Recepcionista (host)

A recepcionista usa **o mesmo app** do garçom e do gerente — mesmo binário, mesmo login (CPF + senha). Quando o backend devolve `role: 'host'`, o app substitui o `GBottomNav` (garçom) / `MBottomNav` (gerente) pelo `HBottomNav` (recepcionista, 4 abas) e abre direto no **grid de mesas com capacidade**.

## Telas exclusivas da recepcionista

| Tela                           | Componente                                        | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home / Mesas**               | `ScreenHostHome`                                  | Duas vistas controladas por segmented control: **Pra liberar** (default) e **Mapa**. Pensado pra usuário não-técnico: poucos elementos por tela, ações grandes, linguagem direta. <br/>**Pra liberar** mostra só o que precisa de ação: 3 contadores compactos (em uso / aguardando / espera) + (se houver) card vermelho de alerta com CTA "Ver mesa N" + lista de mesas livres **agrupadas por capacidade** (2 lugares · 4 lugares · 6 lugares…) com botão **Liberar** inline em cada linha — toque grande, sem precisar entrar no detalhe pra liberar mesa simples. Aguardando chegarem (mesas com QR liberado mas cliente ainda não chegou) fica em seção compacta no rodapé. <br/>**Mapa** mantém o grid 4 colunas com TODAS as mesas agrupadas por seção (Salão / Varanda / Mezanino) + filtro horizontal por seção. Aceita 32+ mesas com scroll vertical. Cada card mostra número, capacidade, estado e — se ocupada — o garçom atribuído. Inclui legenda discreta de cores.               |
| **Liberar mesa**               | `ScreenHostTableLiberate`                         | 3 modos via prop `mode`: <br/>**`walkin`** (default) — recepcionista escolheu a mesa direto. Form pergunta party (chips 1–5+), nome, observação. Dica que **o QR fica ativo até a conta fechar**. <br/>**`reservation`** — vem de uma reserva (party já conhecido). Hero mostra card da reserva (nome, party, hora, observação). Mesa pré-atribuída aparece em **verde** com "Cabe os X convidados · setor Y". CTA grande direto "Liberar mesa N · X pessoas". Lista de "Trocar para outra mesa" abaixo (livres com cap >= party, mesmo setor primeiro) caso família peça outra. <br/>**`reservation-no-fit`** — quando a mesa pré-atribuída é menor que o party (ex: reserva de 5 pessoas atribuída na mesa 7 que tem só 4 lugares). Mesa em **vermelho** com "Não cabe os X convidados (cap Y)". Lista "Outras opções que cabem" em destaque (algoritmo determinístico — ver `findFitTable()` abaixo). CTA principal vira secundário "Liberar mesa N mesmo assim" (caso recepcionista insista). |
| **Sucesso · QR ativo**         | `ScreenHostTableLiberada`                         | Confirmação verde + status persistente (sem countdown). Lista do que acontece a seguir (cliente escaneia → vira ocupada → garçom é atribuído). Ação **Cancelar liberação** ou **Voltar ao salão**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Menu da Mesa** ★ V5 ★        | `ScreenManagerTableMenu` (variante `role="host"`) | Mesma tela do gerente compartilhada com a recepcionista. Aberta ao tocar em qualquer mesa **ocupada/liberada/em alerta** no Mapa. Reusa o hero (Mesa N + status pill) e os 3 atributos editáveis (PESSOAS · OBSERVAÇÃO · CLIENTE) com a **mesma lógica de stepper +/- e modal vaul de capacidade excedida** — caso comum da recepção: família chegou em 5 mas a reserva era pra 4. As ações ficam reduzidas a 3 (estado da mesa, não financeiro): **Trocar pra outra mesa** (reusa `ScreenHostTableSwap`) · **Avisar gerente** · **Cancelar liberação** (mostarda · só se cliente não chegou). Recepção NÃO vê: Cortesia · Imprimir · Fechar mesa · Timeline.                                                                                                                                                                                                                                                                                                                                     |
| **Trocar mesa**                | `ScreenHostTableSwap`                             | Move família de uma mesa ocupada para outra. 3 estados via prop `state`: **`select`** lista mesas livres que cabem no party (mesmo setor primeiro pra manter o garçom), cada linha mostra "mesmo garçom" (verde) ou "troca garçom" (laranja). **`confirm`** mostra diagrama visual da troca + checklist do que vai acontecer (pedidos migram, QR continua, garçom muda se mudou de zona). **`success`** confirma + mostra os 3 efeitos colaterais explicados em linguagem direta (sem jargão técnico). Backend faz transferência atômica em transaction — ver `POST /host/tables/:id/swap` abaixo. ★ V5 ★ Acessível também a partir do Menu da Mesa em ambos os roles.                                                                                                                                                                                                                                                                                                                            |
| **Lista de espera**            | `ScreenHostWaitlist`                              | Aba 'Espera' da bottom nav. Lista clientes aguardando mesa, cabeçalho com contagem total + maior tempo de espera, sugestão proativa em verde "Próxima mesa livre · X pessoas · Mesa N", filtros por tamanho do grupo (1 / 2 / 3-4 / 5+). Cada linha tem ação **Sentar agora** + ligar. Tempo colorido: verde até 10 min · amarelo 10-20 · vermelho 20+.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Adicionar à fila**           | `ScreenHostWaitlistAdd`                           | Formulário para cadastrar novo cliente na espera: tamanho do grupo (chips 1-7+), nome (obrigatório), telefone (obrigatório), CPF (opcional, só pra fidelidade), observação livre + atalhos (Aniversário, Mesa interna, Cadeirinha…). Dados ficam guardados pra fidelidade e métricas; CPF criptografado e mascarado em listagens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Reservas do dia**            | `ScreenHostReservations`                          | Aba 'Reservas' da bottom nav. Lista reservas vindas do bot do WhatsApp em ordem cronológica, com horário grande à esquerda, filtros (Todas / Esperadas / Chegaram), badge de status, telefone e mesa atribuída. Ação **Marcar chegada** auto-libera o QR da mesa. Botão **+** no canto superior abre `ScreenHostReservationAdd`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Cadastro manual de reserva** | `ScreenHostReservationAdd`                        | Form para cadastrar reserva que veio FORA do bot — ligação direta, cliente presencial, WhatsApp pessoal da gerência. Respeita a mesma lógica do bot: chips do tamanho do grupo (1-7+), data (Hoje / Amanhã / outro dia / outra), backend devolve **horários disponíveis** em chips numerados (mesma `findAvailableSlots(date, party)` que o bot usa — recepcionista não digita horário livre), nome + telefone, observação com 5 atalhos (Aniversário, Mesa discreta, Vegetariano, Cadeirinha, Varanda). Campo obrigatório **Como chegou** (4 chips: Telefone, Presencial, WhatsApp pessoal, Outro) — alimenta a métrica de canais "fora do bot" no painel do gerente. CTA "Reservar · X pessoas · Hoje 20:30".                                                                                                                                                                                                                                                                                   |
| **Avisos · inbox**             | `ScreenHostInbox`                                 | Lista de alertas: cliente sentou sem liberação (cascata), reserva chegou, fila de espera. Cada item indica se vai escalar e em quanto tempo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Detalhe do alerta**          | `ScreenHostAlertDetail`                           | Hero vermelho com timeline da ocorrência, dados da mesa, **2 ações** (liberar / é erro). O mesmo componente é reusado nos 3 papéis com `role="host" \| "manager" \| "waiter"` — copy e timeline mudam.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Estados da mesa (do ponto de vista da recepção)

```ts
type HostTableStatus =
  | 'livre' // ninguém atribuído, sem QR liberado
  | 'liberada' // recepção liberou; QR ativo até a conta fechar (sem prazo)
  | 'ocupada' // cliente escaneou, virou mesa ativa do app do garçom
  | 'alerta'; // cliente escaneou SEM liberação prévia → cascata disparada
```

`liberada` → `ocupada` quando o cliente escaneia o QR. **Não há expiração** — uma vez liberada, a mesa fica disponível para escaneamento até `closeBill()` ser chamado (que reverte a `livre`). A recepcionista pode cancelar manualmente via `DELETE /host/tables/:n/release` se errou.

## Endpoints sugeridos

```
GET    /host/tables                  — todas as mesas com estado, capacidade, waiter, seção
POST   /host/tables/:n/release       — libera mesa para escaneamento (sem prazo)
       body: { partySize, reservationId?, note? }
DELETE /host/tables/:n/release       — cancela liberação ativa (volta a livre)
POST   /host/tables/:from/swap       — move família ativa de :from para outra mesa
       body: { toTable: number, reason?: string }
       — fluxo descrito em "Auto-assign e troca de mesa" abaixo
GET    /host/alerts                  — inbox da recepcionista (cascata + reservas + fila)
POST   /host/alerts/:id/dismiss      — fecha um aviso

# Lista de espera
GET    /host/waitlist                — lista atual (status='waiting'), ordenada por addedAt
POST   /host/waitlist                — cadastra cliente na fila
       body: { name, phone, party, cpf?, note? }
PATCH  /host/waitlist/:id            — atualizar (ex: { status: 'seated', tableNumber })
DELETE /host/waitlist/:id            — desistiu / cancelar

# Reservas do dia
GET    /host/reservations/today      — reservas do dia (para casar com chegadas)
POST   /host/reservations            — criar reserva manual (vinda de telefone)
PATCH  /host/reservations/:id        — { status: 'arrived' | 'noshow', tableNumber? }
       — `arrived` com tableNumber dispara POST /host/tables/:n/release internamente
```

---

## Auto-assign e troca de mesa · arquitetura

> **Por que isso existe.** Em uma reserva, recepcionista NÃO deveria precisar pensar "onde vou colocar a Família Carvalho? Mesa 9 tem 6 lugares e eles são 6 — beleza." O software já sabe o party (vem da reserva) e sabe quais mesas estão livres com capacidade suficiente. Auto-assign reduz cliques + erros + pedidos do tipo "trocar mesa porque não coube".

### Função core · `findFitTable(party, anchor)`

Lógica determinística (sem LLM, sem ML — operação previsível pra recepcionista). `anchor` é a mesa pré-atribuída pela reserva (ou `null` em walkin).

```ts
function findFitTable(
  party: number,
  anchor: { sector: string; n: number } | null,
): {
  bestMatch: Table | null;
  alternatives: Table[];
  anchorFits: boolean;
} {
  const livres = db.tables.findAll({ where: { st: 'livre' } });
  const fits = livres.filter((t) => t.cap >= party);

  // Ordena: mesmo setor primeiro, capacidade mais próxima depois
  const sorted = fits.sort((a, b) => {
    if (anchor) {
      const sameA = a.sector === anchor.sector ? 0 : 1;
      const sameB = b.sector === anchor.sector ? 0 : 1;
      if (sameA !== sameB) return sameA - sameB;
    }
    return a.cap - b.cap; // não desperdiça mesa de 8 com grupo de 2
  });

  const anchorTable = anchor ? livres.find((t) => t.n === anchor.n) : null;
  const anchorFits = anchorTable ? anchorTable.cap >= party : false;

  return {
    bestMatch: anchorFits ? anchorTable : sorted[0] || null,
    alternatives: sorted.filter((t) => !anchorFits || t.n !== anchor!.n).slice(0, 3),
    anchorFits,
  };
}
```

### Estado do front (`ScreenHostTableLiberate`)

```ts
// quando recepcionista clica "Liberar mesa N" da reserva:
const reservation = await api.get(`/host/reservations/${id}`);
const result = findFitTable(reservation.party, { sector: anchor.sector, n: reservation.table });

if (result.anchorFits) {
  // mesa cabe — modo `reservation`
  showLiberate({ mode: 'reservation', reservation, suggestions: result.alternatives });
} else {
  // mesa NÃO cabe — modo `reservation-no-fit`
  showLiberate({ mode: 'reservation-no-fit', reservation, suggestions: result.alternatives });
}
```

### Endpoint · `POST /host/tables/:n/release` (atualizado)

Aceita override quando a recepcionista escolhe uma mesa diferente da pré-atribuída:

```ts
POST /host/tables/9/release
body: {
  partySize: 6,
  reservationId: 'r1',  // dispara update da reserva: status='arrived', tableNumber=9
  note: 'Comemoração 80 anos'
}

// se recepcionista usou outra mesa que não a anchor:
POST /host/tables/12/release
body: {
  partySize: 6,
  reservationId: 'r1',
  overrideAnchor: 9,   // log: "host preferiu mesa 12 ao invés de 9"
  note: '...'
}
```

Side effect: quando `reservationId` é informado, o backend faz `UPDATE reservations SET status='arrived', tableNumber=N, arrivedAt=now() WHERE id=:reservationId` na mesma transaction. Garantia atômica.

### Endpoint · `POST /host/tables/:from/swap` (novo · troca de mesa)

Move uma família ativa de uma mesa para outra. Caso de uso: cliente sentou na mesa 9 mas pediu pra trocar (não gostou da posição, queria varanda).

```ts
POST /host/tables/9/swap
body: {
  toTable: 20,          // mesa destino (precisa estar livre com cap >= party)
  reason: 'Pediu varanda' // opcional · vira metadata no log
}

// 200 OK
{
  fromTable: 9,
  toTable: 20,
  sessionId: 'tbs_abc',
  ordersMigrated: 2,
  waiterChanged: true,    // mudou porque mudou de setor
  newWaiter: { id: 'st_henrique', name: 'Henrique L.' },
  oldWaiter: { id: 'st_caleb', name: 'Caleb S.' }
}
```

#### Lógica do backend (transaction atômica)

```sql
BEGIN;

-- 1. valida: from está ocupada, to está livre, to.cap >= from.party
SELECT * FROM tables WHERE n = :from FOR UPDATE;
SELECT * FROM tables WHERE n = :to FOR UPDATE;
-- raise se !ocupada(from) || !livre(to) || cap(to) < seats(from)

-- 2. transfere a sessão
UPDATE table_sessions SET tableId = :to_id WHERE tableId = :from_id AND status = 'active_verified';

-- 3. transfere pedidos abertos (não-pagos)
UPDATE orders SET tableId = :to_id
  WHERE tableId = :from_id
  AND status NOT IN ('paid', 'cancelled');

-- 4. log de auditoria
INSERT INTO table_swap_logs (fromTableId, toTableId, sessionId, reason, hostId, createdAt)
VALUES (:from_id, :to_id, :session_id, :reason, :host_id, now());

-- 5. atualiza estados das mesas
UPDATE tables SET st = 'livre',   seats = NULL, since = NULL, waiter_id = NULL WHERE id = :from_id;
UPDATE tables SET st = 'ocupada', seats = :seats, since = now(), waiter_id = :new_waiter_id WHERE id = :to_id;

COMMIT;
```

#### Reatribuição do garçom

```ts
function reassignWaiter(fromSector, toSector, fromWaiter): { newWaiter; changed } {
  if (fromSector === toSector) return { newWaiter: fromWaiter, changed: false };

  // mesma lógica de balanceamento da seção "Distribuição entre garçons" no topo:
  // pega o garçom da nova zona com menos carga
  const candidates = db.staff.findActive({ sector: toSector });
  const least = candidates.sort((a, b) => a.activeTables - b.activeTables)[0];
  return { newWaiter: least, changed: true };
}
```

#### Notificações disparadas

| Evento                     | Destinatário                         | Conteúdo                                                                 |
| -------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| `table:swapped` (WS)       | recepção, gerente, **ambos garçons** | `{ from, to, customer, sessionId }`                                      |
| Push pro garçom **antigo** | só se mudou de setor                 | "Mesa 9 esvaziou — família foi pra mesa 20"                              |
| Push pro garçom **novo**   | só se mudou de setor                 | "Família Carvalho agora é sua — mesa 20 · 6 pessoas · 2 pedidos abertos" |
| Push pra cozinha           | sempre                               | "Pedidos da mesa 9 → agora mesa 20" (atualiza ticket impresso/KDS)       |

#### Tabela nova · `table_swap_logs`

```sql
CREATE TABLE table_swap_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantId      UUID NOT NULL REFERENCES tenants(id),
  fromTableId   UUID NOT NULL REFERENCES tables(id),
  toTableId     UUID NOT NULL REFERENCES tables(id),
  sessionId     UUID NOT NULL REFERENCES table_sessions(id),
  reason        TEXT NULL,
  hostId        UUID NOT NULL REFERENCES staff(id),
  createdAt     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- snapshot do estado pre-swap (debug)
  fromSeats     INT NOT NULL,
  fromWaiterId  UUID NULL,
  toWaiterId    UUID NULL
);
CREATE INDEX idx_swap_session ON table_swap_logs(sessionId);
CREATE INDEX idx_swap_host    ON table_swap_logs(hostId, createdAt DESC);
```

### Casos extremos

| Caso                                     | Comportamento                                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cliente quer mesa que **NÃO está livre** | Backend retorna 409 Conflict. Front mostra "Mesa N está ocupada por outra família" (não revela quem).                                                                     |
| Cliente quer mesa **menor que o party**  | Backend retorna 422 Validation. Front bloqueia e mostra mesas que cabem.                                                                                                  |
| 2 famílias querem trocar **entre si**    | Endpoint não suporta swap-cruzado direto. Recepcionista move 1 pra mesa neutra livre, depois move a outra. (Caso real raro — não vale complexidade do swap-bidirecional.) |
| Cliente já pagou parte da conta          | Bloqueia swap. "Conta parcial paga · feche antes de mover" — UX explica direto, recepcionista chama gerente se precisa exceção.                                           |
| Garçom novo ofline                       | Backend pula `least` ofline e pega o próximo. Se nenhum disponível na nova zona → mantém o antigo até próximo turno.                                                      |

### Permissão

```ts
SWAP_TABLE: ['host', 'manager', 'owner'];
// garçom NÃO pode mover famílias — não é responsabilidade dele
```

---

## Lista de espera · arquitetura

> **Para que serve.** Em horários de pico, todas as mesas estão ocupadas. A recepcionista cadastra os clientes na chegada com nome + telefone + tamanho do grupo. Quando uma mesa do tamanho certo abre, o sistema sugere chamar a próxima pessoa da fila — e pode disparar push opcional pelo telefone (WhatsApp / SMS) avisando que a mesa está pronta.

### Modelo

```ts
interface WaitlistEntry {
  id: string;
  tenantId: string;
  name: string; // obrigatório
  phone: string; // obrigatório (E.164: +5511987654321)
  party: number; // tamanho do grupo
  cpf?: string; // opcional, encriptado em repouso, mascarado em listagens
  note?: string; // observação livre
  tags?: string[]; // ex: ['aniversario', 'mesa-janela']
  status: 'waiting' | 'seated' | 'gave_up' | 'no_show';
  addedAt: string; // ISO timestamp
  seatedAt?: string;
  seatedAtTable?: number;
  addedByStaffId: string; // recepcionista que cadastrou
}
```

### Fluxo

1. **Chegada do cliente** → recepcionista toca `+` na aba **Espera** → preenche o form (`POST /host/waitlist`).
2. Lista atualizada em todos os devices via WebSocket `host:waitlist:added`.
3. **Mesa abre** (`PATCH /host/tables/:n` com `status='livre'`) → backend procura na fila a primeira entrada com `party <= mesa.cap` → emite `host:waitlist:next-suggestion` com `{ entryId, tableNumber }`.
4. App da recepcionista mostra o card verde "Próxima mesa livre · Mesa N · chamar **Família X**".
5. Recepcionista toca **Sentar agora** → `PATCH /host/waitlist/:id { status:'seated', tableNumber }` → o backend dispara `POST /host/tables/:n/release { partySize, name }` automaticamente.
6. (Opcional) Notificar o cliente via WhatsApp Business API ou SMS — apenas se `phone_optin=true` no cadastro.

### LGPD · proteção de dados pessoais

> **Política de retenção.** Os dados da fila ficam guardados sem prazo de expiração — acumulam como base do programa de fidelidade e da camada de métricas (frequência, ticket médio por cliente, taxa de retorno, padrões de espera). Base legal: **legítimo interesse** (LGPD art. 7º IX) para métricas operacionais agregadas + **consentimento** explícito para comunicação de marketing (checkbox `marketingOptin` no cadastro, default `false`).

- **CPF** é encriptado com AES-256 em repouso (chave em `KMS`). Listagens API retornam mascarado: `123.***.***-12`. Só fica em claro em endpoints específicos de fidelidade autenticados pelo dono.
- **Telefone** e **nome** mantêm formato cru no banco, mas só staff com `role IN ('host','manager','owner')` pode ler. Logs de acesso (quem viu qual cliente) ficam em `customer_access_logs` para auditoria.
- **Marketing** (campanhas, WhatsApp em massa, push promocional) só dispara para registros com `marketingOptin=true`. Endpoint `POST /host/customers/:id/optout` revoga em qualquer momento (sem login — basta o telefone bater) — opt-out de marketing **não** apaga o registro, só desliga o flag de comunicação.
- **Sem deleção automática.** O sistema não remove dados de cliente por tempo nem por solicitação pública. Pedidos de remoção que cheguem por canais oficiais (LGPD art. 18) são tratados manualmente pelo dono em rotina específica do painel administrativo — não há endpoint público de auto-serviço.
- **Auditoria de acesso** continua mandatória independente da retenção: cada leitura de PII por staff é registrada em `customer_access_logs` (quem, quando, qual cliente), expurgada apenas após 5 anos.

---

## Reservas do dia · arquitetura

> **Para que serve.** **Todas** as reservas chegam pelo bot do WhatsApp do restaurante. O número público (ex: `+55 11 90000-0000`) já está exposto no site oficial e no Instagram — clicar em "Reservar" no site abre direto uma conversa no WhatsApp. O bot conduz a conversa, extrai os dados estruturados (nome, party, horário, **observação**) e cria um draft pra recepcionista revisar e aprovar com 1 toque.
>
> **Decisão de produto.** A gente NÃO vai construir form web próprio, integração com OpenTable/TheFork, nem captura de ligação telefônica. Brasileiro vive no zap; o site existente já redireciona pra ele; é UM canal só, mais barato de operar e mais barato de cobrir contra abuso. Se um cliente liga, a recepcionista pede educadamente pra ele mandar mensagem no mesmo número — o atendimento por voz não vira reserva.

### Modelo

```ts
interface Reservation {
  id: string;
  tenantId: string;
  name: string;
  phone: string; // E.164: +5511900000000
  party: number; // 1–20
  scheduledAt: string; // ISO timestamp do horário marcado
  tableNumber?: number; // mesa pré-atribuída (opcional)
  status: 'awaited' | 'arrived' | 'noshow' | 'cancelled';
  note?: string; // observação livre — ver seção abaixo
  whatsappConversationId: string; // FK pra conversa que originou
  arrivedAt?: string;
  seatedAtTable?: number;
  createdAt: string;
}
```

> **Sem campo `source`.** Todas as reservas são `whatsapp` por definição. O canvas (`ScreenHostReservations`) não mostra ícone de canal — mostra só o telefone.

### Bot do WhatsApp · setup (uma vez por tenant)

1. **Conta WhatsApp Business API.** Via Meta Cloud API direto (gratuito até 1000 conversas/mês iniciadas pelo cliente) ou provider tipo Twilio/Zenvia (mais caro mas com SLA brasileiro). Recomendação: Meta direto — provedor adiciona R$ 0,05–0,15 por mensagem sem agregar valor.
2. **Phone number registrado e verificado** no painel Meta Business. Mesmo número que aparece no site público do restaurante.
3. **Webhook** em `POST /webhooks/whatsapp` configurado no app Meta. Validação inicial via `GET /webhooks/whatsapp?hub.verify_token=...` (Meta exige).
4. **Templates aprovados** pela Meta para mensagens proativas (templates podem demorar 24h pra aprovação):
   - `reservation_confirmed` — disparado quando recepcionista aprova draft
   - `reservation_reminder_2h` — disparado pelo cron 2h antes do horário
   - `reservation_no_show` — disparado quando cron noshow flagga a reserva
   - Mensagens reativas (durante a conversa de criação) não precisam de template.
5. **Variáveis de ambiente:**
   ```
   WHATSAPP_PHONE_NUMBER_ID=         # do painel Meta
   WHATSAPP_BUSINESS_ACCOUNT_ID=
   WHATSAPP_ACCESS_TOKEN=            # rotacionar a cada 60 dias
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=    # secret aleatório, igual no painel Meta
   WHATSAPP_APP_SECRET=              # pra validar X-Hub-Signature-256
   ```

### Bot do WhatsApp · fluxo conversacional

A regra é **state machine simples + parser leve**, NUNCA LLM puro:

- **Custo previsível.** Cada conversa é deterministicamente curta.
- **Sem alucinação.** Cliente "Quero pra umas 8 ou 10 pessoas" não vira reserva fantasma.
- **Latência baixa.** Resposta em <1s, sem chamada externa.
- **Bot dita os horários disponíveis** (NUNCA o cliente propõe horário). O bot consulta a agenda da casa e oferece **slots reais que cabem** pro tamanho do grupo no dia escolhido. Cliente apenas escolhe 1/2/3/4. Isso elimina:
  - Cliente propondo horário em que a casa está cheia
  - Bot precisando "negociar" alternativas
  - Reserva criada com horário inviável que a recepcionista vai rejeitar depois

```
Cliente: oi quero reservar
Bot:     Oi! 👋 Trattoria Luna por aqui. Pra qual *dia* você quer?
         (ex: "hoje", "amanhã", "sábado", "10/05")
Cliente: sábado
Bot:     📅 sábado, 10/mai. Pra *quantas pessoas*?
Cliente: 8
Bot:     ⏰ Pra 8 pessoas no sábado, esses são os horários *disponíveis*:
         *1* — 18:30
         *2* — 19:45
         *3* — 20:30
         *4* — 21:15
         Responda com o número.
Cliente: 3
Bot:     Pra finalizar, qual o *nome* da reserva?
Cliente: Família Tanaka
Bot:     Alguma *observação*? (ex: aniversário, vegetariano,
         cadeirinha pra criança, mesa mais reservada).
         Se não tiver, responda *NÃO*.
Cliente: aniversário do meu pai, ele faz 70. e a gente queria uma mesa
         mais discreta porque ele não gosta de barulho
Bot:     Tudo certo! Vou confirmar:
         👨‍👩‍👧‍👦 Família Tanaka · 8 pessoas
         📅 sábado 10/mai · 20:30
         📍 Trattoria Luna · Av. Paulista 1500
         📝 Aniversário 70 anos · pediu mesa discreta
         Responda *SIM* pra confirmar.
Cliente: sim
Bot:     ✅ Reserva enviada! A recepção vai confirmar em alguns minutos.
         Pra cancelar, é só responder *CANCELAR* aqui mesmo.
```

**Estados do state machine** (`whatsapp_conversations.state`):

```
awaiting_intent → awaiting_date → awaiting_party → picking_slot
   → awaiting_name → awaiting_note → awaiting_confirm → done
```

Note que `awaiting_time` foi substituído por `picking_slot`. A diferença é fundamental:

- **Antes** (`awaiting_time`): cliente digitava texto livre ("20h", "umas 8") → bot tentava parsear → se não cabia, sugeria alternativas. Mais turnos, mais ambiguidade.
- **Agora** (`picking_slot`): bot consulta a agenda e mostra a **lista de slots reais que cabem**, numerados. Cliente responde só `1`, `2`, `3` ou `4`. Sem ambiguidade, sem negociação.

Cada estado tem regras de parse:

| Estado             | O que aceita                                                         | Exemplos válidos                                 | Como falha                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `awaiting_intent`  | Frase com verbo de reserva                                           | "quero reservar", "tem mesa pra hoje", "reserva" | Mensagens sem intent → bot responde menu rápido com 4 ações: _Reservar · Cancelar reserva · Cardápio · Falar com atendente_                                   |
| `awaiting_date`    | Data parseada por `chrono-node` (pt-BR)                              | "hoje", "sábado", "10/05", "amanhã"              | Ambíguo → bot lista 3 opções: _hoje · amanhã · este sábado_                                                                                                   |
| `awaiting_party`   | Número 1–20                                                          | "8", "4 pessoas", "duas" (`numerizer` pt-BR)     | "umas 8 ou 10" → bot pede número exato                                                                                                                        |
| `picking_slot`     | Número exato do slot apresentado (`1`–`N` onde N = slots oferecidos) | `"3"`, `"2"`, `"1 por favor"`                    | Resposta fora do intervalo → bot repete a lista numerada. Se cliente digita horário livre ("21:30") → bot responde "Por favor, escolha um dos números acima." |
| `awaiting_name`    | Texto livre 2–60 chars                                               | "Família Tanaka", "André"                        | Vazio → repete pergunta                                                                                                                                       |
| `awaiting_note`    | Texto livre OU "NÃO"/"NAO"/"-"                                       | "aniversário", "vegetariano", "cadeirinha", "—"  | Vazio → assume sem observação                                                                                                                                 |
| `awaiting_confirm` | "SIM"/"S"/"OK"/"CONFIRMA" → done                                     | /                                                | "NÃO" volta pra `awaiting_intent`                                                                                                                             |

### Slot availability query · como o bot decide o que oferecer

Quando o cliente termina de informar **data + número de pessoas**, o bot chama:

```ts
// apps/api/src/modules/whatsapp/slot-availability.service.ts
async findAvailableSlots(date: Date, party: number): Promise<Slot[]> {
  // 1) Janela do dia: settings.openingHours pra esse weekday
  //    Ex: sábado abre 18:00 e fecha 23:30
  const window = await this.openingHoursFor(date);
  if (!window) return [];                            // dia fechado

  // 2) Slots candidatos: a cada 15 min do horário de abertura ao fechamento
  //    Excluindo última 1.5h (não dá tempo de servir uma reserva nova)
  const STEP_MIN = 15;
  const LAST_OFFSET_MIN = 90;
  const candidates = generateSlots(window.open, window.close, STEP_MIN, LAST_OFFSET_MIN);

  // 3) Pra cada candidato, verificar capacidade restante:
  //    - Buscar reservations confirmadas que se sobrepõem ao slot ± duração
  //    - Buscar table_sessions ativas que se sobrepõem (walk-in)
  //    - Calcular ocupação por mesa (capacity → tables.capacity)
  const occupancy = await this.computeOccupancy(date, candidates);

  // 4) Filtrar slots que conseguem acomodar `party`:
  //    - 1 mesa livre com capacity >= party  OU
  //    - 2+ mesas adjacentes que somadas alcancem party (settings.allowMergedTables)
  const available = candidates.filter(slot =>
    canAccommodate(occupancy[slot.iso], party, this.settings.allowMergedTables)
  );

  // 5) Pegar os 4 slots melhor distribuídos no dia (não 4 seguidos)
  //    Se total < 4, devolve todos. Se total > 4, dá preferência:
  //    - 1 slot na 1ª terça do funcionamento
  //    - 1 no pico (~20:30)
  //    - 1 no fim do funcionamento (~22:00)
  //    - 1 alternativo
  return pickSpread(available, 4);
}
```

**Setting do restaurante** que controla a query (em `restaurant_settings`):

```jsonc
{
  "openingHours": {
    "tue": [{ "open": "18:00", "close": "23:30" }],
    "wed": [{ "open": "18:00", "close": "23:30" }],
    // ...
    "sat": [{ "open": "18:00", "close": "23:30" }],
    "sun": [
      { "open": "12:00", "close": "16:00" },
      { "open": "18:00", "close": "23:00" },
    ],
    "mon": null, // fechado
  },
  "reservationDurationMin": 120, // bloqueia mesa por 2h depois do horário
  "allowMergedTables": true, // pode juntar mesas adjacentes pra grupo grande
  "slotStepMin": 15, // candidatos a cada 15min
  "lastSlotOffsetMin": 90, // não oferece slot a menos de 1.5h do fechamento
  "maxSlotsToOffer": 4, // tamanho da lista mostrada ao cliente
}
```

**O que acontece se NÃO houver slot disponível:**

```
Cliente: amanhã
Bot:     📅 domingo, 11/mai. Pra *quantas pessoas*?
Cliente: 12
Bot:     Para 12 pessoas no domingo, infelizmente *não temos
         disponibilidade* — esse dia é mais cheio.
         Quer tentar outro dia? Esses são próximos com vaga:
         *1* — segunda 12/mai 19:00
         *2* — terça 13/mai 18:30
         *3* — terça 13/mai 21:00
         Responda com o número, ou *CANCELAR* pra desistir.
```

→ Estado vira `picking_slot_alt` (mesmo handler, com `dateOverride` setado da escolha).

**Implementação:**

```ts
// apps/api/src/modules/whatsapp/whatsapp.service.ts
async processMessage(from: string, body: string, messageId: string) {
  // idempotência
  if (await this.alreadyProcessed(messageId)) return;

  const conv = await this.getOrCreateConversation(from);
  const handler = STATE_HANDLERS[conv.state];
  const next = await handler(conv, body, this.slotAvailability);

  // next: { state, reply, persistFields?, complete? }
  await this.updateConversation(conv.id, { state: next.state, ...next.persistFields });
  await this.sendMessage(from, next.reply);

  if (next.complete) {
    await this.createReservationDraft(conv);
  }
}

// Handler de awaiting_party: ao receber o número, JÁ consulta slots
// e transiciona pra picking_slot persistindo a lista oferecida.
const STATE_HANDLERS = {
  awaiting_party: async (conv, body, slotSvc) => {
    const party = parsePartyNumber(body);
    if (!party) return { state: 'awaiting_party', reply: 'Não entendi. Quantas pessoas?' };

    const slots = await slotSvc.findAvailableSlots(conv.collectedFields.scheduledDate, party);
    if (slots.length === 0) {
      // Buscar próximos 3 dias com disponibilidade
      const alt = await slotSvc.findAlternativeDays(conv.collectedFields.scheduledDate, party, 3);
      return {
        state: 'picking_slot_alt',
        persistFields: { collectedFields: { ...conv.collectedFields, party, alternativeSlots: alt } },
        reply: formatNoSlotsReply(alt, party),
      };
    }
    return {
      state: 'picking_slot',
      persistFields: { collectedFields: { ...conv.collectedFields, party, offeredSlots: slots } },
      reply: formatSlotsReply(slots, party, conv.collectedFields.scheduledDate),
    };
  },

  picking_slot: async (conv, body) => {
    const idx = parseInt(body.trim().match(/^\d+/)?.[0] ?? '', 10);
    const slots = conv.collectedFields.offeredSlots;
    if (!idx || idx < 1 || idx > slots.length) {
      return { state: 'picking_slot', reply: `Por favor, escolha um dos números acima (1 a ${slots.length}).` };
    }
    const chosen = slots[idx - 1];
    return {
      state: 'awaiting_name',
      persistFields: { collectedFields: { ...conv.collectedFields, scheduledAt: chosen.iso } },
      reply: 'Pra finalizar, qual o *nome* da reserva?',
    };
  },

  // ... demais handlers
};
```

### Por que **draft** e não reserva direto

Mesmo o state machine sendo robusto, a recepcionista é o gate final por 3 razões:

1. **Capacidade.** Bot não conhece a real situação do salão — pode ter mesa de 8 livre no horário pedido mas a casa está overbookada. Recepcionista decide.
2. **Política do restaurante.** Aniversário com bolo precisa avisar a cozinha antes; mesa de 12 pode requerer pré-pagamento. O bot não sabe disso, ela sabe.
3. **Anti-abuso.** Cliente com histórico de no-show, número suspeito, ou pedindo reserva pra horário fora do funcionamento — ela vê o sinal e age.

**Ciclo:**

```
Cliente confirma SIM → cria reservation_drafts (status='pending')
                    → push pra recepcionista: "Nova reserva no WhatsApp · Família Tanaka, 8p, 20:30"
                    → bot responde "Reserva enviada! Recepção vai confirmar em alguns minutos."
Recepcionista revisa → aprova OU rejeita OU edita
   ├── Aprovar:  draft.status='approved' → cria Reservation oficial
   │             → manda template `reservation_confirmed` pro cliente
   ├── Rejeitar: draft.status='rejected' (com reason)
   │             → manda mensagem livre pro cliente explicando ("Desculpa,
   │               nesse horário só temos mesa pra 4. Quer 19:00 ou 21:00?")
   └── Editar:   ajusta party/horário/mesa → aprova com mudanças
                 → bot manda confirmação com os dados corrigidos
```

### Confiança da extração · `confidence: 'high' | 'med' | 'low'`

Cada draft carrega um campo `confidence` calculado quando o state machine atinge `awaiting_confirm`. **Não usa LLM** — é uma função determinística sobre os campos coletados:

```ts
// apps/api/src/modules/whatsapp/confidence.ts
function computeConfidence(fields: CollectedFields): 'high' | 'med' | 'low' {
  let score = 0;
  let missing = [];

  // 1) Cada campo obrigatório completo vale +20
  if (fields.name && fields.name.length >= 2) score += 20;
  else missing.push('name');
  if (fields.phone && /^\+?\d{10,}$/.test(fields.phone)) score += 20;
  else missing.push('phone');
  if (fields.party && fields.party >= 1 && fields.party <= 50) score += 20;
  else missing.push('party');
  if (fields.scheduledAt && !isNaN(fields.scheduledAt.getTime())) score += 20;
  else missing.push('scheduledAt');

  // 2) Confirmação explícita do cliente vale +15
  if (fields.userConfirmed === true) score += 15;

  // 3) Penalidades por sinais de ambiguidade no texto bruto
  const ambiguousTime = /\b(umas?|talvez|por volta|aí pelas?|ou)\b/i.test(fields.rawTime || '');
  const ambiguousParty = /\b(umas?|talvez|ou)\b/i.test(fields.rawParty || '');
  if (ambiguousTime) score -= 15;
  if (ambiguousParty) score -= 15;

  // 4) Conversa muito curta (cliente sumiu) é red flag
  if (fields.messageCount < 5) score -= 20;

  if (score >= 75) return 'high';
  if (score >= 50) return 'med';
  return 'low';
}
```

**Como a UI usa:**

| Confiança | Hero     | CTA primária              | Quando                                                                  | Ação esperada                                                                                  |
| --------- | -------- | ------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `high`    | verde    | "Aprovar e criar reserva" | Todos os 4 campos completos + confirmação explícita + sem ambiguidade   | Recepcionista lê e aprova com 1 toque (≤5 s)                                                   |
| `med`     | amarelo  | "Definir hora e aprovar"  | Falta 1 campo OU tempo ambíguo ("8 ou 9 da noite")                      | Edita o campo destacado em vermelho, depois aprova                                             |
| `low`     | vermelho | "Continuar no WhatsApp"   | Faltam 2+ campos OU bot deu handoff (cliente abandonou ou pediu humano) | Recepcionista entra na conversa do WhatsApp e fecha manualmente — depois cria a reserva no app |

**Por que não LLM:** o classificador roda em <1 ms, custa 0, e os sinais que importam (campos vazios, "umas X ou Y", conversa curta) são triviais de detectar com regex e contagem. Reserva fantasma criada por LLM alucinando hora errada custa muito mais que o ganho de "talvez classificar melhor".

### Endpoints específicos do draft

```
GET    /host/reservation-drafts                — lista drafts pendentes (default: status='pending')
GET    /host/reservation-drafts/:id            — detalhes do draft + conversa completa do WhatsApp
POST   /host/reservation-drafts/:id/approve    — aprova; cria Reservation; manda template confirmação
       body: { edits?: Partial<Reservation> }   (opcional — campos editados antes de aprovar)
POST   /host/reservation-drafts/:id/reject     — rejeita; manda mensagem livre pro cliente
       body: { reason: string, replyToCustomer?: string }
POST   /host/reservation-drafts/:id/handoff    — transfere conversa do bot pra recepcionista
                                                  (bot fica desativado nessa conversa por 1h)
```

### Tabelas (SQL)

```sql
CREATE TABLE whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  customer_phone_e164 VARCHAR(20) NOT NULL,
  state VARCHAR(30) NOT NULL,           -- awaiting_intent, awaiting_date, awaiting_party, picking_slot, picking_slot_alt, awaiting_name, awaiting_note, awaiting_confirm, done
  collected_fields JSONB NOT NULL DEFAULT '{}',  -- { name, party, scheduledDate, scheduledAt, offeredSlots, alternativeSlots, note }
  last_inbound_at TIMESTAMPTZ NOT NULL,
  idle_warning_sent BOOLEAN DEFAULT false,       -- se >15min sem resposta, bot manda nudge
  closed_at TIMESTAMPTZ,                         -- conversa encerrada (done OU timeout 30min)
  handed_off_at TIMESTAMPTZ,                     -- quando virou conversa humana
  handed_off_to_staff_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, customer_phone_e164, closed_at)  -- 1 conversa ativa por telefone
);

CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES whatsapp_conversations(id),
  meta_message_id VARCHAR(80) UNIQUE NOT NULL,   -- idempotência
  direction VARCHAR(10) NOT NULL,                -- 'in' | 'out'
  body TEXT NOT NULL,
  parsed_intent VARCHAR(40),                     -- só pra inbound
  sent_by_staff_id UUID,                         -- só pra handoff
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE reservation_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  conversation_id UUID REFERENCES whatsapp_conversations(id),
  collected_fields JSONB NOT NULL,               -- { name, phone, party, scheduledAt, note, rawTime, rawParty, userConfirmed, messageCount }
  detected_tags JSONB DEFAULT '[]',              -- ['birthday', 'quiet'] etc — regex sobre note
  confidence VARCHAR(8) NOT NULL,                -- 'high' | 'med' | 'low'
  confidence_score INT NOT NULL,                 -- 0–115 (pra debug / analytics)
  status VARCHAR(20) DEFAULT 'pending',          -- pending | approved | rejected | edited_approved
  approved_reservation_id UUID REFERENCES reservations(id),
  reviewed_by_staff_id UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  INDEX (tenant_id, status, created_at DESC),
  INDEX (tenant_id, confidence)                  -- pra dashboard "drafts low" do gerente
);
```

### Campo `note` · texto livre sempre + tags opcionais por cima

A observação é o ponto mais importante da reserva pra cozinha e atendimento. O bot pergunta texto livre (cliente fala como quiser) e **o `note` cru é sempre salvo e sempre exibido** — a recepcionista lê e entende. As tags são uma camada de DESTAQUE VISUAL opcional por cima, não substituem o texto.

```ts
// apps/api/src/modules/whatsapp/note-classifier.ts
const NOTE_TAGS = {
  birthday: /\b(aniversári[oa]|niver|bolo)\b/i,
  vegetarian: /\b(vegetarian[oa]|sem\s+carne|veg)\b/i,
  vegan: /\b(vegan|sem\s+(animal|leite|ovo))\b/i,
  baby: /\b(cadeirinha|bebê|crianças?)\b/i,
  quiet: /\b(reservad[oa]|silencios[oa]|tranquila|discret[oa])\b/i,
  outdoor: /\b(varanda|fora|ar\s+livre|terraço)\b/i,
  allergy: /\b(alerg|intoler|glúten|lactose|amend|frutos\s+do\s+mar)\b/i,
  business: /\b(reuni[ãa]o|negóci|empresa|corporativ)\b/i,
  vip: /\b(VIP|gerente|dono)\b/i,
};

function classifyNote(note: string): string[] {
  if (!note) return [];
  return Object.entries(NOTE_TAGS)
    .filter(([_, regex]) => regex.test(note))
    .map(([tag]) => tag);
}
```

**Como aparece na UI** — sempre o texto livre, com chips opcionais POR CIMA dele quando bate alguma regex:

| Cenário                                                       | Como aparece                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Cliente: _"comemoração de 15 anos da minha filha, mesa fora"_ | Chips `🎂 aniversário` `🌳 varanda` no topo + texto livre completo logo abaixo.                  |
| Cliente: _"a minha esposa não come glúten"_                   | Chip `⚠️ alergia` no topo + texto livre completo.                                                |
| Cliente: _"vamos passar antes do show no Bolshoi"_            | **Sem chip nenhum** — texto livre completo aparece igual. Recepcionista lê e entende o contexto. |
| Cliente: _"sem observações"_ / vazio                          | Linha "—" discreta.                                                                              |

A regex existe SÓ pra cozinha enxergar rápido as 9 categorias mais comuns sem ler 4 linhas. Mas o texto livre **nunca é escondido** — chips e texto convivem.

> **NÃO usar LLM** pra classificar. Regex é determinístico, custo zero, latência zero, e cobre as categorias críticas pra cozinha (alergia / vegetariano / aniversário). O resto é texto livre que a recepcionista lê. Se quiser melhorar precisão depois, treina um classificador local pequeno — não terceiriza pra OpenAI/Anthropic.

### Anti-abuso (camada barata)

- **Idempotência.** `meta_message_id` UNIQUE evita reprocessar webhook duplicado.
- **Rate limit por telefone.** 1 reserva ativa por telefone por dia. 2ª tentativa: bot responde "Você já tem uma reserva pra hoje 20:30. Pra alterar, responda _ALTERAR_."
- **Block list.** Tabela `whatsapp_blocked_numbers` com telefones bloqueados (no-show repetido, abuso). Recepcionista pode adicionar via app.
- **Anti-spam.** Mensagens com URLs ou emojis em excesso (>5) caem em `awaiting_intent` com resposta padrão de menu, não engatam o flow.
- **Janela de funcionamento.** Reserva fora do `settings.openingHours` → bot recusa: "Não fazemos atendimento nesse horário. Operamos terça a domingo, 18h–23h."
- **No-show repetido.** 3+ no-shows nos últimos 90 dias → bot pede confirmação extra: "Pra reservar, peço só pra confirmar pelo PIX a chave `restaurante@email.com.br`, R$ 30 por pessoa, reembolsado quando você chegar."

### Fallback humano (handoff)

Se o cliente:

- Escreve algo que NÃO encaixa em nenhum estado por 2 turnos consecutivos
- OU pede explicitamente "falar com atendente" / "pessoa real" / "humano"
- OU envia áudio/imagem (bot não processa)

→ Bot responde:

> _"Vou pedir pra alguém da equipe te responder por aqui. Em alguns minutos uma pessoa vai entrar na conversa. 🙏"_

→ `POST /host/whatsapp/handoff { conversationId }` marca `handed_off_at` e empurra a conversa pra aba **Avisos** do app da recepcionista. Ela toca, vê o histórico inteiro e responde manualmente — backend manda via Cloud API com `sent_by_staff_id` preenchido. Bot fica desativado nessa conversa por 1 hora; depois disso, se cliente mandar nova mensagem, volta pro state machine.

### Como aparece no app da recepcionista

```ts
// apps/api/src/modules/reservation-drafts/reservation-drafts.service.ts
async createDraftFromConversation(conv: WhatsappConversation) {
  const draft = await this.repo.save({
    tenantId: conv.tenantId,
    conversationId: conv.id,
    collectedFields: conv.collectedFields,
  });

  // 1. WebSocket — devices da recepção atualizam em real-time
  this.io.of('host').to(`tenant:${conv.tenantId}`)
    .emit('reservation:draft:new', { draft });

  // 2. Push pra todo staff role='host' ativo
  const hostStaff = await this.staffRepo.find({
    where: { tenantId: conv.tenantId, role: 'host', active: true }
  });
  await Promise.all(hostStaff.map(s => this.notifyStaff.notifyStaff(s.id, {
    title: 'Nova reserva no WhatsApp',
    body: `${draft.collectedFields.name} · ${draft.collectedFields.party} pessoas · ${formatTime(draft.collectedFields.scheduledAt)}`,
    data: { type: 'reservation_draft', draftId: draft.id },
    priority: 'high',
  })));
}

// quando aprovar
async approve(draftId: string, staffId: string, edits?: Partial<Reservation>) {
  const draft = await this.repo.findOneOrFail({ where: { id: draftId } });
  const fields = { ...draft.collectedFields, ...edits };

  const reservation = await this.reservationsRepo.save({
    tenantId: draft.tenantId,
    ...fields,
    status: 'awaited',
    whatsappConversationId: draft.conversationId,
  });

  draft.status = edits ? 'edited_approved' : 'approved';
  draft.approvedReservationId = reservation.id;
  draft.reviewedByStaffId = staffId;
  draft.reviewedAt = new Date();
  await this.repo.save(draft);

  // confirmação pro cliente via template aprovado
  await this.whatsapp.sendTemplate(draft.collectedFields.phone, 'reservation_confirmed', {
    name: fields.name,
    date: formatDateTime(fields.scheduledAt),
    party: fields.party,
  });

  // reminder 2h antes
  await this.scheduleReminder(reservation.id, fields.scheduledAt);
}
```

### Fluxo do dia (consolidado)

1. **Início do turno** (09:00) → app puxa `GET /host/reservations/today` ordenado por `scheduledAt`.
2. **Cliente manda mensagem no zap** → state machine conduz a conversa exigindo **nome, telefone, CPF, data, hora** (todos obrigatórios; observação opcional). Sem campos faltantes, bot insere direto em `reservations` com status `confirmed`. **Não há fluxo de revisão de draft** — recepcionista vê a reserva pronta na lista.
3. **Reservas com horário 30 min antes do agora** aparecem em destaque na aba Reservas (badge "Esperada agora").
4. **Cliente chega** → recepcionista toca **Marcar chegada** → `PATCH /host/reservations/:id { status:'arrived' }`.
5. Se a reserva tem `tableNumber` atribuída e a mesa está `livre`, backend chama `POST /host/tables/:n/release { partySize, reservationId }` automaticamente. Se a mesa não está livre, app emite alerta "Mesa N ocupada — atribuir outra?".
6. WebSocket `host:reservation:arrived` atualiza todos os devices.
7. Cron às 22:00 marca `noshow` automático em reservas com `scheduledAt < now() - 60 min` e `status='awaited'` — dispara template `reservation_no_show` pro cliente: _"Sentimos muito, perdemos sua reserva de hoje. Esperamos te ver em breve!"_

### Endpoints (consolidados)

```
# webhook do WhatsApp
GET    /webhooks/whatsapp                      — verificação inicial (Meta exige)
POST   /webhooks/whatsapp                      — entrada (valida X-Hub-Signature-256)

# leitura/escrita interna (app da recepcionista)
GET    /host/reservations/today                — reservas do dia ordenadas por scheduledAt
GET    /host/reservations?date=2026-05-10&status=awaited
PATCH  /host/reservations/:id                  — atualizar status / mesa / observação
DELETE /host/reservations/:id                  — cancelar (manda template "cancelled")

# drafts pendentes
GET    /host/reservation-drafts                — lista pending
POST   /host/reservation-drafts/:id/approve    — vira Reservation
                                                 body: { edits?: { party?, scheduledAt?, tableNumber?, note? } }
POST   /host/reservation-drafts/:id/reject     — descarta + manda mensagem livre
                                                 body: { replyToCustomer: string }

# handoff humano (bot → recepcionista)
GET    /host/whatsapp/conversations            — conversas em handoff aguardando resposta
POST   /host/whatsapp/reply                    — recepcionista responde manualmente
                                                 body: { conversationId, body }

# block list
POST   /host/whatsapp/block                    — bloqueia número
DELETE /host/whatsapp/block/:phone             — desbloqueia
```

### Métricas (pra dashboard do gerente)

```
GET /manager/reservations/metrics?range=30d
→ {
    totalReservations: 941,
    botSuccessRate: 0.83,                  // % de conversas que viraram draft (sem handoff)
    handoffRate: 0.17,                     // % que precisaram de humano
    draftApprovalRate: 0.92,               // % de drafts aprovados sem edição
    draftEditRate: 0.06,                   // % aprovados com edição
    draftRejectionRate: 0.02,              // % rejeitados
    avgPartySize: 3.4,
    noShowRate: 0.08,                      // 30d
    avgConversationTurns: 6.2,             // turnos do bot por conversa concluída
    topNoteTags: [
      { tag: 'birthday',   count: 87  },
      { tag: 'vegetarian', count: 54  },
      { tag: 'baby',       count: 41  },
      { tag: 'quiet',      count: 28  },
    ],
  }
```

Recepcionista NÃO vê essas métricas — quem vê é o gerente, na aba **Painel**.

---

## ⭐ Cascata de notificações (PRIORIDADE)

> **Caso de fallback central.** Cliente entra no restaurante, senta numa mesa e escaneia o QR sem passar pela recepção. Se o sistema não fizer nada, o cliente fica sem garçom atribuído e o pedido cai num limbo. A cascata garante que, em até 60 segundos, **alguém** está cuidando.

### Quando dispara

Cada mesa tem `status: 'livre' | 'liberada' | 'ocupada' | 'alerta'`. Quando um QR é escaneado:

```ts
function onQrScan(tableNumber: number, deviceId: string) {
  const table = await getTable(tableNumber);

  if (table.status === 'liberada') {
    // fluxo feliz — vira ocupada e atribui garçom
    return assignWaiterAndStart(tableNumber, deviceId);
  }

  // fluxo de fallback — cliente sentou sem passar pela recepção
  await setStatus(tableNumber, 'alerta');
  await startCascade(tableNumber, deviceId);
}
```

### Etapas da cascata

| Etapa      | Atraso                   | Quem é avisado                                      | Como                               |
| ---------- | ------------------------ | --------------------------------------------------- | ---------------------------------- |
| **T+0 s**  | imediato                 | recepcionista de plantão                            | push + lock screen + banner in-app |
| **T+30 s** | só se T+0 não respondeu  | gerente de plantão                                  | push + lock screen + banner in-app |
| **T+60 s** | só se T+30 não respondeu | garçom da praça da mesa                             | push + lock screen + banner in-app |
| **T+90 s** | só se ninguém respondeu  | broadcast a todos os garçons + alerta sonoro no KDS | push + alarme                      |

Quem agir primeiro **encerra a cascata**. Os outros recebem um banner _"Resolvido por X às HH:MM"_ e o item some do inbox.

### Como o backend gerencia

```ts
type CascadeStep = {
  level: 'host' | 'manager' | 'waiter' | 'broadcast';
  notifiedAt: string; // ISO
  notifiedUserIds: string[];
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
};

type Cascade = {
  id: string;
  tableNumber: number;
  partySize: number; // estimado pelo nº de devices conectados ao QR
  startedAt: string;
  resolvedAt: string | null;
  resolution: 'liberated' | 'rejected' | 'expired' | null;
  steps: CascadeStep[];
};

// Job recorrente checa a cada 5 s se algum CascadeStep precisa escalar
async function tickCascades() {
  const active = await getActiveCascades();
  for (const c of active) {
    const lastStep = c.steps[c.steps.length - 1];
    const elapsed = (Date.now() - new Date(lastStep.notifiedAt).getTime()) / 1000;
    if (lastStep.acknowledgedAt) continue; // alguém pegou, fim
    if (lastStep.level === 'host' && elapsed >= 30) escalateTo('manager', c);
    if (lastStep.level === 'manager' && elapsed >= 30) escalateTo('waiter', c);
    if (lastStep.level === 'waiter' && elapsed >= 30) escalateTo('broadcast', c);
  }
}
```

### Endpoints da cascata

```
POST /qr/scan/:tableNumber              — cliente escaneia (bate ponto da cascata)
GET  /cascades/active                   — lista de cascatas em aberto
POST /cascades/:id/acknowledge          — acionado por host / manager / waiter
       body: { resolution: 'liberated' | 'rejected', userId }
POST /cascades/:id/resolve              — fecha (vira ocupada se liberated)
GET  /cascades/:id                      — detalhe + timeline para a tela ScreenHostAlertDetail
```

### Push notifications da cascata

A mesma estrutura de push do bloco "Realtime — sockets" + um campo `cascade` extra:

```ts
type CascadePush = {
  type: 'cascade:notify';
  level: 'host' | 'manager' | 'waiter' | 'broadcast';
  cascadeId: string;
  tableNumber: number;
  partySize: number;
  // copy adaptado por papel — gerado no backend
  title: string; // ex: "Mesa 14 · sentou sem liberação"  (host)
  //     "Recepção não atendeu mesa 14"   (manager)
  //     "Sua mesa 14 está sem garçom"    (waiter)
  body: string;
  sound: 'urgent'; // toca som diferente da notificação normal
  actions: [
    { label: 'Liberar agora'; deepLink: 'app://cascade/{id}/liberate' },
    { label: 'Recusar'; deepLink: 'app://cascade/{id}/reject' },
  ];
};
```

> Os botões **Liberar agora** e **Recusar** vêm dentro do próprio push (iOS interactive notifications + Android expanded notifications) — a pessoa não precisa abrir o app pra resolver. Se ela tocar no banner, abre `ScreenHostAlertDetail` com o `role` já correto.

### O que ainda **não existe** e precisa ser criado

- [ ] Tabela `cascades` + `cascade_steps`
- [ ] Job `cascade_tick` rodando a cada 5 s
- [ ] Templates de copy por papel (3 versões de title/body para `host` / `manager` / `waiter`)
- [ ] Som customizado de cascata (mais urgente que o som padrão de chamado)
- [ ] Endpoint `POST /qr/scan/:tableNumber` precisa olhar o `status` antes de criar a sessão
- [ ] Tela `ScreenHostAlertDetail` (já existe no design) precisa ler de `GET /cascades/:id`

---

## Notificações in-app (substituem "ligar para")

> O usuário sinalizou que a opção **"Ligar para a cozinha"** não faz sentido — não há telefone. Ela vai ser substituída por **notificações in-app** com ações inline. Mesma mecânica da cascata, sem timer de escalação.

### Caso 1 · Gerente pede pra cozinha alterar ordem de preparo

Cenário: gerente vê na tela de gargalos que a mesa 14 está há 22 min esperando o risoto. Ele quer pedir pra cozinha **puxar pra frente**.

Componente: `ScreenManagerKitchenReorder` (em `garcom-screens-d.jsx`). Tem 3 estados controlados pelo prop `state`:

**`state="select"` (entrada)** — Hero laranja "Cozinha lenta agora · 11 pedidos · 2 já passaram da meta". Lista a fila atual com checkbox em cada linha (mesa, items, tempo em preparo, garçom responsável; pedidos atrasados ficam destacados em vermelho). Campo de motivo opcional ("Mesa 14 está há 22 min, comemorando aniversário"). Sticky bottom: contador de selecionados + CTA **Avisar cozinha · puxar N pra frente**.

**`state="sent"` (aguardando)** — Hero azul "Aviso enviado · cozinha vai responder · ~30 s". Mostra os pedidos selecionados (read-only) + motivo enviado. Indicador de loading. CTA **Cancelar pedido**.

**`state="accepted"` (resposta da cozinha)** — Hero verde "Cozinha aceitou · 2 pedidos foram puxados pra frente". Lista os garçons que foram avisados (avatar + nome + mesa + ETA). Card resumo "O que aconteceu" com 3 passos (cozinha repriorizou / pushes enviados / outros pedidos empurrados pra trás). CTA **Voltar pro painel**.

**No KDS / tv-cozinha-bar.html** (canvas separado, horizontal) — chega um banner urgente no topo da tela da cozinha:

- _"Gerente pediu pra puxar pra frente · mesa 14 + mesa 7"_
- Lista os pedidos com novo ordering proposto + motivo
- 2 botões: **Aceitar** (move ao topo da fila) · **Recusar** (texto livre obrigatório)
- 30 s sem resposta = mantém fila como está, dispara push pro gerente "cozinha não respondeu"

**O que o software faz no Aceitar:**

1. Reordena `kitchen_queue.priority` dos pedidos selecionados
2. Push pro **garçom de cada mesa afetada** (`kitchen-reorder-waiter`): _"Risoto da mesa 14 vai sair primeiro · sai em ~5 min"_
3. Push pro **gerente** (`kitchen-reorder-manager`): _"Cozinha aceitou alteração · Olivia e Caleb foram avisados"_
4. Loga em `audit_log` quem mudou a ordem (gerente), quem aceitou (cozinheiro), motivo, ordering antes/depois — pra retrospectiva e pra detectar abuso (gerente repriorizando demais)

### Caso 2 · ~~Despausar fluxo de pedidos por garçom~~ — REMOVIDO

> **Decisão de produto:** pausa de garçom (telas + push de fim de pausa) saiu inteiramente do app. As ações `Pausar 5 min` / `Pausar` no MoreSheet e nos cards de funcionário também sumiram. Quando o gerente quer aliviar a carga de alguém sobrecarregado, o caminho agora é **Realocar mesas** (passa as mesas pra outro garçom) — sem bloquear o garçom em si. A coluna `staff_users.is_paused` no DB pode ficar — só não temos UI nem endpoints públicos pra ela.

### Endpoints

```
POST /kitchen/reorder            — gerente envia pedido de reordenação
     body: { orderIds: string[], note: string }
POST /kitchen/reorder/:id/accept — cozinheiro aceita
POST /kitchen/reorder/:id/reject — cozinheiro recusa (note obrigatório)
```

---

## Pause de pedidos novos (modo silencioso)

> O gerente pode pausar a entrada de pedidos novos quando a cozinha está sobrecarregada. **O cliente NÃO pode ver isso** — pra ele, o app continua aceitando pedidos normalmente. O que muda é que o tempo estimado de preparo aumenta silenciosamente.

Componente: `ScreenManagerOrdersPause` (em `garcom-screens-d.jsx`). Estados: `confirm` (escolhendo duração) → `active` (rodando com countdown grande, stats em tempo real, botões de despausar antes ou estender +5 min).

### Como funciona

1. Gerente toca **"Pausar pedidos"** num alerta de "Cozinha · fila excedeu capacidade" ou no Painel
2. Tela `confirm`: chips de duração (5 / 10 / 15 / 30 min · default 5) + bloco explicando que o cliente não vê pause + botão **Pausar pedidos por N min**
3. Backend marca `restaurant.orders_paused_until = now + N min`
4. **Front do cliente continua aceitando pedidos** — só que o `eta_minutes` retornado pela API soma o tempo de pause silenciosamente. Sem mensagem de "indisponível", sem carrinho bloqueado
5. Cozinha vê os pedidos novos numa fila separada (`paused_queue`) — só vão pro `kitchen_queue` quando o pause acabar
6. Tela `active`: countdown grande 4:23 → 0:00, barra de progresso, stats em tempo real (cardápio cliente / pedidos na fila / cozinha caindo / saída média). Botões: **+5 min** (estender) ou **Despausar agora**
7. Quando termina, push pro gerente: _"Pedidos retomados · 3 pedidos novos entraram na cozinha · fila agora em 7"_

### Retomada automática

Se o gerente esqueceu o pause ativo e ele já passou do tempo, o sistema retoma sozinho e manda push (cenário `pause-auto-resumed` em `garcom-push.jsx`). O cliente nunca soube — só vê o ETA voltando ao normal nos próximos pedidos.

### Endpoints

```
POST /restaurant/orders/pause       — { durationMin: 5|10|15, reason?: string }
DELETE /restaurant/orders/pause     — cancela manualmente antes do prazo
GET  /restaurant/orders/pause       — estado atual (para o painel mostrar)
```

### Tabela

```sql
CREATE TABLE order_pauses (
  id              uuid PRIMARY KEY,
  restaurant_id   uuid NOT NULL,
  paused_by       uuid NOT NULL REFERENCES users(id),
  reason          text,
  duration_min    int  NOT NULL,
  paused_at       timestamp NOT NULL DEFAULT now(),
  ended_at        timestamp,
  ended_by        text   -- 'manual' | 'automatic'
);
```

---

## Atalhos do Painel · deep links (Painel → Ver tudo / Gerenciar / Ferramentas rápidas)

A Opção 1 do Painel do gerente tem 2 atalhos secundários e 3 ferramentas rápidas (já desenhados no canvas):

### Atalhos secundários (links em seções)

| Atalho                         | Deep link                             | Tela destino                                                           |
| ------------------------------ | ------------------------------------- | ---------------------------------------------------------------------- |
| **Atenção · agora · Ver tudo** | `app://manager/alerts/all`            | `ScreenManagerAlertsAll` (lista completa de alertas filtráveis)        |
| **Equipe · Ver mais** ★ V6 ★   | `app://manager/staff?filter=in-field` | `ScreenManagerStaff` (mesma aba Equipe · filtro inicial em "Em turno") |

A navegação volta pro Painel pelo back nativo do bottom nav.

### Ferramentas rápidas (substituem o antigo bloco "Ações rápidas")

O bloco anterior se chamava "Ações rápidas" e era 3 cards menores em grid 1/3 — visualmente parecia info estática (sem chevron, sem afford­ância de toque), e o gerente não percebia que eram botões. **Renomeado pra "Ferramentas rápidas" e refeito como 3 linhas grandes**, cada uma com:

- Ícone tinted à esquerda (40px) em cor da ferramenta
- Título em destaque + sub-label explicativa em uma linha
- **Chevron `›` à direita** (afford­ância clara de tap-to-open)
- Hint sublinhado em cima do bloco: _"Toque pra abrir. Cada uma age direto na operação ao vivo."_

| Ferramenta                   | Cor / ícone       | Sub-label                                      | Deep link                       | Tela destino                    |
| ---------------------------- | ----------------- | ---------------------------------------------- | ------------------------------- | ------------------------------- |
| **Alterar ordem da cozinha** | laranja · `flame` | "Puxar 1 ou + pedidos pra frente da fila"      | `app://manager/kitchen/reorder` | `ScreenManagerKitchenReorder`   |
| **Pausar pedidos novos**     | amarelo · `pause` | "Cliente não vê · só aumenta tempo de preparo" | `app://manager/orders/pause`    | `ScreenManagerOrdersPause`      |
| **Cortesia para a mesa**     | verde · `gift`    | "Mandar item de cortesia · zero atrito"        | `app://manager/courtesy`        | `ScreenManagerCompensateClient` |

Essas 3 são telas modais (não páginas). Voltam pro Painel via X / back. Gerente NUNCA fica preso nelas — sempre é uma ida e volta. No canvas você vê todas as 5 deep-links (2 atalhos secundários + 3 ferramentas rápidas) na seção **"Painel · telas que abrem dos atalhos e ferramentas rápidas"**.

---

## Cortesia · gerente envia mimo pra mesa (Comp. cliente)

> Substitui a antiga ação **"Comp. cliente"** que aparecia no alerta de Cozinha lenta como string solta sem destino. Agora ela tem fluxo completo: composer no app do gerente → modal celebrativo na web do cliente → push pro garçom da praça pra entregar.

### Triggers (de onde abre)

1. **Painel · ação rápida "Cortesia"** — entrada padrão, sem mesa pré-selecionada
2. **Alerta "Cozinha lenta · mesa N" → "Comp. cliente"** — entrada com mesa N pré-selecionada (a sugestão proativa do alerta era exatamente isso)
3. **Bottlenecks · Timeline da mesa → ação "Mandar cortesia"** — também com mesa pré-selecionada
4. **MoreSheet do Financeiro → "Definir meta + cortesia VIP"** — entrada com flag `vip=true` (sai do orçamento de retenção, não do operacional)

### Composição (estados do `ScreenManagerCompensateClient`)

`state="select"` (entrada):

- **Mesa** — chips horizontais com mesas ativas (status=active*verified). Cada chip mostra `Mesa N · party · tempo decorrido`. Mesas com `status=slow` (>1.5× meta) ficam destacadas em laranja com aviso *"está esperando há 1h — mande antes que reclame"\_
- **Tipo** — grid 2-col com 5 opções: Sobremesa / Drink / Couvert / Desconto % / Mensagem só
- **Item específico** — varia por tipo (e.g., Sobremesa → fondant 2 porções; Drink → caipirinha 2 doses; Couvert → R$ 18 sai da conta; Desconto → 15% no total; Mensagem → sem brinde físico)
- **Mensagem opcional** — textarea + 4 sugestões rápidas ("Pelos 1h de espera", "Aniversário", "Volte sempre", "Em branco")
- Sticky bottom: resumo (`Mesa 14 · sobremesa`) + CTA **Enviar cortesia → mesa N**

`state="sent"`:

- Hero azul "Aguardando cliente abrir · ~10 s"
- Card resumo do que foi enviado (item + mensagem em itálico)
- Timeline "O que acontece a seguir" (4 passos: cliente recebe pop-up · aceita ou recusa · garçom recebe push · vira pedido na cozinha)
- CTA **Cancelar cortesia** (revoga antes do cliente aceitar)

`state="accepted"`:

- Hero verde "Cliente aceitou · 'Muito obrigado, vocês são incríveis!'"
- Bloco de resposta do cliente (a mensagem que ele digitou ao aceitar — opcional)
- Lista "Próximos passos": garçom avisado (Olivia recebeu push) + cozinha (#167, prioridade alta, sem cobrança)
- CTA **Voltar pro painel**

### O cliente vê na hora · `CourtesyArrival` + `CourtesyConfirmed`

> **Single source of truth.** A vista do CLIENTE da cortesia mora em `handoff/cliente/cliente-screens.jsx` (`CourtesyArrival` para `received` · `CourtesyConfirmed` para `accepted`). Não duplicamos no canvas do garçom. A cópia anterior (`ScreenCustomerCompensation` em `garcom-screens-d.jsx`) foi deletada no V3 — usava o estilo antigo (cream `#FFFAF4` + serif Iowan + orange + confetti SVG) e divergia do estilo aceito do cliente (branco puro · Inter sans · JetBrains Mono caps tiny · pill ink outline/filled · selo customizado · sem confetti). Pra ver a vista do cliente, abrir `app-cliente-canvas.html`.

Renderizado dentro do app web do cliente (`apps/web-customer`, Next.js, acessado via QR da mesa). É **um modal full-screen** que sobe por cima de qualquer tela em que o cliente esteja (cardápio, pedido, conta). Estados `received` e `accepted` — ver canvas do cliente pra detalhes visuais.

### Backend · ordem de eventos

```
1. POST /manager/courtesy
     body: { tableId, type, itemId?, discountPct?, message? }
     → cria courtesy row + order tipo='courtesy', preço 0, prioridade alta
     → emite WebSocket 'courtesy.received' no namespace da sessão da mesa
     → manager UI vai pra state='sent'

2. Cliente abre modal (auto, via WebSocket listener)
     → tap "Aceitar com gratidão" (ou "Não, obrigado")
     → POST /customer/courtesy/:id/accept ou /reject
     → emite WebSocket 'courtesy.accepted' (ou 'courtesy.rejected')
     → manager UI vai pra state='accepted' (ou state='rejected')

3. Push pro garçom (apenas se aceito)
     → notifyByRole('waiter', { tableId }, { title, body, data, priority='high' })
     → cenário 'courtesy-waiter' em garcom-push.jsx
     → ações inline: Vou pegar / Estou ocupado

4. Push pro gerente (confirmação)
     → cenário 'courtesy-manager' em garcom-push.jsx
     → tone success
```

### Modelo de dados

```sql
CREATE TABLE courtesies (
  id              uuid PRIMARY KEY,
  restaurant_id   uuid NOT NULL,
  table_id        uuid NOT NULL,
  session_id      uuid NOT NULL REFERENCES table_sessions(id),
  sent_by         uuid NOT NULL REFERENCES users(id),  -- gerente
  type            text NOT NULL,
  -- 'dessert' | 'drink' | 'couvert' | 'discount' | 'message'
  item_id         uuid REFERENCES menu_items(id),       -- para dessert/drink
  discount_pct    numeric(4,2),                          -- para discount (e.g., 15.00)
  message         text,
  status          text NOT NULL DEFAULT 'sent',
  -- 'sent' | 'accepted' | 'rejected' | 'cancelled' | 'delivered'
  sent_at         timestamp NOT NULL DEFAULT now(),
  accepted_at     timestamp,
  delivered_at    timestamp,
  delivered_by    uuid REFERENCES users(id),            -- garçom que entregou
  client_response text,                                  -- resposta opcional do cliente
  source          text NOT NULL,
  -- 'painel' | 'alert-kitchen-slow' | 'timeline-table' | 'finance-vip'
  vip             boolean NOT NULL DEFAULT false,
  estimated_cost  numeric(10,2),                         -- pra reporting
  created_at      timestamp NOT NULL DEFAULT now()
);

CREATE INDEX idx_courtesies_table_session ON courtesies(table_id, session_id);
CREATE INDEX idx_courtesies_sent_by ON courtesies(sent_by, sent_at);
CREATE INDEX idx_courtesies_status_open ON courtesies(status) WHERE status IN ('sent', 'accepted');
```

### Endpoints

```
POST   /manager/courtesy              — gerente envia
GET    /manager/courtesy?status=open  — lista pendentes (pra UI)
DELETE /manager/courtesy/:id          — cancela antes do cliente abrir
POST   /customer/courtesy/:id/accept  — cliente aceita (auth: session)
POST   /customer/courtesy/:id/reject  — cliente recusa
POST   /waiter/courtesy/:id/delivered — garçom marca como entregue
GET    /manager/courtesy/report       — relatório do mês (custo + impacto em rating)
```

### Permissão

Apenas `role IN ('owner', 'manager')` pode chamar `POST /manager/courtesy`. **Garçom NÃO pode** mandar cortesia direto — se ele quer, abre uma chamada pro gerente ("Mesa 14 está reclamando, posso pedir cortesia?"). Esse gate evita custo descontrolado.

### Métrica para o dono

A tela `ScreenManagerFinance` deve ter uma linha discreta:

- **Cortesias do mês** · R$ 450 (1.2% do faturamento) · _"Cliente que recebeu cortesia voltou em 73% das vezes vs 41% no controle. ROI ~5×."_

Cortesia bem usada é a melhor ferramenta de retenção do gerente — então ela deve aparecer mensurada, não escondida.

---

## ⭐ QR code de mesa · QR fixo + 3 camadas de proteção (PRIORIDADE)

> **Decisão de produto.** O QR code da mesa é **fixo e permanente** — gravado a laser no tampo de madeira ou metal. Não expira, não rotaciona. Como qualquer assinatura impressa pode ser fotografada e copiada, o sistema **substitui** a proteção por algoritmo (que não funciona contra foto) por **detecção e reação** em 3 camadas.

### Por que QR fixo (e não rotativo)?

1. **Operacional.** Reimprimir QR toda semana é fricção real (gráfica, plastificar, colar, descolar quando suja).
2. **Estético.** O dono quer gravar a laser na mesa — fica bonito e dura anos.
3. **Análise honesta do vetor.** Endurecer o algoritmo do HMAC NÃO resolve "alguém tirou foto do QR". A foto vaza qualquer assinatura visível, independente do algoritmo. O caminho real é detectar e reagir a uso ilegítimo.

### As 3 camadas

#### Camada 1 · Rate limit + audit log (passiva, todo init)

Toda chamada `POST /session/init` é registrada em `session_audit_logs`:

```sql
CREATE TABLE session_audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id        uuid NOT NULL REFERENCES tables(id),
  session_id      uuid NULL  REFERENCES table_sessions(id),
  ip              varchar(45) NOT NULL,
  user_agent      text NOT NULL,
  risk_score      int NOT NULL,
  risk_signals    jsonb NOT NULL,           -- ['datacenter_ip', 'no_mobile_ua', ...]
  decision        varchar(30) NOT NULL,     -- 'auto_approved' | 'pending_review' | 'rejected_by_receptionist' | etc.
  decided_by_staff_id uuid NULL REFERENCES staff(id),
  decided_at      timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON session_audit_logs (table_id, created_at DESC);
CREATE INDEX ON session_audit_logs (ip, created_at DESC);
CREATE INDEX ON session_audit_logs (decision, created_at DESC);
```

Rate limit (interceptor NestJS, Redis quando disponível, in-memory em dev):

- 5 inits/min/IP
- 30 inits/hora/IP
- Resposta 429 com `Retry-After`. Decision = `'rate_limited'` no log.

Cleanup diário às 03:00 BRT: `DELETE FROM session_audit_logs WHERE created_at < now() - interval '90 days'`.

#### Camada 2 · Risk scoring + recepcionista (modo portaria)

Toda abertura de sessão entra em `pending_review` por padrão e aparece na inbox da recepcionista. O risco é calculado por sinais somados:

| Sinal                                                                | Peso |
| -------------------------------------------------------------------- | ---- |
| IP em datacenter ASN (AWS, GCP, Azure)                               | 40   |
| User-Agent sem 'Mobile' / 'Android' / 'iPhone'                       | 30   |
| 3+ inits/min na mesma mesa, mesmo IP                                 | 25   |
| Init fora do horário do restaurante (settings.openingHours vs now()) | 35   |
| Geo-IP fora da cidade do restaurante                                 | 10   |
| Mesa marcada inativa (`tables.is_active=false`)                      | 50   |

**Threshold:** score ≥ 50 = ALTO RISCO. Aparece em vermelho na inbox da recepcionista.

Lookup IP-ASN: maxmind GeoLite2-ASN.mmdb em produção (download mensal); stub `{ asn: 0, isDatacenter: false }` em dev.

#### Camada 3 · Aprovação do garçom no primeiro pedido (fallback)

Se a recepcionista não responder em **30 s**:

- Score < 50 → **auto-promove** sessão para `active_unverified`. Cliente já consegue navegar cardápio. **No primeiro pedido**, o garçom recebe notificação "Confirmar pedido da mesa N" e ele resolve no fluxo natural (já está na mesa entregando os pratos antigos). Se ele confirma → sessão vira `active_verified`. Se ele cancela → sessão vira `rejected` e cliente é desconectado.
- Score ≥ 50 → **escala para o gerente** (Web Push priority='high'). Se gerente não responder em mais 30 s, segue auto-promove para `active_unverified` mas com flag `was_escalated=true` no audit log.

### Estados de sessão

```ts
type TableSessionStatus =
  | 'pending_review' // recém-criada, aguardando recepcionista
  | 'active_unverified' // promovida automaticamente, esperando confirmação do garçom no 1º pedido
  | 'active_verified' // 100% verificada, pode pedir livremente
  | 'rejected' // recepcionista ou garçom rejeitou — bloqueio total
  | 'closed'; // conta fechada
```

### HMAC sem timestamp (QR fixo)

```ts
// apps/api/src/modules/table-session/qr-code.service.ts
generateHmac(tableCode: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(tableCode).digest('hex');
  // sem timestamp — assinatura permanente, gravável no QR físico
}

validateHmac(tableCode: string, signature: string, secret: string): boolean {
  const expected = generateHmac(tableCode, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

URL do QR físico: `https://restaurante.example.com/m/<slug>/<tableCode>?sig=<hmac>`. Permanente até o `qr_hmac_secret` da mesa ser regenerado (e a mesa regravada).

### Endpoints admin de mesas (gerar QR)

```
POST   /admin/tables                         (auth: owner|manager)
       body: { count: number, startCode?: string }
       resp: [{ tableId, tableCode, label, qrUrl, qrSvg }]   — qrSvg pronto pra gráfica/laser

POST   /admin/tables/:id/regenerate-secret    (auth: owner|manager)
       resp: { qrUrl, qrSvg }                  — uso: rotacionar QR de mesa específica.
                                                ⚠️ implica REGRAVAR a mesa fisicamente.

GET    /admin/tables                          (auth: owner|manager|receptionist)
       resp: lista com qrUrl atual. NÃO retorna qr_hmac_secret cru.

GET    /admin/tables/print-sheet              (auth: owner|manager) → PDF/HTML
       Layout A4 com QRs grandes (8 por página) prontos pra gráfica/laser cutter.
```

### Endpoints da recepcionista (camada 2)

```
GET    /reception/sessions               — lista pending_review + active_*, ordem: pending primeiro
POST   /reception/sessions/:id/approve   — pending_review → active_verified
POST   /reception/sessions/:id/reject    — pending_review → rejected
GET    /reception/sessions/:id/audit     — histórico do audit log dessa sessão
```

### Variáveis de ambiente

```
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:owner@restaurante.com
RECEPTION_TIMEOUT_SECONDS=30
ESCALATION_TIMEOUT_SECONDS=30
RATE_LIMIT_INIT_PER_MIN=5
RATE_LIMIT_INIT_PER_HOUR=30
MAXMIND_ASN_DB_PATH=  # caminho pro GeoLite2-ASN.mmdb (opcional em dev)
```

---

## ⭐ Watcher de tráfego anômalo (assistente do gerente)

> **Para que serve.** Mesmo com as 3 camadas, é útil ter um observador passivo que olha o `session_audit_logs` em janela móvel e avisa o gerente quando o padrão sai do esperado. É o "guard de portaria" do sistema.

### O que monitora

```ts
interface WatcherConfig {
  windowMinutes: number; // 15 min default
  rules: WatcherRule[];
}

type WatcherRule =
  | { kind: 'too_many_pending_review'; threshold: 5; severity: 'med' }
  | { kind: 'too_many_rejections'; threshold: 3; severity: 'high' }
  | { kind: 'rate_limited_ip'; threshold: 10; severity: 'high' }
  | { kind: 'init_from_inactive_table'; threshold: 1; severity: 'high' }
  | { kind: 'init_outside_hours'; threshold: 2; severity: 'med' }
  | { kind: 'datacenter_ip_burst'; threshold: 5; severity: 'high' }
  | { kind: 'auto_approval_drift'; threshold: 0.7; severity: 'low' }; // % auto-aprovados sobe muito
```

### Job

Cron `*/2 * * * *` (a cada 2 min) roda em cada tenant:

```ts
async function runWatcher(tenantId: string) {
  const now = Date.now();
  const window = await db.select<AuditLog>(
    `
    SELECT * FROM session_audit_logs
    WHERE created_at > now() - interval '15 minutes'
      AND table_id IN (SELECT id FROM tables WHERE tenant_id = $1)
  `,
    [tenantId],
  );

  for (const rule of config.rules) {
    const triggered = applyRule(rule, window);
    if (triggered) {
      await notifications.notifyByRole('manager', {
        title: `Padrão suspeito: ${rule.kind}`,
        body: humanize(rule, triggered),
        data: { deepLink: `app://manager/security/audit?rule=${rule.kind}` },
        priority: rule.severity === 'high' ? 'high' : 'normal',
      });
      await db.insert('watcher_events', {
        tenantId,
        rule: rule.kind,
        snapshot: triggered,
        at: now,
      });
    }
  }
}
```

### Tabela

```sql
CREATE TABLE watcher_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  rule        varchar(60) NOT NULL,
  snapshot    jsonb NOT NULL,         -- amostra dos audit logs que dispararam
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON watcher_events (tenant_id, at DESC);
```

### O que o gerente vê

> **2026-05 · saiu do app do gerente.** Decisão de produto: as 2 telas (`ScreenManagerSecurity` + `ScreenManagerSecurityAudit`) moveram pra `prototypes/seguranca-qr/` aguardando definição de onde plugar (aba dedicada do gerente com gating de role · app separado `apps/web-admin` · console do dono). O backend (tabelas, watcher, regras) **continua existindo** intacto — só a UI saiu. Pra revisar as telas, abrir `prototypes/seguranca-qr/index.html` num servidor estático na raiz do projeto. A descrição abaixo permanece pro design ser consultado quando voltar.

Tela `ScreenManagerSecurity` (originalmente em `garcom-screens-d.jsx` · agora em `prototypes/seguranca-qr/security-screens.jsx`) — visualização do watcher. Tem 2 modos via prop `state`:

#### Modo `overview` (default · visão geral)

- **Hero do dia**: 3 contadores grandes (mesas abertas hoje · aguardando você · bloqueadas auto) + frase explicativa de uma linha
- **Aguardando você decidir**: lista das sessões em `pending_review` que foram escaladas pra você (risco ≥ 50). Cada card vermelho mostra mesa, score, sinais detectados como pills (ex: `datacenter`, `fora-horario`, `sem-mobile`), tempo desde abertura, e 3 botões inline: **Investigar** (abre modo `investigate`) · **Aprovar** · **Rejeitar**
- **IPs bloqueados automaticamente**: lista de IPs que o watcher ou o rate-limit bloquearam. Cada linha mostra IP, ASN (AWS / Vivo / Claro), motivo do bloqueio, quando bloqueou, quando libera sozinho, com 2 ações: **Desbloquear** (retira agora) · **Bloquear permanente** (entra na blocklist)
- **Eventos suspeitos · últimas 24 h** com **filtro por severidade no topo** (chips: Todos · Críticos · Atenção · Info, com contador). Cada evento: dot colorido pela severidade, título, descrição contextual, horário, badge da regra (`datacenter-burst`, `off-hours`, `too-many-pending`, `repeat-customer`), e 2 ações: **Investigar** · **Marcar como seguro** (só nos info-level e med, vira whitelist daquela regra+IP)
- **Auditoria completa**: link pra `ScreenManagerSecurityAudit` — lista paginada de TODAS as `session_audit_logs` dos últimos 90 dias com filtros por decisão (Todas / Aprovadas / Rejeitadas / Bloqueadas / Escaladas) e por mesa específica (quando vem do Investigate, traz a mesa pré-filtrada num banner amarelo "Filtrando por mesa N · limpar"). Cada linha mostra mesa + horário, IP, ASN, risco numérico, decisão (badge colorido), e quem decidiu. Paginação cursor-based ("Carregar mais 20 registros"). Endpoint: `GET /manager/security/audit?cursor=<id>&limit=20&decision=<filter>&table_id=<id>`. Útil pro gerente: revisar aprovações suspeitas que passaram, comparar mesas com mais bloqueios, identificar IPs reincidentes

#### Modo `investigate` (deep-dive numa mesa específica)

Aberto ao tocar **Investigar** numa sessão pendente OU num evento suspeito. Mostra contexto completo daquela mesa:

- **Hero vermelho**: título do problema (ex: _"3 tentativas no mesmo IP de datacenter"_) + parágrafo explicativo de 3 linhas (qual mesa, qual IP, quantas tentativas, padrão típico de bot, situação atual). Cliente médio entende sem precisar saber o que é HMAC.
- **Histórico de aberturas · últimas 24h**: timeline (com horário, IP, localização geográfica, risco numérico) de TODAS as tentativas naquela mesa. Cada linha tem badge colorido com a decisão (`aprovado` verde, `rejeitado` vermelho, `bloqueado` vermelho, `auto-aprovado` verde, `escalado` cinza)
- **O que fazer · 4 ações poderosas**:
  1. **Bloquear IP** (vermelho) — adiciona o IP à blocklist permanente daquela mesa (ou do tenant inteiro, configurável)
  2. **Regenerar QR da mesa** (amarelo) — cria novo `qr_hmac_secret` no DB. **Aviso explícito de que o QR físico para de funcionar e o gerente precisa regravar a mesa a laser** — consequência real do design "QR fixo na madeira"
  3. **Marcar mesa como inativa** (cinza) — flip `tables.is_active = false`. Sistema rejeita qualquer abertura até reativar manualmente
  4. **Ver auditoria completa** (azul) — abre os 90 dias daquela mesa específica (não a auditoria geral)

A tela tem bottom nav fixa na aba **Gargalos** (segurança vive como sub-rota dela).

---

## Implementação · prompt do Claude Code

Quando for implementar QR fixo + 3 camadas + watcher, use o prompt consolidado do design (já incluído no documento original). Ele inclui:

1. **HMAC sem timestamp** em `qr-code.service.ts`.
2. **Migration `020_expand_session_states.sql`** com os 5 estados.
3. **Tabelas novas**: `session_audit_logs`, `push_subscriptions`, `watcher_events`, `ip_blocks`.
4. **Módulo `security/`**: `rate-limit.interceptor.ts` + `risk-scoring.service.ts` + `session-audit-log.service.ts` + `ip-block.service.ts` (CRUD da blocklist + `isBlocked(ip, tableId)` consultado no init).
5. **Módulo `reception/`**: endpoints + `reception-timeout.service.ts` (timer 30s + escalada 30s).
6. **Módulo `notifications/`**: `notify-staff.service.ts` com adapter `PushTransport[]` (`WebPushTransport` agora; `APNSTransport` / `FCMTransport` depois sem refactor).
7. **Módulo `admin/tables/`**: `POST /admin/tables` (gera QR SVG via lib `qrcode`) + `print-sheet` + `POST /admin/tables/:id/regenerate-secret` (com email de confirmação porque consequência é regravar a mesa a laser) + `PATCH /admin/tables/:id/active` (toggle is_active).
8. **Endpoints do gerente / Security UI**:
   - `GET  /manager/security/overview` — dados pra tela `overview` (KPIs + pending + blocks + watcher events filtráveis)
   - `GET  /manager/security/tables/:id/investigate` — dados pra tela `investigate` (histórico de 24h da mesa, IPs envolvidos)
   - `POST /manager/security/blocks { ip, scope: 'table' | 'tenant', tableId?, expiresAt? }` — bloqueia
   - `DELETE /manager/security/blocks/:id` — desbloqueia
   - `POST /manager/security/events/:id/mark-safe { applyToFutureMatches: boolean }` — marca evento como falso positivo. Se `applyToFutureMatches=true`, cria regra de whitelist (kind+IP) que faz o watcher ignorar matches idênticos por 30 dias.
9. **Mudanças mínimas no web-customer**: tratar novos estados (reaproveitar `PendingApprovalScreen.tsx` com prop `variant='reception_review'`).

**Escopo explicitamente fora**: UIs nativas de recepcionista / gerente / garçom (estão sendo desenhadas aqui no Claude Design); migração silenciosa de mesas legadas (cliente regenera secret + regrava mesa); adapters APNS/FCM (interface pronta, implementação depois).

### Tabela `ip_blocks` (nova)

```sql
CREATE TABLE ip_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  ip          inet NOT NULL,
  scope       varchar(10) NOT NULL,  -- 'table' | 'tenant'
  table_id    uuid REFERENCES tables(id),  -- NULL quando scope='tenant'
  reason      text,
  blocked_by  uuid REFERENCES staff(id),  -- NULL quando automático (rate-limit / watcher)
  blocked_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,                 -- NULL = permanente
  active      boolean NOT NULL DEFAULT true,
  CONSTRAINT scope_consistency CHECK (
    (scope = 'tenant' AND table_id IS NULL) OR
    (scope = 'table' AND table_id IS NOT NULL)
  )
);
CREATE INDEX ON ip_blocks (tenant_id, ip, active);
CREATE INDEX ON ip_blocks (expires_at) WHERE active = true;
```

Job `release_expired_ip_blocks` roda a cada 5 min: `UPDATE ip_blocks SET active = false WHERE expires_at < now() AND active = true`.

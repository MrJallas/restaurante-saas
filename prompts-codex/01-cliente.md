# Round 24 — Bugs do app do cliente (`apps/web-customer`)

## Contexto do projeto

Este é o monorepo `restauranteSaaS`. O app do cliente fica em `apps/web-customer` e é onde o cliente do restaurante interage: scaneia o QR da mesa, vê o cardápio, faz pedido, conversa com o assistente IA, chama o garçom, etc.

### Regras V20 (do `CLAUDE.md`)

Os seguintes arquivos do cliente são **bloqueados visualmente** — eles foram hand-designed na Round 4 e fazem parte do V20 design language. Não trocar tokens visuais (`text-ink`, `text-mute`, `border-soft`, etc.), tipografia (`font-mono` eyebrows 10px, titles 26/700) ou layout central (`grid place-items-center`):

- `apps/web-customer/src/components/welcome/WelcomeModal.tsx`
- `apps/web-customer/src/components/welcome/CpfInput.tsx`
- `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerIdentifyBeforeJoin.tsx`
- `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx`
- `apps/web-customer/src/components/ui/CallWaiterSheet.tsx`
- Reclaim banner em `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx`
- Landing branch `!chatStarted` em `apps/web-customer/src/app/[slug]/assistente/page.tsx`

Se precisar mexer em algum desses por fix funcional, mantém o visual idêntico. Refatores estruturais (extrair `FieldShell` etc) ok desde que preserve 100% da aparência.

### Canvas (source-of-truth visual)

- `docs/design-canvas/handoff/cliente/cliente-journey-v20.jsx`
- `docs/design-canvas/handoff/cliente/cliente-late-arrival.jsx`
- `docs/design-canvas/handoff/cliente/cliente-menu-drawer-v20.jsx`
- `docs/design-canvas/handoff/cliente/cliente-table-merge.jsx`
- `docs/design-canvas/handoff/cliente/cliente-screens-v2.jsx`

---

## Bugs

### 1. Geolocalização — bloqueante de entrada no app do cliente

**Cenário**: Cliente scaneia o QR da mesa e entra no app.

**Atual**: O app **não pede permissão de localização**.

**Esperado**:

- App pede permissão de geolocalização **antes** de deixar entrar
- Se cliente **negar** ou **estiver fora do raio** do restaurante → **não entra**, mostra mensagem explicando
- Raio inicial pra teste: **3 metros** (deve ser configurável pelo gerente depois — pode ser fixo no env por enquanto)
- Quando dentro do raio: badge/info "dentro da área do restaurante"
- Capturar localização aproximada do cliente em metros em relação ao centro do raio — esse dado tem que aparecer pra recepcionista (vê `02-recepcionista.md` bug 1)

**Componente backend**: o endpoint que valida a entrada do cliente precisa receber lat/long e validar contra o raio — coordena com `06-api-transversais.md` bug 1.

**Critério de aceitação**:

- [ ] Cliente sem permissão de geolocation não consegue entrar
- [ ] Cliente fora do raio (3m) vê mensagem clara e não entra
- [ ] Lat/long do cliente é enviado pro backend e fica disponível pra recepcionista

---

### 3. Botão "Repetir última visita" — regras erradas

**Cenário**: Acabei de criar um cliente novo no app, nunca fiz pedido nenhum.

**Atual**:

- O botão "Repetir última visita" **aparece mesmo sem histórico** (não tem nada no banco, é cliente novo)
- Quando clico, **leva pro menu** (cardápio normal)

**Esperado**:

- O botão **só aparece se o cliente tiver visitas anteriores com itens pedidos no banco**
- Ao clicar, abrir a **tela de "Confirmar itens pra mandar pra cozinha"** já pré-populada com os itens da última visita
- Se o cliente verbalizar pro LLM "quero só as bebidas e entradas da última vez" / variações, o LLM deve:
  - Adicionar itens usando **ID do item** do cardápio (não por nome)
  - **Validar** se cada item ainda existe no cardápio atual
  - Se o item é de cardápio antigo (deprecated/removido):
    - Avisar o cliente que o prato não tem mais
    - **Recomendar substituto equivalente** do cardápio atual (ex.: se pediu uma entrada antes, sugere uma entrada do cardápio atual)
  - Se o cliente pediu "entrada + bebida" antes e o cardápio mudou, sugerir entrada + bebida atuais que faça sentido

**Componente API/LLM**: ver `06-api-transversais.md` bug 3 — tool nova/extendida que recebe lista de item IDs históricos e devolve match no cardápio atual.

**Critério de aceitação**:

- [ ] Botão escondido pra cliente sem histórico
- [ ] Botão presente abre tela de revisão pré-populada (não o menu)
- [ ] LLM consegue interpretar "só as bebidas/entradas" e adicionar itens corretos
- [ ] Itens de cardápio antigo são tratados com recomendação de substituto

---

### 4. Estado do assistente IA NÃO atualiza ao navegar via menu hambúrguer

**Cenário reproduzido**:

1. Estava em `/assistente`
2. Abri o menu hambúrguer → cliquei em "Cardápio" → fui pro cardápio
3. Voltei pra `/assistente` **pelo próprio menu hambúrguer** (clicando "Voltar ao assistente")

**Atual**:

- O eyebrow "VOCÊ ESTEVE NO MENU" **não aparece** ao lado do "ASSISTENTE" (greeting do continuation API ficou stale)
- Quando volto pelo **botão de voltar do navegador**, aí sim aparece "VOCÊ ESTEVE NO MENU"
- Continuando: cliquei "Chamar garçom" pelo menu hambúrguer → arrastei o bottom-sheet pra baixo → fiz refresh
- A **mesma mensagem antiga continuou** em vez de atualizar pra contexto "chamar garçom"

**Raiz suspeita**: navegação via menu hambúrguer não dispara re-fetch da continuation API. Estado SPA fica congelado com o último valor.

**Esperado**:

- Toda mudança de contexto (cliente entrou em menu / chamou garçom / etc) deve disparar atualização do greeting do assistente quando voltar pra `/assistente`
- O greeting reflete a última ação relevante do cliente

**Componente API**: ver `06-api-transversais.md` bug 4 — continuation API talvez precise expor um `version`/`updated_at` que o cliente verifica ao re-montar a página.

**Critério de aceitação**:

- [ ] Voltar via menu hambúrguer mostra eyebrow correto ("VOCÊ ESTEVE NO MENU", "VOCÊ CHAMOU O GARÇOM", etc.)
- [ ] Mesmo comportamento quando volta via botão de voltar do navegador
- [ ] Refresh da página re-fetcha continuation

---

### 5. "Conversa antiga" (histórico de conversas com IA) — múltiplos bugs

**Cenário**: No menu "Conversas com IA" (histórico de threads dos últimos 30 dias).

**Bugs**:

1. Ao clicar numa thread pra continuar → tela mostra erro **"Thread nao encontrada"**
   - Verificar se a thread realmente foi apagada do banco ou se é problema de fetch (talvez falha de query/permission no endpoint)
2. Botão de voltar (`<`) **não funciona** nessa tela de erro
3. Modal/menu de "Apagar essa conversa?" aparece **MUITO embaixo** — cortado pela barra de navegação do iOS Safari. Não dá pra ler o conteúdo nem ver botões de Sim/Cancelar

**Esperado**:

- Clicar numa thread carrega o histórico e permite continuar conversando
- Se a thread realmente não existir mais (TTL 30 dias), mostrar mensagem amigável (não erro técnico) e voltar pra lista
- Botão voltar funcional
- Modal de "Apagar essa conversa?" deve respeitar safe-area do iOS — usar `env(safe-area-inset-bottom)` ou similar

**Componente API**: ver `06-api-transversais.md` bug 5 — verificar lifecycle de thread (TTL 30 dias documentado em `docs/design-canvas/docs/features/chat-history-lgpd.md`).

**Critério de aceitação**:

- [ ] Thread existente abre com histórico
- [ ] Thread inexistente mostra empty state amigável
- [ ] Botão voltar funcional
- [ ] Modal de apagar visível por inteiro no iOS Safari

---

### 6. Mensagens cliente↔equipe — entrada na conversa bloqueada

**Cenário**: No menu de mensagens cliente↔equipe.

**Atual**:

- Tentei entrar numa conversa específica → não permitiu acesso
- Botão de voltar dessa página **não funciona**

**Esperado**:

- Verificar se a conversa foi realmente apagada do banco ou se é problema de fetch/permissão
- Se apagada: empty state amigável
- Botão voltar funcional

**Critério de aceitação**:

- [ ] Entrar na conversa funciona ou mostra empty state claro
- [ ] Voltar funciona

---

### 14 + 15 + 26. Tela "Reclamações" + apagar conversas sem IA + reclamação manual cliente→gerente

**Contexto**: No perfil do cliente (`/[slug]/mesa/[code]/eu` ou similar), na seção "PRIVACIDADE":

- Item de menu **"Reclamações · Histórico do atendimento"** existe na lista mas **leva a uma rota inexistente** (tela não existe ainda)
- Item **"Apagar minhas conversas · Pelo assistente · efeito imediato"** existe — mas **depende da IA** pra apagar (errado)

**Esperado**:

**A) Tela "Reclamações" precisa existir** com:

- Histórico de reclamações que o cliente já abriu naquele restaurante (ou em geral, se aplicável)
- **Botão pra enviar uma reclamação manual pro gerente**:
  - Cria conversa cliente↔gerente
  - Manda notificação pro gerente (badge de "nova reclamação" no painel do gerente)
- Layout consistente com as outras telas do cliente (V20)

**B) "Apagar minhas conversas" não pode passar pela IA**

- Usar o **mesmo mecanismo já existente em "Mensagens com a equipe"** — botão direto na UI + modal de confirmação ("Vai sumir todas as conversas com a equipe · não tem volta") com botões "Sim, apagar tudo" / "Cancelar"
- Precisa de um botão extra pra **escolher escopo**: apagar conversas da **equipe**, da **IA**, ou **todas**
- Após apagar: empty state ("Nenhuma mensagem por aqui ainda" ou equivalente)
- Footer LGPD permanece: "SUAS MENSAGENS FICAM AQUI POR 30 DIAS E SÃO APAGADAS AUTOMATICAMENTE · LGPD ART. 18"

**Componente API**: ver `06-api-transversais.md` bugs 14, 15, 26.

**Refs canvas**:

- `docs/design-canvas/docs/features/chat-history-lgpd.md`
- `docs/design-canvas/docs/features/complaint-flow-v12.md`

**Critério de aceitação**:

- [ ] Item "Reclamações" abre tela funcional com histórico + botão "Nova reclamação"
- [ ] Reclamação manual cria conversa com gerente + notifica
- [ ] "Apagar conversas" é UI direta (sem IA) com escolha de escopo (equipe/IA/todas)

---

### 16. "Revise seu pedido" — taxa de serviço 10% no lugar errado

**Cenário**: Cliente adiciona Picanha na Brasa (R$ 78,90) à comanda, abre "Revise seu pedido" antes de enviar pra cozinha.

**Atual**:

- Tela mostra `Subtotal R$ 78,90 + Taxa de serviço (10%) R$ 7,89 = Total estimado R$ 86,79`
- A taxa de serviço aparece em **cada pedido individual** mandado à cozinha

**Esperado**:

- Os 10% **NÃO** devem aparecer em "Revise seu pedido"
- Taxa de serviço aparece **apenas no fechamento da conta da mesa** (momento do "Pedir a conta")
- Justificativa: cliente pode mandar vários pedidos durante a refeição (entrada, prato, sobremesa, bebida). Calcular taxa em cada submissão não faz sentido — é cálculo único sobre o consumo total no fim.

**Componente API**: ver `06-api-transversais.md` bug 16 — endpoint de fechamento da conta calcula taxa; pedido individual não.

**Critério de aceitação**:

- [ ] "Revise seu pedido" mostra só Subtotal + itens (sem linha de taxa)
- [ ] Tela de fechamento da conta da mesa mostra Subtotal + Taxa (10%) + Total

---

### 17. Checkbox "Usar esta opção para os próximos itens" não persiste

**Cenário**: Cliente adiciona item, abre bottom-sheet "Onde lançar este item? · Escolha a comanda" (Minha comanda vs Comanda da mesa). Marca o checkbox "Usar esta opção para os próximos itens" e adiciona à minha comanda.

**Atual**: No próximo item, **o checkbox aparece de novo** (preferência não foi salva).

**Esperado**:

- Preferência persiste por session (ou enquanto o cliente estiver na mesa)
- UI precisa ter um ponto fácil de:
  - **Redefinir** a preferência
  - **Trocar** entre "minha comanda" e "comanda da mesa"
- Pode ser:
  - No cardápio (header ou menu hambúrguer)
  - Como item global em algum lugar do app
- Sugestão: chip discreto no header do cardápio "Lançando em: Minha comanda · trocar"

**Componente API**: ver `06-api-transversais.md` bug 17.

**Critério de aceitação**:

- [ ] Marcar checkbox uma vez aplica pros próximos itens da session
- [ ] Cliente tem UI clara pra trocar/redefinir
- [ ] Bottom-sheet só aparece de novo se cliente redefinir

---

### 18. Tela "Meus pedidos" feia × tela dinâmica de status — mesclar

**Cenário**: Cliente faz pedido → abre tela dinâmica linda com status do preparo. Sai dessa tela, clica "Meus pedidos" no menu hambúrguer → vai pra outra tela "muito feia" sem o mesmo polish.

**Atual**:

- Existem 2 telas diferentes:
  1. Tela dinâmica/interativa pós-pedido com tempo que muda dinamicamente (conforme qtd de pratos na cozinha + pausas do gerente). **Verificar se essa é a implementação atual ou se é o "ideal" — essa era a forma intencional do menu**
  2. Tela "Meus pedidos" do menu hambúrguer — feia

**Esperado**:

- **Mesclar as duas** em uma tela única "Meus pedidos":
  - **Se há pedido ativo na cozinha/bar pra essa mesa**: tela dinâmica com preço + estágio atual de preparo, atualizando em tempo real
  - **Depois de completar/entregar**: tela bonita com histórico de pedidos da mesa
- **Botão pra alternar entre "comanda da mesa" e "minha comanda"** — só aparece se a pessoa tiver itens na própria comanda; caso contrário, escondido

**Refs canvas**:

- `docs/design-canvas/handoff/cliente/cliente-journey-v20.jsx` (procurar tela de status do pedido)
- `docs/design-canvas/handoff/cliente/cliente-screens-v2.jsx`

**Critério de aceitação**:

- [ ] Apenas uma tela "Meus pedidos" (sem 2 versões)
- [ ] Estado "tem pedido ativo": layout dinâmico com preparo em tempo real
- [ ] Estado "sem pedido ativo": layout de histórico
- [ ] Toggle minha comanda ↔ comanda da mesa quando aplicável

---

## Validação automatizada obrigatória

- Rodar builds/testes relevantes e `git diff --check`.
- Validar os fluxos do cliente em simulador iOS usando idb do Facebook: QR/entrada, modal de boas-vindas, assistente, cardápio, pedido, revisão, "Meus pedidos" e safe-area/teclado quando aplicável.
- Quando o bug envolver LLM/tools/chips, testar pelo chat real do app com o LLM local ligado; conferir `assistant_messages.tool_calls`, chips e efeito real no backend.
- Usar Playwright apenas como apoio para cenários determinísticos de desktop/mobile web; o aceite de UX mobile do cliente deve ter evidência idb com screenshots.
- Salvar evidências em `qa-reports/cliente-<bug>/` ou equivalente.

## Checklist final do chat

Não confiar no toast de "em desenvolvimento" — se um botão não funciona, ou implementa ou esconde. Nada de placeholders cinza visíveis pro cliente.

Pra cada bug acima:

- Implementar fix
- Adicionar/atualizar teste E2E se houver fluxo do bug
- Não modificar arquivos listados como V20-locked sem fix funcional necessário
- Documentar mudança no CHANGELOG/round notes se aplicável

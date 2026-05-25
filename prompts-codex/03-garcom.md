# Round 24 — Bugs do app do garçom (`apps/web-staff/src/app/waiter` + `garcom`)

## Contexto do projeto

Este é o monorepo `restauranteSaaS`. O app do garçom está em `apps/web-staff/src/app/waiter` (e/ou `garcom`). Ele recebe chamados, lança pedidos diretos na mesa, vê suas mesas atendidas, recebe pedidos prontos da cozinha pra entregar.

### Bottom nav do garçom

`Mesas / Chamados / Novo / Turno / Eu`

### Canvas (source-of-truth visual)

- `docs/design-canvas/handoff/garcom/garcom-app.jsx` (app completo)
- `docs/design-canvas/handoff/garcom/garcom-screens-a.jsx` até `garcom-screens-e.jsx`
- `docs/design-canvas/handoff/garcom/garcom-screens-host.jsx` (telas compartilhadas com host)
- `docs/design-canvas/handoff/garcom/garcom-late-arrival-info.jsx`
- `docs/design-canvas/handoff/garcom/garcom-complaint.jsx`
- `docs/design-canvas/handoff/garcom/garcom-table-merge-info.jsx`
- `docs/design-canvas/handoff/garcom/garcom-qr-issue.jsx`
- `docs/design-canvas/v11-waiter-eu-ios.png` (perfil "Eu" do garçom)
- `docs/design-canvas/v4-entry-chooser.png` (modal "Como vai começar?")

---

## Bugs

### 20. Sino superior direito abre página do GERENTE

**Cenário**: Garçom clica no sininho de notificações (topo direito).

**Atual**:
- Abre uma tela com bottom nav `Painel / Operação / Equipe / Financeiro / Eu` — **isso é o bottom nav do gerente, não do garçom**
- Badge rosa de erro técnico: `manager-only endpoint`

**Esperado**:
- Tela de notificações dedicada do garçom
- Bottom nav permanece o do garçom (`Mesas / Chamados / Novo / Turno / Eu`)
- Sem erro técnico vazando

**Componente API**: ver `06-api-transversais.md` bug 20 (mesmo problema afeta host — `02-recepcionista.md` bug 12).

**Critério de aceitação**:
- [ ] Sininho do garçom abre tela de notif do garçom
- [ ] Bottom nav permanece do garçom
- [ ] Sem `manager-only endpoint`

---

### 21. "Novo" (tirar novo pedido) bugado + remover opção "Reservar"

**Cenário A**: Estou na tela "Chamados" (vazia: "Sem chamados nessa categoria"). Clico no botão central do bottom nav "Novo" → **nada acontece**. Pra abrir esse menu, tenho que ir em "Eu" primeiro.

**Cenário B**: Quando consigo abrir o modal "**NOVO ATENDIMENTO · Como vai começar?**", aparecem 3 opções:
- **Cliente nova visita** (Escanear o QR da mesa · ação principal)
- **Pedido direto** (Lançar comanda em mesa que você já atende)
- **Reservar** (Marcar mesa pra cliente que vai chegar mais tarde) ← **REMOVER**

**Esperado**:
- Botão "Novo" no bottom nav funciona em **qualquer tela** (não só vindo de "Eu") — abre o modal "Como vai começar?"
- **Remover** opção "Reservar" — garçom NÃO reserva mesa, só recepcionista (host) faz isso
- Restam só "Cliente nova visita" + "Pedido direto"

**Refs canvas**:
- `docs/design-canvas/v4-entry-chooser.png`
- `docs/design-canvas/handoff/garcom/garcom-app.jsx`

**Critério de aceitação**:
- [ ] Botão "Novo" funciona em qualquer tela
- [ ] Modal "Como vai começar?" mostra só 2 opções (Cliente nova visita / Pedido direto)
- [ ] Opção "Reservar" removida do garçom (mantém apenas no host)

---

### 22. Lançamento rápido de pedido pra mesa — completamente bugado

**Cenário reproduzido**:
1. Clico em "Pedido direto" no modal "Como vai começar?"
2. Vai pra tela "**Escolher mesa**"
3. ATENDENDO ATUALMENTE: Mesa 01 - 1 pessoa, Mesa 92 - 1 pessoa, Mesa 91 - 2 pessoas
4. Clico em qualquer mesa

**Atual**:
- Abre tela **ERRADA**: "**Entrega · PEDIDO PRONTO · Confirme com os seus clientes se está tudo certo antes de marcar como entregue**" (com botões "Cancelar / Confirmar entrega")
- Essa tela é o fluxo de **marcar entrega da cozinha**, não de lançar pedido novo
- Toast de erro vermelho no rodapé: `"Pedido nao identificado neste fluxo - marque entregue pela aba 'Pedidos'"`

**Esperado**:
- Clicar numa mesa em "Escolher mesa" → abrir tela de **"lançamento rápido"** que existe no canvas
- Depois de selecionar itens, mostrar tela de revisão com **15 segundos** antes de enviar (igual ao cliente quando lança pelo app)
- Garçom pode **editar** o pedido durante esses 15s
- Após enviar → vai **direto pra tela da mesa** mostrando valor atualizado com os pedidos novos lançados

**Refs canvas**:
- Procurar tela de "lançamento rápido" em `docs/design-canvas/handoff/garcom/garcom-screens-a.jsx`..`-e.jsx`
- `docs/design-canvas/handoff/garcom/garcom-app.jsx`

**Critério de aceitação**:
- [ ] "Pedido direto" → escolhe mesa → tela de lançamento (não tela de entrega)
- [ ] Pode escolher itens do cardápio
- [ ] Tela de revisão com timer de 15s (igual cliente)
- [ ] Após enviar, vai pra tela da mesa com valor atualizado

---

### 23. Botões do garçom geral não funcionam + Encerrar turno precisa fluxo de aprovação

**Cenário geral**: A maioria dos botões do app do garçom não funciona. Só funcionam:
- Mensagens
- Sair do app
- Encerrar turno (mas com bug — ver abaixo)

**Auditar**: Cada botão do app do garçom (em todas as telas) — wirar ou esconder se ainda não implementado. Não vazar toasts cinza de "em desenvolvimento" pro usuário em produção.

**Bug específico do Encerrar turno**:

**Atual**: Garçom clica em "Encerrar turno" e sai do app diretamente (ou não funciona).

**Esperado** — fluxo de aprovação do gerente:
1. Garçom clica "Encerrar turno" → request vai pro gerente como notificação
2. UI do garçom mostra **"Gerente está analisando seu pedido"** + abre **chat do garçom com o gerente**
3. No chat: mensagem do sistema (não do garçom humano) com botões `Aceitar / Recusar encerramento` (visíveis pro gerente)
4. Gerente decide:
   - **Aceitar**: garçom sai do turno, app gera resumo e desloga
   - **Recusar**: garçom volta pro turno, recebe mensagem do gerente (opcional motivo)
5. Notificação push pro garçom quando o gerente responde

**Componente API**: ver `06-api-transversais.md` bug 23 — endpoint de "request encerramento turno" + chat com sistema-message + notificação.

**Critério de aceitação**:
- [ ] Todos os botões do garçom ou funcionam ou estão escondidos (nada de "em desenvolvimento" vazando)
- [ ] "Encerrar turno" cria request pendente + abre chat com gerente
- [ ] Gerente vê botões de Aceitar/Recusar no chat
- [ ] Garçom só sai do turno após aprovação do gerente
- [ ] Notificação push pro garçom quando o gerente responde

---

## Checklist final do chat

- Auditar **todos** os botões do app do garçom (Chamados, Mesas, Novo, Turno, Eu)
- Pra cada botão: implementar ou esconder
- Wirar fluxos com a API conforme `06-api-transversais.md`
- Adicionar testes E2E (especialmente o fluxo de encerrar turno com aprovação do gerente)
- Visual: comparar com `docs/design-canvas/handoff/garcom/` antes de marcar feito

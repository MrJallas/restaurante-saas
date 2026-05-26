# Round 24 — Bugs do app da cozinha (`apps/web-staff/src/app/cozinha`)

## Contexto do projeto

Este é o monorepo `restauranteSaaS`. O app da cozinha (KDS — Kitchen Display System) está em `apps/web-staff/src/app/cozinha`. Mostra colunas `NOVOS / PREPARANDO / PRONTOS` com cards de pedidos.

### Estado atual da cozinha

- Apenas tema **escuro**
- Perfil: `/cozinha/eu` com avatar, turno, estatísticas, mensagens, sair
- Estado vazio quando tem pedido prioridade gerência mostra apenas badge genérico

### Canvas (source-of-truth visual)

- `docs/design-canvas/screens-kitchen.jsx` (KDS principal)
- `docs/design-canvas/handoff/tv-screens.jsx`
- `docs/design-canvas/handoff/tv-cozinha-bar.html`

---

## Bugs

### 24. Cozinha NÃO deve decidir se o pedido foi entregue — substituir "Entregue" por "Chamar garçom"

**Cenário**: KDS coluna `PRONTOS` mostra pedidos com botão verde "**Entregue**".

**Atual**: A cozinha aperta "Entregue" e o pedido sai do KDS — **errado**. Cozinha não sabe nem se o garçom chegou na mesa.

**Esperado** — novo fluxo:
1. Cozinha termina o prato e clica "Pronto!" → vai pra coluna `PRONTOS`
2. Na coluna `PRONTOS`, em vez de "Entregue", botão é "**Chamar garçom**"
3. Cozinha aperta "Chamar garçom":
   - Dispara chamado pra o garçom que atende aquela mesa específica
   - Card fica com state "AGUARDANDO GARÇOM" + timer
4. Garçom recebe notificação (push + visual no app)
5. Garçom abre o chamado → vê info do pedido + botão "**Estou levando o pedido**"
6. Garçom aperta "Estou levando" → card na cozinha vai pra estado "EM TRÂNSITO" (some do KDS ou fica em coluna separada)
7. Garçom chega na mesa e tem botão "**Entregue**" no app dele → marca como entregue
8. Pedido sai do sistema (status final: entregue)

**Componente API**: ver `06-api-transversais.md` bug 24 — endpoints novos: `POST /orders/{id}/call-waiter`, `POST /orders/{id}/in-transit`, `POST /orders/{id}/delivered` (último é do garçom, não da cozinha).

**Critério de aceitação**:
- [ ] Botão "Entregue" removido do KDS
- [ ] Botão "Chamar garçom" no lugar
- [ ] Estados intermediários: "Aguardando garçom" / "Em trânsito"
- [ ] Notif push pro garçom específico (não broadcast)
- [ ] Garçom tem botão "Entregue" no app dele

---

### 25. Cozinha precisa ter tema claro + tela do cozinheiro vira "cozinha como um todo"

**Parte A — tema claro**:

**Atual**: KDS só tem tema escuro.

**Esperado**: Cozinha deve ter os mesmos modos das outras interfaces (Claro / Escuro / Automático). Mantém o tema escuro como default pra KDS (já fica bem em ambiente de cozinha) mas permite trocar.

**Notas**: provavelmente feito junto com host (`02-recepcionista.md` bug 11) e gerente (`05-gerente.md` bug 44). Lib `@/lib/theme` compartilhada.

**Parte B — repensar tela do cozinheiro (`/cozinha/eu`)**:

**Atual**: Tela simples com avatar do "Cozinheiro" + turno 17:00-23:00 + Pedidos hoje (vazio) + Tempo médio (vazio) + Mensagens + Configurações de som + Sair.

**Esperado**: A tela do cozinheiro deve refletir a **cozinha como um todo** (não só o cozinheiro logado).

**Login**: pode ser feito pelo **chefe máximo da cozinha** OU pelo **gerente** (qualquer um deles).

**Funcionalidades nessa tela**:
- **Escalar próximos turnos** (similar à interface de turnos do gerente):
  - Escolher assistentes de cozinha (precisa de menu pra adicionar essas pessoas no sistema)
  - Escolher cozinheiros pra cada turno
  - Fazer escala dos próximos dias/semanas
- **Botão "Mostrar turno"** com estatísticas em tempo real:
  - Quantos pratos entraram
  - Quantos saíram
  - Tempo médio de preparo
  - Pedidos por hora
  - Outras métricas relevantes

**Refs canvas**:
- `docs/design-canvas/v8-shifteditor-row1.png` (referência de shift editor do gerente)
- `docs/design-canvas/screens-kitchen.jsx`
- Procurar telas de turno em `docs/design-canvas/screens.jsx`, `screens-extra.jsx`

**Componente API**: ver `06-api-transversais.md` — endpoints novos pra:
- Cadastrar assistentes de cozinha (similar a cadastrar funcionários)
- CRUD de turnos da cozinha
- Stats em tempo real da cozinha

**Critério de aceitação**:
- [ ] Tema claro funcional no KDS
- [ ] Tela `/cozinha/eu` repensada com gestão de equipe da cozinha + escala de turnos
- [ ] Login: chefe máximo OU gerente
- [ ] Botão "Mostrar turno" com stats reais

---

### 32. "Puxar pedidos pra frente" — sem fluxo de aceitação da cozinha

**Cenário**: Gerente puxa pedidos pra frente (prioridade gerência). Hoje:

**Atual**:
- Cozinha **não é notificada**
- Sistema aceita automaticamente (mente: tela do gerente diz "COZINHA ACEITOU" sem cozinha ter consentido)
- No KDS, aparece apenas badge genérico: "**PRIORIDADE GERÊNCIA · MESA 22 ESTÁ HÁ 19385 MIN ESPERANDO · ACIMA DA META DA COZINHA**"
- **Sem som**
- Sem opção de a cozinha responder/negociar

**Esperado**:
1. Gerente puxa pedido → request vai pra cozinha como **alerta visual + sonoro**
2. UI na cozinha mostra modal/card destacado:
   - Lista dos pedidos que o gerente quer puxar
   - Motivo (ex.: "Mesa 22 esperando há 23631 min - acima da meta")
   - 2 opções:
     - **"Aceitar"** — pedidos vão pra topo da fila imediatamente
     - **"Serão os próximos"** — cozinha seleciona quais pedidos em preparo agora têm prioridade, e os puxados entram **depois** desses (sem interromper o que já está sendo feito)
3. Só **depois** da resposta da cozinha, gerente vê confirmação real:
   - "Cozinha aceitou — pedidos no topo"
   - OU "Cozinha vai pegar logo após os pedidos X, Y, Z"

**Componente API**: ver `06-api-transversais.md` bug 32.

**Refs canvas**: procurar fluxo "puxar pra frente" em `docs/design-canvas/screens-kitchen.jsx` e nas telas do gerente.

**Critério de aceitação**:
- [ ] Pedido puxado dispara alerta sonoro + visual na cozinha
- [ ] Cozinha tem botões reais de resposta (não só badge informativo)
- [ ] Opção "serão os próximos" deixa cozinha selecionar pedidos atuais que não vão ser interrompidos
- [ ] Tela do gerente só mostra "aceito" depois da resposta real da cozinha

---

## Validação automatizada obrigatória

- Rodar builds/testes relevantes e `git diff --check`.
- Validar KDS/cozinha com MCP Playwright/browser: colunas do KDS, som, tema, mensagens, `/cozinha/eu` e fluxo de prioridade da gerência.
- Para "chamar garçom" ou pedido criado pelo cliente, usar simulador iOS via idb para disparar a origem real e Playwright para observar cozinha/staff.
- Para alertas sonoros/visuais, registrar screenshot e evidência de evento WebSocket/response.
- Salvar evidências em `qa-reports/cozinha-<bug>/` ou equivalente.

## Checklist final do chat

- Auditar visual: comparar KDS com `docs/design-canvas/screens-kitchen.jsx`
- Implementar fluxo novo de chamado-garçom (bug 24) coordenado com `06-api-transversais.md`
- Tela `/cozinha/eu` reformulada como "gestão da cozinha" (bug 25)
- Tema claro funcional + persiste preferência
- Fluxo de aceitação de "puxar pra frente" coordenado com gerente (bug 32)
- Testes E2E pros fluxos novos

# Round 24 — Bugs do app do gerente (`apps/web-staff/src/app/manager`)

## Contexto do projeto

Este é o monorepo `restauranteSaaS`. O app do gerente está em `apps/web-staff/src/app/manager`. Ele é a interface mais complexa: tem painel ao vivo, operação (mapa/alertas/funil), equipe, financeiro, configurações.

### Bottom nav do gerente

`Painel / Operação / Equipe / Financeiro / Eu`

### Estado atual

Muitas funcionalidades mostram toasts cinza tipo `"em desenvolvimento (Onda X backend)"`. Isso **não pode vazar pro usuário final** — ou implementa real ou esconde o botão até estar pronto.

### Canvas (source-of-truth visual)

- `docs/design-canvas/v5-mgr-tablemenu.png` (table menu do gerente)
- `docs/design-canvas/v5-mgr-tablemenu-modals.png`
- `docs/design-canvas/v5-mgr-ops-cleaned.png`
- `docs/design-canvas/v5-mgr-courtesies.png`
- `docs/design-canvas/v5-mgr-settings-cortesias.png`
- `docs/design-canvas/v5-mgr-compensate-prefilled.png`
- `docs/design-canvas/v8-shifteditor-row1.png` (editor de turnos)
- `docs/design-canvas/v11-mgr-eu-ios.png` / `v11-mgr-eu-and.png` (perfil Eu)
- `docs/design-canvas/v12g-painel-complaint.png` (reclamação no painel)
- `docs/design-canvas/v12g-detail-chips.png` / `v12g-detail-chips-fix.png` / `v12g-detail-custom.png` (detalhe reclamação)
- `docs/design-canvas/v12g-resolved.png`
- `docs/design-canvas/v12g-push.png`
- `docs/design-canvas/v4-painel-3ops-ios.png` / `v4-painel-3ops-focused.png`
- `docs/design-canvas/v4-pause-summary.png`
- `docs/design-canvas/v7-courtesies-new.png`
- `docs/design-canvas/v9-modal-zoom.png`
- `docs/design-canvas/docs/features/complaint-flow-v12.md` (doc do fluxo de reclamação)
- `docs/design-canvas/docs/features/zone-pause.md`

---

## Bugs

### 27. Botão "Enviar resposta" da reclamação não habilita com resposta rápida selecionada

**Cenário**: `/manager/chamado/{id}?kind=complaint` — tela de reclamação.

**Atual**:
- Cards de Resposta Padrão como pílulas: `Estou indo`, `Vou ver na cozinha`, `Cortesia`, `Texto livre`
- Mesmo com "Estou indo" selecionada (visível highlight preto), botão "Enviar resposta" continua **desabilitado**
- "Texto livre" como pílula é confuso — não é uma resposta, é um modo de input

**Esperado**:
- Selecionar uma resposta padrão habilita "Enviar resposta"
- "Texto livre" não deve ser pílula — deve ser o **default** (input de texto sempre visível); pílulas são atalhos pra preencher o input
- Repensar UX: quando clicar numa pílula (ex.: "Estou indo"), o input se preenche com o texto correspondente, cliente pode editar antes de enviar

**Critério de aceitação**:
- [ ] Selecionar pílula habilita o botão de envio
- [ ] "Texto livre" removido como opção (input já existe)
- [ ] Pílulas pré-preenchem o input

---

### 28. Tela "Reclamação" inteira é redundante — usar overlay + persistir draft

**Atual**:
- No painel do gerente, cards de reclamação têm botões `Encaminhar / Responder`
- Clicar em "Responder" abre uma tela inteira em `/manager/chamado/{id}?kind=complaint`
- Mas o **overlay "Mensagem para Mesa X"** (modal bottom-sheet com sugestões + texto livre + Enviar como Gerência) que aparece em outras telas é **muito melhor** apresentacionalmente

**Esperado**:
- Descartar a tela `/manager/chamado/{id}?kind=complaint`
- Clicar em "Responder" do card **abre o overlay** diretamente
- **Persistência de draft**:
  - Se gerente fechar o overlay sem terminar de responder, a reclamação **não some** do painel
  - O **progresso da escrita** continua salvo (rascunho local + opcionalmente sync com backend)
  - Reabrir overlay restaura onde parou
- Cortesias relacionadas ao "Cortesia" pill: ver `v5-mgr-compensate-prefilled.png`

**Refs canvas**:
- `docs/design-canvas/docs/features/complaint-flow-v12.md`
- `docs/design-canvas/v12g-detail-chips-fix.png`
- `docs/design-canvas/v9-modal-zoom.png`

**Critério de aceitação**:
- [ ] Tela cheia de reclamação removida (ou redireciona pra painel + abre overlay)
- [ ] "Responder" abre o overlay direto
- [ ] Draft persiste se fechar sem enviar
- [ ] Reabrir restaura o texto

---

### 29. Botão "Encaminhar" sem função — remover

**Cenário**: Cards de reclamação no painel do gerente têm 2 botões: `Encaminhar / Responder`.

**Atual**: "Encaminhar" não faz nada — não existe fluxo de encaminhar pra ninguém.

**Esperado**:
- **Remover** o botão "Encaminhar"
- Card fica só com "Responder" — pode ocupar mais espaço, ficar mais bonito visualmente

**Critério de aceitação**:
- [ ] Botão "Encaminhar" removido dos cards
- [ ] Layout do card melhorado (responder ocupa mais espaço)

---

### 30. Solicitação de junção de mesas expirada continua visível

**Cenário**: Junção de mesas — Pedro Test M03 quer juntar Mesa 3 com M04 Host.

**Atual**:
- Solicitação tem `EXPIRA EM: 08/05/2026, 21:40:24`
- Hoje é **25/05/2026** (17 dias depois)
- Ainda aparece como pendente no painel, com botões Rejeitar / Aprovar

**Esperado**:
- Job/scheduled task que **auto-expira** solicitações antigas de junção de mesas
- Quando expirada, sai do painel (ou fica em histórico marcada como "expirada")
- Botões Aprovar/Rejeitar não disponíveis em solicitações expiradas

**Componente API**: ver `06-api-transversais.md` bug 30 — cron/worker pra cleanup.

**Critério de aceitação**:
- [ ] Solicitação expirada não aparece como pendente
- [ ] Histórico (opcional) com status "expirada"
- [ ] Cron testado

---

### 31. Funcionalidades sem sentido ou não implementadas no painel/operação

**Auditar e refazer**:

- **"Notificar todos os garçons"** (em "Críticos"):
  - Atual: clica e abre as **mensagens do gerente** (errado)
  - Esperado: **dispara chamado direto pros garçons que atendem aquela mesa específica** (não broadcast pra todos da praça inteira; só os relevantes)
- **"Resolver todos de uma vez"** (em "Críticos"):
  - Hoje: toast "em desenvolvimento (Onda 5 backend)"
  - O que significa exatamente "resolver todos"? Marca como resolvido sem ação? Refazer com fluxo claro
- **"Adiantar todos"** (em "Atenção"):
  - Falta clareza do que faz
  - Refazer ou remover

**Diretriz geral**: refazer apresentação das ações do gerente pra que **façam sentido prático**. Cada botão tem que ter ação determinística e útil — não apenas "fazer algo vago".

**Critério de aceitação**:
- [ ] "Notificar todos os garçons" dispara chamado real pros garçons da mesa (não broadcast geral)
- [ ] "Resolver todos de uma vez" tem fluxo claro definido OU removido
- [ ] "Adiantar todos" tem ação determinística OU removido
- [ ] Nenhum toast "em desenvolvimento" visível no painel

---

### 33. Múltiplas funcionalidades só com toast "em desenvolvimento" — esconder ou implementar

**Toasts encontrados na auditoria**:
- `Histórico de turnos · em desenvolvimento (Onda 3 backend)`
- `Resolver todos em sequência · em desenvolvimento (Onda 5 backend)`
- `Realocar mesas críticas · em desenvolvimento (Onda 4 backend)`
- `Realocar mesas · em desenvolvimento (Onda 3 backend)` (individual)
- `Aplicar sugestão: mover 1 mesa · em desenvolvimento (Onda 4 backend)`
- `Mais ações · em desenvolvimento (Onda 4 backend)` (na tela de desempenho)
- `Notificações · em desenvolvimento (Onda 3 backend)`
- `Encerrar turno · em desenvolvimento (Onda 3 backend)`
- `Ver mesas · em desenvolvimento (Onda 3 backend)`
- `Mover mesa · em desenvolvimento (Onda 3 backend)`

**Diretriz**: ou implementa real, ou **esconde o botão** até estar pronto. Não vazar toasts cinza pro gerente em produção. Se precisar manter pra dev/staging, usa feature flag.

**Decisão por item** — sugestão (negociar com PM/owner antes):
- "Realocar mesas" individual / críticas: implementar (alto valor)
- "Aplicar sugestão" auto: implementar (alto valor)
- "Ver mesas" / "Mover mesa": implementar (essencial)
- "Resolver todos em sequência": esconder até spec clara
- "Mais ações" desempenho: esconder até spec clara
- Notificações: implementar (essencial, bug 44 também)
- Encerrar turno: implementar (bug 40)
- Histórico de turnos: implementar com MongoDB (bug 42)

---

### 34. "Mensagem direta" do gerente não abre overlay + erro técnico `xstaff id incorreto`

**Cenário**: Em "Sobrecarga", "Em alerta", "Equipe" — botão "Mensagem direta pra [funcionário]".

**Atual**: Não abre o overlay. Erro técnico **"xstaff id incorreto"** vaza pra UI (ou simplesmente não acontece nada).

**Esperado**:
- Mesmo overlay de "Mensagem para Mesa X" (sugestões + texto livre + Enviar como Gerência)
- Adaptado pra "Mensagem para [Funcionário]"
- Endpoint correto (não retornar `xstaff id incorreto`)

**Componente API**: ver `06-api-transversais.md` bug 34 — auth header `x-staff-id` precisa estar sendo enviado em **todas** as requests do gerente.

**Critério de aceitação**:
- [ ] Mensagem direta abre overlay
- [ ] Funcionário recebe a mensagem
- [ ] Sem erro `xstaff id` vazando

---

### 35. Voltar do gerente sempre vai pro Painel em vez de respeitar histórico

**Cenário reproduzido**:
1. Estava em "Equipe"
2. Entrei numa sub-tela (ex.: Sobrecarga)
3. Apertei voltar

**Atual**: Vai pro "Painel" (errado — perde contexto da aba origem).

**Esperado**: Voltar respeita histórico de navegação. Sub-tela acessada de "Equipe" volta pra "Equipe", não pro "Painel".

**Solução**: usar `router.back()` do Next.js ou similar; não fazer `router.push('/manager/painel')` no botão de voltar.

**Critério de aceitação**:
- [ ] Voltar de qualquer sub-tela respeita aba de origem (Painel / Operação / Equipe / Financeiro / Eu)

---

### 36. Tela "Pausar zona" — toast vermelho "1 erro" sem detalhe

**Cenário**: `/manager/pausa/zona` — escolher praça (Ana/Bruno), duração (5/10/15/20 min), motivo opcional, botão "Pausar por 5 min".

**Atual**: Tentei pausar — toast vermelho `"1 erro"` no rodapé sem detalhe nenhum.

**Esperado**:
- Mostrar causa real do erro (validação, conflito, permissão, etc.)
- Mensagem amigável pro usuário (ex.: "Praça já pausada por outro gerente")

**Componente API**: investigar endpoint de pausa de zona — provavelmente retorna erro genérico.

**Refs canvas**: `docs/design-canvas/docs/features/zone-pause.md`

**Critério de aceitação**:
- [ ] Erros de pausar zona retornam mensagem específica
- [ ] UI mostra a mensagem amigavelmente (sem genérico "1 erro")

---

### 37. Financeiro — cards não interativos + sem seletor de período

**Cenário**: `/manager/financeiro`. Cards:
- RESUMO DE HOJE: Faturamento R$ 95, Pedidos 1, Clientes 1, Pendentes 14
- ÚLTIMOS 7 DIAS: Receita R$ 1.862, Ticket médio R$ 62
- Mais vendidos: Picanha na Brasa (23 pedidos), Bruschetta de Tomate (14)
- Gráfico de barras (dom, seg, sex, dom)

**Atual**: Nenhum card é clicável. Não há seletor de período.

**Esperado**:
- Cada card abre tela de detalhe:
  - **Pedidos** → lista de pedidos do dia com ranking (valor, garçom, hora, mesa)
  - **Clientes** → lista de clientes únicos
  - **Pendentes** → lista de pedidos pendentes
  - **Faturamento** → breakdown por período/categoria/garçom
- **Seletor de período**: Hoje / Últimos 5 dias / 7 dias / Mês / Mês passado / Customizado
- Canvas tem essas telas prontas

**Refs canvas**: procurar telas de Financeiro em `docs/design-canvas/screens.jsx`, `screens-extra.jsx`, `design-canvas.jsx`. Os screenshots em `slide-*.png` podem mostrar variantes.

**Critério de aceitação**:
- [ ] Cards clicáveis → abrem detalhe
- [ ] Seletor de período funcional
- [ ] Layout bate com canvas

---

### 38. Tela "Mesas ativas" — itens precisam ser clicáveis

**Cenário**: `/manager/operacoes/mesas-ativas` (ou similar). Lista com Mesa 1 (15:13 aberta R$ 142), Mesa 2 (15:38 R$ 95), etc.

**Atual**: Itens da lista não interagem.

**Esperado**: Clicar abre detalhe da mesa (mesmo que `46/47` cobre).

**Critério de aceitação**:
- [ ] Item clicável → abre detalhe (resolução do bug 46/47)

---

### 39. "Chamar funcionário da folga" não faz sentido

**Cenário**: `/manager/equipe/carga-media`, na seção "O QUE FAZER AGORA":
- Realocar mesas
- Pausar pedidos novos por 5 min
- **Chamar funcionário da folga** ← refazer

**Atual**: O botão "Chamar funcionário da folga" não faz sentido — funcionário **não está no restaurante** se está de folga.

**Esperado**: Repensar lista de ações pra que tenham utilidade prática quando há sobrecarga. Sugestões:
- "Convocar reforço back-office" (gente do administrativo que pode ajudar)
- "Redistribuir mesas entre garçons em turno"
- "Abrir uma praça extra"
- "Pausar entrada de novos clientes" (já existe mas pode ser na lista)

Discutir com PM antes de implementar lista final.

**Critério de aceitação**:
- [ ] "Chamar funcionário da folga" removido
- [ ] Ações alternativas implementadas (ou ao menos lista refeita)

---

### 40. "Encerrar turno" do gerente não funciona

**Cenário**: `/manager/configuracoes` — botão amarelo "Encerrar turno · Vai gerar resumo · você sai do app".

**Atual**: Toast `Encerrar turno · em desenvolvimento (Onda 3 backend)`.

**Esperado**: Implementar fluxo real:
1. Confirmar (modal "Tem certeza? Vai gerar resumo do turno e deslogar")
2. Gerar resumo do turno (vendas, mesas atendidas, alertas críticos, etc.)
3. Salvar resumo no MongoDB (logs de turnos — ver bug 42)
4. Deslogar gerente (limpar session)
5. Mostrar resumo final por X segundos antes de redirecionar pra login

**Componente API**: ver `06-api-transversais.md` bug 40.

**Refs canvas**: `docs/design-canvas/v4-pause-summary.png` (talvez referência)

**Critério de aceitação**:
- [ ] Encerrar turno gera resumo real
- [ ] Salva log do turno no Mongo
- [ ] Desloga
- [ ] Modal de confirmação antes

---

### 41. "Editar turnos" abre tela errada

**Cenário**: Aba "Equipe", seção `TURNOS DE HOJE` (TARDE 12H-17H 0 funcionários, NOITE 17H-23H 6 ATUAL, ENCERRAMENTO 23H-02H 0). Link "Editar turnos →".

**Atual**: Clicar abre a **própria página de Equipe** (recursivo, sem efeito).

**Esperado**: Abrir página dedicada de **gerenciamento de turnos** que existe no canvas.

**Refs canvas**: `docs/design-canvas/v8-shifteditor-row1.png` — shift editor row.

Procurar telas relacionadas em `screens.jsx`, `screens-extra.jsx`.

**Critério de aceitação**:
- [ ] "Editar turnos" abre tela de gerenciamento de turnos
- [ ] Layout bate com canvas

---

### 42. "Histórico de turnos" — implementar com MongoDB

**Cenário**: `/manager/configuracoes` → "Histórico de turnos · Vendas, mesas e desempenho dos turnos passados".

**Atual**: Toast `Histórico de turnos · em desenvolvimento (Onda 3 backend)`.

**Esperado**:
- Implementar tela com lista de turnos passados
- Cada item: data, garçons no turno, vendas, mesas atendidas, pedidos, ticket médio, alertas críticos
- Permitir filtrar por data/garçom/turno

**Diretriz do user**: **Todos os logs e históricos devem ir pra MongoDB**, não Postgres. Ver `07-infra-auditoria.md`.

**Componente API**: ver `06-api-transversais.md` bug 42.

**Critério de aceitação**:
- [ ] Tela "Histórico de turnos" lista turnos do Mongo
- [ ] Filtros funcionais
- [ ] Detalhe do turno mostra resumo completo

---

### 43. "Cortesias" com erro `x-staff-id inválido`

**Cenário**: `/manager/cortesias`.

**Atual**: Tela inteira mostra só o erro técnico `x-staff-id inválido` em rosa.

**Causa raiz**: header `x-staff-id` não está sendo populado/enviado corretamente nas requests autenticadas do gerente. **Mesmo bug afeta**: Mensagem direta (bug 34), Notificações (bug 44 parcial), tela de mesa (bug 46), provavelmente outros.

**Componente API**: ver `06-api-transversais.md` bug 43 — auditoria geral de auth pro role manager.

**Refs canvas**: `docs/design-canvas/v5-mgr-courtesies.png`, `v5-mgr-settings-cortesias.png`, `v5-mgr-compensate-prefilled.png`, `v7-courtesies-new.png`.

**Critério de aceitação**:
- [ ] Cortesias carrega sem erro
- [ ] Listagem + criação manual funcionam (canvas tem fluxo)

---

### 44. Notificações / Segurança e senha / Aparência — todas inoperantes

**Cenário**: `/manager/configuracoes`. Seções:

- **Notificações** (Avisos do turno · push · sons · lock screen): toast `em desenvolvimento (Onda 3 backend)`
- **Segurança e senha** (Trocar senha · 2FA · sessões ativas): não funciona
- **Aparência** (Modo claro · escuro · automático): não aplica de verdade

**Esperado**:
- **Notificações**: tela com toggles de avisos do turno + push + sons + lock screen
- **Segurança e senha**: trocar senha, ativar 2FA, ver sessões ativas (lista com device + IP + revogar)
- **Aparência**: aplica tema global no app do gerente (ver host bug 11 + cozinha bug 25 — fazer junto numa lib `@/lib/theme`)

**Componente API**: ver `06-api-transversais.md` bug 44.

**Critério de aceitação**:
- [ ] 3 telas implementadas
- [ ] Aparência aplica global (claro/escuro/auto)
- [ ] Segurança: trocar senha + 2FA + listar/revogar sessões
- [ ] Notificações: toggles persistem por usuário

---

### 45. Tela "Desempenho" (de funcionário) com "Mais ações" não implementadas

**Cenário**: `/manager/equipe/{id}` — tela de desempenho de um funcionário (ex.: Diana Cozinha).

**Atual**: Cards de stats funcionam (mostram zerado pq não tem atividade). Toast `Mais ações · em desenvolvimento (Onda 4 backend)`.

**Esperado**: Implementar "Mais ações" ou esconder. Discutir com PM o que deveria estar nessas ações.

Sugestões prováveis:
- Realocar mesas desse funcionário
- Mensagem direta
- Marcar folga
- Substituir por outro funcionário
- Ver histórico de turnos desse funcionário

**Critério de aceitação**:
- [ ] "Mais ações" implementado OU escondido
- [ ] Stats reais quando há atividade

---

### 46. `/manager/mesa/{id}` quebrada — "host- or manager-only endpoint"

**Cenário**: Gerente em Operação → Mapa, clica numa mesa (qualquer uma — Mesa 1, Mesa 6 confirmadas).

**Atual**: Tela de erro:
- "ERRO · CONSULTA"
- "Não consegui carregar"
- "host- or manager-only endpoint"
- Botão "Voltar pro mapa"

**Causa raiz suspeita**: mesmo grupo de bugs `x-staff-id` (bug 43) — gerente está chamando endpoint que foi marcado como `host-only` ou middleware de permissão rejeita. Auditar **todas** as rotas marcadas como `host-only` ou `manager-only` pra garantir que o gerente tem acesso onde deveria.

**Componente API**: ver `06-api-transversais.md` bug 46 — auditoria de permissions middlewares.

**Critério de aceitação**:
- [ ] Gerente consegue clicar em qualquer mesa sem erro
- [ ] Endpoint correto pra ambos host e manager (compartilhado ou role-agnostic na maior parte)

---

### 47. Tela de detalhe/edição de mesa não existe — canvas tem

**Esperado**: Clicar numa mesa do mapa abre tela com:
- Adicionar mais pessoas na mesa
- Editar mesa (capacidade, nome, observação)
- Encerrar mesa (fechar conta + liberar)
- Outras ações de gestão

**Refs canvas**:
- `docs/design-canvas/v5-mgr-tablemenu.png` (table menu do gerente — **principal referência**)
- `docs/design-canvas/v5-mgr-tablemenu-modals.png`
- `docs/design-canvas/v5-host-tablemenu.png` (versão host pra comparar)
- `docs/design-canvas/v5-canvas-tablemenu-overview.png`

**Critério de aceitação**:
- [ ] Clicar numa mesa abre table menu do gerente
- [ ] Ações implementadas: adicionar pessoas, editar mesa, encerrar mesa
- [ ] Layout bate 100% com canvas v5-mgr-tablemenu.png

---

## Validação automatizada obrigatória

- Rodar builds/testes relevantes e `git diff --check`.
- Validar telas do gerente com MCP Playwright/browser: Painel, Operação, Equipe, Financeiro, Eu, table menu, reclamação, cortesias, notificações, segurança/aparência.
- Para fluxos que afetam cliente, garçom, host ou cozinha, abrir a outra superfície também: idb para cliente iOS e Playwright para staff.
- Em cada CTA que antes era placeholder, provar ação real por response HTTP, WebSocket, DB ou mudança de tela persistente. Screenshot sozinho não basta.
- Salvar evidências em `qa-reports/gerente-<bug>/` ou equivalente.

## Checklist final do chat

- Auditar **TODOS** os botões do gerente — implementar ou esconder
- Coordenar com `06-api-transversais.md` pra resolver `x-staff-id` em massa (resolve bugs 34, 43, 44, 46)
- Visual: comparar com canvas pra cada tela tocada
- Testes E2E pros fluxos críticos (reclamação, junção de mesas, encerrar turno, table menu)
- "Em desenvolvimento" toast: zero tolerância pro usuário final
- Decisão por funcionalidade não pronta: implementar ou esconder, nunca placeholder

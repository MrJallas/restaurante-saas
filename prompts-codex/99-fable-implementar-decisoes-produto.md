# Fable / Claude Code - Implementar decisões de produto do chat Codex

Repo: `/Users/calebmedeiros/meus_projetos/restauranteSaaS`

Contexto: este prompt consolida decisões tomadas por Caleb em chat com Codex
em 2026-06-10. Antes de mexer, leia o `MEMORY.md` inteiro, principalmente
`Decisoes detalhadas confirmadas por Caleb em 2026-06-10`.

Nao use o canvas como fonte absoluta. O canvas e referencia/pesquisa visual; a
fonte final e tela a tela conforme `MEMORY.md` + este prompt + codigo atual.
Nao faça merge na main. Trabalhe em branch/worktree isolada se aplicavel.

## Objetivo

Implementar os comportamentos novos e corrigir divergencias de produto:

1. mapa de mesas com VIP e merge;
2. table-menu real com pessoas, clientes, observacao, acoes e timeline;
3. KDS chamando garcom e fluxo de entrega pelo garcom;
4. QR/geofence com copy leiga e configuracao persistente pelo dono;
5. late-arrival/merge sem aprovacao ativa de staff, mas com awareness correto;
6. timeline por sessao/mesa no Mongo;
7. remover rota legada `/garcom/pedidos`;
8. VIP marcado apenas por gerente/recepcionista e fila VIP na cozinha/bar;
9. pagamento dividido/customizado com 10%;
10. reclamacao como timeline + chat + metrica + notificacao.

## Regra obrigatoria para botoes e CTAs

Nao basta ajustar UI. Todos os botoes/CTAs que fazem parte dos fluxos acima
devem ter logica real no backend para funcionar corretamente.

Para cada botao/acao, implemente o contrato completo:

- endpoint/API ou handler existente reaproveitado;
- DTOs/validacao;
- permissao por papel (`manager`, `host/recepcionista`, `waiter`, `cook`,
  `bartender`, cliente da sessao);
- persistencia em Postgres/Mongo/Redis conforme o dominio;
- evento WebSocket/notificacao in-app quando a acao afeta outra persona;
- tratamento de erro visivel na UI;
- teste ou validacao manual documentada.

Nao deixar `catch { setSuccess() }`, sucesso local falso, mock silencioso ou
stub que pareca acao final para o usuario.

Exemplos que precisam de backend real quando entrarem no escopo:

- `Ver timeline da mesa`;
- `Contatar cliente`;
- `Editar observacao`;
- `Fechar mesa/comanda`;
- `Adicionar pessoas`;
- merge/unmerge de mesas;
- escolher se comandas ficam separadas ou unificadas no merge;
- `Chamar garcom` no KDS/bar;
- `Entregue` pelo garcom;
- marcar/desmarcar VIP por gerente/recepcionista;
- configurar localizacao/raio do restaurante;
- pagamento por itens, itens selecionados ou valor livre + 10%;
- resposta do gerente em reclamacao/chat;
- exclusao imediata de dados LGPD.

Se houver duvida sobre regra de produto, texto, permissao, estado final,
side-effect, evento, persistencia, ou tela correta, pare e pergunte ao Caleb
antes de implementar. Nao invente comportamento para fechar a tarefa.

## Comportamento esperado

### 1. Mapa de mesas gerente/garcom/recepcionista

- O mapa atual de `/manager/operacoes > Mapa` pode ser base, mas precisa sair
  de `FALLBACK_TABLES` e usar dados reais.
- Implementar visual de mesa VIP: badge + cor/icone diferente.
- Implementar visual de mesa mergeada: mostrar claramente as mesas como
  conjunto/par de mesas.
- Recepcionista/host nao deve receber alerta indireto so porque a mesa e VIP.
- Garcom ve VIP no mapa operacional, mas nao marca VIP.
- Gerente e recepcionista podem marcar/desmarcar VIP.

### 2. Table-menu

- Header deve mostrar quantidade real de usuarios atualmente na mesa/sessao.
- Secao Cliente deve listar nomes dos clientes atuais da mesa.
- Observacao vazia e normal quando nao veio de reserva.
- Se recepcionista abriu mesa por reserva e a reserva tem observacao, popular
  a observacao da mesa.
- Menu de 3 pontos deve abrir overlay real com:
  - editar observacao;
  - fechar mesa/comanda;
  - adicionar pessoas;
  - modais de capacidade conforme canvas;
  - outras acoes de mesa ja existentes.
- Fechar mesa pelo garcom deve deixar comanda/mesa pronta/liberavel para novos
  clientes escanearem e cairem na logica de aprovacao correta.
- Contatar cliente deve funcionar, com erro visivel se falhar.
- Todos os CTAs desta tela devem chamar backend real. Se algum contrato ainda
  estiver indefinido, perguntar ao Caleb antes de codar.

### 3. Late-arrival

- Late-arrival = pessoa chega atrasada e pede para entrar em uma mesa/sessao ja
  existente.
- Se cliente nao for reconhecido, identificar antes e pedir entrada ao
  customer-host.
- Se cliente for reconhecido por cookies, pular identificacao e pedir entrada
  ao customer-host com os dados reconhecidos.
- Nao deve ir para staff como aprovacao ativa.
- Depois que o customer-host aceitar, recepcionista pode ver a informacao e
  recebe notificacao passiva.
- Se late-arrival aprovado exceder capacidade, permitir e atualizar pessoas/
  capacidade para gerente, garcom e recepcionista.

### 4. Table merge e unmerge

- Table merge = juncao de mesas.
- Ao mergear, abrir overlay perguntando se cliente quer:
  - manter comandas separadas; ou
  - juntar comandas.
- Depois da escolha e sucesso, a IA deve dizer que a juncao das mesas foi um
  sucesso.
- Cooldown de merge e 10 minutos.
- Gerente pode desfazer merge.
- Customer-host pode pedir ao outro customer-host antes de mergear.
- Se desmergear depois de juntar pessoas/comandas, o sistema precisa lembrar a
  estrutura anterior das mesas, pessoas e pedidos, inclusive pedidos novos que
  pessoas especificas fizeram durante o periodo mergeado, para restaurar as
  mesas/comandas corretamente.

### 5. Timeline por sessao/mesa

- Timeline e por sessao/mesa/comanda atual, nao por `orderId`.
- Persistir no Mongo.
- Incluir pedidos, chamados, reclamacoes, cortesias, pagamentos, late-arrival,
  merge e unmerge.
- Mostrar sessoes antigas por botoes. Cada botao deve mostrar quantidade de
  pessoas e nome da mesa como `mesa de [host daquela sessao]`.
- Ao abrir sessao antiga, mostrar timeline com valor total, quanto foi pago e
  eventos daquela sessao.
- Em mesa mergeada:
  - se comandas continuarem separadas, mostrar as duas comandas na mesma tela;
  - se comandas forem mergeadas, mostrar como arvore/linha do tempo com duas
    ramificacoes que se unem no ponto do merge e, depois, eventos unicos.

### 6. KDS, cozinha, bar e entrega

- Acao canonica da cozinha/bar e `Chamar garcom`, nao `Servir agora`.
- Estado atual da `main` apos integração Codex: existem `/cozinha/tv` e
  `/bar/tv`, `GET /:slug/orders/_kds?station=kitchen|bar`, proxy TV
  same-origin e `/cozinha/unlock`. O board ja chama
  `POST /:slug/orders/:orderId/call-waiter` quando um pedido fica `ready`.
  Nao reimplemente essa base do zero; valide e complemente.
- Ao clicar `Chamar garcom`, enviar notificacao in-app/banner ao garcom
  responsavel.
- O garcom deve ter uma tela/botao para ver entrega pendente, com local da mesa
  (varanda, salao principal etc.) e mapa para facilitar.
- O garcom marca `Entregue`; so entao o pedido termina e o app do cliente muda.
- Implementar tres filas/prioridades:
  1. urgencia;
  2. VIP;
  3. normal.
- Pedido de mesa VIP deve subir automaticamente para fila VIP.
- A TV de bar existe, mas ainda precisa ser validada como fluxo operacional
  completo, inclusive notificacao do garcom, estado final `Entregue`,
  priorizacao VIP/urgencia e separacao correta de itens por estação.
- Evidencia/risco atual: a integracao Codex confirmou build e contrato de
  backend real para `_kds` e `call-waiter`, mas nao rodou E2E com app + DB
  reais para provar banner in-app do garcom, mapa/localizacao da mesa e
  finalizacao `Entregue`. Antes de marcar esse bloco como pronto, subir o stack
  real, criar pedido pronto na TV, clicar `Chamar garcom`, evidenciar
  notificacao do garcom, tela de entrega com local/mapa e mudanca final no app
  do cliente apos `Entregue`.
- Lider de cozinha em `/cozinha/eu` por agora so ve o proprio perfil. Deixar
  TODO claro para possivel futuro gerenciamento de turnos dos assistentes de
  cozinha; nao tratar esse codigo como lixo.

### 7. QR/geofence

- Se localizacao for necessaria ou negada, mostrar copy curta e leiga:
  explicar que a localizacao e usada por seguranca para confirmar que o cliente
  esta no restaurante e liberar o cardapio correto.
- O raio deve ser do restaurante, nao um valor hardcoded.
- Dono deve conseguir selecionar localizacao no mapa, definir raio, salvar e
  alterar depois.
- Persistir latitude/longitude/raio em banco para sobreviver a reinicio.

### 8. Garcom

- Remover/arquivar rota legada `/garcom/pedidos`.
- Garcom escaneia QR apenas para lancar pedidos novos em uma mesa que ele ja
  esta atendendo. Nao usar esse QR para abrir mesa ou validar presenca.

### 9. Reclamacao

- Reclamacao deve virar:
  - evento na timeline;
  - mensagem/chat;
  - metrica;
  - notificacao para gerente.
- Gerente responde no chat.

### 10. LGPD/dados

- Se cliente pedir exclusao de dados, limpar na hora.
- Se o cliente nao mexer nisso, apagar historico automaticamente a cada 30 dias.

### 11. Pagamento

- Pagamento dividido/customizado deve permitir:
  - pagar somente itens que o cliente pediu + 10%;
  - selecionar itens especificos + 10%;
  - informar valor livre + 10%.
- UI deve explicar claramente o acrescimo de 10% no calculo total.
- Frontend pode calcular preview, mas backend deve conhecer/validar o valor
  esperado para fechar a conta.

## Limpeza e riscos conhecidos

- Dados demo ruins, como tempos de 14k/44k minutos, mesas QRTEST91/92 e labels
  tecnicos como `ready`, sao vazamento de fixture/QA. Corrigir seed, esconder
  ou traduzir antes de release.
- P1 confirmado bloqueia merge/release. Corrija o P1, nao marque como PARTIAL.
- Evidencias pesadas devem ficar fora do Git. No repo, manter resumo, logs
  pequenos e poucos prints indispensaveis.

## Validacoes obrigatorias

Rode pelo menos:

```bash
npm run build
npm run lint
npm run format:check
git diff --check
```

E, quando tocar cada workspace:

```bash
npm run build --workspace @restaurant/api
npm run build --workspace @restaurant/web-customer
npm run build --workspace @restaurant/web-staff
npm exec --workspace @restaurant/api -- tsc --noEmit -p tsconfig.json
npm exec --workspace @restaurant/web-customer -- tsc --noEmit -p tsconfig.json
npm exec --workspace @restaurant/web-staff -- tsc --noEmit -p tsconfig.json
npm run e2e --workspace @restaurant/web-customer
python -m pytest services/ai-service/tests -q
```

Use Playwright/prints para validar as telas alteradas, mas nao commite
evidencia pesada.

## Entrega esperada

- Branch e commit hash.
- Arquivos alterados.
- O que foi implementado de cada bloco acima.
- O que ficou pendente e por que.
- Validacoes executadas.
- Prints pequenos dos fluxos principais, se houver UI alterada.

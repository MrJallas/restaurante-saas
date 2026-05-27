# Round 24 - Roteiro para novos chats Codex

Este arquivo junta o prompt inicial comum, a ordem de execucao e os blocos prontos para abrir os proximos chats.

## Estado base obrigatorio

- Base para todos os novos chats: `codex/round24-full-snapshot`.
- Nao criar chats novos a partir de `main` enquanto esta rodada estiver sendo conciliada.
- A base atual ja inclui o checkpoint dos prompts ja rodados e os artefatos de validacao disponiveis ate aqui.
- Cada chat deve trabalhar numa worktree propria e commitar somente na sua branch.
- O chat nao deve fazer merge na base, `main` ou branch de outro chat.

## LM Studio para testes

Em 26/05/2026, o LM Studio estava ligado e acessivel na rede local:

- Endpoint OpenAI-compatible: `http://192.168.0.56:1234/v1`
- Modelo carregado: `qwen/qwen3-coder-30b`
- Capacidade observada: tool use

Antes de validar fluxos com assistente, o chat deve confirmar que o endpoint ainda responde:

```bash
export LLM_BASE_URL="http://192.168.0.56:1234/v1"
curl -sS --max-time 10 "$LLM_BASE_URL/models" | head -c 1200
```

Se o IP local mudar, atualizar `LLM_BASE_URL` no ambiente usado pelo `ai-service` e recriar o container relevante:

```bash
grep -n "LLM_BASE_URL" .env docker-compose.yml
docker compose up -d --force-recreate ai-service
docker compose logs --tail=120 ai-service
```

Para prompts com assistente/tools, a validacao final deve usar o chat real do app com esse LLM local. Mock de LLM serve para teste unitario, mas nao fecha aceite da feature.

## Ordem recomendada

### Ja cobertos na base atual

Estes prompts ja foram usados como parte do snapshot/base desta rodada. Nao abrir de novo sem motivo; use apenas se precisar revalidar ou corrigir regressao especifica:

1. `06-api-transversais.md`
2. `15-staff-login-superusers.md`
3. `01-cliente.md`
4. `02-recepcionista.md`
5. `03-garcom.md`
6. `04-cozinha.md`

### Proximos chats

1. `05-gerente.md` - primeiro dos proximos, porque usa auth/staff corrigido.
2. `09-gerente-timeline-real.md` - depois do `05` ou coordenado com ele, pois ambos mexem no gerente.
3. `12-cliente-home-chips-dinamicos.md` - pode rodar em paralelo com gerente; toca mais a home customer.
4. `10-cliente-staffbubble-historico.md` - inicio da sequencia do assistente customer.
5. `11-cliente-courtesy-arrival.md` - depois do `10`, para evitar conflito no assistente.
6. `08-cliente-table-merge-salao.md` - depois do `10/11`, pois tambem toca assistente e table-merge.
7. `13-cliente-join-table-ai-typewriter.md` - depois do `08` ou em branch coordenada.
8. `14-cliente-table-merge-pos-confirmacao.md` - depois do `08` e preferencialmente depois do `13`.
9. `07-infra-auditoria.md` - por ultimo, para auditar o produto ja integrado; pode rodar antes apenas como auditoria sem mexer em features.

## Prompt inicial comum

Cole este bloco no inicio de cada chat novo, junto com um bloco especifico da secao seguinte.

```txt
Voce e Codex trabalhando no monorepo restauranteSaaS.

Objetivo: executar exatamente o prompt Round 24 informado abaixo, preservando o estado atual da rodada e trabalhando em branch/worktree propria.

Contexto obrigatorio:
- Repo base: /Users/calebmedeiros/meus_projetos/restauranteSaaS
- Base branch: codex/round24-full-snapshot
- Nao use main como base.
- Nao faca merge na base, main ou branch de outro chat.
- Preserve qualquer alteracao de outro agente. Se a worktree nao estiver limpa antes de voce mexer, pare e explique.
- Logs/historicos novos vao para MongoDB, nao Postgres.
- Migrations novas devem ser idempotentes, no padrao DO $$ ... IF NOT EXISTS.
- Erros para usuario devem ser estruturados { message_user, code }; nao vazar strings tecnicas.
- Manter cobertura de testes, especialmente test_chips_coverage_at_least_9_of_10_mutations quando tocar AI/chips.

Setup de worktree:
1. Defina PROMPT_FILE, BRANCH e WT_NAME conforme o bloco especifico deste chat.
2. Rode:

BASE_REPO="/Users/calebmedeiros/meus_projetos/restauranteSaaS"
WT_ROOT="/Users/calebmedeiros/meus_projetos/restauranteSaaS-worktrees"
BASE_BRANCH="codex/round24-full-snapshot"
WT="$WT_ROOT/$WT_NAME"

cd "$BASE_REPO"
git fetch --all --prune
git switch "$BASE_BRANCH"
git status --short --branch

if [ -n "$(git status --porcelain)" ]; then
  echo "A base esta suja. Pare e relate antes de criar worktree."
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "A branch $BRANCH ja existe. Pare e combine um nome -r2 antes de continuar."
  exit 1
fi

mkdir -p "$WT_ROOT"
git worktree add -b "$BRANCH" "$WT" "$BASE_BRANCH"
cd "$WT"
git status --short --branch

3. Leia o prompt:
sed -n '1,260p' "$PROMPT_FILE"

4. Antes de implementar, faca uma mini-auditoria do codigo afetado e apresente plano curto com:
- arquivos/rotas/componentes afetados;
- riscos de conflito com outros prompts;
- validacoes que voce vai rodar.

LLM local para testes:
- O LM Studio esta ligado em http://192.168.0.56:1234/v1 com modelo qwen/qwen3-coder-30b.
- Confirme antes de testar:
  export LLM_BASE_URL="http://192.168.0.56:1234/v1"
  curl -sS --max-time 10 "$LLM_BASE_URL/models" | head -c 1200
- Para fluxos com assistente/tools, teste pelo chat real do app usando esse LLM. Nao aceite apenas mock como validacao final.

Validacao obrigatoria:
- API/backend: testes unitarios/integracao relevantes, build do pacote afetado e fluxo consumidor real quando houver.
- web-customer/mobile: usar IDB do Facebook em simulador iOS para fluxos de UX mobile, chat, sheet, overlay, QR, teclado, safe-area ou WebSocket. Salvar evidencias em qa-reports/<slug>/.
- web-staff: usar MCP Playwright/browser para abrir tela real, clicar fluxo, validar DOM/rede/estado e salvar screenshot/relatorio em qa-reports/<slug>/.
- AI/tools: rodar pytest do ai-service e validar assistant_messages/tool_calls/chips quando aplicavel.
- Sempre rodar git diff --check antes do commit.

Ao terminar:
- Commitar somente a sua branch.
- Responder com branch, hash do commit, comandos de validacao executados, evidencias geradas e riscos pendentes.
- Nao fazer merge.
```

## Blocos prontos por prompt

### Prompt 01 - Cliente

Use este bloco apenas para revalidacao ou correcao pontual, porque esta frente ja entrou no snapshot atual.

```txt
PROMPT_FILE="prompts-codex/01-cliente.md"
BRANCH="codex/recheck-01-cliente"
WT_NAME="recheck-01-cliente"

Execute o prompt 01 como revalidacao/follow-up. Nao refaca o que ja esta correto na base; procure regressao objetiva, valide com IDB no simulador iOS quando tocar UX mobile e commite apenas correcoes necessarias.
```

### Prompt 02 - Recepcionista

Use este bloco apenas para revalidacao ou correcao pontual, porque esta frente ja entrou no snapshot atual.

```txt
PROMPT_FILE="prompts-codex/02-recepcionista.md"
BRANCH="codex/recheck-02-recepcionista"
WT_NAME="recheck-02-recepcionista"

Execute o prompt 02 como revalidacao/follow-up. Use Playwright/browser para validar a interface staff/host real e commite apenas correcoes necessarias.
```

### Prompt 03 - Garcom

Use este bloco apenas para revalidacao ou correcao pontual, porque esta frente ja entrou no snapshot atual.

```txt
PROMPT_FILE="prompts-codex/03-garcom.md"
BRANCH="codex/recheck-03-garcom"
WT_NAME="recheck-03-garcom"

Execute o prompt 03 como revalidacao/follow-up. Use Playwright/browser para validar fluxos reais do garcom e commite apenas correcoes necessarias.
```

### Prompt 04 - Cozinha

Use este bloco apenas para revalidacao ou correcao pontual, porque esta frente ja entrou no snapshot atual.

```txt
PROMPT_FILE="prompts-codex/04-cozinha.md"
BRANCH="codex/recheck-04-cozinha"
WT_NAME="recheck-04-cozinha"

Execute o prompt 04 como revalidacao/follow-up. Use Playwright/browser para validar cozinha real, inclusive acoes que mudam estado no backend, e commite apenas correcoes necessarias.
```

### Prompt 05 - Gerente

Este e o proximo prompt recomendado.

```txt
PROMPT_FILE="prompts-codex/05-gerente.md"
BRANCH="codex/prompt-05-gerente"
WT_NAME="prompt-05-gerente"

Execute o prompt 05 inteiro.

Atencao:
- Parta da branch codex/round24-full-snapshot, que ja traz auth/staff/base Round 24.
- Antes de mexer, mapeie as rotas/telas de manager afetadas e os endpoints staff que cada acao usa.
- Use MCP Playwright/browser para validar as telas do gerente com identidade real de staff/superuser.
- Se alguma acao ainda nao tiver contrato real, esconda o CTA em vez de manter toast "em desenvolvimento".
- Salve evidencias em qa-reports/gerente-round24/.
```

### Prompt 06 - API transversais

Use este bloco apenas para revalidacao ou hotfix, porque foi a frente P0 da rodada e ja esta na base.

```txt
PROMPT_FILE="prompts-codex/06-api-transversais.md"
BRANCH="codex/recheck-06-api-transversais"
WT_NAME="recheck-06-api-transversais"

Execute apenas auditoria/regressao do prompt 06.

Atencao:
- O foco e garantir que x-staff-id, manager-only e host-only continuam corretos.
- Antes de mudar qualquer middleware, apresente o mapeamento das rotas afetadas.
- Valide com testes backend e ao menos um consumidor frontend real.
- Nao reintroduza bypass de role/staff.
```

### Prompt 07 - Infra e auditoria

Rode preferencialmente depois dos prompts de feature, para auditar o produto ja integrado.

```txt
PROMPT_FILE="prompts-codex/07-infra-auditoria.md"
BRANCH="codex/prompt-07-infra-auditoria"
WT_NAME="prompt-07-infra-auditoria"

Execute o prompt 07.

Atencao:
- Priorize auditoria sistematica com IDB e Playwright/browser, sem transformar auditoria em refactor amplo.
- Logs/historicos novos devem ir para MongoDB.
- Se encontrar bugs novos fora do escopo, registre em prompts-codex/round-24-followups.md ou qa-reports/infra-auditoria/ sem tentar corrigir tudo na mesma branch.
- Salve screenshots, comandos, device/simulator usado e lista de telas auditadas.
```

### Prompt 08 - Cliente table merge salao

Rode depois de estabilizar os prompts `10` e `11`, ou em branch coordenada, porque toca assistente customer.

```txt
PROMPT_FILE="prompts-codex/08-cliente-table-merge-salao.md"
BRANCH="codex/prompt-08-table-merge-salao"
WT_NAME="prompt-08-table-merge-salao"

Execute o prompt 08 inteiro.

Atencao:
- Complete o fluxo real de escolha da mesa alvo pelo mapa do salao.
- Use o LLM local em http://192.168.0.56:1234/v1 para disparar o fluxo pelo chat real.
- Valide no iOS com IDB: pedir junção, abrir overlay, escolher mesa, criar request real e observar evento/estado.
- Preserve contrato de cooldown e consentimento duplo.
- Salve evidencias em qa-reports/table-merge-salao/.
```

### Prompt 09 - Gerente timeline real

Rode depois do `05` ou coordenado com ele para evitar conflito em manager.

```txt
PROMPT_FILE="prompts-codex/09-gerente-timeline-real.md"
BRANCH="codex/prompt-09-gerente-timeline-real"
WT_NAME="prompt-09-gerente-timeline-real"

Execute o prompt 09 inteiro.

Atencao:
- Remova mock/banner "dados mock" da timeline.
- Use endpoint real de timeline e esconda CTAs sem contrato real.
- Use MCP Playwright/browser para validar rota /manager/timeline/[orderId], DOM, rede e estado visual.
- Salve evidencias em qa-reports/gerente-timeline-real/.
```

### Prompt 10 - StaffBubble historico

Primeiro prompt recomendado da sequencia do assistente customer.

```txt
PROMPT_FILE="prompts-codex/10-cliente-staffbubble-historico.md"
BRANCH="codex/prompt-10-staffbubble-historico"
WT_NAME="prompt-10-staffbubble-historico"

Execute o prompt 10 inteiro.

Atencao:
- A StaffBubble enviada por staff deve sobreviver a reload no chat do cliente.
- Nao criar novo historico em Postgres; usar assistant_messages e/ou Mongo conforme o prompt.
- Valide ao vivo: gerente envia mensagem, cliente recebe sem refresh, recarrega e a bolha continua sem duplicar.
- Use Playwright/browser para staff e IDB para cliente iOS quando possivel.
- Salve evidencias em qa-reports/staffbubble-historico/.
```

### Prompt 11 - Cortesia recebida pelo cliente

Rode depois do `10`, porque tambem toca historico/assistente/customer.

```txt
PROMPT_FILE="prompts-codex/11-cliente-courtesy-arrival.md"
BRANCH="codex/prompt-11-courtesy-arrival"
WT_NAME="prompt-11-courtesy-arrival"

Execute o prompt 11 inteiro.

Atencao:
- Cliente deve receber, ver, aceitar e recusar cortesia real pelo app.
- Tool view_courtesy deve parar de retornar fallback falso quando houver endpoint real.
- Use Playwright/browser para gerente criar cortesia e IDB para cliente iOS aceitar/recusar.
- Se o assistente/tool entrar no fluxo, validar com LM Studio em http://192.168.0.56:1234/v1.
- Salve evidencias em qa-reports/courtesy-arrival/.
```

### Prompt 12 - Chips dinamicos na home

Pode rodar em paralelo com gerente, desde que ninguem esteja mexendo na mesma tela customer.

```txt
PROMPT_FILE="prompts-codex/12-cliente-home-chips-dinamicos.md"
BRANCH="codex/prompt-12-cliente-home-chips"
WT_NAME="prompt-12-cliente-home-chips"

Execute o prompt 12 inteiro.

Atencao:
- A home da mesa deve renderizar chips reais vindos da continuation API.
- Manter test_chips_coverage_at_least_9_of_10_mutations verde.
- Validar chips navigate/send/expand com mobile/iOS via IDB quando tocar UX.
- Se chip abrir assistente, validar com LM Studio em http://192.168.0.56:1234/v1.
- Salve evidencias em qa-reports/home-chips-dinamicos/.
```

### Prompt 13 - Join table por IA/typewriter

Rode depois do `08` ou coordenado com ele; tambem prepara o `14`.

```txt
PROMPT_FILE="prompts-codex/13-cliente-join-table-ai-typewriter.md"
BRANCH="codex/prompt-13-join-table-ai"
WT_NAME="prompt-13-join-table-ai"

Execute o prompt 13 inteiro.

Atencao:
- Host deve conseguir aprovar/rejeitar entrada de participante pelo chat/IA.
- Nao quebrar banner/modal existentes.
- Criar/validar tools accept_join_request e reject_join_request com o LLM local.
- Validar fluxo E2E com dois clientes/sessoes, IDB no iOS para UX mobile e registros backend.
- Salve evidencias em qa-reports/join-table-ai-typewriter/.
```

### Prompt 14 - Estados finais da junção de mesas

Rode depois do `08` e preferencialmente depois do `13`.

```txt
PROMPT_FILE="prompts-codex/14-cliente-table-merge-pos-confirmacao.md"
BRANCH="codex/prompt-14-table-merge-pos-confirmacao"
WT_NAME="prompt-14-table-merge-pos-confirmacao"

Execute o prompt 14 inteiro.

Atencao:
- Implementar estados finais do solicitante e receptor: aguardando, aprovado, rejeitado, timeout e cooldown.
- Usar eventos reais table_merge.* e merge.cooldown_*.
- Validar com LLM local quando o fluxo passar pelo assistente.
- Validar no iOS com IDB: solicitante e mesa alvo, aprovacao/rejeicao/cooldown.
- Salve evidencias em qa-reports/table-merge-pos-confirmacao/.
```

### Prompt 15 - Staff login superusers

Use este bloco apenas para revalidacao ou ajuste pontual, porque esta frente ja entrou na base.

```txt
PROMPT_FILE="prompts-codex/15-staff-login-superusers.md"
BRANCH="codex/recheck-15-staff-login-superusers"
WT_NAME="recheck-15-staff-login-superusers"

Execute apenas auditoria/regressao do prompt 15.

Atencao:
- Garantir que superusers servem para acessar interfaces e nao viram bypass inseguro.
- Validar login e roles staff com Playwright/browser.
- Nao reintroduzir localStorage/manual staff identity como solucao final.
```

## Como consolidar depois

Quando um chat terminar, ele deve deixar a branch commitada e nao mergeada. A conciliacao deve acontecer na base da rodada com merge/cherry-pick seletivo, preservando a versao local quando ela ja for mais nova e trazendo apenas diferencas uteis de cada branch.

Ordem de merge sugerida:

1. `codex/prompt-05-gerente`
2. `codex/prompt-09-gerente-timeline-real`
3. `codex/prompt-12-cliente-home-chips`
4. `codex/prompt-10-staffbubble-historico`
5. `codex/prompt-11-courtesy-arrival`
6. `codex/prompt-08-table-merge-salao`
7. `codex/prompt-13-join-table-ai`
8. `codex/prompt-14-table-merge-pos-confirmacao`
9. `codex/prompt-07-infra-auditoria`

Depois de cada merge, rodar pelo menos:

```bash
git diff --check
npm run build -w @restaurant/api
```

E completar com os builds/testes especificos do prompt integrado.

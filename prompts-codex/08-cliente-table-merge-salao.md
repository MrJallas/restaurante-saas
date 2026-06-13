# Continuação — Cliente escolhe mesa para junção pelo mapa do salão

## Contexto

Este é o monorepo `restauranteSaaS`. O fluxo incompleto é do app do cliente em `apps/web-customer`: quando o cliente fala com a IA algo como "quero juntar com a mesa do lado", a tool `request_table_merge` deveria abrir um mapa do salão para o cliente escolher com qual mesa quer juntar. Depois da escolha, o sistema cria uma solicitação de junção de mesas com consentimento duplo entre os hosts das duas mesas.

Source-of-truth visual:

- `docs/design-canvas/handoff/cliente/cliente-table-merge.jsx`
- `docs/design-canvas/app-cliente-canvas-v16.html`
- `docs/features/customer-host-model.md`

Regras gerais:

- Antes de mexer, rode `git status --short` e preserve edições de outros agentes.
- Logs/históricos novos vão para MongoDB, não Postgres.
- Migrations novas, se necessárias, devem ser idempotentes (`DO $$ ... IF NOT EXISTS`).
- Erros para o usuário devem ser estruturados `{ message_user, code }`; não vazar string técnica.
- Manter cobertura de testes, especialmente `test_chips_coverage_at_least_9_of_10_mutations`.

## Estado atual já encontrado

O fluxo está parcialmente implementado, mas não fecha end-to-end:

- Existe `OverlaySalonMap` em `apps/web-customer/src/components/ui/OverlaySalonMap.tsx`.
- Existe `useTableMerge` em `apps/web-customer/src/hooks/useTableMerge.ts`.
- `apps/web-customer/src/app/[slug]/assistente/page.tsx` já importa e monta o overlay, mas usa:

```ts
const salonTables = useMemo<SalonTable[]>(() => [], []);
```

- O próprio comentário no arquivo diz que `/salon/tables/adjacent?from={ourTable}` ainda não foi implementado.
- A tela do assistente tenta reemitir o resultado para `POST /:slug/assistant/tool-result`, mas esse endpoint não existe na `main` atual.
- `apps/api/src/modules/table-merge/table-merge.controller.ts` espera `sourceTableSessionId` e `targetTableSessionId`, enquanto a tool Python `services/ai-service/services/tools/request_table_merge.py` envia `originTableSessionId` e `targetTableLabel`. Esse contrato precisa ser conciliado; não basta criar o endpoint `salon`.
- A worktree antiga `claude/round3-tools` tem uma implementação útil de referência para `apps/api/src/modules/salon/*`, mas ela é incompleta para o estado atual da `main` e não deve ser cherry-pickada às cegas.

## Objetivo

Completar o fluxo real:

1. Cliente pede junção de mesas pelo assistente.
2. Se a IA não souber a mesa alvo, abre `OverlaySalonMap`.
3. O overlay lista mesas reais próximas/adjacentes, com status, host e quantidade de pessoas.
4. Cliente escolhe a mesa.
5. Backend cria `table_merge_requests` entre a sessão atual e a sessão alvo ativa.
6. Hosts das duas mesas recebem a solicitação e aprovam/rejeitam pelo fluxo já existente.
7. Cooldown direcional continua funcionando.

## Implementação esperada

### 1. Backend `salon`

Criar módulo pequeno e read-only em `apps/api/src/modules/salon`:

- `SalonModule`
- `SalonController`
- `SalonService`

Endpoint sugerido:

```http
GET /:slug/salon/tables/adjacent?radius=2
```

Preferir derivar a mesa atual via `SessionGuard`/`session.sessionId` em vez de confiar em `from` enviado pelo browser. Se manter `from`, tratar como hint de layout, não como autorização.

Resposta sugerida:

```ts
{
  tables: Array<{
    num: number;
    tableCode: string;
    tableLabel: string;
    status: 'you' | 'occupied' | 'free' | 'distant';
    sessionId?: string;
    host?: string;
    party?: number;
  }>;
}
```

Critérios:

- Usar schema atual (`tables`, `table_sessions`, `customers`, `session_participants`); não criar migration se não for necessária.
- Retornar a mesa atual como `you`.
- Mesas ocupadas com sessão ativa devem vir com `sessionId`, `host` e `party`.
- Mesas livres aparecem como `free`, mas não devem ser selecionáveis.
- Se ainda não houver coordenadas reais, usar aproximação por número da mesa (`M14`, `Mesa 14`, etc.) como fallback explícito e fácil de substituir depois por layout real.
- Proteger com `SessionGuard`.

### 2. Conciliar contrato de criação do merge

Hoje há desacordo entre FE, API e AI service. Resolva de forma consistente:

- O cliente autenticado pelo cookie/session deve ser a fonte de verdade.
- `sourceTableSessionId` deve vir da `SessionGuard` ou ser validado contra `session.sessionId`.
- `requestingCustomerId` deve ser derivado pelo backend via `CallerResolverService`, não confiado do body.
- A mesa alvo pode ser enviada como `targetTableSessionId` quando vier do overlay, ou como `targetTableNumber`/`targetTableLabel` quando vier direto da tool.
- Se vier número/label, o backend deve resolver para uma `table_sessions.status = 'active'` da mesa alvo.
- Recusar claramente: mesa alvo livre, mesa igual à origem, sessão alvo inexistente, host não encontrado quando necessário, cooldown ativo.
- Não quebrar o endpoint atual `POST /:slug/table-merge-requests` usado por `apps/web-customer/src/lib/api/customer-host.ts`.

### 3. Corrigir o overlay no frontend

Em `apps/web-customer/src/app/[slug]/assistente/page.tsx`:

- Buscar `GET /:slug/salon/tables/adjacent` quando `tableMerge.overlayOpen` ficar `true`.
- Preencher `salonTables` com dados reais.
- Exibir loading/erro/empty-state amigável dentro do overlay ou antes de abri-lo.
- Ao escolher mesa ocupada, criar a solicitação real de junção.
- Não tratar o primeiro tap como confirmação acidental se o CTA "Pedir pra juntar" estiver visível. Hoje `OverlaySalonMap` chama `onSelectTable` no tap da célula; ajuste para seleção + CTA confirmar, ou remova CTA se a decisão de produto for tap-confirma. Preferir seleção + CTA.
- Depois de criar a solicitação, mostrar bubble amigável no chat e manter chips úteis.

### 4. `assistant/tool-result`

Se o fluxo ainda precisar registrar que o FE completou a tool client-side, implementar `POST /:slug/assistant/tool-result` de forma pequena:

- Usar `SessionGuard`.
- Validar tool name.
- Validar que `customerId`, se recebido, pertence à sessão; idealmente derivar pelo cookie quando possível.
- Persistir em `assistant_messages.tool_calls/tool_results` apenas como auditoria/replay.
- Não usar esse endpoint como substituto da criação real de `table_merge_requests`.

A worktree `claude/round3-tools` tem uma versão de referência de `ToolResultDto` e `AssistantService.recordToolResult`, mas adapte ao estado atual da `main`.

### 5. AI service

Rever `services/ai-service/services/tools/request_table_merge.py` e testes:

- Não deixar a tool depender de um HTTP call sem cookie para endpoint protegido por `SessionGuard`.
- Se a decisão for que o FE/app API cria a solicitação, a tool deve retornar payload para o FE agir, sem fingir que criou no backend.
- Se mantiver dispatch server-side, alinhar body e autenticação com `TableMergeController`.
- Preservar chips canônicos e manter `test_chips_coverage_at_least_9_of_10_mutations` verde.

## Validação mínima

Rodar pelo menos:

```bash
npm run build -w @restaurant/api
npm run build -w @restaurant/web-customer
python -m pytest services/ai-service/tests -q
git diff --check
```

## Validação automatizada obrigatória

- Validar o fluxo cliente em simulador iOS com idb do Facebook, preferencialmente com duas mesas/sessões ativas e screenshots do overlay.
- Usar o chat real do app com LLM local ligado para disparar "quero juntar com a mesa do lado" e confirmar que `request_table_merge`/overlay/chips seguem o contrato. Nesta rodada, o LM Studio foi visto em `http://192.168.0.56:1234` com modelo `qwen/qwen3-coder-30b`; confirmar antes de rodar.
- Usar MCP Playwright/browser para a superfície staff/host se for mais prático observar aprovação/rejeição em outra janela, mas o aceite do overlay cliente precisa ter evidência idb.
- Conferir no DB `table_merge_requests` e eventos WebSocket; screenshot sozinho não basta.
- Salvar evidências em `qa-reports/table-merge-salao/`.

Validar o caminho E2E:

1. Entrar como cliente em mesa ativa.
2. Abrir assistente.
3. Enviar "quero juntar com a mesa do lado".
4. Ver overlay com mesas reais.
5. Escolher uma mesa ocupada.
6. Confirmar.
7. Ver `table_merge_requests` criada no tenant.
8. Ver evento/modal para os hosts das duas mesas.

## Critérios de aceitação

- [ ] Overlay não abre vazio.
- [ ] Cliente consegue escolher uma mesa ocupada real.
- [ ] Mesa livre não é selecionável.
- [ ] Solicitação real é criada em `table_merge_requests`.
- [ ] `sourceTableSessionId` e `requestingCustomerId` não são confiados cegamente do browser.
- [ ] Cooldown 429 mostra mensagem amigável e não retry infinito.
- [ ] Hosts das duas mesas recebem fluxo de aprovação/rejeição.
- [ ] Builds e testes acima passam.

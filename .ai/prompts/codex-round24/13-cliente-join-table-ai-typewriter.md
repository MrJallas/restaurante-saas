# Continuação — Host cliente decide entrada de participante pelo chat IA

## Contexto

Este é o monorepo `restauranteSaaS`. Quando outro cliente escaneia o QR de uma mesa ativa, o host da mesa recebe `participant:join_request` e hoje existem banner/modal/tela de aprovação. A feature incompleta dos superprompts é a decisão conversacional: a IA deve inserir uma `TypewriterBubble` no chat do host e permitir que o host responda "pode", "sim", "não", etc. para aprovar/rejeitar via tools.

Source-of-truth visual:

- `docs/features/customer-host-model.md`
- `docs/design-canvas-final/handoff/cliente/cliente-late-arrival.jsx`
- `apps/web-customer/src/screens/customer-host-flows/TypewriterBubble.tsx`
- `apps/web-customer/src/screens/customer-host-flows/ScreenHostApproveParticipant.tsx`
- `apps/api/src/modules/table-session/table.controller.ts`

Regras gerais:

- Antes de mexer, rode `git status --short` e preserve edições de outros agentes.
- Logs/históricos novos vão para MongoDB, não Postgres.
- Não quebrar o banner/modal existentes; esta entrega adiciona o caminho conversacional.
- Erros para o usuário devem ser estruturados `{ message_user, code }`; não vazar string técnica.
- Manter `test_chips_coverage_at_least_9_of_10_mutations` verde.

## Estado atual já encontrado

- Backend emite `participant:join_request` para `session:<tableSessionId>` com `{ customerId, name, requestedAt }`.
- Backend decide via `POST /:slug/table/participants/decide`, protegido por `SessionGuard`, derivando o host real via cookie.
- Frontend `useTableSocket` escuta `participant:join_request` e `participant:decision`.
- `HostJoinRequestBanner` e `HostApprovalModal` já existem.
- AI service não tem tools `accept_join_request` / `reject_join_request`.

## Comportamento esperado

1. Cliente A é host da mesa.
2. Cliente B pede para entrar.
3. Se Cliente A está no assistente ou abre o assistente depois do evento, aparece uma bubble tipo:

```txt
Olha, {hostName}: {joinerName} quer entrar na mesa. Pode deixar?
```

4. A bubble usa `TypewriterBubble` ou visual equivalente e só mostra chips depois do texto completar.
5. Chips sugeridos:
   - `Pode entrar`
   - `Agora não`
   - `Ver quem está na mesa`
6. Se o host digitar "pode", "sim", "deixa", etc., a IA chama `accept_join_request`.
7. Se digitar "não", "agora não", "recusar", etc., chama `reject_join_request`.
8. Tools chamam `POST /table/participants/decide` com `targetCustomerId` do pedido pendente.
9. O joiner recebe `participant:decision` e a UI atual continua funcionando.

## Implementação esperada

### 1. Estado pendente no frontend

Em `apps/web-customer/src/app/[slug]/assistente/page.tsx` ou hook dedicado:

- Escutar `participant:join_request` no assistente também.
- Guardar pendência ativa com:
  - `targetCustomerId`
  - `joinerName`
  - `requestedAt`
  - `tableSessionId`
- Renderizar uma mensagem de sistema/IA com `TypewriterBubble`.
- Dedupe por `targetCustomerId + requestedAt`.
- Se a decisão vier por banner/modal em outra aba, remover/fechar a pendência ao receber `participant:decision`.

### 2. Tools AI

Adicionar no `services/ai-service`:

- `accept_join_request`
- `reject_join_request`

Schema sugerido:

```json
{
  "targetCustomerId": "uuid",
  "reason": "string opcional"
}
```

Critérios:

- A tool não deve confiar em `hostCustomerId` vindo do LLM/browser.
- Se o AI service não tiver cookie de sessão para chamar endpoint protegido, não fazer HTTP server-side falso. Nesse caso retornar `action_payload` para o frontend executar a decisão autenticada.
- Preservar chips canônicos no resultado.
- Adicionar aliases/intent no prompt do modelo para "pode", "sim", "deixa entrar", "não", "recusa".

### 3. App API / frontend bridge

Escolher uma abordagem consistente:

- Preferido: frontend executa a decisão autenticada quando recebe `action_payload` da tool, chamando `apiPost('/table/participants/decide', { targetCustomerId, decision })`.
- Alternativa: app API cria endpoint pequeno `assistant/tool-result`/dispatcher autenticado que executa a decisão com `SessionGuard`.

Não duplicar decisão no backend. A fonte de verdade continua `TableSessionService.decideJoinRequest`.

### 4. Persistência/reload

Como esta interação é social e pode ser perdida em refresh:

- Persistir uma entrada leve no histórico do assistente ou recuperar pendências via `GET /table/participants`.
- Não criar novo histórico em Postgres. Se precisar gravar evento novo de "prompt exibido", usar MongoDB.

## Validação mínima

Rodar:

```bash
npm run build -w @restaurant/api
npm run build -w @restaurant/web-customer
python -m pytest services/ai-service/tests -q
git diff --check
```

## Validação automatizada obrigatória

- Usar dois clientes em simulador iOS/idb ou um iOS idb + um contexto Playwright para simular host e joiner. O aceite final precisa ter ao menos uma evidência no iOS/idb.
- Usar o chat real do app com LLM local ligado para o host digitar "pode" e "agora não"; o servidor atual pode ser `http://<IP-da-LAN>:1234` com modelo `qwen/qwen3-coder-30b`, mas confirme antes de rodar.
- Conferir `assistant_messages.tool_calls` para `accept_join_request`/`reject_join_request` ou o action payload equivalente.
- Validar no DB/endpoint que `session_participants.status` mudou para `approved` e `rejected`.
- Capturar screenshots da `TypewriterBubble`, da decisão e do estado do joiner; salvar em `qa-reports/join-table-ai-typewriter/`.

Fluxo manual:

1. Cliente A entra como host.
2. Cliente B tenta entrar na mesma mesa.
3. Cliente A abre assistente e vê typewriter.
4. Cliente A digita "pode".
5. Cliente B vira `approved`.
6. Repetir com rejeição.

## Critérios de aceitação

- [ ] Join request aparece no assistente como bubble/typewriter.
- [ ] Host aprova por linguagem natural.
- [ ] Host rejeita por linguagem natural.
- [ ] Banner/modal existentes continuam funcionando.
- [ ] Sem tool chamando endpoint protegido sem autenticação real.
- [ ] Testes AI e builds passam.

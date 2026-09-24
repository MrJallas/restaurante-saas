# Continuação — StaffBubble no assistente sobrevive a reload

## Contexto

Este é o monorepo `restauranteSaaS`. O gerente consegue mandar mensagem para o cliente e o cliente vê uma `StaffBubble` em tempo real dentro de `/[slug]/assistente`. O problema é que, ao recarregar a página, a bolha enviada pelo staff some do chat inline.

Source-of-truth visual:

- `apps/web-customer/src/components/ui/StaffBubble.tsx`
- `apps/web-customer/src/app/[slug]/assistente/page.tsx`
- `docs/features/chat-history-lgpd.md`

Regras gerais:

- Antes de mexer, rode `git status --short` e preserve edições de outros agentes.
- Logs/históricos novos vão para MongoDB, não Postgres.
- Não criar nova tabela de histórico em Postgres. Use o que já existe (`assistant_messages` para o chat inline e Mongo `staff_messages` para histórico staff/customer).
- Erros para o usuário devem ser estruturados `{ message_user, code }`; não vazar string técnica.
- Manter o fluxo LGPD e histórico de chat funcionando.

## Estado atual já encontrado

- `AssistantService.sendStaffToCustomer` persiste em `assistant_messages` com:
  - `from_role='staff'`
  - `to_role='customer'`
  - `provider_used='staff'`
  - `model_used=<fromStaffId>`
  - `assistant_response=<mensagem>`
- O mesmo método emite WS `assistant.staff_message_received`; o frontend renderiza `StaffBubble` ao vivo.
- `getHistoryWithToolCalls` hoje seleciona apenas `user_message`, `assistant_response`, `tool_calls` e retorna roles `user`/`assistant`.
- Em `assistente/page.tsx`, há comentário dizendo que não há fetch de histórico para staff messages no chat inline.

## Comportamento esperado

1. Gerente manda mensagem para mesa pelo fluxo atual.
2. Cliente vê `StaffBubble` ao vivo sem refresh.
3. Cliente recarrega `/[slug]/assistente`.
4. A mesma `StaffBubble` volta no histórico inline, com nome do staff e label de cargo quando possível.
5. Não aparece bolha vazia de usuário causada por `user_message=''`.
6. A mensagem não aparece para customer de outra mesa.
7. A mensagem não duplica quando chega via histórico e depois por WS/reconnect.

## Implementação esperada

### 1. Backend `/assistant/history`

Atualizar `AssistantService.getHistoryWithToolCalls` para entender rows com `from_role='staff'`.

Shape sugerido para mensagens públicas:

```ts
type AssistantHistoryMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AiToolCall[] | null }
  | {
      role: 'staff';
      content: string;
      staffId: string | null;
      staffName: string | null;
      staffRole: string | null;
      createdAt: string;
    };
```

Critérios:

- Para rows `from_role='staff'`, não criar mensagem `user` vazia.
- Resolver staff por join seguro usando `model_used` apenas quando tiver shape UUID.
- Filtrar por `table_session_id`.
- Para rows do cliente/IA, manter filtro por `customer_id` como hoje.
- Para rows staff, permitir `customer_id IS NULL` para todos os participantes aprovados da sessão.
- Ordenar por `created_at` ascendente no retorno final.
- Não adicionar novo log/histórico em Postgres.

### 2. Frontend `/assistente`

Em `apps/web-customer/src/app/[slug]/assistente/page.tsx`:

- Ajustar o mapeamento do histórico para aceitar `role: 'staff'`.
- Reusar o mesmo componente `StaffBubble` do WS live.
- Dedupe por ID/createdAt/content quando histórico e WS trouxerem a mesma mensagem.
- Preservar o comportamento atual de `ToolCallIndicator`, chips, LGPD e mensagens bloqueadas.

### 3. Testes

Adicionar teste unitário/integração no backend para:

- Histórico com row `from_role='staff'` retorna `role: 'staff'`.
- Histórico não inclui `user_message=''`.
- Staff name é resolvido quando `model_used` é UUID de staff ativo.

Adicionar teste frontend se houver harness acessível para garantir que `StaffBubble` renderiza a partir do histórico.

## Validação mínima

Rodar:

```bash
npm run build -w @restaurant/api
npm run build -w @restaurant/web-customer
git diff --check
```

## Validação automatizada obrigatória

- Usar simulador iOS com idb do Facebook para abrir o cliente em `/[slug]/assistente`, receber mensagem do gerente, recarregar e confirmar que a `StaffBubble` continua na tela.
- Usar MCP Playwright/browser para a superfície do gerente enviar a mensagem real pelo fluxo atual.
- Com o LLM local ligado, testar pelo chat real do app se a mudança tocar histórico/render do assistente; o servidor atual pode ser `http://<IP-da-LAN>:1234` com modelo `qwen/qwen3-coder-30b`, mas confirme no ambiente antes de rodar.
- Conferir no DB que a row em `assistant_messages` tem `from_role='staff'` e que `/assistant/history` retorna `role: 'staff'`.
- Capturar screenshot iOS antes/depois do reload e salvar evidência em `qa-reports/staffbubble-historico/`.

Fluxo manual:

1. Abrir customer `/restaurant_dev/assistente` com sessão ativa.
2. Enviar mensagem do gerente para essa mesa.
3. Confirmar `StaffBubble` ao vivo.
4. Recarregar a página.
5. Confirmar `StaffBubble` ainda aparece.

## Critérios de aceitação

- [ ] StaffBubble aparece ao vivo.
- [ ] StaffBubble reaparece após reload.
- [ ] Não existe bolha vazia de usuário.
- [ ] Não duplica após reconnect.
- [ ] Histórico segue isolado por sessão/customer.

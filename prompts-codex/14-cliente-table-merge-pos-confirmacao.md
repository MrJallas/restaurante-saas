# Continuação — Estados finais da junção de mesas no cliente

## Contexto

Este é o monorepo `restauranteSaaS`. O prompt `08-cliente-table-merge-salao.md` cobre a escolha da mesa alvo e criação da solicitação real de junção. Esta continuação cobre os estados finais do cliente: typewriter para a mesa receptora, confirmação para a mesa solicitante, rejeição, timeout e cooldown.

Source-of-truth visual:

- `prompts-codex/08-cliente-table-merge-salao.md`
- `docs/features/customer-host-model.md`
- `docs/design-canvas-final/handoff/cliente/cliente-table-merge.jsx`
- `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerHostApproveMerge.tsx`
- `apps/web-customer/src/hooks/useCustomerHostEvents.ts`

Regras gerais:

- Antes de mexer, rode `git status --short` e preserve edições de outros agentes.
- Logs/históricos novos vão para MongoDB, não Postgres.
- Migrations novas, se necessárias, devem ser idempotentes (`DO $$ ... IF NOT EXISTS`).
- Erros para o usuário devem ser estruturados `{ message_user, code }`.
- Manter `test_chips_coverage_at_least_9_of_10_mutations` verde.

## Estado atual já encontrado

- Backend emite eventos:
  - `table_merge.created`
  - `table_merge.approved`
  - `table_merge.rejected`
  - `merge.cooldown_started`
  - `merge.cooldown_expired`
- `useCustomerHostEvents` já escuta esses eventos.
- `ScreenCustomerHostApproveMerge` existe para a mesa receptora aprovar/rejeitar.
- A tela do solicitante ainda não tem estados finais claros após enviar pedido de junção.
- Superprompt cita `MergeTypewriterBubble customer chat` e `PostMerge/PostReject/CooldownReattempt`.

## Comportamento esperado

### Mesa receptora

1. Host da mesa alvo recebe `table_merge.created`.
2. Se estiver no assistente, vê `MergeTypewriterBubble`:

```txt
{originHostName} da Mesa {originTableNumber} quer juntar com a sua mesa.
```

3. Pode aprovar/rejeitar por CTAs e, se o prompt 13 já estiver feito, por linguagem natural.
4. Se abrir via push/deeplink, pode continuar usando `ScreenCustomerHostApproveMerge`.

### Mesa solicitante

1. Após criar a solicitação, vê estado "Aguardando a outra mesa".
2. Se ambos aprovarem:
   - vê confirmação amigável;
   - entende que as mesas viraram uma só;
   - chips úteis: `Ver pedido da mesa`, `Chamar garçom`, `Ver cardápio`.
3. Se a outra mesa rejeitar:
   - vê copy neutra, sem culpabilizar;
   - chips úteis: `Chamar recepcionista`, `Tentar outra mesa`, `Continuar aqui`.
4. Se expirar:
   - vê timeout amigável;
   - se backend iniciar cooldown, mostra countdown.
5. Se tentar de novo dentro do cooldown:
   - não fica em loop chamando `request_table_merge`;
   - mostra "tentar de novo em X min".

## Implementação esperada

### 1. Frontend states

Criar ou completar componentes em `apps/web-customer/src/screens/customer-host-flows`:

- `MergeTypewriterBubble` ou composição com `TypewriterBubble`.
- `ScreenCustomerPostMergeApproved`.
- `ScreenCustomerPostMergeRejected`.
- `ScreenCustomerMergeCooldown`.

Não precisa virar telas separadas se a arquitetura local preferir renderizar cards/bubbles dentro de `/assistente`, mas os estados precisam existir e ser testáveis.

### 2. Eventos

Em `apps/web-customer/src/app/[slug]/assistente/page.tsx` e/ou home da mesa:

- Consumir `table_merge.created` para receptor.
- Consumir `table_merge.approved`:
  - se `side='both'` ou status final aprovado, mostrar confirmação para ambos os lados;
  - se só um lado aprovou, mostrar "aguardando a outra mesa".
- Consumir `table_merge.rejected` para receptor e solicitante.
- Consumir `merge.cooldown_started` para solicitante.
- Dedupe por `requestId`.

### 3. Backend payloads

Se os eventos atuais não carregarem informação suficiente, enriquecer payload de forma compatível:

```ts
{
  requestId: string;
  originSessionId: string;
  targetSessionId: string;
  originTableNumber: number;
  targetTableNumber: number;
  originHostName: string | null;
  targetHostName: string | null;
  originPartySize: number;
  targetPartySize: number;
  expiresAt?: string;
  cooldownEndsAt?: string;
  retryAfterSeconds?: number;
}
```

Critérios:

- Não emitir `originTable: 0` ou `targetTable: 0` em cooldown/reject.
- Se não conseguir resolver nomes, usar copy sem nome em vez de placeholder técnico.
- 429 de cooldown precisa ter `{ message_user, code, retryAfterSeconds }`.

### 4. AI service

Atualizar `request_table_merge` para:

- Não retry em cooldown.
- Retornar chips de fallback úteis.
- Se a solicitação for criada pelo frontend após overlay do prompt 08, não duplicar a criação no AI service.

## Validação mínima

Rodar:

```bash
npm run build -w @restaurant/api
npm run build -w @restaurant/web-customer
python -m pytest services/ai-service/tests -q
git diff --check
```

## Validação automatizada obrigatória

- Usar dois clientes no fluxo de junção com simulador iOS/idb; se faltar simulador, usar um iOS idb para a mesa solicitante e Playwright para a outra, documentando a limitação.
- Usar o chat real do app com LLM local ligado para disparar `request_table_merge` e validar cooldown/retry; o servidor atual pode ser `http://192.168.0.56:1234` com modelo `qwen/qwen3-coder-30b`, mas confirme antes de rodar.
- Usar MCP Playwright/browser apenas como apoio para observar staff/host, mas os estados finais do cliente precisam de evidência mobile.
- Conferir eventos WebSocket e DB: `table_merge_requests`, status final e `table_merge_cooldowns`.
- Capturar screenshots de aguardando, aprovado, rejeitado e cooldown; salvar em `qa-reports/table-merge-pos-confirmacao/`.

Fluxo manual:

1. Mesa A pede junção com Mesa B.
2. Mesa B recebe typewriter/card.
3. Mesa B aprova; Mesa A aprova se necessário.
4. Ambas veem confirmação.
5. Repetir rejeição.
6. Tentar novamente dentro do cooldown e confirmar mensagem amigável.

## Critérios de aceitação

- [ ] Receptor vê `MergeTypewriterBubble`/estado equivalente.
- [ ] Solicitante vê aguardando/aprovado/rejeitado/cooldown.
- [ ] Cooldown mostra countdown e não faz retry infinito.
- [ ] Eventos têm dados reais de mesa, sem `0`.
- [ ] Prompt 08 continua compatível.

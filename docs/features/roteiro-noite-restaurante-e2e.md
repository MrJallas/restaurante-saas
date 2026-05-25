# Roteiro E2E: Noite Realista no Restaurante

## Objetivo

Validar uma noite completa de operação no tenant `restaurant_dev`, desde o escaneamento físico do QR até recepção, host, convidados, cozinha, garçom, gerente, histórico de mesa, auditoria e estabilidade dos jobs de fundo.

Este roteiro pode ser seguido manualmente por outro chat/agente, ou executado pela suíte automatizada:

```bash
cd /Users/calebmedeiros/meus_projetos/restauranteSaaS/apps/web-customer
npx playwright test e2e/specs/restaurant-night-simulation.spec.ts
npx playwright test e2e/specs/physical-qr-heavy.spec.ts
```

## Elenco

- Cliente A: primeiro cliente da `QRTEST91`, vira host.
- Cliente B: segundo cliente da `QRTEST91`, aguarda aprovação do host.
- Cliente C: primeiro cliente da `QRTEST92`, passa por verificação física.
- Recepcionista: aprova/rejeita scan físico.
- Host A: aprova/rejeita participante novo.
- Cozinha: recebe pedidos e muda status.
- Garçom: recebe chamados e reconhece atendimento.
- Gerente: acompanha mesas ativas, histórico e operação.
- Auditoria: Postgres + Mongo + logs da API.

## Ferramentas

- Playwright para múltiplos browsers/contextos.
- `idb` para controlar simuladores iOS reais por UDID.
- `xcodebuildmcp` para inventário, screenshots e UI tree dos simuladores.
- Postgres via `docker exec restaurant-postgres psql`.
- Logs via `docker logs restaurant-api`.

## Preparação

1. Confirmar serviços:

```bash
docker ps --format '{{.Names}} {{.Status}}' | sort
```

Esperado: `restaurant-api`, `restaurant-postgres`, `restaurant-mongodb`, `restaurant-redis`, `restaurant-web-customer`, `restaurant-web-staff` ativos.

2. Confirmar simuladores:

```bash
npx -y xcodebuildmcp@latest simulator-management list --enabled --output json
idb list-targets --json
```

3. Usar estes QRs fixos:

- `QRTEST91`: `http://localhost:3001/api/qr/qrtest91-public-token-fixed`
- `QRTEST92`: `http://localhost:3001/api/qr/qrtest92-public-token-fixed`

4. Garantir que o fluxo antigo está bloqueado:

- `/session/init` sem `accessToken`: `401`.
- `accessToken` vazio: `401`.
- token de outra mesa: `401`.
- token vencido: `401`.
- payload original completo: `201`.

## Ato 1: A Porta do Restaurante

Cena 1: Cliente A chega na mesa 91.

1. Abrir Cliente A em contexto iPhone.
2. Navegar para `/api/qr/qrtest91-public-token-fixed`.
3. Confirmar redirect para o app do cliente com `hmac`, `ts` e `accessToken`.
4. Cliente A informa nome, CPF válido e aceita localização.

Esperado:

- Cliente A cai na tela de espera.
- `table_sessions` ativa é criada para `QRTEST91`.
- `session_participants.status = pending`.
- `scan_verification_requests.status = pending`.
- Não aparece cardápio nem botão de pedido.

Cena 2: Recepção vê a chegada.

1. Abrir staff em `/host?tenant=restaurant_dev&hostId=<host_staff_id>`.
2. Confirmar card `Verificar mesa escaneada`.
3. Card deve mostrar mesa, cliente, CPF mascarado, localização e tempo restante.
4. Abrir detalhe `/host/scan-verification/:id`.
5. Clicar em `Aprovar entrada`.

Esperado:

- Request vira `approved`.
- Participante vira `approved`.
- `table_sessions.host_customer_id = customer_id` do Cliente A.
- Cliente A sai da espera sem reescanear.
- Reload do Cliente A mantém acesso.

## Ato 2: O Host Assume a Mesa

Cena 3: Cliente B chega na mesma mesa 91.

1. Cliente B escaneia o mesmo QR físico da `QRTEST91`.
2. Cliente B informa nome/CPF.
3. Cliente B fica aguardando aprovação.
4. Cliente A, já host, mantém o app aberto.

Esperado:

- Cliente B fica `pending`.
- Não cria `scan_verification_request`.
- Staff não recebe pendência nova.
- Host A vê pedido `participant:join_request`.

Cena 4: Host aprova convidado.

1. No app do Cliente A, aprovar Cliente B.
2. Cliente B entra no app.

Esperado:

- Cliente B vira `approved`.
- Cliente A continua host.
- Cliente B não passa pela recepção.

Cena alternativa: Host rejeita.

1. Repetir com outro cliente.
2. Host rejeita.

Esperado:

- Participante vira `rejected`.
- Cliente rejeitado não acessa menu/pedidos.
- Staff não participa.

## Ato 3: Outra Mesa Entra por Verificação Física

Cena 5: Cliente C chega na mesa 92.

1. Cliente C escaneia `/api/qr/qrtest92-public-token-fixed`.
2. Informa nome/CPF/localização.
3. Recepção vê card da mesa 92.
4. Recepção aprova.

Esperado:

- `QRTEST92` tem nova sessão ativa.
- Cliente C vira host da mesa 92.
- Cliente C entra no app.

Cena alternativa: recepção rejeita.

1. Staff rejeita com motivo `mesa vazia`.

Esperado:

- Request `rejected`.
- Participante `rejected`.
- Cliente não acessa cardápio.
- Mongo registra motivo e metadata de tenant/table/customer/staff.

## Ato 4: Pedido Vai para a Cozinha

Cena 6: Mesas fazem pedidos.

1. Cliente A/mesa 91 cria pedido com 2 unidades de um item disponível.
2. Cliente C/mesa 92 cria pedido com 1 unidade de outro item disponível.
3. Confirmar pedidos.
4. Abrir `/cozinha`.

Esperado:

- KDS mostra pedidos em `NOVOS`.
- Itens aparecem pelo nome.
- Status inicial após confirmação é `received`.

Cena 7: Cozinha prepara.

1. Cozinha move pedidos para `in_progress`.
2. Recarregar KDS.
3. Confirmar coluna `PREPARANDO`.
4. Cozinha move pedido 91 para `ready`.
5. Garçom/operador move pedido 91 para `delivered`.
6. Pedido 92 fica `ready` para validar fila pendente.

Esperado:

- Transições aceitas:
  - `received -> in_progress`
  - `in_progress -> ready`
  - `ready -> delivered`
- Nenhum `500`.
- Histórico de status é gravado.

## Ato 5: Chamados de Garçom

Cena 8: Clientes chamam garçom.

1. Mesa 91 cria chamado `serve_drink`.
2. Mesa 91 tenta criar outro chamado `ask_bill`.
3. Mesa 92 cria chamado `other`.

Esperado:

- Mesa 91 deduplica chamado ativo: retorna o mesmo `callId` enquanto houver chamado pendente/acknowledged.
- Mesa 92 cria chamado próprio.
- Garçom vê cards em `/waiter?tenant=restaurant_dev&waiterId=<waiter_id>`.

Cena 9: Garçom reconhece chamados.

1. Garçom abre lista.
2. Reconhece cada chamado único com ETA.

Esperado:

- Status vira `acknowledged`.
- Cliente recebe evento/estado de atendimento.
- Backend não recebe `callId = undefined`.

## Ato 6: Gerente Entra em Cena

Cena 10: Gerente olha operação.

1. Abrir `/manager/operacoes/mesas-ativas?slug=restaurant_dev`.
2. Confirmar heading `Mesas ativas`.
3. Abrir `/manager/mesa/91?slug=restaurant_dev`.
4. Confirmar `Mesa 91`.

Esperado:

- Mesa 91 aparece como ativa.
- Histórico mostra dados coerentes.
- Participantes e pedidos batem com Postgres.

## Ato 7: Incidentes e Cascade

Cena 11: Staff não responde verificação física.

1. Criar verificação pendente em `QRTEST92`.
2. Forçar/aguardar TTL da recepção.
3. Confirmar escalonamento para manager.
4. Forçar/aguardar TTL.
5. Confirmar escalonamento para waiter.
6. Forçar/aguardar TTL final.

Esperado:

- `escalation_chains.level`: 0 -> 1 -> 2.
- Cliente permanece aguardando.
- Timeout final:
  - request `expired`
  - participante `rejected`
  - chain `completed_at` preenchido.

Cena 12: Manager aprova depois do escalonamento.

1. Criar pendência.
2. Forçar expiração da recepção.
3. Manager aprova.

Esperado:

- Request `approved`.
- Participante `approved`.
- Evento mostra `approved_by_staff_id` do manager.

## Ato 8: Concorrência

Cena 13: Dois primeiros scans na mesma mesa.

1. Dois clientes escaneiam `QRTEST91` quase simultaneamente.
2. Ambos informam CPFs diferentes.

Esperado:

- Só uma `table_session` ativa.
- Ambos ficam `pending`.
- Sem duplicação inválida de `color_index`.
- Aprovar um não aprova o outro automaticamente.

Cena 14: Dois staffs decidem a mesma pendência.

1. Abrir a mesma verificação em dois usuários staff.
2. Staff A aprova.
3. Staff B tenta rejeitar imediatamente.

Esperado:

- Primeira decisão vence.
- Segunda recebe conflito/estado já decidido.
- Não existem eventos terminais contraditórios.

## Ato 9: Isolamento e Auditoria

Cena 15: Tenant isolado.

1. Criar/usar `restaurant_e2e_other`.
2. Tentar token do tenant A no tenant B.
3. Consultar request de A usando slug B.

Esperado:

- QR público resolve a mesa correta por token global.
- `/session/init` opera só no tenant correto.
- Endpoint B não lê request A.
- Mongo registra `tenantId` correto.

Cena 16: Auditoria mensal.

Gerar e consultar eventos:

- `qr_resolved`
- token inválido
- verificação criada
- aprovada
- rejeitada
- timeout

Esperado:

- Índices por tenant/data existem.
- Eventos têm `tenantId`, `tableId`, `tableSessionId`, `customerId` quando aplicável.

## Ato 10: Fechamento e Reuso de QR

Cena 17: Mesa encerra e outro cliente usa o mesmo QR físico.

1. Cliente entra e vira host.
2. Staff fecha/libera a mesa.
3. Confirmar sessão antiga fechada.
4. Novo cliente escaneia o mesmo QR físico.

Esperado:

- QR físico é o mesmo.
- Nova sessão é criada.
- Host antigo não é herdado.
- Sem pré-liberação, cria verificação física.
- Com pré-liberação, entra direto.

## Checks Técnicos Finais

Rodar:

```bash
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web-customer/tsconfig.json
npx tsc --noEmit -p apps/web-staff/tsconfig.json
cd apps/web-customer && npx playwright test e2e/specs/restaurant-night-simulation.spec.ts
cd apps/web-customer && npx playwright test e2e/specs/physical-qr-heavy.spec.ts
```

Checar logs:

```bash
docker logs restaurant-api --since 2m 2>&1 | rg "ERROR|QueryFailedError|ExceptionsHandler" || true
```

Esperado:

- Noite completa passa.
- QR pesado: 15 passed, 1 skipped (`Mongo fora do ar`, opt-in).
- Sem `QueryFailedError` recorrente por tenant parcial.

## Critérios de Falha

Falhar o roteiro se ocorrer qualquer um destes sinais:

- `/session/init` aceita request sem `accessToken`.
- Cliente sem pré-liberação entra direto sem staff/host.
- Segundo cliente com host ativo gera pendência staff.
- Host aprovado perde `isHost` após reload.
- Pedido muda para status inválido ou retorna `500`.
- Chamado de garçom usa `id` indefinido em vez de `callId`.
- Staff consegue alternar decisão terminal já tomada.
- Tenant B lê dados do tenant A.
- Jobs de fundo geram `ERROR` repetido por tabela inexistente em schema parcial.

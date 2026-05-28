# Prompt 08 - table merge salao

Data: 2026-05-28
Branch: `codex/prompt-08-table-merge-salao`
Worktree: `/Users/calebmedeiros/meus_projetos/restauranteSaaS-worktrees/prompt-08-table-merge-salao`

## Ambiente

- API: `http://localhost:3001/api`
- Web customer: `http://localhost:3003`
- AI service: container `restaurant-ai`
- LLM local confirmado pelo screenshot do LM Studio: `http://192.168.0.14:1234/v1`
- Modelo: `qwen/qwen3-coder-30b`
- Tenant: `restaurant_dev`
- Origem: mesa M14, session `1c8354f2-5257-44e1-bd54-e46fcb43b3e5`
- Destino: mesa M15, session `4789b056-cf3f-41ea-8b3b-fe0ed708218e`

## Validacoes automatizadas

Comandos executados:

```bash
npm run build -w @restaurant/api
npm run build -w @restaurant/web-customer
python -m pytest services/ai-service/tests -q
git diff --check
```

Resultado:

- API build: passou.
- Web customer build: passou.
- AI service tests: `226 passed, 2 warnings`.
- `git diff --check`: passou.

## Contratos HTTP e DB

- `GET /api/restaurant_dev/salon/tables/adjacent?radius=2` retornou M14 como `you`, M15 como `occupied`, mesas livres como `free` e mesas fora do raio como `distant`.
- `POST /api/restaurant_dev/table-merge-requests` com `sourceTableSessionId` falso foi recusado com `SOURCE_SESSION_MISMATCH`.
- `POST /api/restaurant_dev/table-merge-requests` derivou `requestingCustomerId` do caller real, ignorando caller arbitrario no body.
- Pedido criado pelo Playwright mobile: `2ef7e734-93e6-4763-9fe7-98a4a51ca9e7`.
- Pedido criado pelo iOS/idb: `8001ec94-025d-4494-b0e9-c5ed431e8ee1`.
- Pedido criado para evidencia WebSocket: `433f25c8-f3f7-4631-88a0-6cd104df08bf`.

## WebSocket

Arquivo: `websocket-results.json`

- Dois clientes Socket.IO entraram nas salas de sessao M14 e M15.
- A criacao REST do pedido `433f25c8-f3f7-4631-88a0-6cd104df08bf` retornou `201`.
- Ambas as sessoes receberam `table_merge.created`.
- Payload confirmou origem M14, destino M15, hosts `Prompt08 Origem` e `Prompt08 Destino`, parties `2` e `1`.

## Playwright mobile

Arquivo: `playwright-mobile-results.json`

Screenshots:

- `01-assistente-ready.png`
- `02-overlay-mesas-reais.png`
- `03-overlay-mesa-15-selecionada.png`
- `04-pedido-criado-chat.png`

Fluxo validado:

1. Assistente abriu com sessao M14 autenticada.
2. Mensagem `quero juntar mesas` disparou `request_table_merge`.
3. Overlay buscou `salon/tables/adjacent?radius=2`.
4. M15 apareceu ocupada com host e party.
5. CTA criou `table_merge_requests` com status `pending`.

## iOS/idb

Diretorio: `ios-idb-2026-05-28/`

Evidencias principais:

- `01-open-qr.png`: QR real da M14 abriu no Safari iOS.
- `04-welcome-valid-cpf.png`: welcome preenchido com CPF valido.
- `09-reopen-qr-approved.png`: cliente reconhecido e aprovado na M14.
- `12-after-send-button.png`: mapa do salao abriu a partir do chat real.
- `13-overlay-m15-selected.png`: M15 selecionada.
- `14-overlay-after-scroll.png`: CTA de confirmacao visivel.
- `15-request-created.png`: chat confirmou pedido enviado para M15.

Observacao operacional: o primeiro preenchimento no simulador concatenou CPF no campo de nome por coordenada instavel do teclado. A validacao foi corrigida no mesmo Safari com CPF valido, aprovacao do participante de QA e reabertura do QR real.

## Pos-aceite da outra mesa

Diretorio: `post-acceptance-2026-05-28/`

Pedido validado: `2b4e8635-53ac-4780-9699-a11d0ac55e6c`.

- A mesa origem ja sai pre-aprovada quando o host de origem pede para juntar.
- Apos a mesa destino aceitar, o pedido ficou `approved` com `approvedByAAt` e `approvedByBAt` preenchidos.
- A tela de espera mostrou `Mesas juntadas!` e redirecionou para `/restaurant_dev/assistente`.
- O assistente exibiu automaticamente: `Mesas juntadas! A comanda virou uma só. Vocês já podem pedir juntos por aqui.`
- Pergunta posterior ao LLM (`a outra mesa aceitou? as mesas ja estao juntas?`) respondeu `Sim, as mesas 14 e 15 já estão juntas. A comanda virou uma só.` com `toolCalls: []`.

Screenshots:

- `01-waiting-before-other-accepts.png`
- `02-joined-success-screen.png`
- `03-automatic-message-latest.png`
- `04-automatic-message-bottom.png`

Arquivos:

- `results.json`
- `llm-after-acceptance-response.json`

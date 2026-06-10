# QA - table merge pos-confirmacao

Data: 2026-05-29
Branch: `codex/prompt-14-table-merge-pos-confirmacao`

## Stack usada

- API da branch: `http://localhost:3101/api`
- Web customer da branch: `http://localhost:3103`
- AI service da branch: container `p14-ai`
- LM Studio confirmado em `http://192.168.0.14:1234/v1`, modelo `qwen/qwen3-coder-30b`
- iOS idb smoke: iPhone 16 Pro iOS 18.4, UDID `0075BF14-2FEE-4DF5-8056-1248A6D8CD75`

## Fluxo mobile automatizado

Par limpo criado para QA no tenant `restaurant_dev`:

- origem: Mesa 04, session `46fcd4f4-8886-4d5e-a5c2-cacfb94a225f`
- destino: Mesa 05, session `71194879-382c-4e92-8304-c5e7ee97227f`

Evidencias:

- `01-solicitante-aguardando.png` - solicitante aguardando a outra mesa
- `02-receptor-typewriter.png` - receptor com typewriter/card de merge
- `03-solicitante-aprovado.png` - solicitante ve confirmacao
- `04-receptor-aprovado.png` - receptor ve confirmacao
- `05-receptor-rejeitado.png` - receptor ve rejeicao
- `06-solicitante-cooldown.png` - solicitante ve cooldown com countdown
- `07-ios-idb-assistente.png` - smoke iOS/idb abrindo o app local

## IDs e checks runtime

- request aprovado: `ecaa74dc-8f8d-4c94-987f-2a6b15d486c9`
- request rejeitado: `ed26ee95-c684-4ac4-a2a8-90843c4cf82c`
- cooldown: `062dc420-1b77-4f4f-ac00-6096549481f2`
- retry durante cooldown: HTTP 429, `code=MERGE_COOLDOWN_ACTIVE`, `retryAfterSeconds=600`, `originTableNumber=4`, `targetTableNumber=5`
- chat real com LLM criou `request_table_merge(targetTable=5)` antes do cooldown
- chat real em cooldown respondeu sem tool call: "Ainda tem uma pausa nessa juncao. Voce pode tentar de novo em 10 min."

## Validacoes executadas

- `npm run build -w @restaurant/api`
- `npm run build -w @restaurant/web-customer`
- `python -m pytest services/ai-service/tests -q`
- `git diff --check`

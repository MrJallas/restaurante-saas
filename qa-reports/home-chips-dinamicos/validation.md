# QA - Home chips dinamicos

Data: 2026-05-27
Branch: `codex/prompt-12-cliente-home-chips`

## Escopo validado

- `/api/:slug/home` preserva `chips`, `subtitle` e `primary_cta` vindos do AI service.
- `/[slug]/mesa/[tableCode]` renderiza chips reais de `homeData.continuationMessage.chips`.
- Fallback fixo continua existindo quando `chips` vem vazio.
- `navigate` direciona para rota do tenant.
- `send` abre `/assistente?prefill=...`.
- `expand` abre `/assistente?prefill=...&mode=expand` e deixa o input preenchido sem autoenvio.

## Evidencias

- `continuation-viu-menu.json`: resposta real deterministica do AI service com chips de continuation.
- `continuation-pagou.json`: resposta real deterministica do AI service com chip `navigate`.
- `mobile-home-chips.png`: home mobile com chips renderizados.
- `mobile-chip-navigate-cardapio.png`: tap no chip navigate chegou em `/cardapio`.
- `mobile-chip-send-assistente.png` e `mobile-chip-send-url.txt`: tap no chip send chegou ao assistente com `prefill`.
- `mobile-chip-expand-prefill.png` e `mobile-chip-expand-url.txt`: tap no chip expand chegou ao assistente com `mode=expand` e input preenchido.
- `idb-ui-*.txt` e `ios-*.png`: tentativa via iOS Simulator + idb; Safari bloqueou o fluxo na permissao de geolocalizacao.

## Pendencias

- Chat real com LLM local nao foi validado porque nao ha LLM disponivel neste ambiente agora. O fluxo de navigation/prefill foi validado sem depender de resposta do modelo.
- A validacao iOS via `idb` ficou bloqueada na permissao de geolocalizacao do Safari. A cobertura mobile funcional foi feita com Playwright WebKit em viewport iPhone, geolocation grant e taps reais nos chips.

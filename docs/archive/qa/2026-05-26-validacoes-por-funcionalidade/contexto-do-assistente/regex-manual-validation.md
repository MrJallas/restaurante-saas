# Validação manual do rule-layer no stack (ai-service vivo, 2026-06-12)

`POST /chat` direto no container `restaurant-ai` (commit 0c029b7+). LLM
local (LM Studio) **desligado de propósito**: positivas devem responder
sem provider; negativas devem TENTAR o LLM (503 sem provider = prova de
que o regex não as engoliu).

| Frase | Camada | Tool |
|---|---|---|
| quero ver o cardápio | rule-view-menu | view_menu |
| abre o cardápio | rule-view-menu | view_menu |
| mostra as bebidas | rule-view-menu | view_menu (category=bebida) |
| mostra as sobremesas | rule-view-menu | view_menu (category=sobremesa) |
| me indica algo | rule-recommend-dish | recommend_dish |
| me indica algo leve | rule-recommend-dish | recommend_dish |
| me indica uma sobremesa | rule-recommend-dish | recommend_dish (category=sobremesa) |
| o que você recomenda hoje? | rule-recommend-dish | recommend_dish |
| ver meu pedido | rule-order-status | view_order |
| quanto tempo demora o pedido? | rule-order-status | view_order |
| chama o garçom | rule-call-waiter | call_waiter |
| garçom, por favor | rule-call-waiter | call_waiter |
| cadê o garçom? | rule-call-waiter | call_waiter |
| traz a conta | rule-payment | open_payment_screen |
| a conta, por favor | rule-payment | open_payment_screen |
| quero finalizar | rule-payment | open_payment_screen |
| quero dividir a conta | rule-payment | split_bill |
| quero pagar tudo | rule-payment | pay_full |
| ver minhas cortesias | rule-courtesy | view_courtesy |
| quero falar com o gerente | rule-manager-intent | — (pede o texto; turno seguinte → send_message_to_manager) |
| opções sem glúten | rule-gluten-free-recommendation | recommend_dish (dietary=gluten_free) |
| qual prato combina com vinho tinto? | **rota LLM** (503 sem provider) | — |
| tem algo sem glúten que chegue rápido? | **rota LLM** | — |
| meu pedido veio errado, o que você sugere? | **rota LLM** | — |
| não quero ver o cardápio agora, me fala de você | **rota LLM** | — |
| não quero pagar agora | **rota LLM** | — |
| o garçom foi grosso comigo | **rota LLM** | — |
| me indica algo que combine com o risoto que meu amigo pediu | **rota LLM** | — |
| quero adicionar 1 risoto | **rota LLM** (add_to_order é decisão do LLM) | — |

Resultado: 21/21 frases diretas resolvidas sem LLM; 8/8 frases de
raciocínio seguiram pra rota LLM. A UX no front foi verificada no spec
`assistente-context.spec.ts` (tool indicator + cards/chips reais +
MenuOverlay) — idêntica à de uma resposta de IA.

Bateria automatizada equivalente: `services/ai-service/tests/test_rule_layer_phrases.py`
(40 casos + contrato do followup do gerente).

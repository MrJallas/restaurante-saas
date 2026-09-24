---
status: aceita
date: 2026-04-15
decision-makers: Caleb Medeiros
---

# Separar o serviço de IA e responder sem LLM quando possível

## Contexto e problema

O cliente conversa com um assistente na mesa. O modelo de linguagem (LLM) pode ser local ou de nuvem,
demora, custa por chamada e pode ser induzido pelo texto que recebe. Pedido, pagamento, entrada na
mesa e alergia não podem depender do que o modelo resolver dizer.

## Opções consideradas

Para as decisões críticas dentro da conversa:

- deixar o LLM decidir, com instruções e filtros de texto (por exemplo, limpar o nome de quem pede
  para entrar na mesa antes de mostrá-lo ao modelo);
- tirar a decisão do LLM: regra determinística ou toque humano, e a chamada que vier do modelo é
  descartada.

## Decisão

Escolhida: "serviço de IA próprio, independente de provedor, com uma camada determinística antes do
LLM", porque isola a dependência e as falhas do modelo e mantém as regras críticas fora dele.

- `services/ai-service` (FastAPI) é o único componente que fala com LLM; `apps/api` e os fronts não
  têm SDK de LLM. Provedores: `openai` (e qualquer servidor compatível), `anthropic` e `google`
  (`services/llm/factory.py`).
- Chips e frases diretas (até 6 palavras, sem negação) são resolvidos por regra, sem chamar o LLM
  (`main.py`, `_is_direct_phrase`). Toda regra nova entra em `tests/test_rule_layer_phrases.py`.
- Chamada de ferramenta é intenção, não permissão: a ferramenta chama a API com o token da sessão do
  cliente e a API revalida tudo. Confirmação de ação destrutiva só vale vinda do toque no chip; a que
  vem do LLM é removida (`origin="llm"`).
- Entrada e junção de mesa: o LLM nunca decide um pedido pendente (`_llm_may_decide_join`). Vale a
  fala literal do anfitrião, casada por regra, ou o toque no aviso.
- Recomendação para quem pede "sem glúten": a lista é refeita no backend pelo filtro de alérgenos
  cadastrados (`enrichRecommendationToolCalls`); sem candidato, o assistente diz que não há opção.

### Consequências

- Boa, porque trocar de provedor é configuração (`LLM_*`), não código.
- Boa, porque sem LLM os atalhos continuam funcionando; o texto livre recebe uma mensagem fixa de
  indisponibilidade (`apps/api/src/modules/assistant/assistant.service.ts`).
- Boa, porque texto injetado no nome de quem pede para entrar não decide nada: não há heurística a
  vencer.
- Ruim, porque a camada de regras exige manutenção e uma bateria de testes própria.
- Ruim, porque o filtro determinístico de alérgenos cobre só glúten. Outras restrições (lactose,
  frutos do mar) seguem para o LLM, que recebe os alérgenos de cada prato no contexto.
- Ruim, porque `anthropic` e `google` não usam `LLM_BASE_URL` nem `LLM_REQUEST_TIMEOUT`.

## Mais informações

- Datas: serviço independente de provedor no commit `e37cf5f` (2026-04-15); camada de regras ampliada
  por decisão de 2026-06-11 (commit `1f899a1`, 2026-06-12); filtro de glúten no commit `7553611`
  (2026-06-12); confirmação por origem no `ac2660d` (2026-07-04); junção fora do LLM no `05b6170`
  (2026-07-05).
- [Serviço de IA](../arquitetura/servico-de-ia.md)

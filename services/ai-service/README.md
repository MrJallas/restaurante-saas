# services/ai-service — serviço do assistente de IA

Serviço em FastAPI (Python 3.11) que atende o assistente do cliente na mesa. Recebe as mensagens pela
API (`apps/api`), responde frases diretas com uma camada determinística, recorre a um LLM para o resto
e devolve ações ("ferramentas") que a API revalida antes de executar. Também gera as sugestões e as
mensagens de continuação da home da mesa.

## Endpoints (`main.py`)

| Rota                                 | Uso                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| `GET /health`                        | saúde, provedor e modelos configurados, número de ferramentas; sem autenticação |
| `POST /classify`                     | filtro de assunto (fora do restaurante é recusado)                              |
| `POST /chat`                         | conversa: camada determinística, depois LLM com ferramentas                     |
| `POST /smart-suggestions`            | sugestões para a home                                                           |
| `POST` e `GET /continuation`         | mensagem de continuação da home, a partir de modelos de texto                   |
| `POST /tools/dispatch`, `GET /tools` | execução e listagem das ferramentas                                             |

Fora de `/health` e da documentação, toda rota exige o header `X-AI-Service-Key` igual a
`AI_SERVICE_API_KEY`. Sem a variável, o serviço libera as rotas em desenvolvimento e responde 503 em
produção/staging.

## Provedores de LLM

`LLM_PROVIDER` escolhe `openai` (qualquer servidor compatível com a API da OpenAI via `LLM_BASE_URL`:
LM Studio, Ollama ou a própria OpenAI), `anthropic` ou `google` (`services/llm/factory.py`). A chave é
sempre `LLM_API_KEY`; `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` e `GOOGLE_API_KEY` não são lidas. Os
provedores Anthropic e Google não foram validados de ponta a ponta. Configuração completa em
[serviço de IA](../../docs/arquitetura/servico-de-ia.md).

## Como roda

- **No Compose** (serviço `ai-service`, container `restaurant-ai`, imagem `restaurant-ai-service:local`):
  `python:3.11-slim` com o `requirements.lock`, `uvicorn` na porta 8000 **sem porta publicada**. Só a
  API o chama, pela rede interna (`http://ai-service:8000`). Para falar com ele, use
  `docker exec restaurant-ai python -c "…"` (a imagem não tem `curl`).
- **Local:** `uvicorn main:app --reload --host 0.0.0.0 --port 8000` dentro de `services/ai-service`, com
  as dependências instaladas. Sem `REDIS_URL`, o serviço guarda o estado num dicionário em memória
  (`services/redis_pool.py`). `API_BASE_URL` precisa apontar para a API (o padrão do código é
  `http://localhost:3000`; o Compose usa `http://api:3001/api`).

Variáveis lidas: `LLM_*`, `AI_SERVICE_API_KEY`, `API_BASE_URL`, `API_REQUEST_TIMEOUT`, `REDIS_URL`,
`STAFF_API_KEY`, `CORS_ORIGINS`, `ENV`/`NODE_ENV`. Ver
[ambiente local](../../docs/desenvolvimento/ambiente-local.md).

## Estrutura

```
main.py            # app FastAPI, middleware de autenticação, camada determinística, rotas
config.py          # leitura das variáveis
services/
├── llm/           # interface do provedor e implementações openai, anthropic, google
├── tools/         # 40 ferramentas registradas (9 de equipe, sem uso pelo assistente do cliente)
├── continuation.py, smart_suggestions.py, intent_classifier.py, lgpd_messages.py, …
scripts/           # seeds de sugestões e continuação no Redis (python -m scripts.<nome> --tenant restaurant_dev)
tests/             # pytest
```

## Testes

18 arquivos `test_*.py`. O LLM é simulado: não precisa de GPU nem de chave. As dependências de teste
estão no `requirements-dev.lock` (a imagem Docker não traz o pytest):

```bash
cd services/ai-service
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.lock
python -m pytest -q
```

## Sem LLM

O sistema sobe e funciona sem um LLM acessível. Continuam funcionando a home da mesa, as sugestões e as
frases que a camada determinística cobre (cardápio, status do pedido, conta, chamar garçom, entre
outras); o filtro de assunto deixa a mensagem passar quando não consegue consultar o LLM. Perguntas
abertas recebem "Desculpe, estou com dificuldade no momento. Posso ajudar em breve." (HTTP 503 do
`/chat`). Detalhes e como plugar outro LLM: seção "Limitação da IA" do [README](../../README.md) e
[serviço de IA](../../docs/arquitetura/servico-de-ia.md).

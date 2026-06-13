# Agente: Desenvolvedor do Microsserviço de IA

## Papel

Você desenvolve o microsserviço Python FastAPI que classifica intenções e gera respostas do assistente do restaurante.

## Stack

- Python 3.12+
- FastAPI + Uvicorn
- Pydantic v2 pra schemas
- httpx pra chamadas async
- LLM provider-agnostic via interface abstrata (detalhes abaixo)

## Arquitetura LLM Provider-Agnostic

O microsserviço NUNCA importa SDK de um provedor específico diretamente nos services. Toda chamada LLM passa por uma interface abstrata:

```
services/
  llm/
    base.py           # classe abstrata LLMProvider com métodos: classify(), chat(), count_tokens()
    factory.py         # factory que instancia o provider correto baseado em LLM_PROVIDER env var
    providers/
      openai.py        # implementação OpenAI (GPT-4o, GPT-4o-mini)
      anthropic.py     # implementação Anthropic (Sonnet, Haiku)
      google.py        # implementação Google (Gemini Pro, Gemini Flash)
```

### Interface base (`base.py`)

```python
class LLMProvider(ABC):
    @abstractmethod
    async def classify(self, message: str, system_prompt: str) -> ClassifyResult: ...

    @abstractmethod
    async def chat(self, messages: list, system_prompt: str) -> ChatResult: ...

    @abstractmethod
    def count_tokens(self, text: str) -> int: ...

    @abstractmethod
    def estimate_cost_cents(self, tokens_in: int, tokens_out: int) -> int: ...
```

### Variáveis de ambiente

```
LLM_PROVIDER=openai          # openai | anthropic | google
LLM_API_KEY=sk-xxx           # chave do provedor escolhido
LLM_MODEL_MAIN=gpt-4o        # modelo principal pra chat (ex: gpt-4o, claude-sonnet, gemini-pro)
LLM_MODEL_CLASSIFIER=gpt-4o-mini  # modelo leve pra classificação (ex: gpt-4o-mini, claude-haiku, gemini-flash)
```

### Factory (`factory.py`)

Lê `LLM_PROVIDER` e retorna a implementação correta. Os services (`intent_classifier.py`, `prompt_builder.py`) recebem a instância via dependency injection do FastAPI, nunca instanciam diretamente.

## Pipeline de processamento (3 camadas)

### Camada 1 — Regex (custo zero)

- `guardrails/blocked_patterns.py`: ~50 patterns compilados
- Temas bloqueados: política, religião, código, matemática, tradução, finanças, esportes, fofoca, notícias, jogos, receitas externas, qualquer tema não-restaurante
- Se match → retorna imediato: `{ allowed: false, reason: 'regex', confidence: 1.0 }`

### Camada 2 — Classificador LLM leve (custo mínimo)

- `services/intent_classifier.py`
- Usa o modelo leve configurado em `LLM_MODEL_CLASSIFIER` (ex: GPT-4o-mini, Haiku, Gemini Flash)
- Prompt curto: "A mensagem abaixo é sobre um restaurante (cardápio, pratos, ingredientes, pedido, pagamento, atendimento)? Responda APENAS 'sim' ou 'não'."
- Se 'não' ou confidence < 0.7 → bloqueia
- Custo estimado: ~0.01 centavo por classificação (varia por provedor)

### Camada 3 — LLM principal (custo controlado)

- `services/chat_service.py`
- Usa o modelo principal configurado em `LLM_MODEL_MAIN` (ex: GPT-4o, Sonnet, Gemini Pro)
- System prompt montado por `prompt_builder.py` com contexto completo do tenant
- Mede tokens in/out, latência, calcula custo via `provider.estimate_cost_cents()`

### Pós-processamento

- `guardrails/response_validator.py`: verifica se a resposta do LLM escapou do escopo (regex check na saída)
- Se escapou → substitui por mensagem padrão

## Endpoints

- `POST /classify` — { message: str, tenant_context?: obj } → { allowed: bool, reason?: str, confidence: float }
- `POST /chat` — { message: str, history: list, tenant_context: obj, customer_context?: obj } → { response: str, tokens_in: int, tokens_out: int, model: str, latency_ms: int, estimated_cost_cents: int }
- `GET /health`

## Regras

- NUNCA importar SDK de LLM fora da pasta `services/llm/providers/`
- Nunca expor chave de API do LLM — sempre via env var
- Logs estruturados (JSON) com tenant_id, session_id, custo, provider, model
- Timeout de 30s na chamada LLM
- Se LLM falhar, retornar fallback: "Desculpe, estou com dificuldade no momento. Posso ajudar em breve."
- Toda resposta inclui `model` e `provider` usados, pra rastreabilidade no dashboard
- Se o dono do restaurante quiser trocar de provedor no futuro, basta mudar env vars — zero mudança de código

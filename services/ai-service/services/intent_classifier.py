from services.llm.factory import get_provider
from config import settings


CLASSIFY_PROMPT = """Voce e um classificador de intencoes para um assistente de restaurante.
Analise a mensagem do cliente e responda APENAS com "sim" ou "nao".

Responda "sim" se a mensagem e sobre:
- Cardapio, pratos, bebidas, sobremesas
- Recomendacoes de comida/bebida
- Ingredientes, alergenos, restricoes alimentares
- Precos, promocoes do restaurante
- Horario de funcionamento
- Pedidos, status de pedidos
- Elogios/reclamacoes sobre a comida ou servico
- Duvidas sobre o restaurante

Responda "nao" se a mensagem e sobre qualquer outro assunto.

Mensagem do cliente: "{message}"

Resposta (sim/nao):"""


async def classify_message(message: str) -> dict:
    """
    Classifies whether a message is restaurant-related.
    Returns: { allowed: bool, confidence: float, reason: str | None }
    """
    provider = get_provider()

    prompt = CLASSIFY_PROMPT.format(message=message)
    result = await provider.classify(
        prompt=prompt,
        model=settings.LLM_MODEL_CLASSIFIER,
        max_tokens=10,
    )

    response_text = result["response"].strip().lower()
    is_allowed = response_text.startswith("sim")
    confidence = 0.9 if is_allowed else 0.85

    return {
        "allowed": is_allowed,
        "confidence": confidence,
        "reason": None if is_allowed else "classifier",
        "tokens_in": result["tokens_in"],
        "tokens_out": result["tokens_out"],
    }

from services.llm.factory import get_provider
from config import settings


CLASSIFY_PROMPT = """Você é um classificador de intenções para um assistente de restaurante.
Analise a mensagem do cliente considerando o CONTEXTO da conversa anterior e responda APENAS com "sim" ou "não".

Responda "sim" se a mensagem é sobre:
- Cardápio, pratos, bebidas, sobremesas
- Recomendações de comida/bebida
- Ingredientes, alérgenos, restrições alimentares
- Preços, promoções do restaurante
- INFORMAÇÕES OPERACIONAIS DO RESTAURANTE (sempre permitir): horário de
  funcionamento ("até que horas vocês ficam abertos", "quando fecham",
  "abrem domingo?"), endereço, telefone, formas de pagamento, política
  de cancelamento, wi-fi, estacionamento, acessibilidade, dress code.
  Estas perguntas NUNCA são off-topic — são exatamente o caso de uso da
  tool `ask_about_restaurant`. Se o assistente bloquear essas, é regression.
- Pedidos, status de pedidos, conta, pagamento, dividir conta
- Tempo/status/andamento do pedido ("quanto tempo demora o pedido?",
  "cadê meu pedido?", "quando fica pronto?")
- Elogios/reclamações sobre a comida ou serviço
- Dúvidas sobre o restaurante (qualquer coisa sobre o estabelecimento)
- Fome, sede, vontade de comer/beber, estado do apetite ("estou com fome", "tô com sede", "bateu a fome")
- Pedidos de sugestão geral ("o que você recomenda", "o que tem de bom", "me indica algo")
- Pedir para chamar garçom ou ajuda no atendimento
- PEDIDOS COMUNS DE GARÇOM (sempre permitir): "preciso de mais água", "pode
  trazer um talher", "queria mais guardanapo", "me ajuda com a conta", "tem
  como trazer sal/azeite/pimenta/gelo/copo". Estas mensagens NUNCA são
  off-topic — são exatamente o caso de uso da tool `call_waiter`. Se o
  classifier bloquear "preciso de mais água", é regression do round 4.
- Follow-ups curtos ou ambíguos QUANDO o contexto anterior é do restaurante ("os dois", "quero esse", "quanto?", "pode ser", "esse mesmo", "sim", "pode trazer")
- Pedidos sociais relacionados à mesa: juntar mesas, late-arrival, mensagem pro gerente, reclamação, LGPD/exclusão de dados

Responda "não" APENAS se a mensagem é claramente sobre outro assunto não relacionado ao restaurante (política, religião, esportes não-pizza-relacionados, código, finanças pessoais, etc).

EXEMPLOS DE PERGUNTAS QUE DEVEM RETORNAR "sim" (regression do round 3):
- "qual o horário de funcionamento?" → sim
- "vocês abrem domingo?" → sim
- "qual o endereço?" → sim
- "tem wi-fi?" → sim
- "aceitam cartão?" → sim
- "tem estacionamento?" → sim
- "qual a política de cancelamento?" → sim
- "quanto tempo demora o pedido?" → sim
- "cadê meu pedido?" → sim

EXEMPLOS DE PEDIDOS DE GARÇOM QUE DEVEM RETORNAR "sim" (round 4 #C-NEW-2):
- "preciso de mais água" → sim
- "pode trazer um talher?" → sim
- "queria mais um guardanapo" → sim
- "me ajuda com a conta" → sim
- "tem como trazer sal?" → sim
- "preciso de gelo" → sim

{history_block}Mensagem atual do cliente: "{message}"

Resposta (sim/não):"""


async def classify_message(message: str, history: list[dict] | None = None) -> dict:
    """
    Classifies whether a message is restaurant-related.
    Optionally uses recent conversation history to disambiguate follow-ups.
    Returns: { allowed: bool, confidence: float, reason: str | None }
    """
    provider = get_provider()

    history_block = ""
    if history:
        lines = []
        for msg in history:
            role = "Cliente" if msg.get("role") == "user" else "Assistente"
            content = (msg.get("content") or "").strip()
            if content:
                lines.append(f"{role}: {content}")
        if lines:
            history_block = "Conversa anterior:\n" + "\n".join(lines) + "\n\n"

    prompt = CLASSIFY_PROMPT.format(message=message, history_block=history_block)
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

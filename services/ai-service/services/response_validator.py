import re

# Patterns that suggest the AI response went off-scope
OFF_SCOPE_PATTERNS = [
    re.compile(r"\b(como\s+programador|em\s+python|em\s+javascript|codigo)\b", re.IGNORECASE),
    re.compile(r"\b(eleicoes|candidato|partido\s+politico)\b", re.IGNORECASE),
    re.compile(r"\b(receita\s+completa|modo\s+de\s+preparo\s+caseiro)\b", re.IGNORECASE),
]

FALLBACK_RESPONSE = (
    "Posso ajudar com informacoes sobre nosso cardapio, pratos, bebidas, "
    "recomendacoes e qualquer duvida sobre o restaurante. "
    "Como posso ajudar?"
)


def validate_response(response: str) -> tuple[str, bool]:
    """
    Validates the AI response. If off-scope, returns fallback.
    Returns: (response_text, was_replaced)
    """
    for pattern in OFF_SCOPE_PATTERNS:
        if pattern.search(response):
            return FALLBACK_RESPONSE, True

    return response, False

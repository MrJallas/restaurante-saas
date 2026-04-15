import re

# Pre-compiled regex patterns for zero-cost guardrails.
# These block obviously off-topic messages before any LLM call.
BLOCKED_PATTERNS = [
    # Politics
    re.compile(r"\b(politica|eleicao|presidente|deputado|senador|voto|partido|lula|bolsonaro)\b", re.IGNORECASE),
    # Religion
    re.compile(r"\b(religiao|deus|biblia|alcor[aã]o|igreja|mesquita|satanas|demonio)\b", re.IGNORECASE),
    # Code / programming
    re.compile(r"\b(python|javascript|typescript|react|sql|SELECT\s+\*|DROP\s+TABLE|console\.log)\b", re.IGNORECASE),
    re.compile(r"\b(codigo|programacao|debug|compilar|deploy|api|endpoint|backend|frontend)\b", re.IGNORECASE),
    # Finance / crypto
    re.compile(r"\b(bitcoin|ethereum|crypto|acao|investimento|bolsa\s+de\s+valores|forex)\b", re.IGNORECASE),
    # Sports (non-restaurant)
    re.compile(r"\b(futebol|campeonato|gol|placar|brasileirao|libertadores|mundial)\b", re.IGNORECASE),
    # Recipes / cooking at home
    re.compile(r"\b(receita\s+de|como\s+fazer\s+em\s+casa|modo\s+de\s+preparo|ingredientes\s+para)\b", re.IGNORECASE),
    # Medical
    re.compile(r"\b(remedio|medicamento|doenca|sintoma|diagnostico|tratamento\s+medico)\b", re.IGNORECASE),
    # Violence / inappropriate
    re.compile(r"\b(matar|morrer|suicidio|arma|bomba|droga|sexo|pornografia)\b", re.IGNORECASE),
    # Homework / academic
    re.compile(r"\b(tarefa|trabalho\s+escolar|prova|vestibular|enem|faculdade|tcc)\b", re.IGNORECASE),
    # General off-topic signals
    re.compile(r"\b(me\s+conte\s+uma\s+piada|quem\s+e\s+voce|voce\s+e\s+uma?\s+ia|qual\s+seu\s+nome)\b", re.IGNORECASE),
]


def check_blocked(message: str) -> tuple[bool, str | None]:
    """
    Returns (is_blocked, matched_pattern_description).
    True = message should be blocked.
    """
    for pattern in BLOCKED_PATTERNS:
        if pattern.search(message):
            return True, "regex"
    return False, None

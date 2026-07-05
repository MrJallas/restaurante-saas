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
    # "matar/morrer" so bloqueiam se NAO for expressao idiomatica com fome/sede
    # ("matar a fome", "morrer de fome", "matando a sede" sao contexto de restaurante)
    re.compile(r"\bmatar\b(?!\s+a?\s*(fome|sede))", re.IGNORECASE),
    re.compile(r"\bmorrer\b(?!\s+de\s+(fome|sede))", re.IGNORECASE),
    re.compile(r"\b(suicidio|arma\s+de\s+fogo|bomba|cocaina|maconha|sexo|pornografia)\b", re.IGNORECASE),
    # Drogas / sexo explicito (P1 do re-scan de convergencia): 'droga(s)',
    # 'transar', 'crack', 'heroina' escapavam pela allow-list heuristica
    # ('quero \w+' / 'mais \w+') porque a linha acima cobria so cocaina/maconha.
    # CUIDADO: 'droga' sozinho e interjeicao comum ('que droga!') — so bloqueia
    # termos inequivocos OU droga(s) num contexto de comprar/querer/usar/vender,
    # nunca a interjeicao (senao bloquearia cliente frustrado).
    re.compile(r"\b(crack|heroina|entorpecente|drogas)\b", re.IGNORECASE),
    re.compile(r"\b(comprar|quero|querendo|vender|usar|arrumar|cheirar|conseguir)\s+drogas?\b", re.IGNORECASE),
    re.compile(r"\btransar\b", re.IGNORECASE),
    # Homework / academic
    re.compile(r"\b(tarefa|trabalho\s+escolar|prova|vestibular|enem|faculdade|tcc)\b", re.IGNORECASE),
    # General off-topic signals
    re.compile(r"\b(me\s+conte\s+uma\s+piada|quem\s+e\s+voce|voce\s+e\s+uma?\s+ia|qual\s+seu\s+nome)\b", re.IGNORECASE),
]


GREETING_PATTERNS = [
    re.compile(r"^\s*(ol[aá]|oi|e\s*a[ií]?|fala|salve|hey|hello|hi)\s*[!?.]*\s*$", re.IGNORECASE),
    re.compile(r"^\s*(bom\s+dia|boa\s+(tarde|noite))\s*[!?.]*\s*$", re.IGNORECASE),
    re.compile(r"^\s*(tudo\s+(bem|bom|certo|tranquilo|joia))\s*[!?.]*\s*$", re.IGNORECASE),
    re.compile(r"^\s*(como\s+vai|como\s+voc[eê]\s+(est[aá]|ta|tá))\s*[!?.]*\s*$", re.IGNORECASE),
    re.compile(r"^\s*(beleza|tranquilo|suave|firmeza)\s*[!?.]*\s*$", re.IGNORECASE),
]


def check_greeting(message: str) -> bool:
    """Returns True if the message is a simple greeting/pleasantry."""
    for pattern in GREETING_PATTERNS:
        if pattern.search(message):
            return True
    return False


def check_blocked(message: str) -> tuple[bool, str | None]:
    """
    Returns (is_blocked, matched_pattern_description).
    True = message should be blocked.
    """
    for pattern in BLOCKED_PATTERNS:
        if pattern.search(message):
            return True, "regex"
    return False, None

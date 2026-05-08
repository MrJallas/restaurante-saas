"""
4th classification layer — bare acknowledgment detection.

Per `.claude/agents/ai-service.md` the cascade is:
    greeting → ack (THIS layer) → regex guardrails → LLM classifier

Acks are short closer-style replies ("ok", "valeu", "show", "👍", "blz"...).
They should NOT trigger a tool call nor an LLM round-trip — they get a brief
canned reply or, when `silent=True`, no reply at all.

This is regex/lookup only. Zero tokens, zero LLM calls. High-precision,
moderate-recall: it's fine to fall through to the existing layers when in
doubt — false negatives just waste a regex check, false positives swallow
real intent.
"""

import re
from dataclasses import dataclass
from typing import Optional


# Single-token affirmations / closers. Match if the WHOLE message (after
# stripping punctuation/emoji) is one of these.
_ACK_TOKENS = {
    # textual
    "ok", "okay", "okay!", "okk", "kkk",
    "blz", "beleza",
    "ta", "tá", "tabom", "tabem",
    "show", "showw", "top", "topp",
    "valeu", "vlw", "vlww",
    "obrigado", "obrigada", "obrigad",
    "obg", "obgg",
    "agradeço", "agradecido", "agradecida",
    "perfeito", "perfeita",
    "ótimo", "otimo", "ótima", "otima",
    "legal", "legalzinho",
    "bacana", "massa",
    "isso", "exato", "exatamente",
    "claro", "certo", "certinho",
    "uhum", "ahã", "aham", "aha",
    "yes", "yep", "yeah",
    "thx", "thanks",
    "boa",
    "👍", "👌", "🙏", "✓", "✔️", "✅",
}

# Multi-word acks. Matched as a whole-message regex (anchors).
_ACK_PHRASES = [
    re.compile(r"^\s*tá\s+bom\s*[.!?]*\s*$", re.IGNORECASE),
    re.compile(r"^\s*ta\s+bom\s*[.!?]*\s*$", re.IGNORECASE),
    re.compile(r"^\s*tá\s+ótimo\s*[.!?]*\s*$", re.IGNORECASE),
    re.compile(r"^\s*muito\s+obrigad[oa]\s*[.!?]*\s*$", re.IGNORECASE),
    re.compile(r"^\s*valeu\s+(mesmo|mano|cara|amigo|amiga)\s*[.!?]*\s*$", re.IGNORECASE),
    re.compile(r"^\s*obrigad[oa]\s+(mesmo|viu|hein)\s*[.!?]*\s*$", re.IGNORECASE),
    re.compile(r"^\s*ok(ay)?\s+(então|entao|legal|tudo\s+bem)\s*[.!?]*\s*$", re.IGNORECASE),
    re.compile(r"^\s*(certo|claro|legal)\s+(então|entao)\s*[.!?]*\s*$", re.IGNORECASE),
    re.compile(r"^\s*sem\s+problema\s*[.!?]*\s*$", re.IGNORECASE),
    re.compile(r"^\s*pode\s+(ser|deixar)\s*[.!?]*\s*$", re.IGNORECASE),
    re.compile(r"^\s*tudo\s+(certo|tranquilo)\s*[.!?]*\s*$", re.IGNORECASE),
]

# Strip leading/trailing punctuation/whitespace before token comparison.
_PUNCT_STRIP = re.compile(r"^[\s\.\,\!\?\-’‘\"\'\(\)\[\]]+|[\s\.\,\!\?\-’‘\"\'\(\)\[\]]+$")

# Single-emoji detection (any emoji-ish unicode codepoint). High-precision:
# we only treat an isolated emoji as ack — strings mixing emoji with text
# go through the normal classifier so "👍 quero a conta" still hits a tool.
_EMOJI_ONLY = re.compile(
    r"^\s*[☀-➿\U0001F300-\U0001F9FF\U0001FA00-\U0001FAFF]+\s*$"
)


@dataclass(frozen=True)
class AckResult:
    """Outcome of the ack-detection layer."""

    kind: str  # always "ack" today; reserved for future variants ("emoji_ack")
    confidence: float
    matched: str  # the token/pattern that matched (for telemetry)
    silent: bool = False  # if True, the orchestrator should send NO reply


def detect_ack(text: str) -> Optional[AckResult]:
    """
    Returns an AckResult when the message is a bare acknowledgment.

    Heuristics (high-precision, no LLM):
    1. Whole-message emoji-only → ack with silent=False (small thumbs-up reply).
    2. Single token after punctuation stripping → ack lookup table.
    3. Multi-word phrase regex match.

    Returns None if nothing matches; caller falls through to greeting / regex /
    classifier layers.
    """
    if not text or not text.strip():
        return None

    stripped = text.strip()

    # Length guard: anything over ~20 chars is too long to be a bare ack.
    # Keeps "valeu pelo combo de hambúrguer com fritas" out of this layer.
    if len(stripped) > 24:
        return None

    # 1. Emoji-only message
    if _EMOJI_ONLY.match(stripped):
        return AckResult(kind="ack", confidence=0.95, matched="emoji-only", silent=False)

    # 2. Single-token lookup (after stripping punctuation)
    cleaned = _PUNCT_STRIP.sub("", stripped).lower()
    # Single-word: no spaces after cleanup
    if cleaned and " " not in cleaned and cleaned in _ACK_TOKENS:
        return AckResult(kind="ack", confidence=0.97, matched=cleaned, silent=False)

    # Also handle the literal exact-match unicode tokens (e.g. "👍" without strip)
    if stripped in _ACK_TOKENS:
        return AckResult(kind="ack", confidence=0.97, matched=stripped, silent=False)

    # 3. Multi-word phrase patterns
    for pat in _ACK_PHRASES:
        if pat.match(stripped):
            return AckResult(kind="ack", confidence=0.92, matched=pat.pattern, silent=False)

    return None


# Canned tiny replies the orchestrator can rotate through when an ack is
# detected and silent=False. Keep them short — the customer's saying "got it",
# the assistant's job is to NOT keep talking.
#
# These are now seeded into Redis at app startup (key: `ack:replies`) and
# rotated via LPOP + RPUSH (see `get_ack_reply()` below). Same pattern as
# smart-suggestions and continuation pools. Falling back to this list when
# Redis is unreachable keeps tests/dev runs deterministic.
ACK_REPLIES: list[str] = [
    "Tô por aqui se precisar de mais alguma coisa.",
    "À disposição.",
    "Beleza!",
    "Qualquer coisa é só chamar.",
    "Combinado.",
]


# Redis key for the rotating ack-replies pool. Seeded at startup if empty
# (LLEN ack:replies == 0). LPOP returns one entry; we RPUSH it back so the
# pool rotates without needing a global counter.
ACK_REPLIES_KEY = "ack:replies"


def seed_ack_replies(values: list[str] | None = None) -> int:
    """
    Seed the Redis pool ONCE (idempotent). Called at app startup.

    If Redis already has entries under `ack:replies`, this is a no-op.
    Returns the number of entries seeded (0 if pool already exists).
    """
    from .redis_pool import pool_seed_strings_if_empty
    return pool_seed_strings_if_empty(ACK_REPLIES_KEY, values or ACK_REPLIES)


def get_ack_reply() -> str:
    """
    Return the next canned reply, rotating through the Redis-backed pool.

    Implementation: LPOP → if empty re-seed from ACK_REPLIES → LPOP →
    RPUSH popped value back to the tail. Always returns a non-empty string.
    """
    from .redis_pool import pool_rotate_lpop
    return pool_rotate_lpop(ACK_REPLIES_KEY, ACK_REPLIES)


__all__ = [
    "AckResult",
    "detect_ack",
    "ACK_REPLIES",
    "ACK_REPLIES_KEY",
    "get_ack_reply",
    "seed_ack_replies",
]

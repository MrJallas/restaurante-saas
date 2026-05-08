"""
Tiny Redis client wrapper for the AI service.

We don't use any Redis client directly in the rest of the codebase to keep
swapping easy. Connection pooling, JSON encoding, and idempotent
upsert-into-list logic live here.

Falls back to an in-process dict when REDIS_URL is unset (handy for tests
and dev runs without Docker compose).
"""

import json
import os
import time
from typing import Any, Optional

try:
    import redis  # type: ignore[import-not-found]
    _REDIS_AVAILABLE = True
except ImportError:  # pragma: no cover — redis is in requirements.txt
    redis = None  # type: ignore[assignment]
    _REDIS_AVAILABLE = False


class _InMemoryFallback:
    """Used when Redis is unreachable; keeps tests deterministic."""

    def __init__(self) -> None:
        self._kv: dict[str, str] = {}
        self._expires: dict[str, float] = {}
        self._lists: dict[str, list[str]] = {}

    def _gc(self) -> None:
        now = time.time()
        for k in list(self._expires.keys()):
            if self._expires[k] < now:
                self._kv.pop(k, None)
                self._lists.pop(k, None)
                del self._expires[k]

    def get(self, key: str) -> Optional[str]:
        self._gc()
        return self._kv.get(key)

    def set(self, key: str, value: str, ex: Optional[int] = None) -> None:
        self._kv[key] = value
        if ex:
            self._expires[key] = time.time() + ex

    def lrange(self, key: str, start: int, end: int) -> list[str]:
        self._gc()
        lst = self._lists.get(key, [])
        if end == -1:
            return lst[start:]
        return lst[start:end + 1]

    def rpush(self, key: str, *values: str) -> int:
        lst = self._lists.setdefault(key, [])
        lst.extend(values)
        return len(lst)

    def lpop(self, key: str) -> Optional[str]:
        self._gc()
        lst = self._lists.get(key)
        if not lst:
            return None
        return lst.pop(0)

    def llen(self, key: str) -> int:
        self._gc()
        return len(self._lists.get(key, []))

    def delete(self, key: str) -> int:
        n = 0
        if key in self._kv:
            del self._kv[key]; n += 1
        if key in self._lists:
            del self._lists[key]; n += 1
        return n

    def expire(self, key: str, seconds: int) -> bool:
        self._expires[key] = time.time() + seconds
        return True

    def ping(self) -> bool:
        return True


_client: Any = None


def get_client() -> Any:
    """Lazy-init a process-wide Redis client (or in-mem fallback)."""
    global _client
    if _client is not None:
        return _client

    url = os.getenv("REDIS_URL")
    if url and _REDIS_AVAILABLE:
        try:
            _client = redis.Redis.from_url(url, decode_responses=True)  # type: ignore[union-attr]
            _client.ping()
            return _client
        except Exception:
            # Connection refused / unreachable — fall through to in-mem.
            pass

    _client = _InMemoryFallback()
    return _client


# ─────────────────────────────────────────────────────────────
# Pool helpers
# ─────────────────────────────────────────────────────────────

def pool_get_all(key: str) -> list[dict[str, Any]]:
    """LRANGE 0 -1, JSON-decode each entry."""
    client = get_client()
    raw = client.lrange(key, 0, -1) or []
    out: list[dict[str, Any]] = []
    for entry in raw:
        try:
            out.append(json.loads(entry))
        except (TypeError, ValueError):
            continue
    return out


def pool_seed(key: str, entries: list[dict[str, Any]], ttl_seconds: Optional[int] = None) -> int:
    """
    Idempotent seed: deletes existing list and pushes fresh entries.
    Returns the number of entries pushed.
    """
    client = get_client()
    client.delete(key)
    if not entries:
        return 0
    client.rpush(key, *(json.dumps(e) for e in entries))
    if ttl_seconds:
        client.expire(key, ttl_seconds)
    return len(entries)


# ─────────────────────────────────────────────────────────────
# Rotating-pool helpers (LPOP + RPUSH back · for ACK replies, etc.)
# ─────────────────────────────────────────────────────────────

def pool_seed_strings_if_empty(key: str, values: list[str], ttl_seconds: Optional[int] = None) -> int:
    """
    Seed a string-only list ONCE: only pushes if `LLEN key == 0`.
    Idempotent across restarts; doesn't clobber an existing pool.
    Returns number of entries pushed (0 if pool already exists).
    """
    client = get_client()
    if client.llen(key) > 0:
        return 0
    if not values:
        return 0
    client.rpush(key, *values)
    if ttl_seconds:
        client.expire(key, ttl_seconds)
    return len(values)


def pool_rotate_lpop(key: str, fallback: list[str]) -> str:
    """
    LPOP a value, RPUSH it back to the tail (rotating pool).

    If the pool is empty (Redis was flushed, fresh container, etc.) seeds
    from `fallback` then LPOPs again. Always returns a non-empty string;
    caller never has to handle None.

    Race-safe enough for our use case: LPOP+RPUSH are 2 ops, so if N workers
    contend they may briefly observe duplicates — fine for canned ack replies.
    """
    client = get_client()
    val = client.lpop(key)
    if val is None:
        # Pool was empty — re-seed from fallback and try once more.
        if not fallback:
            # Last resort: just return the first fallback or empty string.
            return ""
        client.rpush(key, *fallback)
        val = client.lpop(key)
    if val is not None:
        # Push the popped value to the tail so the pool rotates.
        client.rpush(key, val)
        return val
    return fallback[0] if fallback else ""

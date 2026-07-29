#!/usr/bin/env python3
"""Dependency-free local vector index helpers for repository RAG."""

from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
import struct
from dataclasses import dataclass
from fnmatch import fnmatch
from pathlib import Path


DIMENSIONS = 384
TOKEN_RE = re.compile(r"[\wÀ-ÿ]{2,}", re.UNICODE)


@dataclass(frozen=True)
class SourceFile:
    path: Path
    relative: str
    priority: int


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_config(root: Path) -> dict:
    return json.loads((root / "docs/rag/sources.json").read_text(encoding="utf-8"))


def discover_sources(root: Path, config: dict) -> list[SourceFile]:
    found: dict[str, SourceFile] = {}
    excludes = config.get("exclude", [])
    max_bytes = int(config.get("max_file_bytes", 1_000_000))
    for priority, pattern in enumerate(config["include"], start=1):
        for path in root.glob(pattern):
            if not path.is_file() or path.stat().st_size > max_bytes:
                continue
            relative = path.relative_to(root).as_posix()
            if any(fnmatch(relative, excluded) for excluded in excludes):
                continue
            found.setdefault(relative, SourceFile(path, relative, priority))
    return sorted(found.values(), key=lambda item: (item.priority, item.relative))


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def chunks(text: str, max_lines: int = 60, overlap: int = 10):
    lines = text.splitlines()
    if not lines:
        return
    start = 0
    while start < len(lines):
        end = min(len(lines), start + max_lines)
        body = "\n".join(lines[start:end]).strip()
        if body:
            yield start + 1, end, body
        if end == len(lines):
            break
        start = max(start + 1, end - overlap)


def tokens(text: str) -> list[str]:
    words = [word.casefold() for word in TOKEN_RE.findall(text)]
    return words + [f"{left}::{right}" for left, right in zip(words, words[1:])]


def vectorize(text: str) -> list[float]:
    vector = [0.0] * DIMENSIONS
    for token in tokens(text):
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        value = int.from_bytes(digest, "little")
        index = value % DIMENSIONS
        vector[index] += -1.0 if value & (1 << 63) else 1.0
    norm = math.sqrt(sum(value * value for value in vector))
    return [value / norm for value in vector] if norm else vector


def pack_vector(vector: list[float]) -> bytes:
    return struct.pack(f"<{DIMENSIONS}f", *vector)


def unpack_vector(blob: bytes) -> tuple[float, ...]:
    return struct.unpack(f"<{DIMENSIONS}f", blob)


def cosine(left: list[float], right_blob: bytes) -> float:
    return sum(a * b for a, b in zip(left, unpack_vector(right_blob)))


def connect(index_path: Path) -> sqlite3.Connection:
    index_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(index_path)
    connection.row_factory = sqlite3.Row
    return connection


SCHEMA = """
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  priority INTEGER NOT NULL,
  chunks INTEGER NOT NULL
);
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  priority INTEGER NOT NULL,
  text TEXT NOT NULL,
  vector BLOB NOT NULL
);
CREATE VIRTUAL TABLE chunks_fts USING fts5(text, content='chunks', content_rowid='id');
CREATE INDEX chunks_path_idx ON chunks(path);
"""

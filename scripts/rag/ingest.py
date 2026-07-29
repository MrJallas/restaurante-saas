#!/usr/bin/env python3
"""Build the local repository RAG index under .rag/."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from rag_common import SCHEMA, chunks, connect, discover_sources, file_hash, load_config, pack_vector, repo_root, vectorize


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset", action="store_true", help="Rebuild the complete local index (currently the default behavior).")
    parser.add_argument("--json", action="store_true", help="Print a machine-readable summary.")
    args = parser.parse_args()

    root = repo_root()
    config = load_config(root)
    index_path = root / config.get("index_path", ".rag/index.sqlite3")
    temporary = index_path.with_suffix(".tmp")
    temporary.unlink(missing_ok=True)

    connection = connect(temporary)
    connection.executescript(SCHEMA)
    source_count = 0
    chunk_count = 0
    try:
        for source in discover_sources(root, config):
            text = source.path.read_text(encoding="utf-8", errors="ignore")
            inserted = 0
            for line_start, line_end, body in chunks(text, int(config.get("chunk_lines", 60)), int(config.get("chunk_overlap_lines", 10))):
                cursor = connection.execute(
                    "INSERT INTO chunks(path,line_start,line_end,priority,text,vector) VALUES(?,?,?,?,?,?)",
                    (source.relative, line_start, line_end, source.priority, body, pack_vector(vectorize(body))),
                )
                connection.execute("INSERT INTO chunks_fts(rowid,text) VALUES(?,?)", (cursor.lastrowid, body))
                inserted += 1
            connection.execute(
                "INSERT INTO files(path,sha256,priority,chunks) VALUES(?,?,?,?)",
                (source.relative, file_hash(source.path), source.priority, inserted),
            )
            source_count += 1
            chunk_count += inserted
        generated_at = datetime.now(timezone.utc).isoformat()
        metadata = {
            "generated_at": generated_at,
            "embedding": "signed-hash-unigram-bigram-v1",
            "files": str(source_count),
            "chunks": str(chunk_count),
        }
        connection.executemany("INSERT INTO metadata(key,value) VALUES(?,?)", metadata.items())
        connection.commit()
    finally:
        connection.close()

    index_path.unlink(missing_ok=True)
    temporary.replace(index_path)
    summary = {"index": str(index_path), "files": source_count, "chunks": chunk_count}
    print(json.dumps(summary, ensure_ascii=False) if args.json else f"RAG pronto: {source_count} arquivos, {chunk_count} chunks -> {index_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

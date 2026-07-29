#!/usr/bin/env python3
"""Search the local repository RAG index with hybrid vector + FTS ranking."""

from __future__ import annotations

import argparse
import json
import re

from rag_common import connect, cosine, load_config, repo_root, vectorize


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", nargs="+", help="Natural-language question or terms to retrieve.")
    parser.add_argument("--limit", type=int, default=6)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    query = " ".join(args.query).strip()

    root = repo_root()
    config = load_config(root)
    index_path = root / config.get("index_path", ".rag/index.sqlite3")
    if not index_path.exists():
        raise SystemExit("Índice ausente. Rode: python3 scripts/rag/ingest.py --reset")

    query_vector = vectorize(query)
    lexical: dict[int, float] = {}
    terms = re.findall(r"[\wÀ-ÿ]{2,}", query.casefold())
    connection = connect(index_path)
    if terms:
        expression = " OR ".join(f'"{term}"' for term in terms)
        try:
            raw_lexical = {
                int(row["rowid"]): max(0.0, -float(row["rank"]))
                for row in connection.execute("SELECT rowid, bm25(chunks_fts) AS rank FROM chunks_fts WHERE chunks_fts MATCH ? LIMIT 200", (expression,))
            }
            peak = max(raw_lexical.values(), default=0.0)
            lexical = {row_id: value / peak for row_id, value in raw_lexical.items()} if peak else {}
        except Exception:
            lexical = {}

    results = []
    for row in connection.execute("SELECT id,path,line_start,line_end,priority,text,vector FROM chunks"):
        vector_score = max(0.0, cosine(query_vector, row["vector"]))
        lexical_score = lexical.get(int(row["id"]), 0.0)
        priority_bonus = 0.03 / max(1, int(row["priority"]))
        score = 0.72 * vector_score + 0.25 * lexical_score + priority_bonus
        results.append({
            "score": round(score, 5),
            "path": row["path"],
            "line_start": row["line_start"],
            "line_end": row["line_end"],
            "text": row["text"],
        })
    connection.close()
    results.sort(key=lambda item: item["score"], reverse=True)
    results = results[: max(1, args.limit)]

    if args.json:
        print(json.dumps({"query": query, "results": results}, ensure_ascii=False, indent=2))
    else:
        for position, result in enumerate(results, start=1):
            print(f"[{position}] score={result['score']:.5f} {result['path']}:{result['line_start']}-{result['line_end']}")
            print(result["text"][:1400].strip())
            print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

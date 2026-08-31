# Instructions for coding agents

Before any non-trivial audit or implementation:

1. Read `MEMORY.md`, then `CLAUDE.md`.
2. Read `docs/rag/README.md` and query the local RAG before broad exploration:
   `python3 scripts/rag/search.py "your question"`.
3. If the index is missing or stale, run `python3 scripts/rag/ingest.py --reset`.
4. For interactive iOS/mobile auditing, read `docs/audits/serve-sim.md` and use
   `scripts/audit/start-serve-sim.sh`.
5. Keep durable decisions aligned across `MEMORY.md`, `CLAUDE.md` and indexed
   docs. Keep `.rag/`, screenshots, traces and videos out of Git.

Do not infer that Simulator-only validation proves device performance or
hardware behavior. Confirm hardware-sensitive findings on a physical iPhone.

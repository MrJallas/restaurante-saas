# Instructions for coding agents

Before any non-trivial audit or implementation:

1. Read `MEMORY.md`, then `CLAUDE.md`.
2. To recall a decision and WHY it was made, query the canonical vault RAG:
   `bash '/Users/calebmedeiros/obsidian/memorias de caleb/rag/recall.sh' "your question" --project restaurante-saas`
   It indexes the reasoning about this codebase (logs, decisions, briefs).
3. To find WHERE something lives in the code, use Grep/Glob directly. The repo
   no longer ships a second local index: it drifted to 55% correct and started
   serving stale `CLAUDE.md`/`MEMORY.md` chunks with an air of authority, while
   Grep always reads the current tree.
4. For interactive iOS/mobile auditing, read `docs/audits/serve-sim.md` and use
   `scripts/audit/start-serve-sim.sh`.
5. Keep durable decisions aligned across `MEMORY.md` and `CLAUDE.md`. Keep
   screenshots, traces and videos out of Git.

Do not infer that Simulator-only validation proves device performance or
hardware behavior. Confirm hardware-sensitive findings on a physical iPhone.

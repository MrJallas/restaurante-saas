# restauranteSaaS Local RAG

This folder is the text-first contract for the local vector RAG Caleb wants to
run without external API cost. The actual vector database, embeddings and caches
must stay local and out of Git.

## Purpose

- Help Codex, Claude Code and other agents recover product context before
  changing the app.
- Make `MEMORY.md`, superprompts, canvas handoffs, prompt files, QA reports and
  key source files searchable together.
- Keep long-lived decisions easy to retrieve without committing heavy generated
  artifacts.

## Source Priority

Index these sources in this order:

1. `MEMORY.md`
2. `CLAUDE.md`
3. `qa-reports/SUPER-PROMPT-CONTINUACAO.md`
4. `qa-reports/SUPER-PROMPT-V5.md`
5. `docs/design-canvas-final/**`
6. `docs/design-canvas/handoff/**`
7. `prompts-codex/**/*.md`
8. `apps/api/**`, `apps/web-customer/**`, `apps/web-staff/**`,
   `services/ai-service/**`
9. Recent small QA summaries under `qa-reports/**`

Do not index generated dependency folders, vector DB folders, build outputs,
mass screenshots, traces, videos or Playwright reports.

## Local Storage

Recommended local paths:

- `.rag/`: vector DB, embeddings, manifests and local cache.
- `.rag/manifests/`: source file hashes and ingestion metadata.
- `.rag/exports/`: optional temporary query outputs for debugging.

`.rag/` is intentionally ignored by Git.

## Update Rule For Agents

Every substantial run must keep the memory/RAG layer fresh:

1. Read `MEMORY.md` before broad work.
2. Query the local RAG when it exists before doing expensive manual searches.
3. If the run changes product behavior, validation state, routes, contracts,
   known risks or open questions, update `MEMORY.md`.
4. If indexed source files changed, rebuild or incrementally update `.rag/`.
5. Commit only source docs, scripts and small manifests. Never commit the vector
   database itself.
6. If behavior is unclear, ask Caleb with concrete examples instead of encoding
   guesses into memory.

## Future Implementation Notes

The vector DB can be local-first with Chroma, LanceDB or SQLite-backed
embeddings. Prefer a simple scriptable flow:

```bash
python scripts/rag/ingest.py --reset
python scripts/rag/search.py "como funciona late-arrival e merge de mesas?"
```

When those scripts are added, document exact commands here and keep them synced
with `MEMORY.md` and `CLAUDE.md`.

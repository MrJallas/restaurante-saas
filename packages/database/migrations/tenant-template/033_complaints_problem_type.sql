-- Migration 033: complaints.problem_type enum + idx_complaints_unresolved.
--
-- Per docs/features/complaint-flow-v12.md, complaints precisam de uma
-- categoria pra que o gerente bata o olho e ja saiba o cenario (demora,
-- comida fria, item errado, etc). A coluna e nullable pra nao quebrar
-- complaints legados (criados antes da feature) — o front-end forca o
-- campo no novo composer.
--
-- Indice parcial em complaints nao resolvidas otimiza queries do dashboard
-- (Em curso · gerente). resolved_at NULL = ainda aberta.

ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS problem_type TEXT
    CHECK (problem_type IS NULL OR problem_type IN (
      'demora',
      'item-errado',
      'item-faltando',
      'comida-fria',
      'outro'
    ));

-- Mapeamento mental: o schema atual usa `closed_at` pra "fechada" (status
-- IN ('closed','responded')). O spec V12 fala em `resolved_at`. Como
-- `closed_at` ja existe em complaints (migration 026), o spec pede
-- explicitamente um indice WHERE resolved_at IS NULL — entao adicionamos
-- a coluna `resolved_at` como alias (mantida em sync com closed_at via
-- triggers seria overkill; por ora deixamos as duas convivendo e o codigo
-- backend escreve em ambas quando resolve).

ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Backfill: copia closed_at -> resolved_at pras rows existentes.
UPDATE complaints
   SET resolved_at = closed_at
 WHERE resolved_at IS NULL
   AND closed_at IS NOT NULL;

-- Indice parcial em "ainda nao resolvida". Acelera o widget Em curso.
CREATE INDEX IF NOT EXISTS idx_complaints_unresolved
  ON complaints(submitted_at)
  WHERE resolved_at IS NULL;

-- Lookup por categoria (gerente filtra por tipo de problema).
CREATE INDEX IF NOT EXISTS idx_complaints_problem_type
  ON complaints(problem_type)
  WHERE problem_type IS NOT NULL;

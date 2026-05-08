-- Migration 034: escalation_chains.steps jsonb.
--
-- Per docs/features/customer-host-model.md (esquema "Schema · escalation_chains"):
--
--   steps jsonb NOT NULL  -- [{ role, deadline, notified_at, responded_at? }]
--
-- A migration 023 criou escalation_chains com `current_assignee_role` /
-- `current_assignee_staff_id` (apontadores pro step atual), mas faltou
-- a sequencia completa de steps que o spec descreve. Sem isso, o backend
-- nao consegue persistir o template da chain (ex: "host->host_zona->manager")
-- nem auditar quando cada step foi notificado/respondido.
--
-- Default '[]' (jsonb empty array) pra que rows existentes nao quebrem
-- quando o codigo iterar sobre steps. Codigo backend popula no INSERT.

ALTER TABLE escalation_chains
  ADD COLUMN IF NOT EXISTS steps JSONB NOT NULL DEFAULT '[]'::jsonb;

-- GIN index pra permitir queries tipo "chains com step do role X". Raro,
-- mas barato de manter. Index parcial em chains ativas pra reduzir tamanho.
CREATE INDEX IF NOT EXISTS idx_escalation_chains_steps
  ON escalation_chains USING GIN (steps)
  WHERE completed_at IS NULL;

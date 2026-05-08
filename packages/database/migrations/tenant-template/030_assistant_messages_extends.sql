-- Migration 030: assistant_messages extends.
--
-- Estende `assistant_messages` pra cobrir 3 cenarios do roadmap:
--   1) function-calling com tool_results (complementa tool_calls da migration 029)
--   2) chips contextuais que a IA renderiza junto com a resposta (jsonb)
--   3) mensagens trocadas com STAFF (manager bubble do flow de complaint, V12)
--
-- A coluna `tool_calls` ja foi adicionada em 029 — nao re-adicionar.
-- Os demais campos abaixo sao todos novos e nullable, entao a migration e
-- backwards-compatible com rows existentes.

ALTER TABLE assistant_messages
  ADD COLUMN IF NOT EXISTS tool_results JSONB,
  ADD COLUMN IF NOT EXISTS contextual_chips JSONB,
  ADD COLUMN IF NOT EXISTS from_role TEXT
    CHECK (from_role IS NULL OR from_role IN ('customer', 'staff', 'ai', 'ack')),
  ADD COLUMN IF NOT EXISTS to_role TEXT
    CHECK (to_role IS NULL OR to_role IN ('customer', 'staff', 'ai')),
  ADD COLUMN IF NOT EXISTS to_staff_id UUID REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS thread_id UUID,
  ADD COLUMN IF NOT EXISTS kind TEXT;

-- Mensagens da mesma thread sao lidas em ordem cronologica. Index composto
-- (thread_id, created_at) suporta tanto o "ler thread inteira" quanto o
-- "paginar por created_at dentro da thread".
CREATE INDEX IF NOT EXISTS idx_assistant_messages_thread_created
  ON assistant_messages(thread_id, created_at);

-- Inbox do staff: filtra por to_staff_id IS NOT NULL pra so listar mensagens
-- direcionadas. Index parcial mantem o tamanho enxuto (a maioria das
-- assistant_messages nao tem to_staff_id).
CREATE INDEX IF NOT EXISTS idx_assistant_messages_staff_unread
  ON assistant_messages(to_staff_id)
  WHERE to_staff_id IS NOT NULL;

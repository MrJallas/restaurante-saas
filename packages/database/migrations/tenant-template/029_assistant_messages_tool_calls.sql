-- Migration 029: assistant_messages tool_calls column.
--
-- Quando o LLM faz function-calling (tools), o payload das chamadas
-- (e respostas) precisa ser arquivado pra debug/audit/billing. JSONB porque
-- a estrutura varia entre providers (OpenAI tool_calls vs Anthropic tools)
-- e raramente queremos query relacional sobre isso.

ALTER TABLE assistant_messages
  ADD COLUMN IF NOT EXISTS tool_calls JSONB;

-- GIN index pra suportar buscas por chave/valor dentro do JSON, ex.:
-- "todos os messages que chamaram a tool X". Sem ele queries tipo
-- jsonb_path_ops ficam em seq scan.
CREATE INDEX IF NOT EXISTS idx_assistant_messages_tool_calls
  ON assistant_messages USING GIN (tool_calls)
  WHERE tool_calls IS NOT NULL;

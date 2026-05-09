-- Migration 039: Drop table_sessions.session_token column (round 6 B-NEW-18).
--
-- A coluna foi adicionada na 003_create_table_sessions.sql e gerada via
-- gen_random_uuid() em todo INSERT, mas NUNCA foi lida por nenhum código:
-- o "token" usado pelo Redis/cookie/x-session-token header é o `id` do
-- registro (PK UUID), não session_token. A coluna era code smell — se
-- alguém adicionasse `findBySessionToken(token)` no futuro, atingia
-- field errado.
--
-- Drop seguro: grep em apps/api/src confirma 0 leituras. Cookie+header
-- carregam table_sessions.id como token de sessão.
--
-- Idempotente — IF EXISTS protege re-run.

DROP INDEX IF EXISTS idx_table_sessions_session_token;

ALTER TABLE table_sessions
  DROP COLUMN IF EXISTS session_token;

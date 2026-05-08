-- Migration 028: Session flags.
--
-- Flags transientes em uma table_session pra coordenar fluxos UI/backend.
-- Exemplos: 'menu_paused' (zone pause cascateou), 'late_arrival_pending',
-- 'merge_in_progress', 'host_dispute', 'lgpd_erasure_pending'.
-- Modelado como rows separadas (em vez de boolean columns) pra que
-- novos flags nao requeiram migrations e cada flag traga metadata propria
-- (`metadata JSONB`, expira em ttl, etc).

CREATE TABLE IF NOT EXISTS session_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id UUID NOT NULL REFERENCES table_sessions(id),
  flag VARCHAR(64) NOT NULL,
  set_by_staff_id UUID REFERENCES staff(id),
  set_by_customer_id UUID REFERENCES customers(id),
  metadata JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  cleared_by_staff_id UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_flags_session ON session_flags(table_session_id);
CREATE INDEX IF NOT EXISTS idx_session_flags_flag ON session_flags(flag);
CREATE INDEX IF NOT EXISTS idx_session_flags_expires_at ON session_flags(expires_at);
-- Flags ativas por sessao.
CREATE INDEX IF NOT EXISTS idx_session_flags_active
  ON session_flags(table_session_id, flag)
  WHERE cleared_at IS NULL;
-- Um mesmo flag nao pode estar ativo duas vezes na mesma sessao.
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_flags_unique_active
  ON session_flags(table_session_id, flag)
  WHERE cleared_at IS NULL;

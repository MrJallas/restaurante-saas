CREATE TABLE IF NOT EXISTS table_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES tables(id),
  session_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  closed_by VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_table_sessions_table_id ON table_sessions(table_id);
-- session_token foi DROPADA na migration 039. Em tenants que já passaram
-- por ela e re-rodam esta 003 (tracking de __migrations__ incompleto), o
-- CREATE INDEX direto quebrava o boot — que agora é fatal por decisão
-- (2026-06-10). Índice condicional à existência da coluna, padrão 037.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'table_sessions'
       AND column_name = 'session_token'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_table_sessions_session_token ON table_sessions(session_token);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_table_sessions_status ON table_sessions(status);

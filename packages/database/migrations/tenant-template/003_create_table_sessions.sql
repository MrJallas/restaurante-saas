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
CREATE INDEX IF NOT EXISTS idx_table_sessions_session_token ON table_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_table_sessions_status ON table_sessions(status);

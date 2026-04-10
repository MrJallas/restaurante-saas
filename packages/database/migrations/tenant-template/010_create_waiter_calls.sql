CREATE TABLE IF NOT EXISTS waiter_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id UUID NOT NULL REFERENCES table_sessions(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  acknowledged_by UUID REFERENCES staff(id),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waiter_calls_table_session_id ON waiter_calls(table_session_id);
CREATE INDEX IF NOT EXISTS idx_waiter_calls_status ON waiter_calls(status);

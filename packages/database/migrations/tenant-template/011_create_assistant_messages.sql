CREATE TABLE IF NOT EXISTS assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id UUID NOT NULL REFERENCES table_sessions(id),
  customer_id UUID REFERENCES customers(id),
  user_message TEXT NOT NULL,
  assistant_response TEXT,
  model_used VARCHAR(100),
  provider_used VARCHAR(50),
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  estimated_cost_cents INT NOT NULL DEFAULT 0,
  latency_ms INT NOT NULL DEFAULT 0,
  was_blocked BOOLEAN NOT NULL DEFAULT false,
  block_reason VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_table_session_id ON assistant_messages(table_session_id);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_customer_id ON assistant_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_was_blocked ON assistant_messages(was_blocked);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_created_at ON assistant_messages(created_at);

CREATE TABLE IF NOT EXISTS customer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_events_session_type_created
  ON customer_events(table_session_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_events_customer_created
  ON customer_events(customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

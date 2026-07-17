CREATE TABLE IF NOT EXISTS bill_split_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id uuid NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  created_by_customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('equal', 'by_item', 'custom')),
  allocations jsonb NOT NULL CHECK (jsonb_typeof(allocations) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bill_split_notifications_session_created
  ON bill_split_notifications (table_session_id, created_at DESC);

COMMENT ON TABLE bill_split_notifications IS
  'Auditable summaries emitted by the customer bill split flow; never charges a payment.';

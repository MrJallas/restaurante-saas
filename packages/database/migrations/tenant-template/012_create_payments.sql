CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id UUID NOT NULL REFERENCES table_sessions(id),
  visit_id UUID REFERENCES visits(id),
  amount_cents INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  method VARCHAR(20) NOT NULL DEFAULT 'pix',
  pix_qr_code TEXT,
  pix_copy_paste TEXT,
  psp_transaction_id VARCHAR(255),
  psp_payload JSONB,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_table_session_id ON payments(table_session_id);
CREATE INDEX IF NOT EXISTS idx_payments_visit_id ON payments(visit_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_psp_transaction_id ON payments(psp_transaction_id);

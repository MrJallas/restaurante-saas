-- Migration 024: Late-arrival requests.
--
-- Cliente que avisa que vai chegar atrasado a uma mesa reservada/aberta.
-- Fluxo: cliente cria request com `expected_arrival_at`, a mesa-host
-- (table_session.host_customer_id ou um manager se ninguem souber) tem
-- ate `ttl_expires_at` pra aprovar. Se nao aprovar, sobe via escalation_chains
-- (kind='late_arrival') pra um manager. `escalation_level` espelha o level
-- da chain pra leitura rapida sem join.

DO $$ BEGIN
  CREATE TYPE late_arrival_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS late_arrival_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  table_session_id UUID REFERENCES table_sessions(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_arrival_at TIMESTAMPTZ NOT NULL,
  status late_arrival_request_status NOT NULL DEFAULT 'pending',
  approved_by_staff_id UUID REFERENCES staff(id),
  approved_by_customer_id UUID REFERENCES customers(id),
  decided_at TIMESTAMPTZ,
  escalation_level INT NOT NULL DEFAULT 0,
  escalation_chain_id UUID REFERENCES escalation_chains(id),
  ttl_expires_at TIMESTAMPTZ NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_late_arrival_visit_id ON late_arrival_requests(visit_id);
CREATE INDEX IF NOT EXISTS idx_late_arrival_table_session_id ON late_arrival_requests(table_session_id);
CREATE INDEX IF NOT EXISTS idx_late_arrival_customer_id ON late_arrival_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_late_arrival_status ON late_arrival_requests(status);
CREATE INDEX IF NOT EXISTS idx_late_arrival_ttl_expires_at
  ON late_arrival_requests(ttl_expires_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_late_arrival_approved_by_staff
  ON late_arrival_requests(approved_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_late_arrival_chain_id
  ON late_arrival_requests(escalation_chain_id);

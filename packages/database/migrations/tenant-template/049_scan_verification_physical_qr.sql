-- Migration 049: Physical QR entry verification.
--
-- Adds a permanent public QR token per table, an operational "pre-release"
-- row consumed by the next first scan, and a scan verification request table
-- for staff physical checks. High-volume audit logs live in MongoDB; these
-- tables keep only current operational state.

ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS qr_public_token TEXT;

UPDATE tables
   SET qr_public_token = gen_random_uuid()::text
 WHERE qr_public_token IS NULL;

ALTER TABLE tables
  ALTER COLUMN qr_public_token SET DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_qr_public_token
  ON tables(qr_public_token)
  WHERE qr_public_token IS NOT NULL;

ALTER TYPE escalation_chain_kind ADD VALUE IF NOT EXISTS 'scan_verification';

DO $$ BEGIN
  CREATE TYPE scan_verification_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS table_qr_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES tables(id),
  released_by_staff_id UUID REFERENCES staff(id),
  reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at TIMESTAMPTZ,
  consumed_by_session_id UUID REFERENCES table_sessions(id),
  consumed_by_customer_id UUID REFERENCES customers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_table_qr_releases_open
  ON table_qr_releases(table_id, expires_at DESC)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_table_qr_releases_staff
  ON table_qr_releases(released_by_staff_id, created_at DESC);

CREATE TABLE IF NOT EXISTS scan_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id UUID NOT NULL REFERENCES table_sessions(id),
  table_id UUID NOT NULL REFERENCES tables(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  status scan_verification_status NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by_staff_id UUID REFERENCES staff(id),
  rejected_by_staff_id UUID REFERENCES staff(id),
  decided_at TIMESTAMPTZ,
  escalation_level INT NOT NULL DEFAULT 0,
  escalation_chain_id UUID REFERENCES escalation_chains(id),
  ttl_expires_at TIMESTAMPTZ NOT NULL,
  location_status VARCHAR(30) NOT NULL DEFAULT 'unknown'
    CHECK (location_status IN (
      'unknown',
      'prompt',
      'granted',
      'denied',
      'unavailable',
      'unsupported'
    )),
  latitude NUMERIC(9, 6),
  longitude NUMERIC(9, 6),
  accuracy_meters NUMERIC(10, 2),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_verification_open_participant
  ON scan_verification_requests(table_session_id, customer_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scan_verification_status
  ON scan_verification_requests(status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_scan_verification_session
  ON scan_verification_requests(table_session_id);

CREATE INDEX IF NOT EXISTS idx_scan_verification_customer
  ON scan_verification_requests(customer_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_scan_verification_table
  ON scan_verification_requests(table_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_scan_verification_ttl
  ON scan_verification_requests(ttl_expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scan_verification_chain
  ON scan_verification_requests(escalation_chain_id);

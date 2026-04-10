CREATE TABLE IF NOT EXISTS tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  label VARCHAR(50) NOT NULL,
  qr_hmac_secret VARCHAR(255) NOT NULL DEFAULT gen_random_uuid()::text,
  capacity INT NOT NULL DEFAULT 4,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tables_code ON tables(code);
CREATE INDEX IF NOT EXISTS idx_tables_is_active ON tables(is_active);

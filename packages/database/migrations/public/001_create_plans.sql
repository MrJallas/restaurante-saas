CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price_cents INT NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '{}',
  max_tables INT NOT NULL DEFAULT 10,
  max_staff INT NOT NULL DEFAULT 5,
  max_ai_messages_per_day INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_is_active ON plans(is_active);

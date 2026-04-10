CREATE TABLE IF NOT EXISTS customer_consumption_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL UNIQUE REFERENCES customers(id),
  total_spent_cents INT NOT NULL DEFAULT 0,
  total_orders INT NOT NULL DEFAULT 0,
  last_items JSONB NOT NULL DEFAULT '[]',
  favorite_items JSONB NOT NULL DEFAULT '[]',
  last_categories TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consumption_summary_customer_id ON customer_consumption_summary(customer_id);

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  date DATE NOT NULL,
  total_messages INT NOT NULL DEFAULT 0,
  total_blocked INT NOT NULL DEFAULT 0,
  total_tokens_in INT NOT NULL DEFAULT 0,
  total_tokens_out INT NOT NULL DEFAULT 0,
  total_cost_cents INT NOT NULL DEFAULT 0,
  model_breakdown JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_restaurant_date ON ai_usage_daily(restaurant_id, date);

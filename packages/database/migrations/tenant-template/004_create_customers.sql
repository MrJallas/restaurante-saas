CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  cpf VARCHAR(11) UNIQUE,
  recognition_token UUID NOT NULL DEFAULT gen_random_uuid(),
  total_visits INT NOT NULL DEFAULT 1,
  last_visit_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  preferences JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_cpf ON customers(cpf);
CREATE INDEX IF NOT EXISTS idx_customers_recognition_token ON customers(recognition_token);

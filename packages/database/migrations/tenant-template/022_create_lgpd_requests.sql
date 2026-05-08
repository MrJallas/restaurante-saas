-- Migration 022: LGPD (Lei Geral de Protecao de Dados) requests.
--
-- Quando o cliente pede apagamento ou exportacao dos seus dados pessoais,
-- a request e registrada aqui. O fulfillment apaga (ou exporta) os dados em
-- todas as tabelas relevantes (chat history em MongoDB, customers, visits,
-- preferences, ...). `protocol_number` e o numero publico que damos pro
-- cliente. `notes` arquiva detalhes operacionais (ex: "exportado e enviado
-- por e-mail X em Y").

DO $$ BEGIN
  CREATE TYPE lgpd_request_kind AS ENUM ('erasure', 'export');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE lgpd_request_status AS ENUM ('pending', 'in_progress', 'fulfilled', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS lgpd_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ON DELETE SET NULL: se o customer for apagado (erasure), preservamos a
  -- request anonimizada pra auditoria.
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_cpf VARCHAR(11),
  customer_email VARCHAR(255),
  kind lgpd_request_kind NOT NULL,
  status lgpd_request_status NOT NULL DEFAULT 'pending',
  protocol_number VARCHAR(40) NOT NULL UNIQUE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fulfilled_at TIMESTAMPTZ,
  fulfilled_by_staff_id UUID REFERENCES staff(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lgpd_requests_customer_id ON lgpd_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_requests_customer_cpf ON lgpd_requests(customer_cpf);
CREATE INDEX IF NOT EXISTS idx_lgpd_requests_status ON lgpd_requests(status);
CREATE INDEX IF NOT EXISTS idx_lgpd_requests_kind ON lgpd_requests(kind);
CREATE INDEX IF NOT EXISTS idx_lgpd_requests_requested_at ON lgpd_requests(requested_at);
CREATE INDEX IF NOT EXISTS idx_lgpd_requests_fulfilled_by_staff_id ON lgpd_requests(fulfilled_by_staff_id);

-- Migration 026: Order ratings + complaints (post-meal feedback flow).
--
-- order_ratings: ~13min apos o status do pedido virar 'delivered', o backend
-- dispara um push pro cliente pedindo nota 1-5 sobre o pedido. A row e
-- criada com prompted_at e submitted_at NULL; quando o cliente responde,
-- submitted_at e rating viram preenchidos. Diferente de feedbacks (visit-level
-- geral), order_ratings e por order especifico.
--
-- complaints: composer aberto quando o cliente da nota baixa, ou via fluxo
-- explicito de reclamacao. Pode ter foto anexada (S3 url). Manager responde
-- via response_text. O status vira 'closed' quando o cliente acusa
-- recebimento ou quando manager fecha sem resposta esperada.

CREATE TABLE IF NOT EXISTS order_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  customer_id UUID REFERENCES customers(id),
  visit_id UUID REFERENCES visits(id),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  prompted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_ratings_order_id ON order_ratings(order_id);
CREATE INDEX IF NOT EXISTS idx_order_ratings_customer_id ON order_ratings(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_ratings_visit_id ON order_ratings(visit_id);
CREATE INDEX IF NOT EXISTS idx_order_ratings_submitted_at
  ON order_ratings(submitted_at);
-- Lookup pendente pro retry do push.
CREATE INDEX IF NOT EXISTS idx_order_ratings_pending
  ON order_ratings(prompted_at)
  WHERE submitted_at IS NULL;
-- Idempotencia: um order so pode ter um rating "ativo".
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_ratings_unique_order
  ON order_ratings(order_id);

DO $$ BEGIN
  CREATE TYPE complaint_status AS ENUM (
    'pending_review',
    'in_progress',
    'responded',
    'closed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  order_rating_id UUID REFERENCES order_ratings(id),
  customer_id UUID REFERENCES customers(id),
  visit_id UUID REFERENCES visits(id),
  -- Rating opcional aqui: nem toda complaint vem de um rating ruim
  -- (ex: cliente abre direto sem ter sido prompted).
  rating INT CHECK (rating BETWEEN 1 AND 5),
  text TEXT NOT NULL,
  attached_image_url TEXT,
  status complaint_status NOT NULL DEFAULT 'pending_review',
  assigned_manager_id UUID REFERENCES staff(id),
  response_text TEXT,
  response_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  escalation_chain_id UUID REFERENCES escalation_chains(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complaints_order_id ON complaints(order_id);
CREATE INDEX IF NOT EXISTS idx_complaints_order_rating_id ON complaints(order_rating_id);
CREATE INDEX IF NOT EXISTS idx_complaints_customer_id ON complaints(customer_id);
CREATE INDEX IF NOT EXISTS idx_complaints_visit_id ON complaints(visit_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_assigned_manager_id
  ON complaints(assigned_manager_id);
CREATE INDEX IF NOT EXISTS idx_complaints_submitted_at ON complaints(submitted_at);
CREATE INDEX IF NOT EXISTS idx_complaints_chain_id ON complaints(escalation_chain_id);

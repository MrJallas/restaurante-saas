-- Migration 025: Table merge requests + cooldowns.
--
-- Cliente A na mesa S1 quer "juntar" com mesa S2 (ex: amigo na outra mesa).
-- A request vai pro `target_customer_id` (o host/dono da mesa de destino).
-- Se rejeitada, o par (S1,S2) entra em cooldown por X minutos pra evitar
-- que o solicitante fique reenviando (rate-limit social).
--
-- `table_merge_cooldowns` e a tabela de cooldown explicita por par de
-- table_sessions (ordenado: smaller_id primeiro pra ter chave estavel).
-- Quando uma request e rejeitada/expirada, criamos/atualizamos a row de
-- cooldown com `cooldown_expires_at`. O backend olha aqui antes de aceitar
-- nova request entre o mesmo par.

DO $$ BEGIN
  CREATE TYPE table_merge_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'expired',
    'cooldown_blocked'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS table_merge_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table_session_id UUID NOT NULL REFERENCES table_sessions(id),
  target_table_session_id UUID NOT NULL REFERENCES table_sessions(id),
  requesting_customer_id UUID NOT NULL REFERENCES customers(id),
  -- Pode ser NULL se a mesa de destino nao tiver host registrado ainda;
  -- nesse caso o backend trata como "qualquer participante da mesa pode
  -- aprovar".
  target_customer_id UUID REFERENCES customers(id),
  decided_by_customer_id UUID REFERENCES customers(id),
  status table_merge_request_status NOT NULL DEFAULT 'pending',
  message TEXT,
  ttl_expires_at TIMESTAMPTZ NOT NULL,
  cooldown_expires_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  escalation_chain_id UUID REFERENCES escalation_chains(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Sanidade: nao permite merge da mesa consigo mesma.
  CHECK (source_table_session_id <> target_table_session_id)
);

CREATE INDEX IF NOT EXISTS idx_table_merge_source ON table_merge_requests(source_table_session_id);
CREATE INDEX IF NOT EXISTS idx_table_merge_target ON table_merge_requests(target_table_session_id);
CREATE INDEX IF NOT EXISTS idx_table_merge_requesting_customer
  ON table_merge_requests(requesting_customer_id);
CREATE INDEX IF NOT EXISTS idx_table_merge_target_customer
  ON table_merge_requests(target_customer_id);
CREATE INDEX IF NOT EXISTS idx_table_merge_status ON table_merge_requests(status);
CREATE INDEX IF NOT EXISTS idx_table_merge_ttl
  ON table_merge_requests(ttl_expires_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_table_merge_chain_id
  ON table_merge_requests(escalation_chain_id);

-- Tabela explicita de cooldown por par de mesas. Garante que (S1,S2) sempre
-- e armazenado com IDs ordenados (a < b) pra ter chave canonica e evitar
-- duplicidade. UNIQUE garante que so existe uma row por par.
CREATE TABLE IF NOT EXISTS table_merge_cooldowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_a_id UUID NOT NULL REFERENCES table_sessions(id),
  table_session_b_id UUID NOT NULL REFERENCES table_sessions(id),
  cooldown_expires_at TIMESTAMPTZ NOT NULL,
  last_request_id UUID REFERENCES table_merge_requests(id),
  reason VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (table_session_a_id < table_session_b_id),
  UNIQUE (table_session_a_id, table_session_b_id)
);

CREATE INDEX IF NOT EXISTS idx_table_merge_cooldowns_pair
  ON table_merge_cooldowns(table_session_a_id, table_session_b_id);
CREATE INDEX IF NOT EXISTS idx_table_merge_cooldowns_expires
  ON table_merge_cooldowns(cooldown_expires_at);

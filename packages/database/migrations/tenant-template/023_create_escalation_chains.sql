-- Migration 023: Generic escalation chains.
--
-- Tabela generica que registra escalonamentos em diversos fluxos: late-arrival
-- requests sem resposta do host, table-merge sem resposta da mesa de destino,
-- etc. `kind` discrimina o dominio e `source_id` aponta pra row dominio
-- (FK fraca — nao usamos FK fisica porque a mesma tabela serve varios fluxos).
-- Quando `level` cresce, o request sobe na hierarquia (host -> host de zona
-- -> manager). `current_assignee_role` aponta pra qual papel deve ver/agir.
-- `ttl_expires_at` controla quando esse nivel expira (e dispara o proximo).
-- `completed_at` fecha a chain (foi resolvida em algum nivel).

DO $$ BEGIN
  CREATE TYPE escalation_chain_kind AS ENUM (
    'late_arrival',
    'table_merge',
    'complaint',
    'waiter_call',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS escalation_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind escalation_chain_kind NOT NULL,
  source_id UUID NOT NULL,
  level INT NOT NULL DEFAULT 0,
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_assignee_role VARCHAR(50),
  current_assignee_staff_id UUID REFERENCES staff(id),
  ttl_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup composto pra encontrar chain ativa de uma source.
CREATE INDEX IF NOT EXISTS idx_escalation_chains_kind_source
  ON escalation_chains(kind, source_id);
CREATE INDEX IF NOT EXISTS idx_escalation_chains_ttl_expires_at
  ON escalation_chains(ttl_expires_at)
  WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_escalation_chains_assignee_staff
  ON escalation_chains(current_assignee_staff_id)
  WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_escalation_chains_assignee_role
  ON escalation_chains(current_assignee_role)
  WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_escalation_chains_completed_at
  ON escalation_chains(completed_at);

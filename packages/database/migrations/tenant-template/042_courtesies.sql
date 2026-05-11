-- Migration 042 (round 18 — Onda 1 wiring): courtesies table.
--
-- ScreenManagerCourtesies (canvas screens-c.jsx:2086) e ManagerTableMenu
-- (Mandar cortesia action) precisam persistir cortesias enviadas. Antes
-- a tela mostrava mock data inline (5 cards) — agora `GET /staff/courtesies`
-- alimenta a lista real e `POST /staff/courtesies` cria do
-- compensate-client screen.
--
-- Schema:
--   • table_session_id NULL pra cortesias genericas (couvert do
--     restaurante todo, ex.). Quando ligado, cliente recebe push.
--   • status: pendente -> aceita | recusada (cliente decide via app
--     ou garcom registra resposta verbal).
--   • response_seconds nullable; computado on-update quando cliente
--     responde ou manager fecha como aceita.
--
-- Idempotente — IF NOT EXISTS protege re-run.

CREATE TABLE IF NOT EXISTS courtesies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id UUID NULL REFERENCES table_sessions(id) ON DELETE SET NULL,
  table_number INT,
  type VARCHAR(80) NOT NULL,
  item TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aceita', 'recusada')),
  manager_staff_id UUID NOT NULL REFERENCES staff(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  response_seconds INT
);

CREATE INDEX IF NOT EXISTS idx_courtesies_created_at
  ON courtesies(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courtesies_status
  ON courtesies(status);

CREATE INDEX IF NOT EXISTS idx_courtesies_table_session
  ON courtesies(table_session_id) WHERE table_session_id IS NOT NULL;

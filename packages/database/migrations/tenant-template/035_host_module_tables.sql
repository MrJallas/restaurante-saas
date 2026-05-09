-- Migration 035: Staff-host module tables.
--
-- Backend pra o modulo da recepcionista (P0 #11). Antes nao havia nenhuma
-- tabela pra waitlist (fila de espera presencial), reservations (reserva
-- agendada) e table_swap_requests (registro de troca de mesa). Os screens
-- do app web-staff/host/* estavam fazendo GET/POST contra rotas que nao
-- existiam no backend e voltavam 404 silenciosamente.
--
-- Decisões:
--  - waitlist e reservations sao tabelas novas e independentes; a logica
--    de transicao (`waiting -> seated -> left`, `awaited -> arrived ->
--    cancelled/no_show`) fica toda no service.
--  - table_swap_requests grava a auditoria do "movemos a sessao da mesa
--    14 pra mesa 15". Status: requested -> in_progress -> completed |
--    cancelled. Spec diz 3 estados terminais; mantemos o intermediario
--    pra UIs que mostram "trocando..." no meio do fluxo.
--  - liberate nao precisa de tabela propria — eh apenas um close de
--    table_session com `closed_by` carimbado.

-- ─── waitlist ───
CREATE TABLE IF NOT EXISTS waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  party INT NOT NULL CHECK (party >= 1),
  phone VARCHAR(40),
  cpf VARCHAR(20),
  note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'seated', 'left')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seated_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  -- staff que resolveu / removeu a entrada (se houve).
  resolved_by_staff_id UUID REFERENCES staff(id),
  -- mesa onde foi sentado (quando aplicavel).
  table_id UUID REFERENCES tables(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_status
  ON waitlist_entries(status, added_at);

-- ─── reservations ───
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  party INT NOT NULL CHECK (party >= 1),
  phone VARCHAR(40),
  -- horario agendado. Interpretado como "hoje as HH:MM" pelo service quando
  -- o cliente passa apenas time-of-day.
  scheduled_at TIMESTAMPTZ NOT NULL,
  table_id UUID REFERENCES tables(id),
  status VARCHAR(20) NOT NULL DEFAULT 'awaited'
    CHECK (status IN ('awaited', 'arrived', 'cancelled', 'no_show')),
  arrived_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  note TEXT,
  created_by_staff_id UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservations_scheduled
  ON reservations(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_reservations_status
  ON reservations(status);

-- ─── table swap audit ───
CREATE TABLE IF NOT EXISTS table_swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- sessao que esta sendo movida. quando completed, eh atualizada pra
  -- apontar pra `to_table_id`.
  table_session_id UUID NOT NULL REFERENCES table_sessions(id),
  from_table_id UUID NOT NULL REFERENCES tables(id),
  to_table_id UUID NOT NULL REFERENCES tables(id),
  status VARCHAR(20) NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'in_progress', 'completed', 'cancelled')),
  requested_by_staff_id UUID REFERENCES staff(id),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swap_requests_status
  ON table_swap_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_swap_requests_session
  ON table_swap_requests(table_session_id);

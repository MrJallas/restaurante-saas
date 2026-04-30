-- Migration 017: Host-of-the-table feature.
--
-- Primeiro customer a fazer welcome em uma table_session vira o "host":
-- demais customers ficam com status='pending' em session_participants ate
-- o host aprovar via UI. Sem isso qualquer um que escaneie o QR entra
-- direto (problema de privacidade quando QR vaza fora do estabelecimento).

-- Coluna no table_sessions pra apontar pro customer host. NULL quando
-- ainda nao ha customer cadastrado (sessao acabou de ser criada).
ALTER TABLE table_sessions
  ADD COLUMN IF NOT EXISTS host_customer_id UUID REFERENCES customers(id);

-- Status no session_participants pro fluxo de aprovacao. Default
-- 'approved' pra que o backfill nao quebre dados existentes (todos
-- os participantes que ja estavam na tabela viram approved).
ALTER TABLE session_participants
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE session_participants
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES customers(id),
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

-- Index util pra queries de "quem ta pendente nessa mesa".
CREATE INDEX IF NOT EXISTS idx_session_participants_pending
  ON session_participants(table_session_id)
  WHERE status = 'pending';

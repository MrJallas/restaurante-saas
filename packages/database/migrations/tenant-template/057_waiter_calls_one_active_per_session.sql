-- 057: waiter_calls — no máximo 1 chamado ATIVO (pending|acknowledged) por
-- table_session. Sem isto, o createCall fazia SELECT-then-INSERT e, sob N
-- POSTs concorrentes, todos viam "nenhum ativo" e inseriam N linhas (race
-- do bug-hunt P2-2). Este índice único parcial habilita o ON CONFLICT
-- atômico no waiter-calls.service (1 linha + mesmo callId pra todos).
-- Idempotente: CREATE ... IF NOT EXISTS.
CREATE UNIQUE INDEX IF NOT EXISTS waiter_calls_one_active_per_session
  ON waiter_calls (table_session_id)
  WHERE status IN ('pending', 'acknowledged');

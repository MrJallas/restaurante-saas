-- 057: waiter_calls — no máximo 1 chamado ATIVO (pending|acknowledged) por
-- table_session. Sem isto, o createCall fazia SELECT-then-INSERT e, sob N
-- POSTs concorrentes, todos viam "nenhum ativo" e inseriam N linhas (race
-- do bug-hunt P2-2). Este índice único parcial habilita o ON CONFLICT
-- atômico no waiter-calls.service (1 linha + mesmo callId pra todos).

-- DEDUPE antes do índice: ambientes antigos podem JÁ ter >1 chamado ativo por
-- mesa (justamente a corrida que este índice fecha). Sem isto, o CREATE UNIQUE
-- INDEX falharia com unique_violation e — como migration é FATAL no boot — a
-- API não subiria nesse tenant. Mantém o chamado ativo mais recente por mesa
-- e rebaixa os demais para 'resolved'. Idempotente: roda 0 linhas se já limpo.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY table_session_id ORDER BY created_at DESC
         ) AS rn
    FROM waiter_calls
   WHERE status IN ('pending', 'acknowledged')
)
UPDATE waiter_calls w
   SET status = 'resolved',
       resolved_at = COALESCE(w.resolved_at, now())
  FROM ranked r
 WHERE w.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS waiter_calls_one_active_per_session
  ON waiter_calls (table_session_id)
  WHERE status IN ('pending', 'acknowledged');

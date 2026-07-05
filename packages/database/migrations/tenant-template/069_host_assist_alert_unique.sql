-- 069: alerts kind='host_assist_table' — no máximo 1 pedido de recepção
-- ATIVO por sessão de mesa. Mesma classe do waiter-calls (mig 057): sem isto,
-- HostService.requestAssist() faz INSERT cru em `alerts` sem dedup, e um
-- double-tap (guard liberado no finally) ou timeout+retry do api() (15s) gera
-- N linhas idênticas "Mesa X pediu a recepção" no inbox da recepção + N
-- emitHostAssistRequested (spam operacional). Este índice único parcial +
-- coluna de sessão habilitam o ON CONFLICT atômico no alerts.create quando
-- o kind é host_assist_table (1 linha + reuso do alerta ativo pra retries).
--
-- ESPECÍFICO do kind: TODO o índice é gateado por `kind = 'host_assist_table'`
-- e `table_session_id IS NOT NULL`. Alertas de OUTROS kinds (escalation,
-- qr_issue, zone_pause_overrun, complaint_overdue, scan_verification, etc.)
-- NÃO têm table_session_id preenchido → NÃO entram no índice → seguem
-- inserindo N linhas normalmente, sem regressão.
--
-- Idempotente — ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS
-- + dedupe-prologue que roda 0 linhas em schema já limpo. Re-run é no-op.

-- (1) Coluna de sessão. A tabela `alerts` (mig 045) não tinha vínculo com a
-- sessão — o único elo era o TEXTO do title/sub. Adicionamos a FK explícita
-- pra o kind host_assist_table poder deduplicar por sessão. Nullable porque
-- a esmagadora maioria dos kinds de alerta não é por-sessão.
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS table_session_id UUID REFERENCES table_sessions(id) ON DELETE SET NULL;

-- (2) DEDUPE antes do índice: ambientes que já rodaram requestAssist ANTES
-- desta migration podem ter >1 alerta host_assist_table ATIVO para a mesma
-- sessão (exatamente o spam que este índice fecha). Mas rows antigas não têm
-- table_session_id (a coluna acabou de nascer NULL). Então:
--   (a) backfill best-effort do table_session_id a partir do TEXTO do alerta,
--       casando o título "<label|code> pediu a recepção" contra a sessão
--       ativa da mesa. Só ativos, só host_assist_table, só quando dá pra
--       identificar sem ambiguidade (1 sessão ativa pra aquela mesa).
--   (b) com o backfill feito, resolver duplicatas ativas por sessão mantendo
--       a MAIS RECENTE (mesmo critério do waiter-calls), rebaixando as demais
--       para resolved_at = now(). Sem isto, o CREATE UNIQUE INDEX falharia
--       com unique_violation e — migration é FATAL no boot — a API não subiria
--       nesse tenant.
UPDATE alerts a
   SET table_session_id = m.table_session_id
  FROM (
    SELECT al.id AS alert_id, ts.id AS table_session_id
      FROM alerts al
      JOIN tables t
        ON al.title LIKE t.code || ' %'
        OR al.title LIKE t.label || ' %'
      JOIN LATERAL (
        SELECT s.id
          FROM table_sessions s
         WHERE s.table_id = t.id
           AND s.status = 'active'
         ORDER BY s.created_at DESC
         LIMIT 1
      ) ts ON TRUE
     WHERE al.kind = 'host_assist_table'
       AND al.table_session_id IS NULL
       AND al.dismissed_at IS NULL
       AND al.resolved_at IS NULL
  ) m
 WHERE a.id = m.alert_id;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY table_session_id ORDER BY created_at DESC
         ) AS rn
    FROM alerts
   WHERE kind = 'host_assist_table'
     AND table_session_id IS NOT NULL
     AND dismissed_at IS NULL
     AND resolved_at IS NULL
)
UPDATE alerts a
   SET resolved_at = COALESCE(a.resolved_at, now())
  FROM ranked r
 WHERE a.id = r.id
   AND r.rn > 1;

-- (3) Índice único parcial — 1 alerta host_assist_table ATIVO por sessão.
-- Habilita o ON CONFLICT (table_session_id) WHERE ... no alerts.create.
CREATE UNIQUE INDEX IF NOT EXISTS alerts_host_assist_one_active_per_session
  ON alerts (table_session_id)
  WHERE kind = 'host_assist_table'
    AND table_session_id IS NOT NULL
    AND dismissed_at IS NULL
    AND resolved_at IS NULL;

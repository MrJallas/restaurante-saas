-- Migration 031: VIP layer fix · `table_sessions.flags text[]`.
--
-- Per docs/features/vip-customer.md:
--   "Marcacao de sessao como VIP. Vale so durante a sessao da mesa — nao
--    vira atributo permanente do cliente."
--
-- A migration 028 criou `session_flags` (uma row por flag), mas o spec
-- pede um text[] direto em `table_sessions` pra simplificar joins e
-- permitir que o priorityOf() leia flags em uma unica query JOIN.
--
-- Esta migration:
--   1) Adiciona `flags text[]` em table_sessions
--   2) Backfills VIP flag a partir de customers.is_vip (legado V20) pras
--      sessoes ainda abertas
--   3) Soft-deprecates customers.is_vip via COMMENT (mantem coluna pra
--      nao quebrar codigo existente; documenta no schema o caminho novo)

ALTER TABLE table_sessions
  ADD COLUMN IF NOT EXISTS flags TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: pra toda sessao aberta cujo host_customer_id aponta pra um
-- customer com is_vip=true, adiciona 'vip' ao array (sem duplicar).
-- Usa array_append apenas se o flag ainda nao estiver presente (idempotente).
UPDATE table_sessions ts
   SET flags = array_append(ts.flags, 'vip')
  FROM customers c
 WHERE ts.host_customer_id = c.id
   AND c.is_vip = true
   AND ts.closed_at IS NULL
   AND NOT ('vip' = ANY(ts.flags));

-- Cobertura adicional: sessoes onde o customer aparece como participant
-- ativo (alguns tenants nao populam host_customer_id). Idempotente.
UPDATE table_sessions ts
   SET flags = array_append(ts.flags, 'vip')
  FROM session_participants sp
  JOIN customers c ON c.id = sp.customer_id
 WHERE sp.table_session_id = ts.id
   AND sp.left_at IS NULL
   AND c.is_vip = true
   AND ts.closed_at IS NULL
   AND NOT ('vip' = ANY(ts.flags));

-- Soft-deprecation. Mantem a coluna pra nao quebrar codigo legado nem
-- fluxo de operacao manual; documenta o caminho atual.
COMMENT ON COLUMN customers.is_vip IS
  'DEPRECATED — use table_sessions.flags instead (per docs/features/vip-customer.md). VIP eh session-scoped, nao atributo permanente do cliente.';

-- GIN index pra suportar `WHERE 'vip' = ANY(flags)` sem seq scan.
-- Util pra dashboards "todas as sessoes VIP ativas".
CREATE INDEX IF NOT EXISTS idx_table_sessions_flags
  ON table_sessions USING GIN (flags);

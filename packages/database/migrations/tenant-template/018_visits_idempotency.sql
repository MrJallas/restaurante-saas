-- Dedupe existing visits keeping the oldest per (table_session_id, customer_id).
-- Must null FK refs before deleting duplicates.
DO $$
DECLARE
  _dup_count INT;
BEGIN
  CREATE TEMP TABLE _dup_visit_ids ON COMMIT DROP AS
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY table_session_id, customer_id ORDER BY created_at) AS rn
      FROM visits
    )
    SELECT id FROM ranked WHERE rn > 1;

  SELECT COUNT(*) INTO _dup_count FROM _dup_visit_ids;
  IF _dup_count > 0 THEN
    UPDATE session_participants SET visit_id = NULL WHERE visit_id IN (SELECT id FROM _dup_visit_ids);
    UPDATE waiter_calls SET visit_id = NULL WHERE visit_id IN (SELECT id FROM _dup_visit_ids);
    UPDATE orders SET visit_id = NULL WHERE visit_id IN (SELECT id FROM _dup_visit_ids);
    UPDATE payments SET visit_id = NULL WHERE visit_id IN (SELECT id FROM _dup_visit_ids);
    UPDATE feedbacks SET visit_id = NULL WHERE visit_id IN (SELECT id FROM _dup_visit_ids);
    DELETE FROM visits WHERE id IN (SELECT id FROM _dup_visit_ids);
    RAISE NOTICE 'Removed % duplicate visits', _dup_count;
  END IF;
END $$;

-- One visit per customer per session
DO $$
BEGIN
  -- conrelid escopa ao visits DO SCHEMA ATUAL. Sem isso, o nome da
  -- constraint (único por schema no PG, mas o SELECT varria TODOS) fazia o
  -- EXISTS achar a constraint de OUTRO tenant → o ADD era pulado e o 2º
  -- tenant em diante ficava SEM a UNIQUE (welcome/join quebrava com 42P10
  -- no ON CONFLICT). Achado do re-scan 2026-07-04, P0 do beta multi-tenant.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'visits_session_customer_unique'
       AND conrelid = 'visits'::regclass
  ) THEN
    ALTER TABLE visits ADD CONSTRAINT visits_session_customer_unique
      UNIQUE (table_session_id, customer_id);
  END IF;
END $$;

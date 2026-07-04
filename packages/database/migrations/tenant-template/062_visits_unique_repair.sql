-- Migration 062: repara a UNIQUE de visits nos tenants provisionados DEPOIS
-- do 1º (re-scan 2026-07-04, P0). A migration 018 checava
-- `pg_constraint WHERE conname=...` sem escopar por schema (conrelid), então
-- assim que UM tenant ganhou `visits_session_customer_unique`, o EXISTS
-- retornava true pra todos os seguintes e o ALTER TABLE era PULADO. Efeito:
-- do 2º tenant em diante, a tabela visits ficava SEM a constraint e o
-- `ON CONFLICT (table_session_id, customer_id)` do welcome/join estourava
-- 42P10. A 018 já foi registrada nesses tenants (não re-roda), então o
-- reparo vem aqui — idempotente e escopado ao schema atual.
--
-- Dedup defensivo antes de adicionar (a 018 já deduplicou via search_path,
-- mas re-afirmamos pra não estourar o ADD caso algum duplicado tenha nascido
-- na janela sem constraint).
DO $$
DECLARE
  _dup_count INT;
BEGIN
  -- Só age se a constraint ainda NÃO existe NESTE schema.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'visits_session_customer_unique'
       AND conrelid = 'visits'::regclass
  ) THEN
    -- Remove duplicados (mantém o mais antigo por table_session_id+customer_id),
    -- limpando FKs de feedbacks como a 018 faz.
    CREATE TEMP TABLE _dup_visit_ids ON COMMIT DROP AS
      SELECT id FROM (
        SELECT id, row_number() OVER (
          PARTITION BY table_session_id, customer_id ORDER BY created_at ASC, id ASC
        ) AS rn
        FROM visits
        WHERE customer_id IS NOT NULL
      ) t WHERE rn > 1;

    SELECT count(*) INTO _dup_count FROM _dup_visit_ids;
    IF _dup_count > 0 THEN
      UPDATE feedbacks SET visit_id = NULL WHERE visit_id IN (SELECT id FROM _dup_visit_ids);
      DELETE FROM visits WHERE id IN (SELECT id FROM _dup_visit_ids);
      RAISE NOTICE '062 repair: removidos % visits duplicados antes da UNIQUE', _dup_count;
    END IF;

    ALTER TABLE visits ADD CONSTRAINT visits_session_customer_unique
      UNIQUE (table_session_id, customer_id);
    RAISE NOTICE '062 repair: UNIQUE visits_session_customer_unique adicionada';
  END IF;
END $$;

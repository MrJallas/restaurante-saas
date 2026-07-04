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
--
-- FK-SAFE (re-scan 2026-07-04): visits(id) é referenciada por 10 filhos
-- (orders, payments, feedbacks, waiter_calls, session_participants,
-- assistant_messages, late_arrival_requests, order_ratings, complaints,
-- scan_verification_requests), todos com NO ACTION default exceto os
-- ON DELETE SET NULL. `feedbacks.visit_id` é NOT NULL (013:3) → nular estoura
-- a NOT NULL; e um filho apontando pra visit perdedora faria o `DELETE FROM
-- visits` estourar FK violation → migration aborta → API não sobe. Então em
-- vez de nular-só-feedbacks, REAPONTAMOS todos os filhos da visit perdedora
-- pra visit SOBREVIVENTE (a mais antiga por table_session_id+customer_id)
-- ANTES de deletar. Isso preserva o histórico (nada é perdido) e satisfaz o
-- NOT NULL de feedbacks. Idempotente: 0 linhas se já limpo.
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
    -- Mapa perdedora → sobrevivente por (table_session_id, customer_id).
    -- rn=1 é a mais antiga (sobrevivente); rn>1 são perdedoras. `keep_id`
    -- carrega o id da sobrevivente pra cada perdedora via first_value().
    CREATE TEMP TABLE _dup_visit_map ON COMMIT DROP AS
      SELECT id AS dup_id, keep_id
        FROM (
          SELECT id,
                 row_number() OVER w AS rn,
                 first_value(id) OVER w AS keep_id
            FROM visits
           WHERE customer_id IS NOT NULL
          WINDOW w AS (
            PARTITION BY table_session_id, customer_id
            ORDER BY created_at ASC, id ASC
          )
        ) t
       WHERE rn > 1;

    SELECT count(*) INTO _dup_count FROM _dup_visit_map;
    IF _dup_count > 0 THEN
      -- Reaponta TODOS os filhos da perdedora pra sobrevivente (FK-safe).
      UPDATE orders o                       SET visit_id = m.keep_id FROM _dup_visit_map m WHERE o.visit_id  = m.dup_id;
      UPDATE payments p                     SET visit_id = m.keep_id FROM _dup_visit_map m WHERE p.visit_id  = m.dup_id;

      -- feedbacks é ESPECIAL: a 040 (rodada ANTES desta no provisionamento
      -- fresco: 038→040→062) já criou o UNIQUE feedbacks(visit_id). Reapontar
      -- cru colidiria (23505) se a visit sobrevivente JÁ tem um feedback ou se
      -- 2 perdedoras da mesma sobrevivente têm feedback. Então: por grupo de
      -- sobrevivente, escolhe UM feedback vencedor (o mais recente entre o da
      -- keep + os das perdedoras), apaga os demais e reaponta o vencedor.
      WITH grp AS (
        -- todos os feedbacks cujo visit_id é uma keep ou uma perdedora do mapa
        SELECT f.id,
               COALESCE(m.keep_id, f.visit_id) AS group_keep,
               row_number() OVER (
                 PARTITION BY COALESCE(m.keep_id, f.visit_id)
                 ORDER BY f.created_at DESC, f.id DESC
               ) AS rn
          FROM feedbacks f
          LEFT JOIN _dup_visit_map m ON m.dup_id = f.visit_id
         WHERE f.visit_id IN (SELECT keep_id FROM _dup_visit_map)
            OR f.visit_id IN (SELECT dup_id  FROM _dup_visit_map)
      )
      DELETE FROM feedbacks f USING grp WHERE f.id = grp.id AND grp.rn > 1;
      -- sobrou 1 feedback por grupo; reaponta o que ainda está numa perdedora.
      UPDATE feedbacks f                    SET visit_id = m.keep_id FROM _dup_visit_map m WHERE f.visit_id  = m.dup_id;

      UPDATE waiter_calls w                 SET visit_id = m.keep_id FROM _dup_visit_map m WHERE w.visit_id  = m.dup_id;
      UPDATE session_participants sp        SET visit_id = m.keep_id FROM _dup_visit_map m WHERE sp.visit_id = m.dup_id;
      UPDATE assistant_messages am          SET visit_id = m.keep_id FROM _dup_visit_map m WHERE am.visit_id = m.dup_id;
      UPDATE late_arrival_requests lar      SET visit_id = m.keep_id FROM _dup_visit_map m WHERE lar.visit_id = m.dup_id;
      UPDATE order_ratings orr              SET visit_id = m.keep_id FROM _dup_visit_map m WHERE orr.visit_id = m.dup_id;
      UPDATE complaints c                   SET visit_id = m.keep_id FROM _dup_visit_map m WHERE c.visit_id  = m.dup_id;
      UPDATE scan_verification_requests svr SET visit_id = m.keep_id FROM _dup_visit_map m WHERE svr.visit_id = m.dup_id;

      DELETE FROM visits WHERE id IN (SELECT dup_id FROM _dup_visit_map);
      RAISE NOTICE '062 repair: reapontados filhos e removidos % visits duplicados antes da UNIQUE', _dup_count;
    END IF;

    ALTER TABLE visits ADD CONSTRAINT visits_session_customer_unique
      UNIQUE (table_session_id, customer_id);
    RAISE NOTICE '062 repair: UNIQUE visits_session_customer_unique adicionada';
  END IF;
END $$;

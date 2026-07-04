-- Migration 065: reparo FK-SAFE, idempotente, dos 3 UNIQUEs de integridade
-- que 038/040/062 introduziram (re-scan de verificação 2026-07-04, P0).
--
-- POR QUE ESTA MIGRATION EXISTE (modelo do runner):
--   migrate-tenants.ts RASTREIA migrations aplicadas em __migrations__ e NÃO
--   re-roda uma migration já registrada, mesmo que o arquivo seja editado.
--   Nos 4 tenants existentes (restaurant_dev, restaurant_e2e_other,
--   staging_beta, staging_demo) as migrations 038/040/062 já estão gravadas —
--   então os hardenings que fizemos nelas só protegem PROVISIONAMENTO FRESCO.
--   Qualquer tenant que tenha nascido dado-quebrado (duplicata ativa de
--   delivery, >1 feedback por visit, visit duplicada com filho FK apontando
--   pra perdedora) precisa deste reparo NOVO, que o runner ainda não viu.
--
-- Como migration é FATAL no boot, TUDO aqui é idempotente e defensivo:
--   - roda 0 linhas se o tenant já está limpo;
--   - os CREATE UNIQUE INDEX / ADD CONSTRAINT usam IF NOT EXISTS (nos 4 tenants
--     os objetos já existem → NOOP);
--   - reaponta filhos (nunca nula feedbacks.visit_id, que é NOT NULL) antes de
--     deletar visits perdedoras → nenhum DELETE estoura FK violation.
--
-- Ordem importa: (1) dedup order_deliveries; (2) reaponta+deduplica visits
-- ANTES de (3) dedup feedbacks — porque reapontar feedbacks de uma visit
-- perdedora pra sobrevivente pode criar uma NOVA colisão de feedbacks(visit_id)
-- que o passo (3) então resolve. Só depois re-afirmamos os 3 UNIQUEs.

-- ---------------------------------------------------------------------------
-- (1) order_deliveries: no máximo 1 claim ATIVO (status != 'cancelled') por
--     order. Rebaixa os mais antigos pra 'cancelled' (saem do índice parcial).
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY order_id
           ORDER BY claimed_at DESC NULLS LAST, created_at DESC, id DESC
         ) AS rn
    FROM order_deliveries
   WHERE status != 'cancelled'
)
UPDATE order_deliveries d
   SET status = 'cancelled'
  FROM ranked r
 WHERE d.id = r.id
   AND r.rn > 1;

-- ---------------------------------------------------------------------------
-- (2) visits: no máximo 1 por (table_session_id, customer_id). Reaponta os 10
--     filhos da visit perdedora pra sobrevivente (a mais antiga) ANTES de
--     deletar — FK-safe, satisfaz feedbacks.visit_id NOT NULL. Só age se a
--     constraint ainda não existe OU se sobrou duplicata (defensivo).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _dup_count INT;
BEGIN
  CREATE TEMP TABLE _repair065_visit_map ON COMMIT DROP AS
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

  SELECT count(*) INTO _dup_count FROM _repair065_visit_map;
  IF _dup_count > 0 THEN
    UPDATE orders o                       SET visit_id = m.keep_id FROM _repair065_visit_map m WHERE o.visit_id  = m.dup_id;
    UPDATE payments p                     SET visit_id = m.keep_id FROM _repair065_visit_map m WHERE p.visit_id  = m.dup_id;

    -- feedbacks colisão-safe: nos 4 tenants existentes o UNIQUE
    -- feedbacks(visit_id) JÁ existe, então reapontar cru pra uma keep que já
    -- tem feedback estouraria 23505. Escolhe 1 vencedor por grupo de keep
    -- (mais recente entre keep + perdedoras), apaga os demais, reaponta o
    -- vencedor. O passo (3) mais abaixo é redundante-seguro depois disto.
    WITH grp AS (
      SELECT f.id,
             COALESCE(m.keep_id, f.visit_id) AS group_keep,
             row_number() OVER (
               PARTITION BY COALESCE(m.keep_id, f.visit_id)
               ORDER BY f.created_at DESC, f.id DESC
             ) AS rn
        FROM feedbacks f
        LEFT JOIN _repair065_visit_map m ON m.dup_id = f.visit_id
       WHERE f.visit_id IN (SELECT keep_id FROM _repair065_visit_map)
          OR f.visit_id IN (SELECT dup_id  FROM _repair065_visit_map)
    )
    DELETE FROM feedbacks f USING grp WHERE f.id = grp.id AND grp.rn > 1;
    UPDATE feedbacks f                    SET visit_id = m.keep_id FROM _repair065_visit_map m WHERE f.visit_id  = m.dup_id;

    UPDATE waiter_calls w                 SET visit_id = m.keep_id FROM _repair065_visit_map m WHERE w.visit_id  = m.dup_id;
    UPDATE session_participants sp        SET visit_id = m.keep_id FROM _repair065_visit_map m WHERE sp.visit_id = m.dup_id;
    UPDATE assistant_messages am          SET visit_id = m.keep_id FROM _repair065_visit_map m WHERE am.visit_id = m.dup_id;
    UPDATE late_arrival_requests lar      SET visit_id = m.keep_id FROM _repair065_visit_map m WHERE lar.visit_id = m.dup_id;
    UPDATE order_ratings orr              SET visit_id = m.keep_id FROM _repair065_visit_map m WHERE orr.visit_id = m.dup_id;
    UPDATE complaints c                   SET visit_id = m.keep_id FROM _repair065_visit_map m WHERE c.visit_id  = m.dup_id;
    UPDATE scan_verification_requests svr SET visit_id = m.keep_id FROM _repair065_visit_map m WHERE svr.visit_id = m.dup_id;

    DELETE FROM visits WHERE id IN (SELECT dup_id FROM _repair065_visit_map);
    RAISE NOTICE '065 repair: reapontados filhos e removidos % visits duplicados', _dup_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'visits_session_customer_unique'
       AND conrelid = 'visits'::regclass
  ) THEN
    ALTER TABLE visits ADD CONSTRAINT visits_session_customer_unique
      UNIQUE (table_session_id, customer_id);
    RAISE NOTICE '065 repair: UNIQUE visits_session_customer_unique adicionada';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- (3) feedbacks: no máximo 1 por visit_id (NOT NULL). Roda DEPOIS do reaponte
--     de visits — que pode ter empilhado 2 feedbacks na mesma visit
--     sobrevivente. Mantém o mais recente e apaga os demais (feedbacks é folha,
--     nenhum FK aponta pra ela → DELETE seguro).
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY visit_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM feedbacks
   WHERE visit_id IS NOT NULL
)
DELETE FROM feedbacks f
 USING ranked r
 WHERE f.id = r.id
   AND r.rn > 1;

-- ---------------------------------------------------------------------------
-- Re-afirma os 3 UNIQUEs. Nos 4 tenants já existem (NOOP); num tenant reparado
-- que ainda não os tinha, cria agora sobre dados já limpos.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_active_claim_unique
  ON order_deliveries (order_id)
  WHERE status != 'cancelled';

CREATE UNIQUE INDEX IF NOT EXISTS feedbacks_visit_id_unique
  ON feedbacks(visit_id)
  WHERE visit_id IS NOT NULL;

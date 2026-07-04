-- 063: staff_shift_assignments — no máximo 1 escala ATIVA por
-- (shift_id, staff_id, work_date). Sem isto, o ShiftsService.addMember fazia
-- SELECT-then-INSERT (verifica "já escalado?" e depois insere) sem lock nem
-- ON CONFLICT — sob double-submit / POSTs concorrentes, todos viam "não
-- escalado" e inseriam N linhas ativas para o mesmo (turno, staff, data).
-- Mesmo padrão que 038/040/057 fecharam e que 060 (waiter_zone_assignments)
-- já traz de fábrica. Este índice único parcial habilita o ON CONFLICT
-- atômico no addMember (1 linha por turno/staff/dia).
--
-- Idempotente: IF NOT EXISTS protege o re-run; o dedupe roda 0 linhas se já
-- limpo.

-- DEDUPE antes do índice: ambientes antigos podem JÁ ter >1 escala ativa por
-- (turno, staff, data) — justamente a corrida que este índice fecha. Sem isto,
-- o CREATE UNIQUE INDEX falharia com unique_violation e, como migration é
-- FATAL no boot, a API não subiria nesse tenant. Mantém a escala ativa mais
-- recente e faz soft-delete (removed_at) das demais.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY shift_id, staff_id, work_date
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM staff_shift_assignments
   WHERE removed_at IS NULL
)
UPDATE staff_shift_assignments a
   SET removed_at = now()
  FROM ranked r
 WHERE a.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_assignments_active
  ON staff_shift_assignments (shift_id, staff_id, work_date)
  WHERE removed_at IS NULL;

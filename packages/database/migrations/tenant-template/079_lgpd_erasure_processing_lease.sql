-- Migration 079: lease duravel para o worker/retry de erasure LGPD.
--
-- `status = in_progress` sozinho nao identifica quem possui o trabalho nem
-- permite recuperar uma execucao cujo processo morreu. O attempt token e a
-- cerca CAS: somente a tentativa que reivindicou a linha pode concluir ou
-- devolve-la para pending. O lease permite que uma tentativa nova retome
-- atomicamente uma linha abandonada sem concorrer com uma tentativa ativa.

ALTER TABLE lgpd_requests
  ADD COLUMN IF NOT EXISTS processing_attempt_token UUID,
  ADD COLUMN IF NOT EXISTS processing_lease_expires_at TIMESTAMPTZ;

-- Versoes anteriores podiam deixar `in_progress` para sempre. Uma migration
-- roda durante deploy, sem worker antigo que possamos considerar dono; devolva
-- essas linhas para a fila antes de instalar o invariante novo.
UPDATE lgpd_requests
   SET status = 'pending',
       processing_attempt_token = NULL,
       processing_lease_expires_at = NULL,
       notes = concat_ws(
         ' · ',
         NULLIF(notes, ''),
         'erasure_recovered_by_migration_079'
       ),
       updated_at = now()
 WHERE kind = 'erasure'
   AND status = 'in_progress';

-- Estados que nao executam trabalho nao podem carregar uma lease residual.
UPDATE lgpd_requests
   SET processing_attempt_token = NULL,
       processing_lease_expires_at = NULL
 WHERE status <> 'in_progress';

ALTER TABLE lgpd_requests
  DROP CONSTRAINT IF EXISTS lgpd_requests_processing_lease_check;

ALTER TABLE lgpd_requests
  ADD CONSTRAINT lgpd_requests_processing_lease_check
  CHECK (
    (
      status = 'in_progress'
      AND kind = 'erasure'
      AND processing_attempt_token IS NOT NULL
      AND processing_lease_expires_at IS NOT NULL
    )
    OR
    (
      status <> 'in_progress'
      AND processing_attempt_token IS NULL
      AND processing_lease_expires_at IS NULL
    )
    OR
    (
      kind <> 'erasure'
      AND processing_attempt_token IS NULL
      AND processing_lease_expires_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_lgpd_requests_erasure_lease
  ON lgpd_requests (processing_lease_expires_at)
  WHERE kind = 'erasure' AND status = 'in_progress';

COMMENT ON COLUMN lgpd_requests.processing_attempt_token IS
  'Token CAS da tentativa de erasure que possui a linha in_progress.';
COMMENT ON COLUMN lgpd_requests.processing_lease_expires_at IS
  'Depois deste instante outra tentativa pode retomar atomicamente a erasure.';

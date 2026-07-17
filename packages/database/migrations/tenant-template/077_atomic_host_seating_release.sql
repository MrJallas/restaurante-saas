-- Migration 077: sentar reserva/fila e liberar QR como uma única operação.
--
-- A release agora guarda o tamanho do grupo e a origem operacional. Isso
-- permite aplicar o party size na sessão quando o QR for consumido, manter
-- auditoria reserva/fila -> mesa e impedir que dois cliques sentem a mesma
-- origem duas vezes.

ALTER TABLE table_qr_releases
  ADD COLUMN IF NOT EXISTS party_size INT,
  ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS waitlist_entry_id UUID REFERENCES waitlist_entries(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'table_qr_releases_party_size_check'
       AND conrelid = 'table_qr_releases'::regclass
  ) THEN
    ALTER TABLE table_qr_releases
      ADD CONSTRAINT table_qr_releases_party_size_check
      CHECK (party_size IS NULL OR party_size >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'table_qr_releases_single_source_check'
       AND conrelid = 'table_qr_releases'::regclass
  ) THEN
    ALTER TABLE table_qr_releases
      ADD CONSTRAINT table_qr_releases_single_source_check
      CHECK (NOT (reservation_id IS NOT NULL AND waitlist_entry_id IS NOT NULL));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_table_qr_releases_reservation_unique
  ON table_qr_releases(reservation_id)
  WHERE reservation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_table_qr_releases_waitlist_unique
  ON table_qr_releases(waitlist_entry_id)
  WHERE waitlist_entry_id IS NOT NULL;


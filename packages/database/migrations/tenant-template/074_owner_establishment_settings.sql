-- Migration 074: configurações reais do estabelecimento, administradas pelo dono.
--
-- Preserva os campos existentes de settings e acrescenta somente dados com
-- consumidor real no produto: liga/desliga do geofence, horários semanais e
-- autoria da última alteração. Horários começam NULL de propósito: não
-- inventamos o funcionamento de um tenant existente.

DO $$
BEGIN
  -- O backfill só roda quando a coluna nasce. Em re-run, não pode religar um
  -- geofence que o dono desligou depois mantendo as coordenadas salvas.
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'settings'
       AND column_name = 'geofence_enabled'
  ) THEN
    ALTER TABLE settings
      ADD COLUMN geofence_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE settings
       SET geofence_enabled = TRUE
     WHERE geofence_latitude IS NOT NULL
       AND geofence_longitude IS NOT NULL;
  END IF;
END $$;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS opening_hours JSONB,
  ADD COLUMN IF NOT EXISTS updated_by_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'settings_opening_hours_object_check'
       AND conrelid = 'settings'::regclass
  ) THEN
    ALTER TABLE settings
      ADD CONSTRAINT settings_opening_hours_object_check
      CHECK (opening_hours IS NULL OR jsonb_typeof(opening_hours) = 'object');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS settings_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  changed_fields TEXT[] NOT NULL,
  before_values JSONB NOT NULL,
  after_values JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settings_audit_log_created
  ON settings_audit_log (created_at DESC);

COMMENT ON COLUMN settings.opening_hours IS
  'Mapa mon..sun; cada dia recebe [{open,close}] ou null quando fechado.';
COMMENT ON COLUMN settings.updated_by_staff_id IS
  'Dono autenticado que fez a última mutação das configurações do estabelecimento.';
COMMENT ON TABLE settings_audit_log IS
  'Histórico somente dos campos owner-facing; nunca inclui credenciais PSP ou segredos internos.';

-- Migration 061: staff.must_change_pin — pacote TROCAR-PIN (decisões Caleb
-- 2026-07-04).
--
-- Quando o GERENTE reseta o PIN de um funcionário (POST
-- /:slug/staff/:staffId/reset-pin), o backend gera um PIN temporário de 6
-- dígitos e seta esta flag. O login com a flag ligada devolve
-- `mustChangePin: true` + nextPath `/trocar-pin` — o web-staff força a
-- troca antes de liberar o app. O change-pin (POST /:slug/staff-auth/
-- change-pin) limpa a flag no mesmo UPDATE que grava o pin_hash novo.
--
-- Idempotente (padrão migration 037): DO $$ + IF NOT EXISTS — re-run em
-- schema que já tem a coluna é no-op.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff'
      AND column_name = 'must_change_pin'
      AND table_schema = current_schema()
  ) THEN
    ALTER TABLE staff
      ADD COLUMN must_change_pin BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

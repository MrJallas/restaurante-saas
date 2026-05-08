-- Migration 020: VIP customers flag.
--
-- Marks customers as VIP. Used by frontend-staff to highlight regulars on
-- the table session view (greeting, priority, perks). Default false so
-- backfill is harmless. Index it because lists are filtered by VIP status.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_customers_is_vip
  ON customers(is_vip)
  WHERE is_vip = true;

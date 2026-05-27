-- Migration 054: manager table session metadata.
--
-- The manager table menu needs an operational party count and note that
-- survive reloads/devices. Participants remain the customer-level source of
-- truth; these fields are staff-side overrides for floor management.

ALTER TABLE table_sessions
  ADD COLUMN IF NOT EXISTS staff_party_override INT
    CHECK (staff_party_override IS NULL OR staff_party_override >= 1),
  ADD COLUMN IF NOT EXISTS staff_note TEXT,
  ADD COLUMN IF NOT EXISTS staff_meta_updated_by UUID REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS staff_meta_updated_at TIMESTAMPTZ;

-- Migration 048: staff shift message groups.
--
-- Internal staff messaging already has threads + participants. These metadata
-- fields let the backend create one auto-managed group per shift/day and
-- archive it when the shift ends, without overloading the visible subject.

ALTER TABLE staff_message_threads
  ADD COLUMN IF NOT EXISTS kind VARCHAR(40) NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES staff_shifts(id),
  ADD COLUMN IF NOT EXISTS work_date DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_message_threads_shift_group_unique
  ON staff_message_threads(kind, shift_id, work_date)
  WHERE kind = 'shift_group';


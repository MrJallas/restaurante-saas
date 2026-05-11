-- Migration 043 (round 18 — Onda 2 backend): staff_shifts + assignments.
--
-- ScreenManagerShiftEditor (canvas garcom-screens-c.jsx:1351) precisa
-- persistir turnos editados. Antes M_SHIFTS_FULL era mock inline e os 7
-- CTAs (move/overtime/remove/add/duplicate/save) eram noop.
--
-- Schema:
--   • staff_shifts: TEMPLATE de turno (manhã 06-12, tarde 12-17, noite
--     17-23). Permite "+ Novo turno" criar definicoes adicionais (ex:
--     encerramento 23-02).
--   • staff_shift_assignments: STAFF X TURNO X DATA. Adicionar staff
--     ao turno cria uma row; remover via soft-delete (removed_at).
--     Mover de um turno pra outro = UPDATE shift_id. Hora extra =
--     overtime_minutes column.
--
-- Idempotente — IF NOT EXISTS protege re-run.

CREATE TABLE IF NOT EXISTS staff_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(40) NOT NULL,
  range_label VARCHAR(40) NOT NULL,
  time_start TIME NOT NULL,
  time_end TIME NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES staff_shifts(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  overtime_minutes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shift_assignments_date
  ON staff_shift_assignments(work_date) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shift_assignments_shift_date
  ON staff_shift_assignments(shift_id, work_date) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shift_assignments_staff_date
  ON staff_shift_assignments(staff_id, work_date) WHERE removed_at IS NULL;

-- Seed 3 turnos canon (manhã/tarde/noite). ON CONFLICT skip pra
-- re-run idempotente.
INSERT INTO staff_shifts (id, label, range_label, time_start, time_end, sort_order)
VALUES
  ('11111111-1111-1111-1111-aaaaaaaaaaaa', 'MANHÃ', '06H – 12H', '06:00', '12:00', 1),
  ('22222222-2222-2222-2222-aaaaaaaaaaaa', 'TARDE', '12H – 17H', '12:00', '17:00', 2),
  ('33333333-3333-3333-3333-aaaaaaaaaaaa', 'NOITE', '17H – 23H', '17:00', '23:00', 3)
ON CONFLICT (id) DO NOTHING;

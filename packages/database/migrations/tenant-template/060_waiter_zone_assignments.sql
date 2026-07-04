-- Migration 060: atribuição explícita garçom→zona por dia (decisão Caleb
-- 2026-07-04, madrugada). Fonte REAL pra carga por garçom (CargaMedia/
-- Sobrecarga saem do selo DEMO): o gerente atribui, as mesas da zona
-- contam pro garçom. Idempotente.

CREATE TABLE IF NOT EXISTS waiter_zone_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  zone_id UUID NOT NULL REFERENCES zones(id),
  work_date DATE NOT NULL DEFAULT current_date,
  assigned_by UUID REFERENCES staff(id),
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um garçom só tem UMA atribuição ativa por zona/dia (re-atribuir é no-op;
-- remover usa removed_at, preservando o histórico do dia).
CREATE UNIQUE INDEX IF NOT EXISTS uq_waiter_zone_assignments_active
  ON waiter_zone_assignments (staff_id, zone_id, work_date)
  WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_waiter_zone_assignments_zone_date
  ON waiter_zone_assignments (zone_id, work_date)
  WHERE removed_at IS NULL;

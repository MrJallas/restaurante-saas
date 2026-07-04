-- Migration 059: manager_shift_logs volta pro Postgres (FASE 3, auditoria
-- 2026-07-03 + decisão Caleb 2026-07-04). É dado FINANCEIRO (vendas,
-- ticket médio) — morava no Mongo com filtro $regex e fora do trilho
-- transacional. Histórico legado do Mongo (dev/QA apenas) não migra.
-- Idempotente (padrão da 037).

CREATE TABLE IF NOT EXISTS manager_shift_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES staff(id),
  staff_name VARCHAR(100) NOT NULL,
  shift_label VARCHAR(100) NOT NULL DEFAULT 'Turno atual',
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  sales_cents INT NOT NULL DEFAULT 0,
  orders INT NOT NULL DEFAULT 0,
  tables_served INT NOT NULL DEFAULT 0,
  critical_alerts INT NOT NULL DEFAULT 0,
  avg_ticket_cents INT NOT NULL DEFAULT 0,
  waiters_on_shift JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manager_shift_logs_ended_at
  ON manager_shift_logs (ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_manager_shift_logs_staff_name
  ON manager_shift_logs (staff_name);

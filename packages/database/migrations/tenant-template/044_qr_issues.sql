-- Migration 044 (round 18 — Onda 4 batch 1): qr_issues table.
--
-- ScreenWaiterReportQrIssue (apps/web-staff) chama
-- `POST /:slug/qr-issues` pra reportar QR damaged/unscannable. Antes o
-- controller era stub (lista []; POST retornava fake id). Agora persiste
-- real, alimenta GET com `status=open` filter pro manager dashboard.
--
-- Schema:
--   • reported_by_staff_id e resolved_by_staff_id como UUID plain
--     (sem FK cross-schema — pattern de 042/043).
--   • status: open -> in_progress -> resolved. CHECK enforced.
--   • Index em (status, created_at DESC) acelera filter `?status=open`
--     ORDER BY created_at DESC.
--
-- Idempotente — wrap em DO $$ ... IF NOT EXISTS pra re-run safe.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'qr_issues'
  ) THEN
    CREATE TABLE qr_issues (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      table_number INT,
      description TEXT,
      photo_url TEXT,
      reported_by_staff_id UUID,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'resolved')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ,
      resolved_by_staff_id UUID
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qr_issues_status_created_at
  ON qr_issues(status, created_at DESC);

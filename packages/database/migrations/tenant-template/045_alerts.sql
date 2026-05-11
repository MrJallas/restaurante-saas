-- Migration 045 (round 18 — Onda 4 batch 2): alerts module.
--
-- ScreenManagerAlertsAll (canvas screens-c.jsx — onda 2) precisa
-- persistir alertas operacionais (escalations late-arrival, zone-pause
-- expiring, complaint nao respondida, qr-issue critical, etc). Antes
-- a tela mostrava mock data inline — agora `GET /alerts` alimenta a
-- lista real e `POST /alerts/:id/dismiss|resolve` persistem o estado.
--
-- Schema:
--   • sev: 'crítica' | 'atenção' | 'info' (canon V20 do canvas)
--   • kind: free-form string (ex: 'late_arrival_expired',
--     'zone_pause_overrun', 'complaint_overdue', 'qr_issue_critical')
--   • title/sub: copy renderizado direto no card
--   • ttl_at: TTL opcional (alerta auto-expira para 'info' tipo
--     "novo cliente VIP cadastrado")
--   • actions JSONB: array de CTAs `[{ label, route, kind: 'primary'|'ghost' }]`
--     que a tela renderiza como botoes — emissor decide o que mostrar.
--   • dismissed_at / resolved_at: nullable; mutualmente exclusivos
--     (operador escolhe um). Index parcial em (sev, created_at) filtra
--     pendentes pra lista default.
--
-- Idempotente — IF NOT EXISTS protege re-run.

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sev TEXT NOT NULL CHECK (sev IN ('crítica', 'atenção', 'info')),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  sub TEXT,
  ttl_at TIMESTAMPTZ,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  dismissed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_sev_created_at
  ON alerts(sev, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_open
  ON alerts(created_at DESC)
  WHERE dismissed_at IS NULL AND resolved_at IS NULL;

-- Migration 035: Table-merge dual-consent state.
--
-- A table merge is a SOCIAL decision that requires BOTH host customers to
-- agree (the host of the source table AND the host of the target table).
-- Per docs/features/customer-host-model.md (V16): "Junção só rola se ambos
-- aprovarem (consent duplo · proteção contra puxa-mesa)". The previous
-- service flipped status='approved' on the first /respond hit, regardless
-- of which side answered — that's a single-consent bug because the other
-- host could still be deciding.
--
-- The dual-consent state machine is timestamp-based (not boolean): a
-- non-NULL `approved_by_a_at` means side A already said yes, ditto for B.
-- The status flips from `pending` to `approved` only when BOTH timestamps
-- are populated. A reject from either side flips the row to `rejected`
-- immediately (and triggers the cooldown row, kept in 025).
--
-- Edge: the spec also covers "host_customer_id IS NULL on target" (walkin
-- without app) — in that case the request is bounced at create-time, not
-- here, so the dual-consent invariant always reduces to "two host customers
-- both approving".

ALTER TABLE table_merge_requests
  ADD COLUMN IF NOT EXISTS approved_by_a_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_b_at TIMESTAMPTZ;

-- Index pra readiness check ("listar pedidos esperando contraparte"). Util
-- pro painel staff que quer mostrar "M14 esperando M15" e tambem pra cron
-- de timeout que precisa varrer rows com so um lado decidido.
CREATE INDEX IF NOT EXISTS idx_table_merge_requests_pending_dual
  ON table_merge_requests(approved_by_a_at, approved_by_b_at)
  WHERE status = 'pending';

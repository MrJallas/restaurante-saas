-- Migration 053: cozinha handoff + aprovacao real de reordenacao.
--
-- KDS nao marca mais pedido como entregue. A cozinha chama um garcom,
-- o garcom coloca o pedido em transito, e so depois marca entregue.

ALTER TABLE order_deliveries
  ADD COLUMN IF NOT EXISTS called_by UUID REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS called_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS target_waiter_id UUID REFERENCES staff(id);

UPDATE order_deliveries
   SET called_at = COALESCE(called_at, created_at)
 WHERE called_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_order_deliveries_target_waiter
  ON order_deliveries(target_waiter_id)
  WHERE target_waiter_id IS NOT NULL AND status != 'cancelled';

CREATE INDEX IF NOT EXISTS idx_order_deliveries_called_at
  ON order_deliveries(called_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS kitchen_reorder_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ids UUID[] NOT NULL,
  reason TEXT,
  requested_by_staff_id UUID REFERENCES staff(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'next', 'cancelled')),
  response VARCHAR(20)
    CHECK (response IS NULL OR response IN ('accept', 'next')),
  protected_order_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  responded_by_staff_id UUID REFERENCES staff(id),
  response_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_reorder_requests_pending
  ON kitchen_reorder_requests(created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_kitchen_reorder_requests_requested_by
  ON kitchen_reorder_requests(requested_by_staff_id, created_at DESC);

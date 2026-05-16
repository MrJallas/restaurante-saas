-- Migration 047 (R23 Onda 4): kitchen queue reorder.
--
-- Managers can pull selected orders to the top of the KDS queue. The
-- priority fields are intentionally stored on orders so every existing KDS
-- read path can sort without a separate join table.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS priority_rank BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority_reason TEXT,
  ADD COLUMN IF NOT EXISTS priority_requested_by UUID REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS priority_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_kitchen_queue
  ON orders(priority_rank DESC, created_at ASC)
  WHERE status NOT IN ('delivered', 'cancelled', 'pending_confirmation');

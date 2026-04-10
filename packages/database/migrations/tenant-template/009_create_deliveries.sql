CREATE TABLE IF NOT EXISTS order_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  claimed_by UUID REFERENCES staff(id),
  claimed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_deliveries_order_id ON order_deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_order_deliveries_claimed_by ON order_deliveries(claimed_by);
CREATE INDEX IF NOT EXISTS idx_order_deliveries_status ON order_deliveries(status);

-- Schema additions for the customer app redesign (Sprint customer-app v2).
-- All columns are additive and nullable so existing data stays valid.

-- 1) Orders: support the 15s pre-confirmation flow
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS auto_confirm_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_auto_confirm_at
  ON orders(auto_confirm_at)
  WHERE auto_confirm_at IS NOT NULL;

-- 2) Order items: per-person attribution (null = shared on the table bill)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);

CREATE INDEX IF NOT EXISTS idx_order_items_customer_id ON order_items(customer_id);

-- 3) Menu items: food vs drink and drink size/preference catalog
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'food',
  ADD COLUMN IF NOT EXISTS sizes JSONB,
  ADD COLUMN IF NOT EXISTS preferences JSONB;

CREATE INDEX IF NOT EXISTS idx_menu_items_kind ON menu_items(kind);

-- 4) Waiter calls: reason + cancel/resolve + waiter assignment metadata
ALTER TABLE waiter_calls
  ADD COLUMN IF NOT EXISTS reason VARCHAR(30) NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id),
  ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES visits(id),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_waiter_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS eta_minutes INT;

-- 5) Payments: expiration, cancel, split metadata
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS split_mode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS split_allocations JSONB;

-- 6) Table participants: many customers per session (multi-person QR check-in)
CREATE TABLE IF NOT EXISTS session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  visit_id UUID REFERENCES visits(id),
  color_index SMALLINT NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  UNIQUE (table_session_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_session_participants_session
  ON session_participants(table_session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_customer
  ON session_participants(customer_id);

-- 7) Feedback tags (multi-choice categories from S10)
ALTER TABLE feedbacks
  ADD COLUMN IF NOT EXISTS tags TEXT[];

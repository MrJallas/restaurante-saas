CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id UUID NOT NULL REFERENCES table_sessions(id),
  visit_id UUID REFERENCES visits(id),
  billing_mode VARCHAR(20) NOT NULL DEFAULT 'table',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  notes TEXT,
  total_cents INT NOT NULL DEFAULT 0,
  created_by VARCHAR(50) NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_table_session_id ON orders(table_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_visit_id ON orders(visit_id);
CREATE INDEX IF NOT EXISTS idx_orders_billing_mode ON orders(billing_mode);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  quantity INT NOT NULL DEFAULT 1,
  unit_price_cents INT NOT NULL,
  subtotal_cents INT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id);

CREATE TABLE IF NOT EXISTS order_item_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES order_items(id),
  menu_item_extra_id UUID NOT NULL REFERENCES menu_item_extras(id),
  price_cents INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_item_extras_order_item_id ON order_item_extras(order_item_id);

CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  changed_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);

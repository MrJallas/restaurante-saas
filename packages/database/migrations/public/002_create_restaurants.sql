CREATE TABLE IF NOT EXISTS restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  schema_name VARCHAR(100) NOT NULL UNIQUE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  owner_email VARCHAR(255) NOT NULL,
  owner_name VARCHAR(200) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurants_slug ON restaurants(slug);
CREATE INDEX IF NOT EXISTS idx_restaurants_schema_name ON restaurants(schema_name);
CREATE INDEX IF NOT EXISTS idx_restaurants_plan_id ON restaurants(plan_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_is_active ON restaurants(is_active);

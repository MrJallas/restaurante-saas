-- Migration 021: Zones and zone pauses.
--
-- Zones agrupam tables (varanda, salao interno, etc) pra que o staff consiga
-- pausar pedidos OU toda a operacao em um setor especifico (cozinha de
-- salgados sobrecarregada, garcom em pausa, evento privado, etc).
-- A coluna `tables.zone_id` e nullable: tables existentes ficam sem zona ate
-- alguem explicitamente classificar.

CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_zones_name ON zones(name);
CREATE INDEX IF NOT EXISTS idx_zones_is_active ON zones(is_active);

-- Liga uma table a uma zona (nullable: legados ficam sem zona).
ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones(id);

CREATE INDEX IF NOT EXISTS idx_tables_zone_id ON tables(zone_id);

-- Enum pra `kind`: 'orders' = trava emissao de novos orders nas mesas da zona,
-- 'all' = trava tudo (orders, calls, etc — congela a zona).
DO $$ BEGIN
  CREATE TYPE zone_pause_kind AS ENUM ('orders', 'all');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS zone_pauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES zones(id),
  zone_name VARCHAR(100),
  kind zone_pause_kind NOT NULL DEFAULT 'orders',
  reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  ended_by_staff_id UUID REFERENCES staff(id),
  created_by_staff_id UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Either FK or text-name must be present so analytics nao perde a info
  -- caso a zone tenha sido renomeada/removida apos a pausa.
  CHECK (zone_id IS NOT NULL OR zone_name IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_zone_pauses_zone_id ON zone_pauses(zone_id);
CREATE INDEX IF NOT EXISTS idx_zone_pauses_started_at ON zone_pauses(started_at);
CREATE INDEX IF NOT EXISTS idx_zone_pauses_ends_at ON zone_pauses(ends_at);
CREATE INDEX IF NOT EXISTS idx_zone_pauses_created_by_staff_id ON zone_pauses(created_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_zone_pauses_ended_by_staff_id ON zone_pauses(ended_by_staff_id);

-- Pausas ATIVAS: ends_at IS NULL OR ends_at > now(). Index parcial pra
-- queries do dashboard (ver pausas ativas por zona).
CREATE INDEX IF NOT EXISTS idx_zone_pauses_active
  ON zone_pauses(zone_id, started_at)
  WHERE ends_at IS NULL;

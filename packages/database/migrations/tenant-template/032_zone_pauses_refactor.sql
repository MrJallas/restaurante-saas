-- Migration 032: zone_pauses refactor (zone-wide -> waiter-specific).
--
-- A migration 021 criou `zone_pauses` ligada a `zone_id` (espacial) com
-- coluna `kind` (orders | all). O spec docs/features/zone-pause.md (V13)
-- redefiniu pra ser ESPECIFICO POR GARCOM:
--
--   "Pausa de pedidos novos so nas mesas atendidas por um funcionario
--    especifico. Diferente da pausa global..."
--
-- Round 8 (B-NEW-29) refactor pra IDEMPOTENTE non-destrutivo:
-- antes era DROP TABLE + CREATE — em re-run com `__migrations__` ausente
-- (ex.: TRUNCATE acidental ou tenant antigo onde probe heuristic não
-- marcou) DESTRUÍA dados de pausas ativas em prod.
--
-- Agora: ALTER TABLE aditivo. Adiciona colunas novas se faltam, drop
-- colunas antigas só se existem, sem DROP TABLE. Preserva dados de
-- pausas ativas mesmo em re-run acidental.

DO $$
DECLARE
  has_waiter_id   bool;
  has_zone_id     bool;
  has_kind_col    bool;
  table_exists    bool;
BEGIN
  -- Verifica se a tabela existe (1ª vez no schema).
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = current_schema()
       AND table_name   = 'zone_pauses'
  ) INTO table_exists;

  IF NOT table_exists THEN
    -- 1ª vez · cria tabela direto no schema novo (waiter-specific).
    CREATE TABLE zone_pauses (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      waiter_id   UUID NOT NULL REFERENCES staff(id),
      started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      ends_at     TIMESTAMPTZ NOT NULL,
      started_by  UUID NOT NULL REFERENCES staff(id),
      ended_at    TIMESTAMPTZ,
      ended_by    UUID REFERENCES staff(id),
      reason      TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  ELSE
    -- Tabela existe (legacy 021 ou já refactor 032). Detecta forma e
    -- migra aditivo.
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name   = 'zone_pauses'
         AND column_name  = 'waiter_id'
    ) INTO has_waiter_id;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name   = 'zone_pauses'
         AND column_name  = 'zone_id'
    ) INTO has_zone_id;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name   = 'zone_pauses'
         AND column_name  = 'kind'
    ) INTO has_kind_col;

    -- Adiciona waiter_id como NULLABLE primeiro (backfill se necessário),
    -- depois NOT NULL. Em dev sem dados é trivial; em prod com legacy
    -- (zone_id baseado), backfill manual seria requisito antes de
    -- runtime — por ora assumimos dev/test only (legacy 021 não foi
    -- atingido em prod).
    IF NOT has_waiter_id THEN
      ALTER TABLE zone_pauses
        ADD COLUMN waiter_id UUID REFERENCES staff(id),
        ADD COLUMN ends_at TIMESTAMPTZ,
        ADD COLUMN started_by UUID REFERENCES staff(id),
        ADD COLUMN ended_at TIMESTAMPTZ,
        ADD COLUMN ended_by UUID REFERENCES staff(id),
        ADD COLUMN reason TEXT;
      -- NOT NULL após ADD; sem dados a migrar em legacy ainda
      -- (round 3+ já roda 032 no create-tenant antes de qualquer pause
      -- legacy ser inserida). Em prod com dados legacy de 021 ativos,
      -- backfill manual antes desse migration step.
      ALTER TABLE zone_pauses ALTER COLUMN waiter_id SET NOT NULL;
      ALTER TABLE zone_pauses ALTER COLUMN ends_at SET NOT NULL;
      ALTER TABLE zone_pauses ALTER COLUMN started_by SET NOT NULL;
    END IF;

    -- Drop colunas legacy se existem (sem perder dados — colunas só).
    IF has_zone_id THEN
      ALTER TABLE zone_pauses DROP COLUMN IF EXISTS zone_id;
    END IF;
    IF has_kind_col THEN
      ALTER TABLE zone_pauses DROP COLUMN IF EXISTS kind;
    END IF;
  END IF;
END$$;

-- Drop tipo enum legacy se existe (idempotente).
DROP TYPE IF EXISTS zone_pause_kind;

-- Drop indexes legacy.
DROP INDEX IF EXISTS idx_zone_pauses_zone_id;
DROP INDEX IF EXISTS idx_zone_pauses_started_at;
DROP INDEX IF EXISTS idx_zone_pauses_ends_at;
DROP INDEX IF EXISTS idx_zone_pauses_created_by_staff_id;
DROP INDEX IF EXISTS idx_zone_pauses_ended_by_staff_id;
DROP INDEX IF EXISTS idx_zone_pauses_active;

-- Indexes novos · IF NOT EXISTS pra idempotência.
CREATE INDEX IF NOT EXISTS idx_zone_pauses_active_waiter
  ON zone_pauses(waiter_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_zone_pauses_waiter
  ON zone_pauses(waiter_id);

CREATE INDEX IF NOT EXISTS idx_zone_pauses_pending_auto_end
  ON zone_pauses(ends_at)
  WHERE ended_at IS NULL;

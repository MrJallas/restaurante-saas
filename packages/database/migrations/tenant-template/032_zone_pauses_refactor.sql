-- Migration 032: zone_pauses refactor (zone-wide -> waiter-specific).
--
-- A migration 021 criou `zone_pauses` ligada a `zone_id` (espacial) com
-- coluna `kind` (orders | all). O spec docs/features/zone-pause.md (V13)
-- redefiniu pra ser ESPECIFICO POR GARCOM:
--
--   "Pausa de pedidos novos so nas mesas atendidas por um funcionario
--    especifico. Diferente da pausa global..."
--
-- Como nao ha dados de producao (so dev/teste), refatoramos com DROP+CREATE
-- pra deixar o schema limpo. A tabela antiga e suas dependencias somem.

-- Salva-vidas: derruba dependencias antes de DROP TABLE pra nao falhar.
DROP INDEX IF EXISTS idx_zone_pauses_zone_id;
DROP INDEX IF EXISTS idx_zone_pauses_started_at;
DROP INDEX IF EXISTS idx_zone_pauses_ends_at;
DROP INDEX IF EXISTS idx_zone_pauses_created_by_staff_id;
DROP INDEX IF EXISTS idx_zone_pauses_ended_by_staff_id;
DROP INDEX IF EXISTS idx_zone_pauses_active;

DROP TABLE IF EXISTS zone_pauses;

-- O ENUM zone_pause_kind tambem nao faz sentido no novo schema.
DROP TYPE IF EXISTS zone_pause_kind;

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

-- Index parcial pra pausas ativas (ended_at IS NULL). Suporta o lookup
-- "esse garcom esta pausado agora?" sem percorrer a tabela inteira.
CREATE INDEX idx_zone_pauses_active_waiter
  ON zone_pauses(waiter_id)
  WHERE ended_at IS NULL;

-- Lookup por waiter (todas as pausas, historico incluso).
CREATE INDEX idx_zone_pauses_waiter
  ON zone_pauses(waiter_id);

-- Lookup do job recorrente: rows com ends_at < now() e ainda ativas
-- precisam de auto-end. Index parcial pra otimizar o sweep.
CREATE INDEX idx_zone_pauses_pending_auto_end
  ON zone_pauses(ends_at)
  WHERE ended_at IS NULL;

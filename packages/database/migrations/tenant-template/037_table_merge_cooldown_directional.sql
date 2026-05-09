-- Migration 037: Table-merge cooldowns become DIRECTIONAL.
--
-- Antes: `table_merge_cooldowns(table_session_a_id, table_session_b_id)`
-- com CHECK (a < b) + UNIQUE (a, b) — ou seja, o par era canônico
-- ordenado pelo UUID. Resultado: `orderedPair()` no service garantia que
-- A→B-rejected E B→A-tentativa-reversa caíam no MESMO row de cooldown,
-- bloqueando a mudança de ideia ("a Mesa 15 mudou de ideia agora quer
-- juntar com a Mesa 14"). V16 spec line 261 explicita:
--   "Caminho reverso continua aberto · cooldown é unidirecional
--    origin→target. Razão: a M15 mudou de ideia, é decisão delas."
--
-- Esta migration adiciona colunas direcionais, backfill, swap do UNIQUE
-- pra (source, target). Mantém colunas legacy `table_session_a_id` /
-- `table_session_b_id` por 1 release pra forward-compat de queries
-- inflight no service.
--
-- O service `table-merge.service.ts` foi atualizado em paralelo pra:
--   1. INSERT usar (source_table_session_id, target_table_session_id)
--   2. SELECT pré-create checar exatamente (source = X AND target = Y)
--   3. orderedPair() removido nas paths de check + insert
--
-- Idempotente — aceita re-run em schemas que já tenham as colunas.

DO $$
DECLARE
  has_source_col bool;
  has_check bool;
  has_unique_a_b bool;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_merge_cooldowns'
      AND column_name = 'source_table_session_id'
      AND table_schema = current_schema()
  ) INTO has_source_col;

  IF NOT has_source_col THEN
    -- Step 1: add directional columns nullable.
    ALTER TABLE table_merge_cooldowns
      ADD COLUMN source_table_session_id UUID REFERENCES table_sessions(id),
      ADD COLUMN target_table_session_id UUID REFERENCES table_sessions(id);

    -- Step 2: backfill — para rows existentes não temos a direção real
    -- (legacy bug). Convencionar source=a, target=b. Cooldowns ativos
    -- vão expirar em ≤ 10min de qualquer forma.
    UPDATE table_merge_cooldowns
       SET source_table_session_id = table_session_a_id,
           target_table_session_id = table_session_b_id
     WHERE source_table_session_id IS NULL;

    -- Step 3: NOT NULL após backfill.
    ALTER TABLE table_merge_cooldowns
      ALTER COLUMN source_table_session_id SET NOT NULL,
      ALTER COLUMN target_table_session_id SET NOT NULL;
  END IF;

  -- Step 4: drop antigo CHECK (a < b) — bloqueia (X, X→reverso) que aliás
  -- é exatamente o que queremos permitir.
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = (current_schema() || '.table_merge_cooldowns')::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%table_session_a_id < table_session_b_id%'
  ) INTO has_check;
  IF has_check THEN
    EXECUTE format(
      'ALTER TABLE %I.table_merge_cooldowns DROP CONSTRAINT %I',
      current_schema(),
      (SELECT conname FROM pg_constraint
        WHERE conrelid = (current_schema() || '.table_merge_cooldowns')::regclass
          AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%table_session_a_id%')
    );
  END IF;

  -- Step 5: drop UNIQUE (a, b), criar UNIQUE (source, target).
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = (current_schema() || '.table_merge_cooldowns')::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%table_session_a_id, table_session_b_id%'
  ) INTO has_unique_a_b;
  IF has_unique_a_b THEN
    EXECUTE format(
      'ALTER TABLE %I.table_merge_cooldowns DROP CONSTRAINT %I',
      current_schema(),
      (SELECT conname FROM pg_constraint
        WHERE conrelid = (current_schema() || '.table_merge_cooldowns')::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) ILIKE '%table_session_a_id, table_session_b_id%')
    );
  END IF;
END$$;

-- Idempotent constraint creation: ADD CONSTRAINT crasha se já existe.
-- Round 4 §C-NEW-1 fix: round 3 aplicou esta migration manualmente em
-- restaurant_dev então o constraint pode existir antes da runner ser
-- invocada (e o tracker `__migrations__` ainda não conhecer 037).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'table_merge_cooldowns_directional_unique'
       AND conrelid = (current_schema() || '.table_merge_cooldowns')::regclass
  ) THEN
    EXECUTE 'ALTER TABLE table_merge_cooldowns
      ADD CONSTRAINT table_merge_cooldowns_directional_unique
      UNIQUE (source_table_session_id, target_table_session_id)';
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_table_merge_cooldowns_directional
  ON table_merge_cooldowns(source_table_session_id, target_table_session_id, cooldown_expires_at);

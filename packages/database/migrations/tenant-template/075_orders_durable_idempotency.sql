-- Migration 075: idempotência durável para criação de pedidos do cliente.
--
-- O Redis continua sendo usado como lock/cache de curta duração, mas não pode
-- ser a fonte de verdade: a chave expirava após cinco minutos e uma falha no
-- SET pós-commit fazia um retry criar outro pedido. A UNIQUE abaixo garante no
-- próprio commit que uma sessão de mesa nunca grava dois pedidos com a mesma
-- chave, inclusive quando o Redis está indisponível ou reinicia.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint VARCHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'orders_idempotency_pair_check'
       AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_idempotency_pair_check
      CHECK (
        (idempotency_key IS NULL AND idempotency_fingerprint IS NULL)
        OR
        (
          idempotency_key IS NOT NULL
          AND idempotency_fingerprint IS NOT NULL
          AND idempotency_fingerprint ~ '^[0-9a-f]{64}$'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'orders_table_session_idempotency_key_unique'
       AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_table_session_idempotency_key_unique
      UNIQUE (table_session_id, idempotency_key);
  END IF;
END $$;

COMMENT ON COLUMN orders.idempotency_key IS
  'Chave UUID enviada pelo cliente; única dentro da table_session.';
COMMENT ON COLUMN orders.idempotency_fingerprint IS
  'SHA-256 do payload semântico, usado para rejeitar reutilização divergente da chave.';

-- Migration 076: repara tenants que aplicaram uma versão inicial da 075.
--
-- A primeira versão do CHECK não exigia explicitamente fingerprint NOT NULL.
-- Em PostgreSQL, um CHECK cujo resultado é NULL é aceito; portanto uma linha
-- com idempotency_key preenchida e fingerprint NULL atravessava a constraint.
-- Como o runner registra migrations por filename, corrigir apenas a 075 não
-- altera schemas que já a executaram. Esta migration normaliza qualquer dado
-- parcial e recria a constraint com a expressão definitiva.

-- Fingerprint sem chave não tem escopo nem pode ser recuperado pelo serviço.
UPDATE orders
   SET idempotency_fingerprint = NULL
 WHERE idempotency_key IS NULL
   AND idempotency_fingerprint IS NOT NULL;

-- Se uma versão intermediária tiver persistido chave sem fingerprint válido,
-- preserve a barreira contra duplicação. Um hash sentinela determinístico faz
-- o retry falhar fechado como payload divergente, em vez de liberar um segundo
-- pedido. Os writes atuais sempre persistem o fingerprint semântico correto.
UPDATE orders
   SET idempotency_fingerprint =
       md5('idempotency-repair:' || id::text) ||
       md5('idempotency-repair:' || id::text || ':2')
 WHERE idempotency_key IS NOT NULL
   AND (
     idempotency_fingerprint IS NULL
     OR idempotency_fingerprint !~ '^[0-9a-f]{64}$'
   );

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_idempotency_pair_check;

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


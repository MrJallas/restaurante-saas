-- Migration 078: relógio de preparo por item/estação.
--
-- `orders.updated_at` não é relógio (reorder também o altera) e a
-- `order_status_history` registra somente transições do PEDIDO. Em um pedido
-- misto, a primeira estação que começa muda o pedido para `in_progress`; a
-- segunda começa depois sem gerar uma nova transição do pedido. Sem um
-- timestamp no item, portanto, o dashboard não consegue distinguir há quanto
-- tempo cozinha e bar estão realmente trabalhando.
--
-- A coluna é aditiva e nullable: itens que nunca entraram em preparo não
-- inventam um instante. Para itens legacy que já estão `in_progress`, o
-- backfill usa a última entrada conhecida do pedido em `in_progress`; é a
-- melhor evidência histórica disponível. A partir desta migration,
-- `advanceStationItems` grava o instante exato por estação.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS prep_started_at TIMESTAMPTZ;

UPDATE order_items oi
   SET prep_started_at = (
     SELECT MAX(h.created_at)
       FROM order_status_history h
      WHERE h.order_id = oi.order_id
        AND h.to_status = 'in_progress'
   )
 WHERE oi.status = 'in_progress'
   AND oi.prep_started_at IS NULL
   AND EXISTS (
     SELECT 1
       FROM order_status_history h
      WHERE h.order_id = oi.order_id
        AND h.to_status = 'in_progress'
   );

CREATE INDEX IF NOT EXISTS idx_order_items_active_prep_started
  ON order_items (prep_started_at, order_id)
  WHERE status = 'in_progress' AND prep_started_at IS NOT NULL;

COMMENT ON COLUMN order_items.prep_started_at IS
  'Instante em que este line-item entrou em preparo na sua estação; NULL antes do início.';

-- BUG P1 (re-scan OWASP · pedido MISTO comida+bebida): um pedido food+drink
-- compartilhava UM status entre cozinha e bar. Quando o bar marcava a bebida
-- "Pronto", o `orders.status` inteiro virava 'ready' e a comida DESAPARECIA da
-- cozinha sem ter sido preparada. Não existia estado de preparo por item.
--
-- FIX (status por ITEM): esta coluna rastreia o preparo de cada line-item
-- independentemente. O KDS avança os itens DA ESTAÇÃO (cozinha `kind <> 'drink'`
-- / bar `kind = 'drink'`); o `orders.status` só é reconciliado pra 'ready'
-- quando TODOS os itens estão 'ready'. Assim o bar fecha a bebida sem sumir a
-- comida da fila da cozinha.
--
-- Domínio (espelha os estados de preparo da máquina de estados do pedido):
--   received     — na fila, ainda não iniciado
--   in_progress  — em preparo na estação
--   ready        — pronto na estação
-- (não modela in_transit/delivered/cancelled — esses são do PEDIDO, não do
-- preparo por estação.)
--
-- Idempotente e aditiva: NOT NULL com DEFAULT 'received' pra que rows
-- existentes fiquem válidas; o backfill abaixo alinha os itens ao status atual
-- do pedido pra que o read-side per-estação não regrida um pedido já pronto.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'received';

-- Backfill: deriva o status do item do status do pedido pai, UMA vez (só onde
-- ainda está no default). Pedido já entregue/pronto → itens ready; em preparo →
-- in_progress; o resto fica no default 'received'. Idempotente: só toca rows
-- cujo item.status ainda é o default 'received' (não reverte um item já
-- avançado por um run anterior).
UPDATE order_items oi
   SET status = CASE
     WHEN o.status IN ('ready', 'in_transit', 'delivered') THEN 'ready'
     WHEN o.status IN ('in_progress', 'preparing') THEN 'in_progress'
     ELSE 'received'
   END
  FROM orders o
 WHERE oi.order_id = o.id
   AND oi.status = 'received'
   AND o.status IN ('ready', 'in_transit', 'delivered', 'in_progress', 'preparing');

-- Índice pro agregado de reconciliação (COUNT por order_id filtrando status)
-- e pro read-side per-estação que exclui itens já prontos.
CREATE INDEX IF NOT EXISTS idx_order_items_order_status
  ON order_items (order_id, status);

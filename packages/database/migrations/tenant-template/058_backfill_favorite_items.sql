-- Backfill favorite_items for existing customers with order history
-- but favorite_items still at default '[]'. Idempotent.
DO $$
BEGIN
  UPDATE customer_consumption_summary ccs
  SET favorite_items = sub.favorites,
      updated_at = now()
  FROM (
    SELECT customer_id,
           jsonb_agg(
             jsonb_build_object(
               'name', name,
               'category', category,
               'orderCount', order_count,
               'totalQty', total_qty
             ) ORDER BY order_count DESC, total_qty DESC
           ) AS favorites
    FROM (
      SELECT v.customer_id, mi.name, mc.name AS category,
             COUNT(DISTINCT o.id)::int AS order_count,
             SUM(oi.quantity)::int AS total_qty,
             ROW_NUMBER() OVER (
               PARTITION BY v.customer_id
               ORDER BY COUNT(DISTINCT o.id) DESC, SUM(oi.quantity) DESC
             ) AS rn
        FROM orders o
        JOIN visits v ON v.id = o.visit_id
        JOIN order_items oi ON oi.order_id = o.id
        JOIN menu_items mi ON mi.id = oi.menu_item_id
        JOIN menu_categories mc ON mc.id = mi.category_id
       WHERE o.status NOT IN ('cancelled', 'canceled')
       GROUP BY v.customer_id, mi.name, mc.name
    ) ranked
    WHERE rn <= 5
    GROUP BY customer_id
  ) sub
  WHERE ccs.customer_id = sub.customer_id
    AND ccs.favorite_items = '[]'::jsonb;
END $$;

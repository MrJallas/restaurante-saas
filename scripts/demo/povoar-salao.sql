-- Povoa o salao com uma "noite cheia" plausivel para demo ao vivo.
-- Idempotente: limpa o que ele mesmo criou (marcado com o prefixo DEMO) antes de recriar.
-- Reverter: rode só o bloco de limpeza abaixo (os DELETE do começo), que apaga apenas
-- o que este script criou. Para só liberar as mesas: bash scripts/demo/reset-mesa.sh M01
-- (idem M02, M03 e M04).
SET search_path TO restaurant_dev;

BEGIN;

-- ── limpeza do que ESTE script criou antes (nao toca dado real) ─────────────
DELETE FROM order_items WHERE order_id IN (
  SELECT o.id FROM orders o JOIN table_sessions ts ON ts.id = o.table_session_id
   WHERE ts.id::text LIKE 'de300000-%');
DELETE FROM orders WHERE table_session_id::text LIKE 'de300000-%';
DELETE FROM waiter_calls WHERE table_session_id::text LIKE 'de300000-%';
DELETE FROM session_participants WHERE table_session_id::text LIKE 'de300000-%';
DELETE FROM table_sessions WHERE id::text LIKE 'de300000-%';
DELETE FROM customers WHERE id::text LIKE 'de400000-%';

-- ── clientes da noite ───────────────────────────────────────────────────────
INSERT INTO customers (id, name, cpf) VALUES
  ('de400000-0000-4000-8000-000000000001','Marina Alves','30111222333'),
  ('de400000-0000-4000-8000-000000000002','Rafael Souza','30111222334'),
  ('de400000-0000-4000-8000-000000000003','Juliana Costa','30111222335'),
  ('de400000-0000-4000-8000-000000000004','Pedro Henrique','30111222336'),
  ('de400000-0000-4000-8000-000000000005','Camila Nunes','30111222337');

-- ── mesas ocupadas (M01 a M04) ──────────────────────────────────────────────
INSERT INTO table_sessions (id, table_id, status, host_customer_id, created_at)
SELECT ('de300000-0000-4000-8000-00000000000'||n)::uuid, t.id, 'active', c.id, now() - (i||' minutes')::interval
  FROM (VALUES
    ('1','M01','de400000-0000-4000-8000-000000000001',52),
    ('2','M02','de400000-0000-4000-8000-000000000002',34),
    ('3','M03','de400000-0000-4000-8000-000000000003',18),
    ('4','M04','de400000-0000-4000-8000-000000000004',7)
  ) AS v(n, code, cust, i)
  JOIN tables t ON t.code = v.code
  JOIN customers c ON c.id = v.cust::uuid;

-- participantes aprovados (o host + um acompanhante na M01)
INSERT INTO session_participants (table_session_id, customer_id, color_index, status)
VALUES
  ('de300000-0000-4000-8000-000000000001','de400000-0000-4000-8000-000000000001',0,'approved'),
  ('de300000-0000-4000-8000-000000000001','de400000-0000-4000-8000-000000000005',1,'approved'),
  ('de300000-0000-4000-8000-000000000002','de400000-0000-4000-8000-000000000002',0,'approved'),
  ('de300000-0000-4000-8000-000000000003','de400000-0000-4000-8000-000000000003',0,'approved'),
  ('de300000-0000-4000-8000-000000000004','de400000-0000-4000-8000-000000000004',0,'approved');

-- ── pedidos em estagios diferentes, para a cozinha e o bar terem o que mostrar ──
-- M01: em preparo ha 12 min (aparece no KDS como ativo)
-- M02: pronto, esperando o garcom levar
-- M03: acabou de entrar (card novo piscando na cozinha)
-- M04: bebidas no bar
INSERT INTO orders (id, table_session_id, billing_mode, status, total_cents, created_by, created_at, updated_at, priority_rank)
VALUES
  ('de500000-0000-4000-8000-000000000001','de300000-0000-4000-8000-000000000001','table','in_progress',0,'customer', now() - interval '12 minutes', now() - interval '12 minutes',0),
  ('de500000-0000-4000-8000-000000000002','de300000-0000-4000-8000-000000000002','table','ready',0,'customer', now() - interval '9 minutes', now() - interval '2 minutes',0),
  ('de500000-0000-4000-8000-000000000003','de300000-0000-4000-8000-000000000003','table','received',0,'customer', now() - interval '2 minutes', now() - interval '2 minutes',0),
  ('de500000-0000-4000-8000-000000000004','de300000-0000-4000-8000-000000000004','table','in_progress',0,'customer', now() - interval '4 minutes', now() - interval '4 minutes',0);

-- itens: comida vai pro KDS da cozinha, bebida vai pro bar
INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents, status, prep_started_at)
SELECT v.order_id::uuid, mi.id, v.qty, mi.price_cents, mi.price_cents * v.qty, v.st,
       CASE WHEN v.st = 'in_progress' THEN now() - (v.mins||' minutes')::interval ELSE NULL END
  FROM (VALUES
    ('de500000-0000-4000-8000-000000000001','Picanha na Brasa',    2,'in_progress',12),
    ('de500000-0000-4000-8000-000000000001','Risoto de Funghi',    1,'in_progress',12),
    ('de500000-0000-4000-8000-000000000002','Salmao Grelhado',     2,'ready',0),
    ('de500000-0000-4000-8000-000000000003','Bolinho de Bacalhau', 1,'pending',0),
    ('de500000-0000-4000-8000-000000000004','Caipirinha',          3,'in_progress',4)
  ) AS v(order_id, item_name, qty, st, mins)
  JOIN menu_items mi ON mi.name = v.item_name
 WHERE mi.id IS NOT NULL;

-- total de cada pedido a partir dos itens
UPDATE orders o SET total_cents = COALESCE((
  SELECT SUM(oi.subtotal_cents) FROM order_items oi WHERE oi.order_id = o.id), 0)
 WHERE o.id::text LIKE 'de500000-%';

-- ── um chamado de garcom aberto (a M03 quer fazer o pedido) ─────────────────
INSERT INTO waiter_calls (table_session_id, status, reason, created_at)
VALUES ('de300000-0000-4000-8000-000000000003','pending','fazer_pedido', now() - interval '3 minutes');

COMMIT;

\echo ''
\echo '--- salao povoado ---'
SELECT 'mesas ocupadas: '||count(*) FROM table_sessions WHERE status='active';
SELECT 'pedidos abertos: '||count(*) FROM orders WHERE status NOT IN ('delivered','cancelled');
SELECT 'itens na cozinha/bar: '||count(*) FROM order_items WHERE status IN ('pending','in_progress','ready');
SELECT 'chamados abertos: '||count(*) FROM waiter_calls WHERE status='pending';

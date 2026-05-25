-- Demo data for restaurant_dev tenant (idempotent-ish; wipes prior demo items)
-- Run with:
--   docker compose exec -T postgres psql -U postgres -p 5434 -d restaurant_saas \
--     -v ON_ERROR_STOP=1 -c "SET search_path = restaurant_dev" -f /dev/stdin < demo_data.sql
--
-- Prereq (public schema): make sure a plan and the tenant row exist:
--   INSERT INTO public.plans (name, description, price_cents, features, max_tables, max_staff, max_ai_messages_per_day)
--     VALUES ('Starter','Plano demo',0,'{}'::jsonb,20,10,500)
--     ON CONFLICT DO NOTHING;
--   INSERT INTO public.restaurants (slug, schema_name, name, plan_id, owner_email, owner_name)
--     VALUES ('restaurant_dev','restaurant_dev','Restaurante Demo',
--             (SELECT id FROM public.plans LIMIT 1),'demo@demo.com','Demo Owner')
--     ON CONFLICT DO NOTHING;

-- === Clean previous demo content (keep schema/categories/settings) ===
-- Order matters for FK integrity: children first, parents last.
-- New feature tables (Phase-1): clean before parents.
DELETE FROM session_flags WHERE TRUE;
DELETE FROM staff_messages WHERE TRUE;
DELETE FROM staff_message_thread_participants WHERE TRUE;
DELETE FROM staff_message_threads WHERE TRUE;
DELETE FROM complaints WHERE TRUE;
DELETE FROM order_ratings WHERE TRUE;
DELETE FROM table_merge_cooldowns WHERE TRUE;
DELETE FROM table_merge_requests WHERE TRUE;
DELETE FROM scan_verification_requests WHERE TRUE;
DELETE FROM table_qr_releases WHERE TRUE;
DELETE FROM late_arrival_requests WHERE TRUE;
DELETE FROM escalation_chains WHERE TRUE;
DELETE FROM lgpd_requests WHERE TRUE;
DELETE FROM zone_pauses WHERE TRUE;

DELETE FROM order_item_extras;
DELETE FROM order_items;
DELETE FROM order_status_history;
DELETE FROM order_deliveries;
DELETE FROM orders;
DELETE FROM feedbacks;
DELETE FROM assistant_messages;
DELETE FROM waiter_calls;
DELETE FROM payments;
DELETE FROM visits;
DELETE FROM session_participants;
DELETE FROM table_sessions;
DELETE FROM customer_consumption_summary;
DELETE FROM customers;
DELETE FROM menu_item_extras;
DELETE FROM menu_items;
-- Reset tables.zone_id before deleting zones to avoid FK violation.
UPDATE tables SET zone_id = NULL WHERE zone_id IS NOT NULL;
DELETE FROM zones WHERE TRUE;
DELETE FROM tables;
DELETE FROM staff;
DELETE FROM promotions;

-- === Tables ===
INSERT INTO tables (code, label, capacity, sort_order) VALUES
  ('M01', 'Mesa 01', 2, 1),
  ('M02', 'Mesa 02', 4, 2),
  ('M03', 'Mesa 03', 4, 3),
  ('M04', 'Mesa 04', 6, 4),
  ('M05', 'Mesa 05 (Varanda)', 4, 5);

-- Fixed physical QR tables used by automated and manual QR-entry tests.
-- They intentionally use high table numbers so host endpoints that receive
-- numeric table refs do not collide with M01-M05.
INSERT INTO tables (
  code,
  label,
  qr_hmac_secret,
  qr_public_token,
  capacity,
  sort_order
) VALUES
  (
    'QRTEST91',
    'QR Teste 91',
    'qrtest91-secret-fixed',
    'qrtest91-public-token-fixed',
    2,
    91
  ),
  (
    'QRTEST92',
    'QR Teste 92',
    'qrtest92-secret-fixed',
    'qrtest92-public-token-fixed',
    2,
    92
  );

-- === Staff (PIN 1234 everywhere = sha256) ===
-- sha256('1234') = 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4
INSERT INTO staff (name, role, pin_hash, is_active) VALUES
  ('Ana Garcom',       'waiter',  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', true),
  ('Bruno Garcom',     'waiter',  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', true),
  ('Carlos Cozinha',   'cook',    '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', true),
  ('Diana Cozinha',    'cook',    '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', true),
  ('Erica Gerente',    'manager', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', true);

-- === Menu items ===
-- (category ids from default_categories seed; fetch by name)
INSERT INTO menu_items (category_id, name, short_description, long_description, price_cents, tags, ingredients, prep_time_minutes, is_featured, sort_order)
SELECT c.id, 'Bruschetta de Tomate', 'Pao italiano com tomate e manjericao',
       'Fatias de pao italiano tostadas cobertas com tomate fresco, manjericao e azeite extra virgem.',
       1890, ARRAY['vegetariano'], ARRAY['pao','tomate','manjericao','azeite'], 10, true, 1
FROM menu_categories c WHERE c.name = 'Entradas';

INSERT INTO menu_items (category_id, name, short_description, long_description, price_cents, tags, ingredients, prep_time_minutes, sort_order)
SELECT c.id, 'Bolinho de Bacalhau', '6 unidades, crocante por fora',
       'Bolinhos tradicionais portugueses de bacalhau com batata, servidos com molho tartaro.',
       2490, ARRAY['peixe'], ARRAY['bacalhau','batata','ovo','cebola'], 15, 2
FROM menu_categories c WHERE c.name = 'Entradas';

INSERT INTO menu_items (category_id, name, short_description, long_description, price_cents, tags, allergens, ingredients, prep_time_minutes, is_featured, sort_order)
SELECT c.id, 'Picanha na Brasa', '300g com arroz, farofa e vinagrete',
       'Picanha nobre grelhada na brasa, servida com arroz branco, farofa de ovo e vinagrete.',
       7890, ARRAY['carne','tradicional'], ARRAY[]::text[], ARRAY['picanha','arroz','farinha','tomate','cebola'], 25, true, 1
FROM menu_categories c WHERE c.name = 'Pratos Principais';

INSERT INTO menu_items (category_id, name, short_description, long_description, price_cents, tags, ingredients, prep_time_minutes, is_day_special, sort_order)
SELECT c.id, 'Risoto de Funghi', 'Arroz arboreo com mix de cogumelos',
       'Risoto cremoso de arroz arboreo com mix de cogumelos frescos, parmesao e um toque de trufa.',
       5490, ARRAY['vegetariano'], ARRAY['arroz','funghi','parmesao','manteiga'], 20, true, 2
FROM menu_categories c WHERE c.name = 'Pratos Principais';

INSERT INTO menu_items (category_id, name, short_description, long_description, price_cents, tags, allergens, ingredients, prep_time_minutes, sort_order)
SELECT c.id, 'Salmao Grelhado', 'Filet 220g com legumes',
       'Filet de salmao grelhado no ponto com mix de legumes salteados e purê de batata doce.',
       6890, ARRAY['peixe','saudavel'], ARRAY['peixe'], ARRAY['salmao','legumes','batata doce'], 18, 3
FROM menu_categories c WHERE c.name = 'Pratos Principais';

INSERT INTO menu_items (category_id, name, short_description, price_cents, tags, ingredients, prep_time_minutes, sort_order, kind)
SELECT c.id, 'Suco de Laranja', 'Natural, 400ml', 1290, ARRAY['natural','sem-alcool'], ARRAY['laranja'], 3, 1, 'drink'
FROM menu_categories c WHERE c.name = 'Bebidas';

INSERT INTO menu_items (category_id, name, short_description, price_cents, tags, ingredients, prep_time_minutes, sort_order, kind)
SELECT c.id, 'Caipirinha', 'Cachaca, limao e acucar', 1990, ARRAY['alcoolico','classico'], ARRAY['cachaca','limao','acucar'], 5, 2, 'drink'
FROM menu_categories c WHERE c.name = 'Bebidas';

INSERT INTO menu_items (category_id, name, short_description, price_cents, tags, ingredients, prep_time_minutes, sort_order, kind)
SELECT c.id, 'Agua Mineral', 'Com ou sem gas, 500ml', 790, ARRAY['sem-alcool'], ARRAY['agua'], 1, 3, 'drink'
FROM menu_categories c WHERE c.name = 'Bebidas';

INSERT INTO menu_items (category_id, name, short_description, long_description, price_cents, tags, allergens, ingredients, prep_time_minutes, is_featured, sort_order)
SELECT c.id, 'Pudim da Casa', 'Calda caramelizada', 'Pudim de leite condensado tradicional com calda caramelizada na hora.',
       1590, ARRAY['classico','doce'], ARRAY['leite','ovo'], ARRAY['leite condensado','ovo','acucar'], 5, true, 1
FROM menu_categories c WHERE c.name = 'Sobremesas';

INSERT INTO menu_items (category_id, name, short_description, price_cents, tags, ingredients, prep_time_minutes, sort_order)
SELECT c.id, 'Brownie com Sorvete', 'Chocolate quente + baunilha', 1890, ARRAY['doce','quente'], ARRAY['chocolate','sorvete'], 8, 2
FROM menu_categories c WHERE c.name = 'Sobremesas';

-- === Promotions ===
INSERT INTO promotions (title, description, discount_type, discount_value, min_order_cents, valid_until, is_active) VALUES
  ('Happy Hour 20% OFF', 'Descontao em bebidas de 17h as 19h', 'percentage', 20, NULL, now() + interval '60 days', true),
  ('Combo Almoco', 'R$ 10 off em pedidos acima de R$ 80',      'fixed',      1000, 8000, now() + interval '30 days', true),
  ('Sobremesa Gratis', 'Promocao encerrada',                    'percentage', 100, NULL, now() - interval '7 days',  false);

-- === Historical orders for last 7 days (for dashboard chart) ===
-- Create one table_session + visit + 2-3 orders per day
DO $$
DECLARE
  t_id UUID;
  s_id UUID;
  v_id UUID;
  o_id UUID;
  day_offset INT;
  picanha UUID := (SELECT id FROM menu_items WHERE name = 'Picanha na Brasa');
  risoto  UUID := (SELECT id FROM menu_items WHERE name = 'Risoto de Funghi');
  salmao  UUID := (SELECT id FROM menu_items WHERE name = 'Salmao Grelhado');
  suco    UUID := (SELECT id FROM menu_items WHERE name = 'Suco de Laranja');
  caipi   UUID := (SELECT id FROM menu_items WHERE name = 'Caipirinha');
  pudim   UUID := (SELECT id FROM menu_items WHERE name = 'Pudim da Casa');
BEGIN
  FOR day_offset IN 0..6 LOOP
    SELECT id INTO t_id FROM tables ORDER BY random() LIMIT 1;

    INSERT INTO table_sessions (table_id, status, created_at, closed_at, updated_at)
    VALUES (t_id, 'closed', now() - (day_offset || ' days')::interval,
            now() - (day_offset || ' days')::interval + interval '2 hours',
            now() - (day_offset || ' days')::interval + interval '2 hours')
    RETURNING id INTO s_id;

    INSERT INTO visits (table_session_id, feedback_given, created_at)
    VALUES (s_id, true, now() - (day_offset || ' days')::interval)
    RETURNING id INTO v_id;

    -- Order 1 (picanha + suco)
    INSERT INTO orders (table_session_id, visit_id, billing_mode, status, total_cents, created_at, updated_at)
    VALUES (s_id, v_id, 'table', 'delivered', 9180,
            now() - (day_offset || ' days')::interval + interval '15 minutes',
            now() - (day_offset || ' days')::interval + interval '45 minutes')
    RETURNING id INTO o_id;
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents)
    VALUES (o_id, picanha, 1, 7890, 7890),
           (o_id, suco,    1, 1290, 1290);

    -- Order 2 (risoto + caipi)
    INSERT INTO orders (table_session_id, visit_id, billing_mode, status, total_cents, created_at, updated_at)
    VALUES (s_id, v_id, 'table', 'delivered', 7480,
            now() - (day_offset || ' days')::interval + interval '20 minutes',
            now() - (day_offset || ' days')::interval + interval '50 minutes')
    RETURNING id INTO o_id;
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents)
    VALUES (o_id, risoto, 1, 5490, 5490),
           (o_id, caipi,  1, 1990, 1990);

    -- Order 3 on some days (salmao + pudim)
    IF day_offset % 2 = 0 THEN
      INSERT INTO orders (table_session_id, visit_id, billing_mode, status, total_cents, created_at, updated_at)
      VALUES (s_id, v_id, 'individual', 'delivered', 8480,
              now() - (day_offset || ' days')::interval + interval '30 minutes',
              now() - (day_offset || ' days')::interval + interval '60 minutes')
      RETURNING id INTO o_id;
      INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents)
      VALUES (o_id, salmao, 1, 6890, 6890),
             (o_id, pudim,  1, 1590, 1590);
    END IF;

    -- Feedback
    INSERT INTO feedbacks (visit_id, overall_rating, food_rating, service_rating, ambience_rating, comment, created_at)
    VALUES (v_id, 4 + (day_offset % 2), 5, 4, 5,
            CASE WHEN day_offset = 0 THEN 'Otima comida e atendimento!' ELSE NULL END,
            now() - (day_offset || ' days')::interval + interval '90 minutes');
  END LOOP;
END $$;

-- === Sample AI assistant messages ===
INSERT INTO assistant_messages (table_session_id, user_message, assistant_response, model_used, provider_used, tokens_in, tokens_out, estimated_cost_cents, latency_ms, was_blocked, created_at)
SELECT ts.id, 'O que voces tem de vegetariano?',
       'Temos a Bruschetta de Tomate (R$ 18,90) de entrada e o Risoto de Funghi (R$ 54,90) como prato principal.',
       'gpt-4o', 'openai', 45, 32, 1, 420, false, now() - interval '2 days'
FROM table_sessions ts LIMIT 1;

INSERT INTO assistant_messages (table_session_id, user_message, assistant_response, model_used, provider_used, tokens_in, tokens_out, estimated_cost_cents, latency_ms, was_blocked, block_reason, created_at)
SELECT ts.id, 'Qual a senha do wifi de voces?',
       NULL, 'gpt-4o-mini', 'openai', 20, 0, 0, 180, true, 'off_topic', now() - interval '1 day'
FROM table_sessions ts LIMIT 1;

-- === Demo customers (incl. 2 VIPs) + late-arrival + escalation chain ===
-- Insere alguns customers sinteticos pra exercitar os fluxos novos.
INSERT INTO customers (name, cpf, total_visits, last_visit_at, is_vip, preferences) VALUES
  ('Mariana VIP',  '11122233344', 12, now() - interval '3 days', true,  '{"favorite_drink":"caipi"}'::jsonb),
  ('Joao VIP',     '22233344455', 18, now() - interval '1 days', true,  '{"allergies":["camarao"]}'::jsonb),
  ('Pedro Cliente','33344455566',  3, now() - interval '7 days', false, '{}'::jsonb);

-- Late-arrival request fulfilled (aprovado pelo manager Erica).
DO $$
DECLARE
  cust_id UUID := (SELECT id FROM customers WHERE cpf = '33344455566');
  manager_id UUID := (SELECT id FROM staff WHERE name = 'Erica Gerente');
  ts_id UUID;
  v_id UUID;
  late_id UUID;
  chain_id UUID;
BEGIN
  -- Pega uma table_session existente (criadas nos historical orders) pra
  -- amarrar o late-arrival request.
  SELECT id INTO ts_id FROM table_sessions ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO v_id FROM visits WHERE table_session_id = ts_id LIMIT 1;

  IF ts_id IS NOT NULL THEN
    -- Chain ja completada (low priority demo).
    INSERT INTO escalation_chains (
      kind, source_id, level, escalated_at, current_assignee_role,
      ttl_expires_at, completed_at, resolution_notes
    ) VALUES (
      'late_arrival', gen_random_uuid(), 1, now() - interval '2 hours', 'manager',
      now() - interval '90 minutes', now() - interval '85 minutes',
      'Approved by manager (demo seed)'
    ) RETURNING id INTO chain_id;

    -- O `source_id` da chain a gente atualiza apos criar o request.
    INSERT INTO late_arrival_requests (
      visit_id, table_session_id, customer_id, requested_at,
      expected_arrival_at, status, approved_by_staff_id, decided_at,
      escalation_level, escalation_chain_id, ttl_expires_at, message
    ) VALUES (
      v_id, ts_id, cust_id, now() - interval '2 hours',
      now() - interval '1 hour', 'approved', manager_id, now() - interval '85 minutes',
      1, chain_id, now() - interval '90 minutes', 'Demo: chego 30min atrasado'
    ) RETURNING id INTO late_id;

    -- Aponta a chain pro request criado.
    UPDATE escalation_chains SET source_id = late_id WHERE id = chain_id;
  END IF;
END $$;

-- Summary
SELECT 'menu_items' AS entity, count(*) FROM menu_items
UNION ALL SELECT 'tables', count(*) FROM tables
UNION ALL SELECT 'staff', count(*) FROM staff
UNION ALL SELECT 'promotions', count(*) FROM promotions
UNION ALL SELECT 'orders', count(*) FROM orders
UNION ALL SELECT 'feedbacks', count(*) FROM feedbacks
UNION ALL SELECT 'assistant_messages', count(*) FROM assistant_messages
UNION ALL SELECT 'customers_vip', count(*) FROM customers WHERE is_vip = true
UNION ALL SELECT 'late_arrival_requests', count(*) FROM late_arrival_requests
UNION ALL SELECT 'escalation_chains', count(*) FROM escalation_chains;

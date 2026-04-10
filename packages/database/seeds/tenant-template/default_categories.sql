INSERT INTO menu_categories (name, description, sort_order) VALUES
  ('Entradas', 'Pratos para abrir o apetite', 1),
  ('Pratos Principais', 'Nossos pratos mais completos', 2),
  ('Bebidas', 'Sucos, refrigerantes, drinks e mais', 3),
  ('Sobremesas', 'Para fechar com chave de ouro', 4)
ON CONFLICT DO NOTHING;

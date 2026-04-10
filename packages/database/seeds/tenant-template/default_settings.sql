INSERT INTO settings (restaurant_name, color_primary, color_secondary, color_accent, font_hero, font_body, timezone, currency, max_ai_messages_per_session)
VALUES ('Meu Restaurante', '#1a1a2e', '#16213e', '#e94560', 'Inter', 'Inter', 'America/Sao_Paulo', 'BRL', 20)
ON CONFLICT DO NOTHING;

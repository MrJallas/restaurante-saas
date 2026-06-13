-- Migration 056: tempo de preparo base configurável pela cozinha.
--
-- Decisão Caleb 2026-06-10 (pergunta 9): o líder da cozinha configura em
-- /cozinha/eu o tempo de espera base do cliente; o motor de ETA
-- (orders.service) parte desse range e ajusta dinamicamente com a fila
-- (urgência > VIP > normal ÷ linhas paralelas) e com o estágio do pedido.
-- NULL = usa os defaults do código (10–16 min).
--
-- Idempotente (padrão migration 037): IF NOT EXISTS protege re-run via
-- migrate-tenants.ts em tenants existentes.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS kitchen_eta_min_minutes SMALLINT,
  ADD COLUMN IF NOT EXISTS kitchen_eta_max_minutes SMALLINT;

COMMENT ON COLUMN settings.kitchen_eta_min_minutes IS
  'Tempo mínimo base de preparo (min) configurado pela cozinha. NULL = default do código.';
COMMENT ON COLUMN settings.kitchen_eta_max_minutes IS
  'Tempo máximo base de preparo (min) configurado pela cozinha. NULL = default do código.';

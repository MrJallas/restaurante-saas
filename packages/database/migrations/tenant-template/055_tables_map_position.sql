-- Migration 055: posição das mesas na planta do salão.
--
-- O mapa de orientação do garçom (tela /waiter/entrega, prompt 99 §6) e os
-- futuros mapas de mesas de gerente/recepção (§1) precisam de geometria
-- real — até aqui só existia zona (varanda/salão), sem posição.
--
-- map_x/map_y são coordenadas de grade lógica (inteiros pequenos, origem
-- no canto superior-esquerdo; o FE normaliza pra % do canvas). Nullable:
-- mesa sem posição cai no fallback de grade por zona no FE. Edição pelo
-- dono/gerente vem no bloco de configuração (§1/§7) — por ora as posições
-- entram via seed/SQL operacional.
--
-- Idempotente (padrão migration 037): IF NOT EXISTS protege re-run via
-- migrate-tenants.ts em tenants existentes.

ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS map_x SMALLINT,
  ADD COLUMN IF NOT EXISTS map_y SMALLINT;

COMMENT ON COLUMN tables.map_x IS
  'Coluna lógica da mesa na planta do salão (0 = esquerda). NULL = sem posição.';
COMMENT ON COLUMN tables.map_y IS
  'Linha lógica da mesa na planta do salão (0 = topo). NULL = sem posição.';

-- Migration 038: UNIQUE constraint pra prevenir double-claim em order_deliveries.
--
-- Round 5 (B-NEW-13). Antes: schema 009_create_deliveries.sql sem
-- restrição em `order_id` permitia 2 garçons fazerem claim simultâneo
-- no mesmo pedido — TOCTOU clássico (SELECT existingClaim → ambos vazios
-- → ambos INSERT). Result: 2 rows ativos, garçom A entrega, B fica
-- confuso e até marca delivered também (status history corrompido).
--
-- Fix: partial UNIQUE em (order_id) WHERE status != 'cancelled' — Postgres
-- rejeita o segundo INSERT com erro 23505. Service captura e retorna
-- "ja reivindicado".
--
-- Idempotente — se rodar em schema com index já criado, NOOP.

CREATE UNIQUE INDEX IF NOT EXISTS deliveries_active_claim_unique
  ON order_deliveries (order_id)
  WHERE status != 'cancelled';

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

-- DEDUPE antes do índice (padrão canônico 057/063/064): um tenant legado que
-- JÁ sofreu o double-claim que este índice fecha tem >1 delivery ativo por
-- order. Sem este prólogo, o CREATE UNIQUE INDEX estouraria unique_violation
-- (23505) e — como migration é FATAL no boot — a API não subiria nesse tenant.
-- Mantém o claim ativo MAIS RECENTE por order e rebaixa os demais para
-- 'cancelled' (fora do índice parcial WHERE status != 'cancelled', logo não
-- colidem). Idempotente: roda 0 linhas se já limpo.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY order_id
           ORDER BY claimed_at DESC NULLS LAST, created_at DESC, id DESC
         ) AS rn
    FROM order_deliveries
   WHERE status != 'cancelled'
)
UPDATE order_deliveries d
   SET status = 'cancelled'
  FROM ranked r
 WHERE d.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS deliveries_active_claim_unique
  ON order_deliveries (order_id)
  WHERE status != 'cancelled';

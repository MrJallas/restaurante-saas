-- Round 16 (B-NEW-51): UNIQUE INDEX em feedbacks(visit_id) pra fechar
-- race condition. Antes service.submitFeedback fazia SELECT-then-INSERT
-- (linha 22-29 de feedbacks.service.ts) — 2 requests concorrentes com
-- mesmo visit_id ambos viam empty SELECT, ambos INSERTavam, audit ficava
-- com 2 feedbacks pra mesma visita. Agora PG rejeita o segundo com
-- unique_violation (23505) e service traduz pra BadRequest amigável.
--
-- Idempotente: index só cria se não existir. visit_id NULL (anonymous
-- feedback) cai no WHERE visit_id IS NOT NULL e não conflita.

-- DEDUPE antes do índice (padrão canônico 057/063/064): um tenant legado que
-- JÁ sofreu a corrida que este índice fecha tem >1 feedback pra mesmo
-- visit_id. Sem este prólogo, o CREATE UNIQUE INDEX estouraria unique_violation
-- (23505) e — como migration é FATAL no boot — a API não subiria nesse tenant.
-- Mantém o feedback MAIS RECENTE por visit_id e apaga os demais. feedbacks é
-- folha (nenhum FK aponta pra feedbacks.id → DELETE é seguro). Só considera
-- visit_id NOT NULL — os anônimos (visit_id IS NULL) ficam fora do índice
-- parcial e nunca colidem. Idempotente: roda 0 linhas se já limpo.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY visit_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM feedbacks
   WHERE visit_id IS NOT NULL
)
DELETE FROM feedbacks f
 USING ranked r
 WHERE f.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS feedbacks_visit_id_unique
  ON feedbacks(visit_id)
  WHERE visit_id IS NOT NULL;

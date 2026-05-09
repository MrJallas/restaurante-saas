-- Round 16 (B-NEW-51): UNIQUE INDEX em feedbacks(visit_id) pra fechar
-- race condition. Antes service.submitFeedback fazia SELECT-then-INSERT
-- (linha 22-29 de feedbacks.service.ts) — 2 requests concorrentes com
-- mesmo visit_id ambos viam empty SELECT, ambos INSERTavam, audit ficava
-- com 2 feedbacks pra mesma visita. Agora PG rejeita o segundo com
-- unique_violation (23505) e service traduz pra BadRequest amigável.
--
-- Idempotente: index só cria se não existir. visit_id NULL (anonymous
-- feedback) cai no WHERE visit_id IS NOT NULL e não conflita.
CREATE UNIQUE INDEX IF NOT EXISTS feedbacks_visit_id_unique
  ON feedbacks(visit_id)
  WHERE visit_id IS NOT NULL;

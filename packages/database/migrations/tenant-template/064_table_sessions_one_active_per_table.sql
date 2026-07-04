-- 064 (re-scan P1-O, data-integrity): no máximo 1 sessão ATIVA por mesa.
--
-- Bug: o complete de um table_swap_request fazia
-- `UPDATE table_sessions SET table_id = <destino> WHERE id = <origem>` sem
-- guard nenhum. O destino-livre só era checado na CRIAÇÃO do swap; entre
-- criar e completar, o cliente escaneava a mesa destino e abria uma 2ª sessão
-- ativa nela. O move então deixava origem+destino ativas na MESMA mesa —
-- comanda compartilhada furada, dois grupos vendo o pedido um do outro.
-- A camada de aplicação já ganhou re-check + guard transacional; este índice
-- é a rede de segurança no nível do banco: impede 2 ativas por mesa mesmo sob
-- qualquer corrida ou caminho futuro.
--
-- Caminho feliz preservado: o scan/welcome insere UMA sessão ativa por mesa
-- sob `SELECT ... FROM tables ... FOR UPDATE` + check de ativa existente
-- (table-session.service.ts) — uma mesa livre → uma sessão. Sessões fechadas
-- (status='closed') não entram no índice (WHERE parcial), então o histórico de
-- mesas reusadas nunca colide.

-- DEDUPE defensivo antes do índice: ambientes antigos podem JÁ ter >1 sessão
-- ativa por mesa (exatamente a corrida que este índice fecha). Sem isto, o
-- CREATE UNIQUE INDEX falharia com unique_violation e — como migration é FATAL
-- no boot — a API não subiria nesse tenant. Mantém a sessão ativa MAIS RECENTE
-- por mesa e fecha as demais com a semântica canônica (status='closed' +
-- closed_at + closed_by). Idempotente: roda 0 linhas se já limpo.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY table_id ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM table_sessions
   WHERE status = 'active'
)
UPDATE table_sessions ts
   SET status     = 'closed',
       closed_at  = COALESCE(ts.closed_at, now()),
       closed_by  = COALESCE(ts.closed_by, 'migration_064_dedupe'),
       updated_at = now()
  FROM ranked r
 WHERE ts.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS table_sessions_one_active_per_table
  ON table_sessions (table_id)
  WHERE status = 'active';

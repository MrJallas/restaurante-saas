-- 067 (re-scan #8, P1 retry-safety): no máximo 1 request 'pending' por par
-- DIRECIONAL (source, target) em table_merge_requests.
--
-- Bug: POST /:slug/table-merge-requests não era idempotente.
-- TableMergeService.createRequest() fazia INSERT cru de status='pending'
-- checando SÓ cooldown (que só existe DEPOIS de uma rejeição). Sem guard
-- contra um 'pending' já vivo pro mesmo (source_table_session_id,
-- target_table_session_id) e sem UNIQUE parcial — as migs 025/036 só têm
-- índices NÃO-únicos, e o UNIQUE de 037 é em table_merge_cooldowns, não em
-- requests. Repro: o cliente guarda o submit com `salonSubmitting` mas libera
-- no finally; timeout de 15s do api() ou reconexão → re-submit → 2+
-- table_merge_requests 'pending' pro mesmo par, cada um emitindo
-- emitTableMergeCreated ao host de destino (N cards de aprovação). O host
-- aprova um; os outros ficam órfãos 'pending' até o TTL.
--
-- Fix (mesma classe do order-retry / waiter-calls / deliveries 038): partial
-- UNIQUE em (source_table_session_id, target_table_session_id) WHERE
-- status='pending'. O service ganhou INSERT ... ON CONFLICT DO NOTHING que,
-- em conflito, retorna a request 'pending' já existente (idempotência).
--
-- Direção do par: o modelo de merge é DIRECIONAL (source→target), igual ao
-- cooldown de 037 ("caminho reverso continua aberto · a M15 mudou de ideia").
-- Logo o UNIQUE é em (source, target) exatamente — B→A é uma request distinta
-- e legítima, NÃO colide com A→B. Só o RETRY na MESMA direção é deduplicado.
--
-- Idempotente (IF NOT EXISTS) — aceita re-run em schemas que já tenham o
-- índice.

-- DEDUPE defensivo antes do índice (padrão canônico 038/064/065): um tenant
-- que JÁ sofreu o double-submit que este índice fecha tem >1 request 'pending'
-- pro mesmo par direcional. Sem este prólogo, o CREATE UNIQUE INDEX estouraria
-- unique_violation (23505) e — como migration é FATAL no boot — a API não
-- subiria nesse tenant. Mantém o 'pending' MAIS RECENTE por par e expira os
-- demais (status='expired' + decided_at), tirando-os do índice parcial WHERE
-- status='pending'. Idempotente: roda 0 linhas se já limpo.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY source_table_session_id, target_table_session_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM table_merge_requests
   WHERE status = 'pending'
)
UPDATE table_merge_requests mr
   SET status     = 'expired',
       decided_at = COALESCE(mr.decided_at, now()),
       updated_at = now()
  FROM ranked r
 WHERE mr.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS table_merge_requests_one_pending_per_pair
  ON table_merge_requests (source_table_session_id, target_table_session_id)
  WHERE status = 'pending';

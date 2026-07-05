-- Migration 066: no máximo 1 late_arrival_request PENDING por
-- (table_session_id, customer_id). Rede de segurança no nível do banco pro
-- retry-safety do POST /:slug/late-arrival-requests (re-scan #8, P1).
--
-- BUG: LateArrivalService.create() fazia INSERT cru em late_arrival_requests
-- (status='pending') numa tx que TAMBÉM cria uma escalation_chains nova, SEM
-- dedup por (customer_id, table_session_id, status='pending'). A migration 024
-- só tem índices NÃO-únicos. O POST não é idempotente: o guard `submitting` do
-- ScreenCustomerIdentifyBeforeJoin.tsx só bloqueia double-tap síncrono, mas o
-- api() usa AbortSignal.timeout(15s) e o catch libera o botão — se o servidor
-- commitou mas a resposta passou de 15s, o cliente re-submete → N requests
-- 'pending' + N escalation_chains pro MESMO joiner. O host vê N prompts
-- idênticos e cada chain escala independente pro gerente (spam).
--
-- FIX (mesma classe do order-retry / waiter-calls / mig 057): UNIQUE parcial
-- em (table_session_id, customer_id) WHERE status='pending'. A camada de
-- aplicação ganhou INSERT ... ON CONFLICT ... DO NOTHING + fallback pro request
-- 'pending' existente (sem 2ª chain); este índice é a garantia sob corrida.
--
-- Caminho feliz preservado: 1 joiner → 1 request 'pending' → 1 chain. Assim que
-- o host DECIDE (approved/rejected/expired) a linha SAI do índice parcial, então
-- o MESMO joiner pode reabrir um novo pedido depois — o UNIQUE só cobre o estado
-- 'pending' vivo, nunca o histórico.

-- DEDUPE defensivo ANTES do índice: tenants antigos podem JÁ ter >1 request
-- 'pending' pro mesmo (table_session_id, customer_id) — exatamente a corrida que
-- este índice fecha. Sem isto, o CREATE UNIQUE INDEX estouraria com
-- unique_violation e — como migration é FATAL no boot — a API não subiria nesse
-- tenant. Mantém o request 'pending' MAIS RECENTE por par e expira os demais
-- (status='expired' + decided_at), fechando também a escalation_chain vinculada
-- (completed_at) pra não deixar chain zumbi escalando pro gerente. Idempotente:
-- roda 0 linhas se já limpo. `table_session_id IS NOT NULL` porque o UNIQUE
-- parcial ignora NULLs (dois NULLs nunca colidem no Postgres) — não faz sentido
-- deduplicar linhas que o índice nem cobre.
DO $$
DECLARE
  _dup_count INT;
BEGIN
  CREATE TEMP TABLE _repair066_lar_dupes ON COMMIT DROP AS
    SELECT id, escalation_chain_id
      FROM (
        SELECT id,
               escalation_chain_id,
               row_number() OVER (
                 PARTITION BY table_session_id, customer_id
                 ORDER BY created_at DESC, id DESC
               ) AS rn
          FROM late_arrival_requests
         WHERE status = 'pending'
           AND table_session_id IS NOT NULL
      ) t
     WHERE rn > 1;

  SELECT count(*) INTO _dup_count FROM _repair066_lar_dupes;
  IF _dup_count > 0 THEN
    -- Fecha a chain órfã das duplicatas ANTES de expirar o request, pra não
    -- deixar chain viva sem request pending por trás (mesma semântica do
    -- respond(): completed_at só quando NULL → idempotente).
    UPDATE escalation_chains ec
       SET completed_at      = COALESCE(ec.completed_at, now()),
           resolution_notes  = COALESCE(ec.resolution_notes, 'migration_066_dedupe'),
           updated_at        = now()
      FROM _repair066_lar_dupes d
     WHERE ec.id = d.escalation_chain_id
       AND ec.completed_at IS NULL;

    UPDATE late_arrival_requests lar
       SET status     = 'expired',
           decided_at = COALESCE(lar.decided_at, now()),
           updated_at = now()
      FROM _repair066_lar_dupes d
     WHERE lar.id = d.id;

    RAISE NOTICE '066 dedupe: % late_arrival_requests pending duplicados expirados', _dup_count;
  END IF;
END $$;

-- UNIQUE parcial: no máximo 1 request 'pending' por (table_session_id,
-- customer_id). IF NOT EXISTS → NOOP em tenants que já o têm (idempotente).
CREATE UNIQUE INDEX IF NOT EXISTS late_arrival_pending_unique
  ON late_arrival_requests (table_session_id, customer_id)
  WHERE status = 'pending';

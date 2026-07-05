-- Migration 071: novo status 'cancelled' pro late_arrival_request_status.
--
-- P1 (re-scan mega-loop): Customer B preso pra sempre na espera de join.
-- Quando B pede pra entrar numa mesa e o host IGNORA, o único escape do FE
-- ("Cancelar pedido") era um router.back() no-op — o request seguia 'pending'
-- até o TTL e escalava pro gerente como timeout fantasma. O fix da camada de
-- aplicação (LateArrivalService.cancel + POST .../:id/cancel) flipa o request
-- pra 'cancelled', que é semanticamente distinto de:
--   - 'rejected' (o HOST recusou), e
--   - 'expired'  (ninguém respondeu no TTL).
-- Um estado próprio mantém a timeline/audit honesta (quem matou o pedido foi o
-- próprio solicitante) e tira a row do índice parcial `late_arrival_pending_unique`
-- (que só cobre status='pending'), liberando B pra reabrir depois.
--
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS roda dentro da tx BEGIN/COMMIT do
-- runner (Postgres 12+; o valor só não pode ser USADO na mesma tx — aqui não é).
-- Idempotente: NOOP se o valor já existir. Mesmo padrão da mig 049
-- (escalation_chain_kind ADD VALUE 'scan_verification').

ALTER TYPE late_arrival_request_status ADD VALUE IF NOT EXISTS 'cancelled';

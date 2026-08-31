-- Migration 080: status 'cancelled' em session_participants.
--
-- Bug reproduzido em iPhone real: quando o CLIENTE cancela o próprio pedido de
-- entrada, `cancelOwnPendingJoin` gravava `status='rejected', left_at=now()` —
-- exatamente o mesmo estado de quando o HOST recusa. No re-scan do QR da mesma
-- table_session, o `upsertParticipant` reencontrava a row (a query dele não
-- tinha o `AND left_at IS NULL` que as duas irmãs têm), PRESERVAVA o 'rejected'
-- e ressuscitava a row com `left_at = NULL`. Resultado: o cliente ficava barrado
-- com "O host da mesa não autorizou sua entrada" sem host nenhum ter recusado.
--
-- Decisão do dono (opção B): os dois estados passam a ser distintos.
--   - 'cancelled' = o PRÓPRIO solicitante desistiu. Pode voltar a pedir entrada
--     (novo scan cria uma row 'pending' e o host recebe o pedido de novo).
--   - 'rejected'  = o HOST recusou. Continua barrado até a sessão fechar — a
--     recusa é escopada à table_session e não pode ser torrada por re-scan.
-- Mesma separação semântica que a migration 072 fez para
-- `late_arrival_request_status` ('cancelled' ≠ 'rejected' ≠ 'expired'): quem
-- matou o pedido foi o próprio solicitante, e a timeline/audit precisa dizer isso.
--
-- NÃO há backfill. Rows 'rejected' históricas ficam como estão: retroativamente
-- é impossível saber quem cancelou e quem foi recusado, e reclassificar às cegas
-- liberaria quem o host recusou de verdade. Elas seguem barradas — o mesmo
-- comportamento observável de antes do fix, sem regressão de segurança.
--
-- A coluna é VARCHAR(16) com CHECK nomeado `session_participants_status_check`
-- (criado junto com a coluna na migration 017 via `ADD COLUMN ... CHECK`), não
-- um enum PG — então ALTER TYPE ... ADD VALUE não se aplica aqui; o que muda é a
-- lista do CHECK. 'cancelled' cabe nos 16 chars, sem ALTER TYPE da coluna.
--
-- Idempotente (o runner `migrate-tenants.ts` aplica isto em todo schema de
-- tenant no boot): DROP ... IF EXISTS + ADD recria o constraint no formato novo
-- em qualquer ordem de execução, e o CHECK novo é um SUPERSET do antigo, então
-- nenhuma row existente o viola (não precisa de NOT VALID + VALIDATE).

ALTER TABLE session_participants
  DROP CONSTRAINT IF EXISTS session_participants_status_check;

ALTER TABLE session_participants
  ADD CONSTRAINT session_participants_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

COMMENT ON COLUMN session_participants.status IS
  'pending = aguardando o host · approved = na mesa · rejected = o HOST recusou (barrado até a sessão fechar) · cancelled = o PRÓPRIO cliente desistiu (pode pedir de novo).';

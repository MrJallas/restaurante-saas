-- Migration 027: Staff messaging.
--
-- Mensagens internas entre staff (waiter <-> manager <-> cook). Threads
-- agrupam conversas; uma thread pode ser 1:1 ou broadcast (recipient
-- nullable). Frontend-staff mostra inbox com unread count via read_at.
--
-- Decisoes:
-- - Soft-delete via `deleted_at` opcional pra retencao/auditoria.
-- - `is_broadcast` na thread pra filtrar facilmente threads "todos os waiters".
-- - read_at por mensagem (nao por thread) porque o leitor pode ser cada
--   recipient individual em broadcast.

CREATE TABLE IF NOT EXISTS staff_message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject VARCHAR(200),
  is_broadcast BOOLEAN NOT NULL DEFAULT false,
  created_by_staff_id UUID NOT NULL REFERENCES staff(id),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_message_threads_created_by
  ON staff_message_threads(created_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_message_threads_last_message_at
  ON staff_message_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_message_threads_is_broadcast
  ON staff_message_threads(is_broadcast)
  WHERE is_broadcast = true;
CREATE INDEX IF NOT EXISTS idx_staff_message_threads_closed_at
  ON staff_message_threads(closed_at);

CREATE TABLE IF NOT EXISTS staff_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES staff_message_threads(id),
  sender_staff_id UUID NOT NULL REFERENCES staff(id),
  -- NULL = broadcast pra thread inteira. Caso contrario aponta pro destinatario.
  recipient_staff_id UUID REFERENCES staff(id),
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_messages_thread_id ON staff_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_staff_messages_sender ON staff_messages(sender_staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_messages_recipient ON staff_messages(recipient_staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_messages_sent_at ON staff_messages(sent_at DESC);
-- Inbox unread por destinatario.
CREATE INDEX IF NOT EXISTS idx_staff_messages_unread_recipient
  ON staff_messages(recipient_staff_id, sent_at DESC)
  WHERE read_at IS NULL AND deleted_at IS NULL;

-- Participantes por thread (necessario pra DM 1:1 e pra threads multi-staff).
CREATE TABLE IF NOT EXISTS staff_message_thread_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES staff_message_threads(id),
  staff_id UUID NOT NULL REFERENCES staff(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  last_read_at TIMESTAMPTZ,
  UNIQUE (thread_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_thread_participants_thread
  ON staff_message_thread_participants(thread_id);
CREATE INDEX IF NOT EXISTS idx_staff_thread_participants_staff
  ON staff_message_thread_participants(staff_id);

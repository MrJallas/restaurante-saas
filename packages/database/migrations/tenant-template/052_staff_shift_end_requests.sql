-- Migration 052: waiter shift-end approval requests.
--
-- Waiters do not end their own shift directly. They create a pending request
-- that a manager approves or rejects from the staff chat.

CREATE TABLE IF NOT EXISTS staff_shift_end_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waiter_id UUID NOT NULL REFERENCES staff(id),
  manager_id UUID REFERENCES staff(id),
  thread_id UUID REFERENCES staff_message_threads(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reason TEXT,
  response_message TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_end_requests_waiter_pending
  ON staff_shift_end_requests(waiter_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_shift_end_requests_thread
  ON staff_shift_end_requests(thread_id);

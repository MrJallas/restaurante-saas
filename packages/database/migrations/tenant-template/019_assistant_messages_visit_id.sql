-- Add visit_id to assistant_messages for analytics linkage and schema
-- consistency with other session-entity tables (orders, payments, feedbacks).
ALTER TABLE assistant_messages
ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES visits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assistant_messages_visit_id
ON assistant_messages (visit_id) WHERE visit_id IS NOT NULL;

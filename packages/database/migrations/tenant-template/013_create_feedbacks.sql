CREATE TABLE IF NOT EXISTS feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id),
  customer_id UUID REFERENCES customers(id),
  overall_rating INT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  food_rating INT CHECK (food_rating BETWEEN 1 AND 5),
  service_rating INT CHECK (service_rating BETWEEN 1 AND 5),
  ambience_rating INT CHECK (ambience_rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedbacks_visit_id ON feedbacks(visit_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_customer_id ON feedbacks(customer_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_overall_rating ON feedbacks(overall_rating);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at ON feedbacks(created_at);

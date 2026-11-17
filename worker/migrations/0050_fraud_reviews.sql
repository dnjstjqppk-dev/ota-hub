-- TG-17: fraud-review queue. Rule scores at/above the threshold hold the
-- payment attempt (no provider call) and park the booking in
-- MANUAL_REVIEW_REQUIRED for an operator decision. APPROVED reopens the
-- payment window for that booking; REJECTED leaves it for operator cancel.
CREATE TABLE IF NOT EXISTS fraud_reviews (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fraud_booking ON fraud_reviews (booking_id);
CREATE INDEX IF NOT EXISTS idx_fraud_status ON fraud_reviews (status, created_at);

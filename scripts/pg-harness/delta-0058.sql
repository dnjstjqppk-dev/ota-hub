-- scripts/pg-harness/delta-0058.sql
-- Hybrid catch-up for the TG-21 PG snapshot: GAP-08 change requests.
-- Apply AFTER schema.sql on a fresh dev database. Re-runnable.
-- Porter rules applied: FK clauses dropped (D1 never enforced them),
-- CURRENT_TIMESTAMP defaults become gft_now().

-- 0058: flight itinerary-change (reissue) requests.
CREATE TABLE IF NOT EXISTS change_requests (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('VOLUNTARY', 'INVOLUNTARY')),
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTING', 'EXECUTED', 'CANCELLED')),
  new_quote_id TEXT NOT NULL,
  new_start_date TEXT NOT NULL,
  new_end_date TEXT,
  new_total_minor INTEGER NOT NULL CHECK (new_total_minor > 0),
  cancel_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (cancel_fee_minor >= 0),
  refund_due_minor INTEGER NOT NULL DEFAULT 0 CHECK (refund_due_minor >= 0),
  reason TEXT,
  admin_note TEXT,
  new_booking_id TEXT,
  created_at TEXT NOT NULL DEFAULT (gft_now()),
  decided_at TEXT,
  executed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_change_req_booking ON change_requests (booking_id, created_at);
CREATE INDEX IF NOT EXISTS idx_change_req_status ON change_requests (status, created_at);
CREATE INDEX IF NOT EXISTS idx_change_req_user ON change_requests (user_id, created_at);

-- 0058: flight itinerary-change (reissue) requests (GAP-08).
-- A change is an assisted cancel + rebook: the old booking is cancelled
-- (policy fees, or waived for approved involuntary changes) and a new booking
-- is created for the new dates. The new booking is paid normally; no second
-- payment movement ever lands on one booking.
CREATE TABLE IF NOT EXISTS change_requests (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('VOLUNTARY', 'INVOLUNTARY')),
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTING', 'EXECUTED', 'CANCELLED')),
  new_quote_id TEXT NOT NULL REFERENCES quotes(id),
  new_start_date TEXT NOT NULL,
  new_end_date TEXT,
  new_total_minor INTEGER NOT NULL CHECK (new_total_minor > 0),
  cancel_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (cancel_fee_minor >= 0),
  refund_due_minor INTEGER NOT NULL DEFAULT 0 CHECK (refund_due_minor >= 0),
  reason TEXT,
  admin_note TEXT,
  new_booking_id TEXT REFERENCES bookings(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  decided_at TEXT,
  executed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_change_req_booking ON change_requests (booking_id, created_at);
CREATE INDEX IF NOT EXISTS idx_change_req_status ON change_requests (status, created_at);
CREATE INDEX IF NOT EXISTS idx_change_req_user ON change_requests (user_id, created_at);

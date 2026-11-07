-- 0012: customer support tickets (1:1 inquiries).
-- User submits via POST /api/v1/inquiries; operators triage via /api/v1/admin/tickets.
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  email TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'GENERAL',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  booking_id TEXT REFERENCES bookings(id),
  status TEXT NOT NULL DEFAULT 'OPEN',
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status, created_at DESC);

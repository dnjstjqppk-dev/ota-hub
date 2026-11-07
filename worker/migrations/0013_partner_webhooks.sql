-- 0013: partner order-event webhook deliveries.
-- Enqueued atomically with capture/refund batches; dispatched by runMaintenance.
-- Status is free text (PENDING/SENT/FAILED/SKIPPED) so delivery states can grow
-- without a table rebuild.
CREATE TABLE IF NOT EXISTS partner_webhook_deliveries (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id),
  webhook_url TEXT NOT NULL,
  event_type TEXT NOT NULL,
  booking_id TEXT REFERENCES bookings(id),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_status_code INTEGER,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (event_type, booking_id)
);
CREATE INDEX IF NOT EXISTS idx_whd_pending ON partner_webhook_deliveries(status, created_at);
CREATE INDEX IF NOT EXISTS idx_whd_partner ON partner_webhook_deliveries(partner_id, created_at DESC);
ALTER TABLE partner_profiles ADD COLUMN webhook_secret TEXT;

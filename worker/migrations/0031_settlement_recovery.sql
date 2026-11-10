-- 0031: settlement recovery ledger (B3), refund sourcing (B1/B7),
-- payout evidence (B4).
ALTER TABLE refunds ADD COLUMN source TEXT NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE refunds ADD COLUMN offline_detail_json TEXT;

-- Post-payout clawback ledger: when a refund/chargeback hits an already
-- SETTLED order, the refunded amount becomes an OPEN claim against the
-- seller and is auto-deducted from their next payout (B3).
CREATE TABLE IF NOT EXISTS settlement_recoveries (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  settlement_id TEXT REFERENCES marketplace_order_settlements(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'KRW',
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  applied_at TEXT,
  applied_settlement_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_recovery_seller ON settlement_recoveries(seller_id, status);

-- Payout evidence: a SETTLED row is a recorded bank transfer, not a real-time
-- transfer rail (B4). Method + reference name the actual money movement.
ALTER TABLE marketplace_order_settlements ADD COLUMN payout_method TEXT;
ALTER TABLE marketplace_order_settlements ADD COLUMN payout_reference TEXT;
ALTER TABLE marketplace_order_settlements ADD COLUMN recovery_deducted_minor INTEGER NOT NULL DEFAULT 0;

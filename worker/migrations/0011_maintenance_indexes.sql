-- 0011: indexes for maintenance scans and back-office lists.
-- Purely additive: no table or data changes. Every statement is idempotent.
-- The cron's expiry/reconciliation scans and the admin/affiliate lists below
-- were full-table scans; each index matches its query's filter + order.

-- Maintenance cron: quotes/payments/holds expiry and UNKNOWN-payment scans.
CREATE INDEX IF NOT EXISTS idx_quotes_expiry ON quotes (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
CREATE INDEX IF NOT EXISTS idx_holds_expiry ON inventory_holds (status, expires_at);

-- Affiliate postback lookups by click and order id.
CREATE INDEX IF NOT EXISTS idx_aff_conv_click ON affiliate_conversions (click_id);
CREATE INDEX IF NOT EXISTS idx_aff_conv_order ON affiliate_conversions (order_id);

-- Back-office lists ordered by recency.
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moments_created ON trip_moments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notices_created ON notices (created_at DESC);

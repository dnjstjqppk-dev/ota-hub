-- 0007: indexes for the hottest production read paths (from `wrangler d1 insights`).
-- Purely additive: no table or data changes. Every statement is idempotent.

-- Admin lists: ORDER BY created_at DESC LIMIT n (users, bookings) were full scans + sort.
CREATE INDEX IF NOT EXISTS idx_users_created ON users (created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings (created_at);

-- Partner extranet: product counts / product lists filter by partner_id.
CREATE INDEX IF NOT EXISTS idx_hotels_partner ON hotels (partner_id);
CREATE INDEX IF NOT EXISTS idx_flights_partner ON flights (partner_id);
CREATE INDEX IF NOT EXISTS idx_cars_partner ON cars (partner_id);
CREATE INDEX IF NOT EXISTS idx_transfers_partner ON transfers (partner_id);
CREATE INDEX IF NOT EXISTS idx_activities_partner ON activities (partner_id);

-- Catalog default sorts with LIMIT: let SQLite walk the index instead of sorting the table.
CREATE INDEX IF NOT EXISTS idx_hotels_rank ON hotels (review_score, star_rating);
CREATE INDEX IF NOT EXISTS idx_flights_price ON flights (base_price_krw);
CREATE INDEX IF NOT EXISTS idx_cars_price ON cars (daily_price_krw);
CREATE INDEX IF NOT EXISTS idx_activities_rank ON activities (review_score, review_count);

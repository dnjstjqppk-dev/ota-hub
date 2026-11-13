-- 0044: one-time backfill of integer-minor totals (P3 #151).
-- Legacy rows may carry total_minor NULL (the column postdates the table);
-- readers fall back to the REAL total_price column for those rows. After this
-- backfill the integer column is the sole source of truth and new writes stop
-- maintaining the REAL twins (base/tax/service-fee/cancel-fee/refund twins go
-- unwritten; total_price keeps its NOT NULL write until a table rebuild, and
-- discount_amount_krw stays as the single functional discount store).
UPDATE bookings SET total_minor = CAST(ROUND(total_price) AS INTEGER) WHERE total_minor IS NULL;

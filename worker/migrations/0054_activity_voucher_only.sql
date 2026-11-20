-- 0054: tours sell direct only with their own instant voucher.
-- is_voucher_only = 1 keeps every existing row on the legacy direct path;
-- partner-owned tours (0) route to AFFILIATE_REDIRECT at the quote gate.
ALTER TABLE activities ADD COLUMN is_voucher_only INTEGER NOT NULL DEFAULT 1;

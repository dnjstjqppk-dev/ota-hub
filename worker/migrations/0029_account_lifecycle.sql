-- 0029: account lifecycle — suspension (A8) and withdrawal retention (A1).
--
-- users.status: ACTIVE (default) | SUSPENDED (login + API refused) |
-- DELETED (row anonymized, kept only as a foreign-key anchor for retained
-- financial records). Deletion never removes contract/payment/dispute rows:
-- those are fenced into retained_records with a 5-year horizon per the
-- e-commerce record-keeping duty; everything else identifying is purged.
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users ADD COLUMN suspended_at TEXT;
ALTER TABLE users ADD COLUMN suspended_reason TEXT;
ALTER TABLE users ADD COLUMN deleted_at TEXT;
ALTER TABLE users ADD COLUMN deletion_reason TEXT;
CREATE TABLE IF NOT EXISTS retained_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  retain_until TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_retained_user ON retained_records (user_id, retain_until);

-- 0032: upload registry (C1), partner bank-cert + business verification (C1/C2).
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_uploads_owner ON uploads(owner_type, owner_id);

ALTER TABLE partner_profiles ADD COLUMN bank_cert_url TEXT;
ALTER TABLE partner_profiles ADD COLUMN business_verified_at TEXT;
ALTER TABLE partner_profiles ADD COLUMN business_verified_by TEXT;
ALTER TABLE partner_profiles ADD COLUMN business_verify_method TEXT;

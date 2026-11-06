-- 0008: partner API keys + partner webhook URL.
-- Purely additive: one new table, one nullable column. Every statement is idempotent
-- except the ALTER (D1 applies each migration file exactly once, same as 0002).
--
-- API keys authenticate server-to-server calls (PMS/ERP integrations) with
-- `Authorization: Bearer gft_live_...`. Only the SHA-256 hash is stored; the
-- plaintext key is shown once at issuance and can never be read back.

CREATE TABLE IF NOT EXISTS partner_api_keys (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id),
  name TEXT NOT NULL DEFAULT 'Default',
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_partner_api_keys_partner ON partner_api_keys (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_api_keys_hash ON partner_api_keys (key_hash);

ALTER TABLE partner_profiles ADD COLUMN webhook_url TEXT;

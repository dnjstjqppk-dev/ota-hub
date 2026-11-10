-- 0028: consent audit trail (A2/A3/A4).
--
-- Every grant AND withdrawal is appended (never updated): who consented to
-- what version, when, from where. Registration records TERMS + PRIVACY +
-- MARKETING; booking records REFUND_POLICY + PRIVACY + THIRD_PARTY_SUPPLIER.
-- `target` carries the third-party recipient (supplier id) for disclosures.
CREATE TABLE IF NOT EXISTS user_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  consent_type TEXT NOT NULL,
  version TEXT NOT NULL,
  agreed INTEGER NOT NULL DEFAULT 1,
  target TEXT,
  agreed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_consents_user ON user_consents (user_id, consent_type, agreed_at);

-- Privacy 2.1: processor/offshore disclosure table (A6). Terms 2.1: 1P
-- direct-sales clause alongside intermediary terms (A7).
UPDATE legal_documents SET version = '2.1' WHERE slug IN ('privacy', 'terms');

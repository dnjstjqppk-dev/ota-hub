-- 0019: legal document version registry. Bodies live in the structured
-- frontend pages (terms/privacy/cookies/refund-policy); this table tracks the
-- published version + effective date so clients and auditors can verify currency.
CREATE TABLE IF NOT EXISTS legal_documents (
  slug TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT OR IGNORE INTO legal_documents (slug, version, title, effective_from) VALUES
  ('terms', '2.0', '서비스 이용약관', '2026-11-07'),
  ('privacy', '2.0', '개인정보처리방침', '2026-11-07'),
  ('cookies', '1.1', '쿠키 정책', '2026-11-07'),
  ('refund-policy', '2.0', '취소·환불 규정', '2026-11-07');

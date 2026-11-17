-- TG-21: dynamic markup decisions, review digests, bot reports, CS handoff,
-- settlement markup basis, kill-switches (all additive).
--
-- pricing_decisions: one row per quoted order while DYNAMIC_MARKUP is on
-- (control arm logs variant=control with zeros for the A/B denominator).
-- Booking revalidation reuses the stored row (never recomputes: forecast
-- and inventory move between quote and booking).
-- review_digests: weekly per-product summaries (AI or fallback quotes).
-- bot_reports: customer wrong-answer reports (each auto-hands off).
-- support_tickets.handoff_at: human-handoff request time (+24h = due).
-- marketplace_order_settlements.markup_minor: platform markup excluded
-- from the supplier basis (recorded for the audit trail).

CREATE TABLE IF NOT EXISTS pricing_decisions (
  quote_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  domain_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('control', 'treatment')),
  markup_bps INTEGER NOT NULL DEFAULT 0,
  markup_minor INTEGER NOT NULL DEFAULT 0,
  forecast REAL NULL,
  occupancy REAL NULL,
  clamped_to_floor INTEGER NOT NULL DEFAULT 0,
  reasons_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_pricing_decisions_variant ON pricing_decisions (variant, created_at);

CREATE TABLE IF NOT EXISTS review_digests (
  domain TEXT NOT NULL,
  item_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ai', 'fallback')),
  review_count INTEGER NOT NULL DEFAULT 0,
  avg_rating REAL NULL,
  computed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (domain, item_id)
);

CREATE TABLE IF NOT EXISTS bot_reports (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_bot_reports_ticket ON bot_reports (ticket_id, created_at);

ALTER TABLE support_tickets ADD COLUMN handoff_at TEXT NULL;
ALTER TABLE marketplace_order_settlements ADD COLUMN markup_minor INTEGER NOT NULL DEFAULT 0;

INSERT INTO feature_flags (key, category, display_name, description, is_enabled, default_enabled, requires_flags, is_external_dependent, external_contract_status, updated_by)
SELECT 'DYNAMIC_MARKUP', 'FINANCIAL', '동적 마크업 v1', '수요 예측 기반 ±15% 가격 조정 (하한가 클램프, 결정 로그, A/B). OFF면 기존가 그대로.', 0, 0, '[]', 0, 'NOT_REQUIRED', 'migration_0053'
WHERE NOT EXISTS (SELECT 1 FROM feature_flags WHERE key = 'DYNAMIC_MARKUP');
INSERT INTO feature_flags (key, category, display_name, description, is_enabled, default_enabled, requires_flags, is_external_dependent, external_contract_status, updated_by)
SELECT 'CS_BOT', 'SYSTEM', 'CS 봇 v1', '1:1 문의 1차 자동 응답 + 1클릭 사람 이관. OFF면 전량 사람 응대.', 0, 0, '[]', 0, 'NOT_REQUIRED', 'migration_0053'
WHERE NOT EXISTS (SELECT 1 FROM feature_flags WHERE key = 'CS_BOT');

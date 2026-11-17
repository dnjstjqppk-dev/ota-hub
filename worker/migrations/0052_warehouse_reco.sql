-- TG-19: warehouse marts + experiment + recommendation tables (all additive).
--
-- fact_daily: per-day per-domain rollup (bookings, GMV, searches, views).
--   Recomputed wholesale by the daily batch (idempotent upsert); zeros are
--   real rows, not missing data.
-- reco_pairs: co-viewed item pairs (same domain, batch-computed, capped).
-- reco_popular: top items per domain over the trailing 30 days.
-- experiment_assignments: sticky A/B buckets (experiment, subject).
-- reco_exposures: served recommendation items + click marks (CTR source).
-- Also: RECO_V1 kill-switch (seeded ON; admin-toggled) and a user-first
-- index on analytics_events for the recent-views slot.

CREATE TABLE IF NOT EXISTS fact_daily (
  date TEXT NOT NULL CHECK (date LIKE '____-__-__'),
  domain TEXT NOT NULL,
  bookings INTEGER NOT NULL DEFAULT 0,
  gmv_minor INTEGER NOT NULL DEFAULT 0,
  searches INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (date, domain)
);

CREATE TABLE IF NOT EXISTS reco_pairs (
  item_a TEXT NOT NULL,
  item_b TEXT NOT NULL CHECK (item_a < item_b),
  domain TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (item_a, item_b)
);
CREATE INDEX IF NOT EXISTS idx_reco_pairs_item ON reco_pairs (item_a, score DESC);

CREATE TABLE IF NOT EXISTS reco_popular (
  domain TEXT NOT NULL,
  item_id TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (domain, item_id)
);
CREATE INDEX IF NOT EXISTS idx_reco_popular_rank ON reco_popular (domain, rank ASC);

CREATE TABLE IF NOT EXISTS experiment_assignments (
  experiment TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('control', 'treatment')),
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (experiment, subject_id)
);

CREATE TABLE IF NOT EXISTS reco_exposures (
  id TEXT PRIMARY KEY,
  variant TEXT NOT NULL CHECK (variant IN ('control', 'treatment', 'none')),
  user_id TEXT NULL,
  item_id TEXT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('together', 'popular', 'recent')),
  clicked INTEGER NOT NULL DEFAULT 0,
  clicked_at TEXT NULL,
  -- Attribution window, computed in JS at insert (per-row day math is not
  -- portable SQL): a booking attributes when its day falls in [exp_day,
  -- attr_until] for the same user + item. 7 days.
  exp_day TEXT NOT NULL,
  attr_until TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_reco_exposures_variant ON reco_exposures (variant, created_at);
CREATE INDEX IF NOT EXISTS idx_reco_exposures_user_item ON reco_exposures (user_id, item_id);

CREATE INDEX IF NOT EXISTS idx_analytics_user_view ON analytics_events (user_id, id);

INSERT INTO feature_flags (key, category, display_name, description, is_enabled, default_enabled, requires_flags, is_external_dependent, external_contract_status, updated_by)
SELECT 'RECO_V1', 'SYSTEM', '추천 v1 (규칙 기반)', '상품 상세의 함께 본·인기·최근 본 슬롯 + 추천 A/B 실험. OFF면 API 503 + UI 미노출.', 1, 1, '[]', 0, 'NOT_REQUIRED', 'migration_0052'
WHERE NOT EXISTS (SELECT 1 FROM feature_flags WHERE key = 'RECO_V1');

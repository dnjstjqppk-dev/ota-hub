-- 0045 (TG-03): append-only analytics events for the search→view→book funnel.
-- Server-side emission only (worker/src/lib/analytics.ts). Writers must never
-- fail a request: trackEvent swallows every error. Retention: runMaintenance
-- purges rows older than 90 days. meta_json carries counts only — never PII.
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,          -- 'search' | 'view' | 'book'
  domain TEXT NULL,                  -- HOTEL | FLIGHT | TRAIN | CAR | TRANSFER | ACTIVITY | PACKAGE
  entity_id TEXT NULL,               -- product id (view) or booking id (book)
  user_id TEXT NULL,                 -- authenticated viewer, else NULL
  meta_json TEXT NULL,               -- small JSON ({ resultCount: n }); never PII
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_time ON analytics_events (event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_entity ON analytics_events (domain, entity_id) WHERE entity_id IS NOT NULL;

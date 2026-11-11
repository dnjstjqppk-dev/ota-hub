-- 0038 (6f): ops truth — cron heartbeats, SELF_REG backfill, theater-flag removal.
--
-- #56: the */5 cron only console.logs; failures vanish when no Sentry DSN is
-- set. Heartbeat rows make the last run (and its staleness) queryable, and
-- /health surfaces them so ops alerting has something to watch.
CREATE TABLE IF NOT EXISTS cron_heartbeats (
  job TEXT PRIMARY KEY, -- e.g. 'maintenance'
  ran_at TEXT NOT NULL, -- ISO-8601 end of run
  ok INTEGER NOT NULL DEFAULT 1, -- 1 = runMaintenance completed, 0 = threw
  stats_json TEXT NOT NULL DEFAULT '{}',
  error TEXT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- #49: PARTNER_SELF_PRODUCT_REGISTRATION gates partner product registration
-- (routes/marketplace.ts). It shipped in 0005, but any database that applied
-- 0005 without that row has a dead kill-switch (isFeatureEnabled fails open
-- and PATCH 404s). Backfill only when missing — never clobber an operator's
-- toggle the way OR REPLACE would.
INSERT INTO feature_flags (key, category, display_name, description, is_enabled, default_enabled, requires_flags, is_external_dependent, external_contract_status, updated_by)
SELECT 'PARTNER_SELF_PRODUCT_REGISTRATION', 'PRODUCT_INGESTION', '파트너 자체 상품 등록', '입점 파트너가 익스트라넷에서 신규 상품을 직접 등록하고 요금/재고를 설정하는 기능', 1, 1, '["MARKETPLACE_3P_PARTNER"]', 0, 'NOT_REQUIRED', 'migration_0038'
WHERE NOT EXISTS (SELECT 1 FROM feature_flags WHERE key = 'PARTNER_SELF_PRODUCT_REGISTRATION');

-- #50: these 12 flags gate no code path — toggling them is theater. Delete
-- them so the registry contains only enforced flags. Behavior is unchanged:
-- nothing in worker/src references any of these keys.
-- (ESIM/TRAVEL_INSURANCE purchases stay 409 via assertQuotableDomain; plan
-- listings stay live per #145. Cancel/refund/settle stay code-defined.)
DELETE FROM feature_flags WHERE key IN (
  'AI_TRANSLATION',
  'REALTIME_INVENTORY_SYNC',
  'AUTO_BOOKING_CONFIRMATION',
  'PARTNER_AUTO_DISPATCH',
  'AUTO_BOOKING_DISPATCH',
  'AUTO_CANCEL_REFUND',
  'AUTO_SETTLEMENT',
  'AUTO_PARTNER_SETTLEMENT',
  'AUTO_SUPPLIER_SETTLEMENT',
  'SUPPLIER_API_INTEGRATION',
  'ESIM',
  'TRAVEL_INSURANCE'
);

-- #118 (folded in early): FLIGHT_BOOKING required the now-deleted
-- REALTIME_INVENTORY_SYNC, which no code ever consulted — an undeletable
-- dead precondition. Clear it; the domain flag itself still gates quotes.
UPDATE feature_flags SET requires_flags = '[]', updated_by = 'migration_0038'
  WHERE key = 'FLIGHT_BOOKING';

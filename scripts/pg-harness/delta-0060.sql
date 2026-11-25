-- scripts/pg-harness/delta-0060.sql
-- S10 catch-up: traffic-source attribution on analytics events.
-- Apply AFTER schema.sql on a fresh dev database. Re-runnable.
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS source TEXT NULL;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS session_id TEXT NULL;

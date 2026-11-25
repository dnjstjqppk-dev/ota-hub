-- scripts/pg-harness/delta-0059.sql
-- S8 catch-up: per-product modification time for sitemap lastmod.
-- Apply AFTER schema.sql on a fresh dev database. Re-runnable.
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS updated_at TEXT NULL;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS updated_at TEXT NULL;
ALTER TABLE trains ADD COLUMN IF NOT EXISTS updated_at TEXT NULL;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS updated_at TEXT NULL;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS updated_at TEXT NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS updated_at TEXT NULL;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS updated_at TEXT NULL;

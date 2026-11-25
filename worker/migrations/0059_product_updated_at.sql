-- 0059: per-product modification time for sitemap lastmod (S8) + detail freshness.
-- Nullable on purpose: pre-existing rows keep NULL (unknown) and are omitted from
-- lastmod output, never backfilled with a migration-time lie. All product write
-- paths (admin catalog, partner extranet, URL ingest) stamp it from here on.
ALTER TABLE hotels ADD COLUMN updated_at TEXT;
ALTER TABLE flights ADD COLUMN updated_at TEXT;
ALTER TABLE trains ADD COLUMN updated_at TEXT;
ALTER TABLE cars ADD COLUMN updated_at TEXT;
ALTER TABLE transfers ADD COLUMN updated_at TEXT;
ALTER TABLE activities ADD COLUMN updated_at TEXT;
ALTER TABLE packages ADD COLUMN updated_at TEXT;

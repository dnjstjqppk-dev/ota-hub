-- scripts/pg-harness/delta-0061.sql
-- Storefront edge-cache generation (worker/migrations/0061_edge_epoch.sql).
-- Apply AFTER schema.sql on a fresh dev database. Re-runnable.
CREATE TABLE IF NOT EXISTS edge_epoch (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  epoch INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
INSERT INTO edge_epoch (id, epoch) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;

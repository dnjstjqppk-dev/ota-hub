-- Storefront edge-cache generation (2026-11-28 CPU work).
-- ota-user keys its Workers Cache API entries on this number; every
-- successful admin/partner write bumps it, so cached SSR pages turn over
-- within ~30s of a catalog change while the TTL can stay long.
CREATE TABLE IF NOT EXISTS edge_epoch (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  epoch INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO edge_epoch (id, epoch) VALUES (1, 1);

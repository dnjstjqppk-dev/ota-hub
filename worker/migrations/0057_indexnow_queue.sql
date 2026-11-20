-- P6: IndexNow submission queue (Bing/Yandex/Seznam instant indexing).
-- Producers (catalog publish) enqueue changed URLs; the 5-min cron pump
-- (pumpIndexNow) submits one batch per tick. No key configured = pump no-ops.
CREATE TABLE IF NOT EXISTS indexnow_queue (
  url TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_indexnow_due ON indexnow_queue (status, created_at);

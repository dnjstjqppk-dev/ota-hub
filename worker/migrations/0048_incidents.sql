-- TG-13: operational incidents for the public status page (/status) and the
-- SLO dashboard. Operator-owned rows: an OPEN OUTAGE flips /status to
-- "outage", DEGRADED/INFO flips it to "degraded". Uptime windows derive from
-- started_at/resolved_at (docs/SLO.md).
--
-- No FK clauses (D1 never enforced them; the PG porter drops them): incidents
-- stand alone and never join other tables.
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'DEGRADED' CHECK (severity IN ('INFO', 'DEGRADED', 'OUTAGE')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
  latest_update TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status, started_at);

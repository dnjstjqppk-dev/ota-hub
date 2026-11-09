-- 0026: per-user moment likes (toggle). likes_count on trip_moments stays the
-- cached counter; this table is the source of truth for who liked what.
CREATE TABLE IF NOT EXISTS moment_likes (
  moment_id TEXT NOT NULL REFERENCES trip_moments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (moment_id, user_id)
);

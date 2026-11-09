-- 0024: session revocation (2026-11-09 audit [m]).
-- revoked_tokens: single JWTs killed by logout (keyed by jti, pruned after expiry).
-- session_resets: subject-wide invalidation on password reset; any token with
-- iat older than reset_at stops working (covers users, partners, and staff,
-- whose JWTs all carry their account id + iat).
CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS session_resets (
  subject_id TEXT PRIMARY KEY,
  reset_at INTEGER NOT NULL
);

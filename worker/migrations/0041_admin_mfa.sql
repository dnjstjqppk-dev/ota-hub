-- 0041 (P2d #100): per-admin TOTP secrets for login MFA.
-- A row gates /admin/login (and ADMIN-role /auth/login) once confirmed_at is
-- set; enrollment stores the secret unconfirmed until the first valid code.
CREATE TABLE IF NOT EXISTS admin_mfa_secrets (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    secret_b32 TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    confirmed_at TEXT
);

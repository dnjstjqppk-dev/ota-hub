// scripts/migrate-d1.js
/**
 * RETIRED — this script is intentionally disabled (2026-11-09 audit [B]).
 *
 * Why: it targeted `--remote ota_production` by default, planted ONE shared
 * PBKDF2 password hash on three partner rows, and RESET those passwords on
 * every run via ON CONFLICT. Its ALTER TABLE steps are already covered by
 * worker/migrations/0001_baseline.sql, so nothing is lost by retiring it.
 *
 * Do instead:
 *   - schema changes: add a file under worker/migrations/ and apply with
 *       npx wrangler d1 migrations apply ota_production --remote
 *   - credential rotation:
 *       node scripts/rotate-partner-password.mjs <email> <new-password> --execute --remote
 *
 * This stub refuses to run so any stale runbook reference fails loudly.
 */
console.error("REFUSED: scripts/migrate-d1.js was retired on 2026-11-09 (shared-hash prod seeding).");
console.error("Use worker/migrations/ for schema and scripts/rotate-partner-password.mjs for credentials.");
process.exit(1);

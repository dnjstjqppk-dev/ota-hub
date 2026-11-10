import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * #19: the production seeder must never overwrite operator-owned columns.
 * These assertions run against the GENERATED artifact
 * (database/seed_catalogs_remote.sql) so a regression in
 * scripts/seed-d1-production.js fails the suite even though the script only
 * runs at deploy time. Regenerate with: node scripts/seed-d1-production.js
 */
const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "..", "..", "..", "database", "seed_catalogs_remote.sql"), "utf8");

const OPERATIONAL = [
  "is_active",
  "base_price_krw",
  "daily_price_krw",
  "price_krw",
  "total_original_krw",
  "total_package_krw",
  "package_discount_rate",
  "daily_capacity",
  "available_seats",
  "available_stock",
  "review_score",
  "review_count",
];

test("#19: seed SQL bans INSERT OR REPLACE and refreshes content only", () => {
  assert.ok(!/INSERT\s+OR\s+REPLACE/i.test(sql), "INSERT OR REPLACE resets operator columns — banned");
  const statements = sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
  assert.ok(statements.length > 40, `expected the full catalog, got ${statements.length} statements`);
  for (const st of statements) {
    assert.match(st, /^INSERT INTO (hotels|flights|trains|cars|activities|packages) \(/i, "unexpected statement shape");
    assert.match(st, /ON CONFLICT\(id\) DO UPDATE SET/i, "every seed row must upsert");
    const setClause = st.slice(st.toUpperCase().indexOf("DO UPDATE SET"));
    for (const col of OPERATIONAL) {
      assert.ok(
        !new RegExp(`(^|[,\\s])${col}\\s*=\\s*excluded\\.`, "i").test(setClause),
        `operational column ${col} must not be refreshed`,
      );
    }
  }
});

#!/usr/bin/env node
/**
 * LOCAL-ONLY seed for development / QA. Refuses to touch a remote database.
 *
 *   node scripts/dev-seed.mjs [adminPassword]
 *
 * - loads the legacy catalog (database/seed_catalogs_remote.sql) into local D1
 * - routes the four legacy catalog suppliers (ptn_htl/flt/car/tour_01) through
 *   the SIMULATOR adapter (dev only:
 *   the worker refuses simulator suppliers unless APP_ENV is development/test)
 * - creates a local admin account with the given password (default: random, printed)
 * - restores the documented dev password on the three seed partners (0010
 *   neutralizes it everywhere; local QA needs a working extranet login)
 * - inserts test promotions
 */
import { execFileSync } from "node:child_process";
import { webcrypto as crypto, randomBytes } from "node:crypto";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CFG = "wrangler.local.jsonc";
const DB = "ota_local";
const isWin = process.platform === "win32";

function d1(args) {
  const cmd = isWin ? "cmd.exe" : "npx";
  const full = isWin ? ["/c", "npx", "wrangler", "d1", "execute", DB, "--local", "-c", CFG, ...args] : ["wrangler", "d1", "execute", DB, "--local", "-c", CFG, ...args];
  return execFileSync(cmd, full, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

async function pbkdf2Hash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, km, 256);
  const hex = (u) => Buffer.from(u).toString("hex");
  return `pbkdf2:sha256:100000:${hex(salt)}:${hex(new Uint8Array(bits))}`;
}

const adminPassword = process.argv[2] || `Adm1n-${randomBytes(6).toString("hex")}`;
const hash = await pbkdf2Hash(adminPassword);
// Published dev-only credential (see frontend-partner login hint, DEV builds only).
const PARTNER_DEV_HASH = "pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4";

console.log("1/3 loading catalog seed (local) ...");
d1(["--file", "database/seed_catalogs_remote.sql"]);
d1(["--file", "database/seed_transfers.sql"]);

const sql = `
UPDATE suppliers SET adapter = 'simulator', integration_status = 'NOT_INTEGRATED', notes = 'LOCAL DEV: simulator adapter' WHERE id IN ('ptn_htl_01', 'ptn_flt_01', 'ptn_car_01', 'ptn_tour_01');
UPDATE partners SET password_hash = '${PARTNER_DEV_HASH}', is_active = 1 WHERE id IN ('ptn_htl_01', 'ptn_car_01', 'ptn_tour_01');
UPDATE partner_staff SET password_hash = '${PARTNER_DEV_HASH}' WHERE id IN ('stf_hotel_01', 'stf_car_01', 'stf_tour_01');
INSERT INTO users (id, email, password_hash, full_name, role, tier, trip_coins)
  VALUES ('usr_local_admin', 'admin@local.test', '${hash}', '로컬 관리자', 'ADMIN', 'SILVER', 0)
  ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, role = 'ADMIN';
INSERT OR REPLACE INTO promotions (id, code, title, discount_type, discount_value, min_order_amount_krw, max_discount_krw, valid_from, valid_until, is_active) VALUES
  ('promo_test10', 'TEST10', '[테스트] 10% 할인 (최대 30,000원)', 'PERCENTAGE', 10, 50000, 30000, '2026-01-01T00:00:00Z', '2027-12-31T23:59:59Z', 1),
  ('promo_expired', 'EXPIRED', '[테스트] 만료 쿠폰', 'FIXED_AMOUNT', 10000, 0, 10000, '2025-01-01T00:00:00Z', '2025-12-31T23:59:59Z', 1);
`;
const dir = mkdtempSync(join(tmpdir(), "gft-seed-"));
const f = join(dir, "seed.sql");
writeFileSync(f, sql);
console.log("2/3 simulator suppliers, admin, promotions ...");
d1(["--file", f]);
console.log("3/3 done.");
console.log(`\nLocal admin: admin@local.test / ${adminPassword}\n`);

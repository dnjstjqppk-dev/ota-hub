// scripts/rotate-partner-password.mjs
/**
 * Rotate a partner (or staff) login password to a fresh PBKDF2 hash.
 *
 *   NEW_PASSWORD='...' node scripts/rotate-partner-password.mjs <email> [--remote] [--execute]
 *   (or legacy positional: node scripts/rotate-partner-password.mjs <email> <new-password> [--remote] [--execute])
 *
 * Prefer NEW_PASSWORD env var so production passwords stay out of shell history and ps output.
 * By default it only PRINTS the SQL so an operator can review it. With --execute
 * it runs the UPDATE against the local D1 (add --remote for production) and fails
 * loudly if 0 rows were updated.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rawArgs = process.argv.slice(2);
const flags = rawArgs.filter((a) => a.startsWith("--"));
const positional = rawArgs.filter((a) => !a.startsWith("--"));
const email = positional[0];
const password = process.env.NEW_PASSWORD || positional[1];

if (!email || !password) {
  console.error("usage: NEW_PASSWORD='...' node scripts/rotate-partner-password.mjs <email> [--remote] [--execute]");
  process.exit(1);
}
if (password.length < 12) {
  console.error("refusing: production passwords must be at least 12 characters");
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256));
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const hash = `pbkdf2:sha256:100000:${hex(salt)}:${hex(bits)}`;

const escapedEmail = email.trim().toLowerCase().replace(/'/g, "''");
const sql =
  `UPDATE partners SET password_hash = '${hash}' WHERE lower(email) = '${escapedEmail}';\n` +
  `UPDATE partner_staff SET password_hash = '${hash}' WHERE lower(email) = '${escapedEmail}';`;

if (!flags.includes("--execute")) {
  console.log("-- review, then re-run with --execute to apply --\n" + sql);
  process.exit(0);
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerBin = path.join(rootDir, "node_modules", "wrangler", "bin", "wrangler.js");
const args = ["d1", "execute", "ota_production", "-c", "wrangler.jsonc", "--json", "--command", sql];
if (!flags.includes("--remote")) {
  args[2] = "ota_local";
  args[4] = "wrangler.local.jsonc";
  args.push("--local");
} else {
  args.push("--remote");
}
const raw = execFileSync(process.execPath, [wranglerBin, ...args], { cwd: rootDir, encoding: "utf8" });
let parsed = [];
try { parsed = JSON.parse(raw); } catch { /* handled below */ }
const changes = Array.isArray(parsed)
  ? parsed.reduce((sum, item) => sum + Number(item?.meta?.changes || 0), 0)
  : 0;
if (changes === 0) {
  console.error(`ERROR: 0 rows updated — no partner or partner_staff matched email '${email}'.`);
  process.exit(1);
}
console.log(`password rotated for ${email} (${changes} row(s) updated)`);

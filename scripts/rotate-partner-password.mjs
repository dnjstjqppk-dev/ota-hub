// scripts/rotate-partner-password.mjs
/**
 * Rotate a partner (or staff) login password to a fresh PBKDF2 hash.
 *
 *   node scripts/rotate-partner-password.mjs <email> <new-password> [--remote] [--execute]
 *
 * By default it only PRINTS the SQL so an operator can review it. With --execute
 * it runs the UPDATE against the local D1 (add --remote for production).
 * The hash format matches worker/src/lib/crypto.ts verifyPassword().
 */
import { execFileSync } from "node:child_process";

const [, , email, password, ...flags] = process.argv;
if (!email || !password) {
  console.error("usage: node scripts/rotate-partner-password.mjs <email> <new-password> [--remote] [--execute]");
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

const sql =
  `UPDATE partners SET password_hash = '${hash}' WHERE email = '${email.replace(/'/g, "''")}';\n` +
  `UPDATE partner_staff SET password_hash = '${hash}' WHERE email = '${email.replace(/'/g, "''")}';`;

if (!flags.includes("--execute")) {
  console.log("-- review, then re-run with --execute to apply --\n" + sql);
  process.exit(0);
}

const args = ["d1", "execute", "ota_production", "-c", "wrangler.jsonc", "--json", "--command", sql];
if (!flags.includes("--remote")) {
  args[2] = "ota_local";
  args[4] = "wrangler.local.jsonc";
  args.push("--local");
} else {
  args.push("--remote");
}
execFileSync("npx", ["wrangler", ...args], { stdio: "inherit" });
console.log(`password rotated for ${email}`);

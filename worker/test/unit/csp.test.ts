/** GAP-02 (2026-11-24 commercialization audit): the 3 portals ship a CSP. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** Extract the policy value from a Nuxt routeRules header or a _headers file. */
function policyOf(text: string): string {
  const ts = text.match(/Content-Security-Policy["']\s*:\s*"([^"]+)"/);
  if (ts) return ts[1];
  const line = text.split("\n").find((l) => l.trim().startsWith("Content-Security-Policy:"));
  if (line) return line.slice(line.indexOf(":") + 1).trim();
  assert.fail("no Content-Security-Policy entry found");
}

const HAS = ["default-src 'self'", "frame-ancestors 'self'", "base-uri 'self'", "object-src 'none'",
  "https://cdn.jsdelivr.net", "https://ota-hub.dnjstjqppk.workers.dev", "*.sentry.io"];

test("csp: user portal policy allows SSR inline scripts + Toss, nothing else remote", () => {
  const csp = policyOf(read("frontend-user/nuxt.config.ts"));
  for (const t of HAS) assert.ok(csp.includes(t), `missing ${t}`);
  assert.ok(csp.includes("script-src 'self' 'unsafe-inline' https://js.tosspayments.com"), "toss sdk + ssr inline");
  assert.ok(csp.includes("https://api.tosspayments.com"), "toss api");
  assert.ok(csp.includes("frame-src https://pay.tosspayments.com"), "toss frames");
  assert.ok(!csp.includes("unsafe-eval"), "no eval");
});

test("csp: admin + partner consoles run without inline scripts or Toss", () => {
  for (const f of ["frontend-admin/public/_headers", "frontend-partner/public/_headers"]) {
    const csp = policyOf(read(f));
    for (const t of HAS) assert.ok(csp.includes(t), `${f}: missing ${t}`);
    assert.ok(csp.includes("script-src 'self'"), `${f}: strict scripts`);
    assert.ok(!csp.includes("unsafe-inline"), `${f}: no inline allowance`);
    assert.ok(!csp.includes("unsafe-eval"), `${f}: no eval`);
    assert.ok(!csp.includes("tosspayments"), `${f}: consoles never touch the PG`);
  }
});

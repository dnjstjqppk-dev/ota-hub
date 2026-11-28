import { test } from "node:test";
import assert from "node:assert/strict";
import { authCookie, clearAllAuthCookies, loginCookies } from "../../src/lib/auth.ts";

const prod = { APP_ENV: "production", AUTH_COOKIE_DOMAIN: ".getfortrip.com" } as any;
const req = (host: string) => new Request(`https://${host}/api/v1/auth/login`, { method: "POST" });

test("only the customer jar spans the country subdomains", () => {
  assert.match(authCookie("t", prod, "getfortrip_jwt", 604800, req("kr.getfortrip.com")), /Domain=\.getfortrip\.com;/);
  // Admin and partner portals call the apex /api/* — their jars stay host-only.
  assert.doesNotMatch(authCookie("t", prod, "getfortrip_admin_jwt", 604800, req("getfortrip.com")), /Domain=/);
  assert.doesNotMatch(authCookie("t", prod, "getfortrip_partner_jwt", 0, req("getfortrip.com")), /Domain=/);
});

test("workers.dev, staging and local stay host-only", () => {
  assert.doesNotMatch(authCookie("t", prod, "getfortrip_jwt", 604800, req("ota-hub.x.workers.dev")), /Domain=/);
  assert.doesNotMatch(authCookie("t", { ...prod, APP_ENV: "development" }, "getfortrip_jwt", 604800, req("getfortrip.com")), /Domain=/);
  assert.doesNotMatch(authCookie("t", { APP_ENV: "production" } as any, "getfortrip_jwt", 604800, req("getfortrip.com")), /Domain=/);
});

test("login clears stale domain-scoped admin/partner jars; logout clears both scopes", () => {
  const login = loginCookies(prod, req("getfortrip.com"), "getfortrip_partner_jwt=t; Path=/;");
  assert.equal(login.length, 3);
  assert.ok(login.some((c) => /^getfortrip_partner_jwt=; Path=\/; Domain=\.getfortrip\.com;.*Max-Age=0/.test(c)));
  assert.ok(login.some((c) => /^getfortrip_admin_jwt=; Path=\/; Domain=\.getfortrip\.com;.*Max-Age=0/.test(c)));
  assert.deepEqual(loginCookies(prod, req("ota-hub.x.workers.dev"), "a"), ["a"]);

  const out = clearAllAuthCookies(prod, req("getfortrip.com"));
  for (const jar of ["getfortrip_jwt", "getfortrip_admin_jwt", "getfortrip_partner_jwt"]) {
    assert.equal(out.filter((c) => c.startsWith(`${jar}=;`)).length, 2, jar);
  }
});

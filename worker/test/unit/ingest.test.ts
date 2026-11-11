import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestAllowHosts, missingForPublish, validateUrlSafety } from "../../src/services/url-ingest-service.ts";

function blockedBy(u: string, codes: string[]): void {
  assert.throws(() => validateUrlSafety(u), (e: any) => e?.name !== undefined && codes.includes(e.code), `${u} must be rejected`);
}

test("blocks loopback, private ranges, metadata IP and non-http schemes", () => {
  for (const u of [
    "http://localhost/x", "http://localhost./x", "http://127.0.0.1/x", "http://127.1/x",
    "http://127.0.0.2/x", "http://127.1.2.3/x",
    "http://2130706433/x", "http://0.0.0.0/x", "http://10.1.2.3/x", "http://192.168.0.1/x",
    "http://172.16.0.1/x", "http://172.31.255.255/x", "http://169.254.169.254/x",
    "ftp://example.com/x", "file:///etc/passwd", "not a url",
  ]) {
    blockedBy(u, ["SSRF_BLOCKED", "DISALLOWED_PROTOCOL", "INVALID_URL"]);
  }
  // Public neighbours of the private ranges stay reachable.
  assert.equal(validateUrlSafety("http://172.15.0.1/x").hostname, "172.15.0.1");
  assert.equal(validateUrlSafety("http://172.32.0.1/x").hostname, "172.32.0.1");
  assert.equal(validateUrlSafety("http://127.example.com/x").hostname, "127.example.com");
});

test("blocks IPv6-internal spellings but not hostnames that merely start with fc/fd", () => {
  for (const u of [
    "http://[::1]/x", "http://[::]/x", "http://[::ffff:127.0.0.1]/x",
    "http://[::ffff:127.0.0.2]/x",
    "http://[::ffff:10.0.0.1]/x", "http://[::ffff:169.254.169.254]/x",
    "http://[fe80::1]/x", "http://[fc00::1]/x", "http://[fd12::1]/x",
  ]) {
    blockedBy(u, ["SSRF_BLOCKED"]);
  }
  assert.equal(validateUrlSafety("https://fcbayern.com/x").hostname, "fcbayern.com");
  assert.equal(validateUrlSafety("https://example.com/x").hostname, "example.com");
});

test("#57: allowlist opens only the named host, only off production", () => {
  assert.deepEqual(ingestAllowHosts({ APP_ENV: "development", INGEST_ALLOW_HOSTS: "127.0.0.1" }), ["127.0.0.1"]);
  assert.deepEqual(ingestAllowHosts({ APP_ENV: "test", INGEST_ALLOW_HOSTS: " 127.0.0.1 , LOCALHOST " }), ["127.0.0.1", "localhost"]);
  assert.deepEqual(ingestAllowHosts({ APP_ENV: "production", INGEST_ALLOW_HOSTS: "127.0.0.1" }), []);
  assert.deepEqual(ingestAllowHosts({ APP_ENV: "development" }), []);
  assert.deepEqual(ingestAllowHosts({ APP_ENV: "development", INGEST_ALLOW_HOSTS: "127.0.0.1:8080,[::1],ok-host.test" }), ["ok-host.test"]);
  // The named host passes; every other private spelling still blocks.
  assert.equal(validateUrlSafety("http://127.0.0.1:9/fixture", ["127.0.0.1"]).hostname, "127.0.0.1");
  for (const u of ["http://127.0.0.2/x", "http://10.0.0.1/x", "http://169.254.169.254/x", "http://localhost/x"]) {
    blockedByAllow(u, ["127.0.0.1"]);
  }
  // Empty list (production) blocks everything private, as before.
  blockedByAllow("http://127.0.0.1/x", []);
});

function blockedByAllow(u: string, allow: string[]): void {
  assert.throws(() => validateUrlSafety(u, allow), (e: any) => e?.code === "SSRF_BLOCKED", `${u} must stay blocked`);
}

test("missingForPublish: nothing sellable without title, KRW price, geo and policy", () => {
  assert.deepEqual(missingForPublish({ title: "t", price_minor: 1000, currency: "KRW", city: "c", country: "K", cancellation_policy: "p", domain_type: "ACTIVITY" }), []);
  assert.ok(missingForPublish({ title: "", price_minor: 0, currency: "KRW", city: "", country: "", cancellation_policy: "", domain_type: "ACTIVITY" }).length >= 4);
  assert.ok(missingForPublish({ title: "t", price_minor: 1000, currency: "USD", city: "c", country: "K", cancellation_policy: "p", domain_type: "ACTIVITY" }).includes("price_minor"));
  assert.ok(missingForPublish({ title: "t", price_minor: 1000, currency: "KRW", city: "c", country: "K", cancellation_policy: "p", address: "", domain_type: "HOTEL" }).includes("address"));
});

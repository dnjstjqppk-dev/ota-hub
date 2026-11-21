import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedOrigin } from "../../src/lib/http.ts";

const env = (o: Record<string, string>) => o as any;
const prod = env({ APP_ENV: "production", ALLOWED_ORIGINS: "" });

test("CORS allows all four first-party workers.dev origins", () => {
  for (const w of ["ota-hub", "ota-user", "ota-admin", "ota-partner"]) {
    const o = `https://${w}.dnjstjqppk.workers.dev`;
    assert.equal(allowedOrigin(o, prod), o);
  }
});

test("CORS rejects unknown origins and allows the list + apex subdomains", () => {
  assert.equal(allowedOrigin("https://evil.example.com", prod), null);
  assert.equal(allowedOrigin(null, prod), null);
  assert.equal(allowedOrigin("https://shop.getfortrip.com", prod), "https://shop.getfortrip.com");
  const listed = env({ APP_ENV: "production", ALLOWED_ORIGINS: "https://a.test, https://b.test" });
  assert.equal(allowedOrigin("https://b.test", listed), "https://b.test");
  assert.equal(allowedOrigin("https://c.test", listed), null);
});

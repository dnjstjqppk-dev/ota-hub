/** TG-15 edge-cache invalidation: URL builders + purge_cache client. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bareListUrls, channelPurgeUrls, productPurgeUrls, purgeForMutation, purgeUrls } from "../../src/lib/cache-purge.ts";

const req = (url: string) => ({ url }) as Request;

test("purge urls: one product maps to detail + bare list, fail-closed", () => {
  const r = req("https://ota-hub.test/api/v1/admin/catalog/HOTEL");
  assert.deepEqual(productPurgeUrls(r, "HOTEL", "htl_x1"), [
    "https://ota-hub.test/api/v1/hotels/htl_x1",
    "https://ota-hub.test/api/v1/hotels",
  ]);
  assert.deepEqual(productPurgeUrls(r, "activity", "act-9_Z"), [
    "https://ota-hub.test/api/v1/activities/act-9_Z",
    "https://ota-hub.test/api/v1/activities",
  ]);
  assert.deepEqual(productPurgeUrls(r, "SPACESHIP", "x"), []);
  assert.deepEqual(productPurgeUrls(r, "HOTEL", "../evil"), []);
  assert.deepEqual(productPurgeUrls(r, "HOTEL", "a".repeat(101)), []);
  assert.deepEqual(productPurgeUrls(req("gopher://x/y"), "HOTEL", "htl_x1"), []);
  assert.deepEqual(productPurgeUrls(req("not a url"), "HOTEL", "htl_x1"), []);
});

test("purge urls: channel set covers 7 lists + marketplace", () => {
  const urls = channelPurgeUrls(req("http://127.0.0.1:8798/api/v1/admin/suppliers/x"));
  assert.equal(urls.length, 8);
  assert.ok(urls.includes("http://127.0.0.1:8798/api/v1/hotels"));
  assert.ok(urls.includes("http://127.0.0.1:8798/api/v1/marketplace/catalog"));
  assert.deepEqual(channelPurgeUrls(req("bogus")), []);
  assert.deepEqual(bareListUrls(req("https://h.test/"), "FLIGHT"), ["https://h.test/api/v1/flights", "https://h.test/api/v1/marketplace/catalog"]);
  assert.deepEqual(bareListUrls(req("https://h.test/"), "NOPE"), []);
});

test("purge: no creds is an honest no-op; validation never throws", async () => {
  assert.deepEqual(await purgeUrls({} as any, ["https://h.test/a"]), { purged: 0, skipped: true });
  assert.deepEqual(await purgeUrls({ CACHE_PURGE_TOKEN: "t" } as any, ["https://h.test/a"]), { purged: 0, skipped: true });
  assert.deepEqual(await purgeUrls({} as any, []), { purged: 0, skipped: false });
  assert.equal((await purgeUrls({} as any, Array.from({ length: 51 }, (_, i) => `https://h.test/${i}`))).error, "TOO_MANY_URLS");
  assert.equal((await purgeUrls({} as any, ["ftp://h.test/a"])).error, "INVALID_URL");
  assert.equal((await purgeUrls({} as any, ["https://h.test/" + "a".repeat(500)])).error, "URL_TOO_LONG");
  assert.equal(await purgeForMutation({} as any, ["https://h.test/a"]), 0);
});

test("purge: stub transport proves the Cloudflare call shape + failure mapping", async () => {
  const env = { CACHE_PURGE_TOKEN: "tok", CLOUDFLARE_ZONE_ID: "zone9" } as any;
  let seen: any = null;
  const ok = async (url: string, init: any) => {
    seen = { url, init };
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  };
  const r = await purgeUrls(env, ["https://h.test/a", "https://h.test/a", "https://h.test/b"], ok as any);
  assert.deepEqual(r, { purged: 2, skipped: false });
  assert.equal(seen.url, "https://api.cloudflare.com/client/v4/zones/zone9/purge_cache");
  assert.equal(seen.init.headers.Authorization, "Bearer tok");
  assert.deepEqual(JSON.parse(seen.init.body), { files: ["https://h.test/a", "https://h.test/b"] });
  const down = async () => ({ ok: false, status: 500, json: async () => ({ success: false }) });
  assert.equal((await purgeUrls(env, ["https://h.test/a"], down as any)).error, "PURGE_FAILED");
  const throwing = async () => { throw new Error("net down"); };
  assert.equal((await purgeUrls(env, ["https://h.test/a"], throwing as any)).error, "PURGE_FAILED");
});

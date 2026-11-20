import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSitemapIndex, buildUrlset, childSitemap, DOMAIN_SITEMAPS, STATIC_SITEMAP_PATHS } from "../../src/seo/sitemap-index.ts";
import { llmsFullText, llmsText } from "../../src/seo/llms.ts";
import { enqueueIndexNow, indexnowPayload, productPageUrl, pumpIndexNow } from "../../src/seo/indexnow.ts";
import { fakeDb } from "./_fakedb.ts";

const env = (o: Record<string, any> = {}) => ({ PUBLIC_SITE_URL: "https://getfortrip.com", ...o }) as any;
const SITE = "https://getfortrip.com";

test("sitemap index lists static + one child per domain", () => {
  const xml = buildSitemapIndex(SITE, ["sitemap-static.xml", "sitemap-hotels.xml"], "2026-11-20");
  assert.match(xml, /<sitemapindex/);
  assert.match(xml, new RegExp(`<loc>${SITE}/sitemap-hotels\\.xml</loc><lastmod>2026-11-20</lastmod>`));
  assert.equal(DOMAIN_SITEMAPS.length, 7);
  assert.ok(STATIC_SITEMAP_PATHS.includes("/esim") && STATIC_SITEMAP_PATHS.includes("/insurance"));
  assert.ok(!STATIC_SITEMAP_PATHS.some((p) => p.startsWith("/my") || p.startsWith("/checkout") || p.startsWith("/booking")));
});

test("child sitemap: static paths + per-domain ids, unknown slug 404s", async () => {
  const db = fakeDb({ all: (sql) => (sql.includes("FROM hotels") ? [{ id: "H1" }, { id: "bad id!" }] : []) });
  const r = await childSitemap(env({ DB: db }), "sitemap-hotels.xml");
  assert.ok(r && r.headers.get("Content-Type")!.includes("application/xml"));
  const body = await r!.text();
  assert.match(body, /\/hotels\/detail\/H1</);
  assert.doesNotMatch(body, /bad id/);
  const s = await childSitemap(env({ DB: db }), "sitemap-static.xml");
  assert.match(await s!.text(), new RegExp(`<loc>${SITE}/esim</loc>`));
  assert.equal(await childSitemap(env({ DB: db }), "sitemap-esim.xml"), null);
  assert.equal(buildUrlset(SITE + "/", ["/a", "/a"]).match(/<url>/g)!.length, 1);
});

test("llms briefs name the sitemap index, affiliate limits, and off-limits paths", () => {
  for (const t of [llmsText(SITE), llmsFullText(SITE)]) {
    assert.match(t, /sitemap-index\.xml/);
    assert.match(t, /\/my \/checkout \/booking/);
    assert.match(t, /eSIM/);
  }
  assert.match(llmsFullText(SITE), /things-to-do\/detail\/\{id\}/);
  assert.match(llmsFullText(SITE), /Never invent phone numbers/);
});

test("indexnow: payload shape, page urls, enqueue + pump lifecycle", async () => {
  const p = indexnowPayload(SITE, "k123", ["https://getfortrip.com/hotels", "https://getfortrip.com/hotels"]);
  assert.deepEqual(p, { host: "getfortrip.com", key: "k123", keyLocation: "https://getfortrip.com/k123.txt", urlList: ["https://getfortrip.com/hotels"] });
  assert.equal(productPageUrl(env(), "ACTIVITY", "A9"), `${SITE}/things-to-do/detail/A9`);
  assert.equal(productPageUrl(env(), "ESIM", "E1"), "");
  assert.equal(productPageUrl(env(), "HOTEL", "bad id"), "");

  const seen: string[] = [];
  const db = { ...fakeDb({ all: () => [{ url: `${SITE}/hotels/detail/H1`, attempts: 0 }] }), batch: async (ss: any[]) => { seen.push(...ss.map(() => "q")); return []; } };
  assert.equal(await enqueueIndexNow(env({ DB: db }), ["notaurl", `${SITE}/hotels/detail/H1`]), 1);
  assert.equal(await enqueueIndexNow(env({ DB: null as any }), [`${SITE}/x`]), 0);
  const noKey = await pumpIndexNow(env({ DB: db }));
  assert.deepEqual(noKey, { submitted: 0, failed: 0, skipped: true });
  const ok = await pumpIndexNow(env({ DB: db, INDEXNOW_KEY: "k" }), async (pl) => (assert.equal(pl.urlList.length, 1), { ok: true, status: 202 }));
  assert.deepEqual(ok, { submitted: 1, failed: 0, skipped: false });
  const fail = await pumpIndexNow(env({ DB: db, INDEXNOW_KEY: "k" }), async () => ({ ok: false, status: 429 }));
  assert.deepEqual(fail, { submitted: 0, failed: 1, skipped: false });
});

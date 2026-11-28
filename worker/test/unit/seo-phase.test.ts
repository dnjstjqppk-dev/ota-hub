import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProductUrlset, buildSitemapIndex, buildUrlset, childSitemap, DOMAIN_SITEMAPS, STATIC_SITEMAP_PATHS } from "../../src/seo/sitemap-index.ts";
import { llmsFullText, llmsText } from "../../src/seo/llms.ts";
import { enqueueIndexNow, indexnowKeyFile, indexnowPayload, productPageUrl, pumpIndexNow } from "../../src/seo/indexnow.ts";
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
  // <loc> is the ko-KR subdomain canonical: the bare apex always redirects.
  assert.ok(body.includes("<loc>https://kr.getfortrip.com/hotels/detail/H1?locale=ko-kr</loc>"));
  assert.doesNotMatch(body, /<loc>https:\/\/getfortrip\.com/);
  assert.doesNotMatch(body, /bad id/);
  const s = await childSitemap(env({ DB: db }), "sitemap-static.xml");
  assert.ok((await s!.text()).includes("<loc>https://kr.getfortrip.com/esim?locale=ko-kr</loc>"));
  assert.equal(await childSitemap(env({ DB: db }), "sitemap-esim.xml"), null);
  assert.equal(buildUrlset(SITE + "/", ["/a", "/a"]).match(/<url>/g)!.length, 1);
});

test("child sitemap: per-url lastmod, hreflang alternates, pre-0059 fallback", async () => {
  const db = fakeDb({ all: (sql: string) => (sql.includes("FROM hotels")
    ? [{ id: "H1", u: "2026-11-20T09:00:00.000Z" }, { id: "H2" }]
    : []) });
  const body = await (await childSitemap(env({ DB: db }), "sitemap-hotels.xml"))!.text();
  assert.match(body, /\/hotels\/detail\/H1\?locale=ko-kr<\/loc><lastmod>2026-11-20<\/lastmod>/);
  assert.doesNotMatch(body, /\/hotels\/detail\/H2\?locale=ko-kr<\/loc><lastmod>/);
  assert.ok(body.includes(`<xhtml:link rel="alternate" hreflang="x-default" href="https://www.getfortrip.com/hotels/detail/H1?locale=en-us"/>`));
  assert.ok(body.includes(`<xhtml:link rel="alternate" hreflang="ko-KR" href="https://kr.getfortrip.com/hotels/detail/H1?locale=ko-kr"/>`));
  assert.ok(body.includes(`<xhtml:link rel="alternate" hreflang="ja-JP" href="https://jp.getfortrip.com/hotels/detail/H1?locale=ja-jp"/>`));
  assert.match(body, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.equal(body.match(/<xhtml:link/g)!.length, 14);
  const s = await (await childSitemap(env({ DB: db }), "sitemap-static.xml"))!.text();
  assert.match(s, /<loc>https:\/\/kr\.getfortrip\.com\/esim\?locale=ko-kr<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod><xhtml:link/);
  const legacy = fakeDb({ all: (sql: string) => {
    if (sql.includes("updated_at")) throw new Error("no such column");
    return sql.includes("FROM hotels") ? [{ id: "H9" }] : [];
  } });
  const lb = await (await childSitemap(env({ DB: legacy }), "sitemap-hotels.xml"))!.text();
  assert.match(lb, /\/hotels\/detail\/H9\?locale=ko-kr</);
  assert.doesNotMatch(lb, /<lastmod>/);
});

test("urlset builders escape XML metacharacters", () => {
  const xml = buildUrlset(SITE, ["/x?a=1&b=2", "/<q>'\""]);
  assert.ok(xml.includes("/x?a=1&amp;b=2&amp;locale=ko-kr"));
  assert.ok(xml.includes("/&lt;q&gt;&apos;&quot;"));
  assert.doesNotMatch(xml, /&(?!amp;|lt;|gt;|apos;|quot;)/);
  const prod = buildProductUrlset(SITE, [{ path: "/a&b", updated: "2026-11-20" }]);
  assert.ok(prod.includes("/a&amp;b"));
  assert.match(prod, /<lastmod>2026-11-20<\/lastmod>/);
});

test("llms briefs name the sitemap index, affiliate limits, and off-limits paths", () => {
  for (const t of [llmsText(SITE), llmsFullText(SITE)]) {
    assert.match(t, /sitemap-index\.xml/);
    assert.match(t, /\/my \/checkout \/booking/);
    assert.match(t, /eSIM/);
  }
  assert.match(llmsFullText(SITE), /things-to-do\/detail\/\{id\}/);
  assert.match(llmsFullText(SITE), /Never invent phone numbers/);
  assert.match(llmsFullText(SITE), /api\/v1\/seo\/md\/\{HOTEL\|/);
});

test("indexnow: payload shape, page urls, enqueue + pump lifecycle", async () => {
  const p = indexnowPayload(SITE, "k123", ["https://getfortrip.com/hotels", "https://getfortrip.com/hotels"]);
  assert.deepEqual(p, { host: "getfortrip.com", key: "k123", keyLocation: "https://getfortrip.com/api/v1/seo/indexnow/k123.txt", urlList: ["https://getfortrip.com/hotels"] });
  assert.equal(productPageUrl(env(), "ACTIVITY", "A9"), `${SITE}/things-to-do/detail/A9`);
  assert.equal(productPageUrl(env(), "ESIM", "E1"), "");
  assert.equal(productPageUrl(env(), "HOTEL", "bad id"), "");

  const seen: string[] = [];
  const db = { ...fakeDb({ all: () => [{ url: `${SITE}/hotels/detail/H1`, attempts: 0 }] }), batch: async (ss: any[]) => { seen.push(...ss.map(() => "q")); return []; } };
  assert.equal(await enqueueIndexNow(env({ DB: db, INDEXNOW_KEY: "k" }), ["notaurl", `${SITE}/hotels/detail/H1`]), 1);
  assert.equal(await enqueueIndexNow(env({ DB: db }), [`${SITE}/hotels/detail/H1`]), 0);
  assert.equal(await enqueueIndexNow(env({ DB: null as any, INDEXNOW_KEY: "k" }), [`${SITE}/x`]), 0);
  const noKey = await pumpIndexNow(env({ DB: db }));
  assert.deepEqual(noKey, { submitted: 0, failed: 0, skipped: true });
  const ok = await pumpIndexNow(env({ DB: db, INDEXNOW_KEY: "k" }), async (pl) => (assert.equal(pl.urlList.length, 1), { ok: true, status: 202 }));
  assert.deepEqual(ok, { submitted: 1, failed: 0, skipped: false });
  const fail = await pumpIndexNow(env({ DB: db, INDEXNOW_KEY: "k" }), async () => ({ ok: false, status: 429 }));
  assert.deepEqual(fail, { submitted: 0, failed: 1, skipped: false });
});

test("indexnow key file: exact match 200 text/plain, mismatch or unset key 404", async () => {
  const ok = indexnowKeyFile(env({ INDEXNOW_KEY: "k123" }), "k123");
  assert.equal(ok.status, 200);
  assert.ok(ok.headers.get("Content-Type")!.includes("text/plain"));
  assert.equal(await ok.text(), "k123");
  assert.equal(indexnowKeyFile(env({ INDEXNOW_KEY: "k123" }), "other").status, 404);
  assert.equal(indexnowKeyFile(env({}), "k123").status, 404);
  assert.equal(indexnowKeyFile(env({ INDEXNOW_KEY: "" }), "").status, 404);
});

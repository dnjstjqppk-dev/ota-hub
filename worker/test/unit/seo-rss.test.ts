import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRss, collectRssItems, rssFeed } from "../../src/seo/rss.ts";
import { fakeDb } from "./_fakedb.ts";

const SITE = "https://getfortrip.com";
const env = (o: Record<string, any> = {}) => ({ PUBLIC_SITE_URL: SITE, ...o }) as any;

const rows: Record<string, any[]> = {
  hotels: [{ id: "H1", name_ko: "테스트 호텔", city: "서울", base_price_krw: 85000, created_at: "2026-11-20T09:00:00.000Z" }],
  flights: [{ id: "F1", airline_name: "에어", flight_number: "KE1", departure_city: "서울", arrival_city: "도쿄", base_price_krw: 120000, created_at: "2026-11-21T09:00:00.000Z" }],
  trains: [],
  cars: [{ id: "bad id!", company_name: "X", vehicle_model: "Y", daily_price_krw: 1, created_at: "2026-11-22T09:00:00.000Z" }],
  transfers: [{ id: "T1", service_title: "픽업", destination_area: "명동", price_krw: 45000, created_at: "not-a-date" }],
  activities: [{ id: "A1", title: "투어", city: "부산", price_krw: 59000, created_at: "2026-11-22T09:00:00.000Z" }],
  packages: [{ id: "P1", title: "패키지", destination_city: "다낭", total_package_krw: 300000, total_original_krw: 400000, created_at: "2026-11-19T09:00:00.000Z" }],
};
const tableOf = (sql: string) => ["hotels", "flights", "trains", "cars", "transfers", "activities", "packages"].find((t) => sql.includes(`FROM ${t}`));
const db = fakeDb({ all: (sql: string) => rows[tableOf(sql)!] || [] });

test("rss collects newest-first items with honest fields", async () => {
  const items = await collectRssItems(env({ DB: db }));
  assert.deepEqual(items.map((i) => i.link), [
    `${SITE}/things-to-do/detail/A1`,
    `${SITE}/flights/detail/F1`,
    `${SITE}/hotels/detail/H1`,
    `${SITE}/packages/detail/P1`,
  ]);
  assert.equal(items[0].title, "투어");
  assert.equal(items[0].description, "부산 · 59,000원");
  assert.equal(items[0].pubDate, new Date("2026-11-22T09:00:00.000Z").toUTCString());
  assert.equal(items[1].description, "서울→도쿄 · 120,000원");
  assert.equal(items[3].description, "다낭 · 300,000원 · 정가 400,000원 특가");
});

test("rss caps at 50, skips bad rows, survives missing tables", async () => {
  const many = Array.from({ length: 51 }, (_, i) => ({ id: `H${i}`, name_ko: `H${i}`, city: "서울", base_price_krw: 1000, created_at: "2026-11-20T09:00:00.000Z" }));
  const db2 = fakeDb({ all: (sql: string) => {
    if (sql.includes("FROM flights")) throw new Error("no such table");
    if (sql.includes("FROM hotels")) return many;
    return [];
  } });
  const items = await collectRssItems(env({ DB: db2 }));
  assert.equal(items.length, 50);
  const empty = await collectRssItems(env({ DB: fakeDb({ all: () => [] }) }));
  assert.deepEqual(empty, []);
});

test("rss feed renders valid escaped xml", async () => {
  const r = await rssFeed(env({ DB: db }));
  assert.equal(r.status, 200);
  assert.ok(r.headers.get("Content-Type")!.includes("application/rss+xml"));
  assert.ok(r.headers.get("Cache-Control")!.includes("max-age=3600"));
  const body = await r.text();
  assert.match(body, /<rss version="2.0">/);
  assert.match(body, /<title>getfortrip 특가·신규 상품<\/title>/);
  const esc = buildRss(SITE, [{ title: "A&B <Q>", link: `${SITE}/x?a=1&b=2`, pubDate: "D", description: "d'e" }]);
  assert.ok(esc.includes("A&amp;B &lt;Q&gt;") && esc.includes("/x?a=1&amp;b=2") && esc.includes("d&apos;e"));
  assert.doesNotMatch(esc, /&(?!amp;|lt;|gt;|apos;|quot;)/);
});

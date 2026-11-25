import { test } from "node:test";
import assert from "node:assert/strict";
import { collectLlmsFacts, llmsFull, llmsFullText, llmsText, llmsTxt } from "../../src/seo/llms.ts";
import { fakeDb } from "./_fakedb.ts";

const SITE = "https://getfortrip.com";
const env = (o: Record<string, any> = {}) => ({ PUBLIC_SITE_URL: SITE, ...o }) as any;

const COUNTS: Record<string, number> = {
  hotels: 1234, flights: 56, trains: 0, cars: 7, transfers: 3, activities: 41, packages: 2,
};
const CITIES: Record<string, { c: string; n: number }[]> = {
  hotels: [{ c: "서울", n: 5 }, { c: "도쿄", n: 3 }],
  activities: [{ c: "서울", n: 2 }],
  packages: [{ c: "도쿄", n: 2 }, { c: "부산", n: 1 }],
};
const RANGES: Record<string, { lo: number; hi: number }> = {
  hotels: { lo: 9000, hi: 550000 }, flights: { lo: 120000, hi: 890000 }, trains: { lo: 15000, hi: 15000 },
  cars: { lo: 60000, hi: 60000 }, transfers: { lo: 45000, hi: 45000 }, activities: { lo: 59000, hi: 59000 },
  packages: { lo: 300000, hi: 300000 },
};
const tableOf = (sql: string) => ["hotels", "flights", "trains", "cars", "transfers", "activities", "packages"].find((t) => sql.includes(`FROM ${t}`));

const fullDb = fakeDb({
  first: (sql: string) => {
    const t = tableOf(sql)!;
    if (sql.includes("COUNT(*)")) return { n: COUNTS[t] };
    if (sql.includes("MIN(")) return RANGES[t];
    return null;
  },
  all: (sql: string) => CITIES[tableOf(sql)!] || [],
});

test("llms facts equal the query results", async () => {
  const f = await collectLlmsFacts(env({ DB: fullDb }));
  assert.deepEqual(f.counts.map((c) => [c.domain, c.count]), [
    ["Hotels", 1234], ["Flights", 56], ["Trains", 0], ["Cars", 7],
    ["Transfers", 3], ["Tours", 41], ["Packages", 2],
  ]);
  assert.deepEqual(f.cities, [
    { city: "서울", count: 7 }, { city: "도쿄", count: 5 }, { city: "부산", count: 1 },
  ]);
  assert.equal(f.priceMin, 9000);
  assert.equal(f.priceMax, 890000);
  const txt = llmsFullText(SITE, f);
  assert.match(txt, /- Hotels: 1,234 public products/);
  assert.match(txt, /- Trains: 0 public products/);
  assert.match(txt, /- Top cities: 서울 \(7\), 도쿄 \(5\), 부산 \(1\)/);
  assert.match(txt, /- Price range \(KRW\): 9,000–890,000/);
  assert.match(txt, /- Payment currencies: KRW/);
  assert.match(txt, /- Locales: ko, en, ja, zh/);
  assert.match(txt, new RegExp(`- Last aggregated: ${f.at.replace(/[.:]/g, (c) => `\\${c}`)}`));
});

test("llms full is 200 on an empty db and on missing tables", async () => {
  const emptyDb = fakeDb({
    first: (sql: string) => (sql.includes("COUNT(*)") ? { n: 0 } : { lo: null, hi: null }),
    all: () => [],
  });
  const r = await llmsFull(env({ DB: emptyDb }));
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.match(body, /- Hotels: 0 public products/);
  assert.doesNotMatch(body, /Top cities/);
  assert.doesNotMatch(body, /Price range/);
  assert.match(body, /- Payment currencies: KRW/);
  assert.match(body, /- Locales: ko, en, ja, zh/);
  assert.match(body, /- Last aggregated: \d{4}-\d{2}-\d{2}T/);

  const noDb = fakeDb({
    first: () => { throw new Error("no such table"); },
    all: () => { throw new Error("no such table"); },
  });
  const r2 = await llmsFull(env({ DB: noDb }));
  assert.equal(r2.status, 200);
  const b2 = await r2.text();
  assert.doesNotMatch(b2, /public products/);
  assert.doesNotMatch(b2, /Top cities/);
  assert.doesNotMatch(b2, /Price range/);
  assert.match(b2, /- Payment currencies: KRW/);
  assert.doesNotMatch(b2, /## Company/);
  assert.match(b2, /- Locales: ko, en, ja, zh/);
});

test("llms company lines render only when env carries them", async () => {
  const db = fakeDb({ first: () => ({ n: 0 }), all: () => [] });
  const bare = await (await llmsFull(env({ DB: db }))).text();
  assert.doesNotMatch(bare, /## Company/);
  const full = await (await llmsFull(env({
    DB: db, COMPANY_NAME: "주식회사 겟포", COMPANY_CEO: "홍길동",
    COMPANY_ADDRESS: "서울", COMPANY_BIZ_NO: "123-45-67890",
  }))).text();
  assert.match(full, /- Legal name: 주식회사 겟포/);
  assert.match(full, /- CEO: 홍길동/);
  assert.match(full, /- Address: 서울/);
  assert.match(full, /- Business registration: 123-45-67890/);
});

test("llms brief names locale paths; full caches one hour", async () => {
  assert.match(llmsText(SITE), /\/en \/ja \/zh/);
  assert.match(llmsText(SITE), new RegExp(`${SITE}/en/hotels`));
  const db = fakeDb({ first: () => ({ n: 0 }), all: () => [] });
  const full = await llmsFull(env({ DB: db }));
  assert.ok(full.headers.get("Cache-Control")!.includes("max-age=3600"));
  assert.ok(full.headers.get("Content-Type")!.includes("text/plain"));
  const brief = llmsTxt(env({ DB: db }));
  assert.ok(brief.headers.get("Cache-Control")!.includes("max-age=86400"));
});

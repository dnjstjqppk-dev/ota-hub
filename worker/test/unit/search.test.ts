/** TG-16 unified search: query building, bookability, backend seam, terms. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookableFor, buildMatchExpression, clearSearchCache, hasCjk, normalizeQuery,
  popularTerms, setSearchBackend, unifiedSearch, type SearchBackend,
} from "../../src/services/search-service.ts";
import { fakeDb } from "./_fakedb.ts";

test("search match: terms are quoted, junk and booleans stripped, capped", () => {
  assert.equal(buildMatchExpression("seoul hotel"), '"seoul" "hotel"');
  assert.equal(buildMatchExpression('a"b*c:d(e)^f'), '"a" "b" "c" "d" "e" "f"');
  assert.equal(buildMatchExpression("AND OR NOT"), null);
  assert.equal(buildMatchExpression("  "), null);
  assert.equal(buildMatchExpression("서울 호텔"), '"서울" "호텔"');
  const many = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
  assert.equal(buildMatchExpression(many)!.split(" ").length, 20);
  assert.ok(hasCjk("서울"));
  assert.ok(hasCjk("東京ホテル"));
  assert.ok(!hasCjk("Seoul Hotel"));
});

test("search normalize: clamps, domain gate, range sanity", () => {
  const q = normalizeQuery({ q: "x", limit: 999, offset: -5 });
  assert.equal(q.limit, 50);
  assert.equal(q.offset, 0);
  assert.equal(normalizeQuery({ q: "", domain: "HOTEL" }).domain, "HOTEL");
  assert.equal(normalizeQuery({ q: "", domain: "NOPE" as any }).domain, null);
  assert.equal(normalizeQuery({ q: "", minPrice: 100, maxPrice: 50 }).minPrice, 50);
  assert.equal(normalizeQuery({ q: "", minRating: 9 }).minRating, null);
  assert.equal(normalizeQuery({ q: "", sort: "price_desc" }).sort, "price_desc");
  assert.equal(normalizeQuery({ q: "", sort: "evil" as any }).sort, "rank");
});

test("search bookable: supplier map + FLIGHT override + defaults", () => {
  const map = new Map([
    ["ptn_htl_01", { bookable: true, reason: "OK", mode: "LIVE", adapter: "simulator" }],
    ["ptn_flt_01", { bookable: true, reason: "OK", mode: "LIVE", adapter: "direct_contract" }],
  ]);
  assert.deepEqual(bookableFor(map as any, "HOTEL", "ptn_htl_01"), { bookable: true, reason: "OK", mode: "LIVE" });
  assert.deepEqual(bookableFor(map as any, "HOTEL", "ghost"), { bookable: false, reason: "SUPPLIER_NOT_REGISTERED", mode: null });
  assert.deepEqual(bookableFor(map as any, "FLIGHT", "ptn_flt_01"), { bookable: false, reason: "FLIGHT_TICKETING_UNSUPPORTED", mode: null });
  assert.deepEqual(bookableFor(map as any, "TRAIN", null).reason, "SUPPLIER_NOT_REGISTERED");
});

test("search seam: injected backend serves, second call hits the hot cache", async () => {
  clearSearchCache();
  let calls = 0;
  const fake: SearchBackend = {
    name: "fake",
    search: async () => {
      calls++;
      return {
        hits: [
          { domain: "HOTEL", itemId: "h1", title: "Seoul Stay", city: "서울", priceKrw: 100000, rating: 4.5, supplierId: "ptn_htl_01", rank: 1 },
          { domain: "HOTEL", itemId: "h2", title: "Busan Stay", city: "부산", priceKrw: 80000, rating: 4.0, supplierId: null, rank: 2 },
        ],
        cities: [{ city: "서울", count: 1 }],
        domains: [{ domain: "HOTEL", count: 2 }],
      };
    },
  };
  setSearchBackend(fake);
  try {
    const env = { DB: fakeDb() } as any;
    const r1 = await unifiedSearch(env, { q: "stay", limit: 1 });
    assert.equal(calls, 1);
    assert.equal(r1.hits.length, 1);
    assert.equal(r1.hasMore, true);
    assert.equal(r1.meta.cached, false);
    assert.equal(r1.hits[0].bookableReason, "SUPPLIER_NOT_REGISTERED");
    const r2 = await unifiedSearch(env, { q: "stay", limit: 1 });
    assert.equal(calls, 1);
    assert.equal(r2.meta.cached, true);
    assert.deepEqual(r2.hits, r1.hits);
  } finally {
    setSearchBackend(null);
    clearSearchCache();
  }
});

test("search terms: JS aggregation over recent search events", async () => {
  const rows = [
    { meta_json: JSON.stringify({ q: "seoul" }) },
    { meta_json: JSON.stringify({ q: "seoul" }) },
    { meta_json: JSON.stringify({ q: "tokyo" }) },
    { meta_json: "not-json" },
    { meta_json: JSON.stringify({}) },
  ];
  const env = { DB: fakeDb({ all: () => rows }) } as any;
  assert.deepEqual(await popularTerms(env, 7, 10), [{ q: "seoul", count: 2 }, { q: "tokyo", count: 1 }]);
  assert.deepEqual(await popularTerms(env, 7, 1), [{ q: "seoul", count: 2 }]);
});

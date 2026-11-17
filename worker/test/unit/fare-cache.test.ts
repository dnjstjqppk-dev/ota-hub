import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { FlightOffer } from "../../src/suppliers/adapter.ts";
import {
  FARE_TTL_SEC,
  fareCacheGet,
  fareCacheKey,
  fareCacheSet,
  fareCacheStale,
  recentCachedOffers,
  resetFareHotCache,
} from "../../src/suppliers/fare-cache.ts";

/** TG-18: fare cache — isolate hot layer over a fake fare_cache table. */

const offer = (id: string): FlightOffer => ({
  offerId: id, airline: "KE", flightNo: "KE703", from: "ICN", to: "NRT",
  date: "2027-01-10", amountMinor: 605000, currency: "KRW", expiresAt: "2027-01-10T00:00:00Z",
});

function fakeDb() {
  const rows = new Map<string, { response_json: string; expires_at: number; created_at: number }>();
  const counts = { selects: 0, writes: 0 };
  const db = {
    rows,
    counts,
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              counts.selects += 1;
              const key = args[0] as string;
              const r = rows.get(key);
              if (!r) return null;
              if (sql.includes("expires_at > ?") && !(r.expires_at > (args[1] as number))) return null;
              return { response_json: r.response_json, created_at: r.created_at } as T;
            },
            async all<T>(): Promise<{ results: T[] }> {
              counts.selects += 1;
              // recentCachedOffers: LIKE 'fare:{a}:{f}:{t}:%' + expiry + newest first.
              const prefix = (args[0] as string).replace(/%$/, "");
              const now = args[1] as number;
              const limit = args[2] as number;
              return {
                results: [...rows.entries()]
                  .filter(([k, r]) => k.startsWith(prefix) && r.expires_at > now)
                  .sort((a, b) => b[1].created_at - a[1].created_at)
                  .slice(0, limit)
                  .map(([_, r]) => ({ response_json: r.response_json }) as T),
              };
            },
            async run(): Promise<unknown> {
              counts.writes += 1;
              rows.set(args[0] as string, { response_json: args[1] as string, expires_at: args[2] as number, created_at: args[3] as number });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return db;
}

beforeEach(() => resetFareHotCache());

test("fare-cache: key pins adapter, route, date, party, and airline", () => {
  assert.equal(FARE_TTL_SEC, 900);
  assert.equal(fareCacheKey("ndc", "ICN", "NRT", "2027-01-10", 2, null), "fare:ndc:ICN:NRT:2027-01-10:2:*");
  assert.equal(fareCacheKey("gds", "ICN", "NRT", "2027-01-10", 1, "KE"), "fare:gds:ICN:NRT:2027-01-10:1:KE");
});

test("fare-cache: set writes both layers; get serves hot without touching D1", async () => {
  const db = fakeDb();
  await fareCacheSet(db, "k1", [offer("o1")], 1_000_000);
  assert.equal(db.rows.size, 1);
  assert.equal(db.counts.writes, 1);
  const hit = await fareCacheGet(db, "k1", 1_000_001);
  assert.ok(hit);
  assert.equal(hit.source, "hot");
  assert.deepEqual(hit.offers.map((o) => o.offerId), ["o1"]);
  assert.equal(db.counts.selects, 0);
});

test("fare-cache: cold hot layer falls back to the D1 row and re-warms hot", async () => {
  const db = fakeDb();
  await fareCacheSet(db, "k2", [offer("o2")], 2_000_000);
  resetFareHotCache(); // simulate another isolate with a cold hot layer
  const d1 = await fareCacheGet(db, "k2", 2_000_001);
  assert.ok(d1);
  assert.equal(d1.source, "d1");
  assert.equal(db.counts.selects, 1);
  const hot = await fareCacheGet(db, "k2", 2_000_002);
  assert.ok(hot);
  assert.equal(hot.source, "hot");
  assert.equal(db.counts.selects, 1);
});

test("fare-cache: expired everywhere reads null; stale reads the old row", async () => {
  const db = fakeDb();
  await fareCacheSet(db, "k3", [offer("o3")], 3_000_000);
  const late = 3_000_000 + FARE_TTL_SEC * 1000 + 1;
  assert.equal(await fareCacheGet(db, "k3", late), null);
  const stale = await fareCacheStale(db, "k3");
  assert.ok(stale);
  assert.deepEqual(stale.offers.map((o) => o.offerId), ["o3"]);
  assert.equal(await fareCacheStale(db, "missing"), null);
});

test("fare-cache: corrupt rows read as missing, never throw", async () => {
  const db = fakeDb();
  await fareCacheSet(db, "k4", [offer("o4")], 4_000_000);
  db.rows.get("k4")!.response_json = "{oops";
  resetFareHotCache();
  assert.equal(await fareCacheGet(db, "k4", 4_000_001), null);
  assert.equal(await fareCacheStale(db, "k4"), null);
});

test("fare-cache: recentCachedOffers returns newest-first flagged alternates", async () => {
  const db = fakeDb();
  const k1 = fareCacheKey("ndc", "ICN", "NRT", "2027-01-10", 1, null);
  const k2 = fareCacheKey("ndc", "ICN", "NRT", "2027-01-11", 1, null);
  const other = fareCacheKey("ndc", "ICN", "KIX", "2027-01-10", 1, null);
  await fareCacheSet(db, k1, [offer("old")], 5_000_000);
  await fareCacheSet(db, k2, [offer("new1"), offer("new2")], 5_100_000);
  await fareCacheSet(db, other, [offer("wrong-route")], 5_200_000);
  const alt = await recentCachedOffers(db, "ndc", "ICN", "NRT", 3, 5_300_000);
  assert.deepEqual(alt.map((o) => o.offerId), ["new1", "new2", "old"]);
  assert.ok(alt.every((o) => o.cached === true));
  assert.deepEqual(await recentCachedOffers(db, "gds", "ICN", "NRT", 3, 5_300_000), []);
  // Expired rows never surface as alternates.
  assert.deepEqual(await recentCachedOffers(db, "ndc", "ICN", "NRT", 3, 9_000_000), []);
});

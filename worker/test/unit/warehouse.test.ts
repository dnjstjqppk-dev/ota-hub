import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../../src/lib/http.ts";
import { assertRollupDate, rollupDaily, rollupDailyJob, shiftDay } from "../../src/services/warehouse.ts";

/** TG-19: warehouse batch against a fake Db (SQL matched by shape). */

interface BookingRow { domain_type: string; c: number }
interface FunnelRow { domain_type: string; event_type: string; c: number }

function fakeDb(opts: { bookings?: BookingRow[]; gmv?: BookingRow[]; funnel?: FunnelRow[]; factFresh?: number; pairCount?: number; popularCount?: number } = {}) {
  const facts: any[] = [];
  const calls: string[] = [];
  const db = {
    facts,
    calls,
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              calls.push(`first:${sql.slice(0, 60)}`);
              if (sql.includes("FROM fact_daily")) return { c: opts.factFresh ?? 0 } as T;
              if (sql.includes("FROM reco_pairs")) return { c: opts.pairCount ?? 0 } as T;
              if (sql.includes("FROM reco_popular")) return { c: opts.popularCount ?? 0 } as T;
              return null;
            },
            async all<T>(): Promise<{ results: T[] }> {
              calls.push(`all:${sql.slice(0, 60)}`);
              if (sql.includes("FROM bookings WHERE substr")) return { results: (opts.bookings || []) as T[] };
              if (sql.includes("FROM payments p")) return { results: (opts.gmv || []) as T[] };
              if (sql.includes("FROM analytics_events WHERE substr")) return { results: (opts.funnel || []) as T[] };
              return { results: [] };
            },
            async run(): Promise<any> {
              calls.push(`run:${sql.slice(0, 40)}`);
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(stmts: any[]): Promise<any> {
      calls.push(`batch:${stmts.length}`);
      facts.push(stmts.length);
      return stmts.map(() => ({ meta: { changes: 1 } }));
    },
  };
  return db;
}

test("warehouse: date validation and day shifting", () => {
  assertRollupDate("2026-11-17");
  assert.throws(() => assertRollupDate("2026-1-1"), (e: unknown) => e instanceof HttpError && e.code === "INVALID_ROLLUP_DATE");
  assert.throws(() => assertRollupDate("nope"), (e: unknown) => e instanceof HttpError);
  assert.equal(shiftDay("2026-11-17", -1), "2026-11-16");
  assert.equal(shiftDay("2026-11-17", 6), "2026-11-23");
  assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
  assert.throws(() => shiftDay("xx", 1), (e: unknown) => e instanceof HttpError);
});

test("warehouse: rollupDaily aggregates per-domain facts and rebuilds marts", async () => {
  const db = fakeDb({
    bookings: [{ domain_type: "HOTEL", c: 3 }, { domain_type: "FLIGHT", c: 1 }],
    gmv: [{ domain_type: "HOTEL", c: 90000 }],
    funnel: [
      { domain_type: "HOTEL", event_type: "search", c: 10 },
      { domain_type: "HOTEL", event_type: "view", c: 7 },
      { domain_type: "FLIGHT", event_type: "search", c: 4 },
    ],
    pairCount: 12,
    popularCount: 9,
  });
  const s = await rollupDaily(db as any, "2026-11-17");
  assert.equal(s.rows, 7);
  assert.equal(s.bookings, 4);
  assert.equal(s.gmvMinor, 90000);
  assert.equal(s.searches, 14);
  assert.equal(s.views, 7);
  assert.equal(s.pairs, 12);
  assert.equal(s.popular, 9);
  assert.equal(s.skipped, 0);
  assert.deepEqual(db.facts, [7], "one batch of 7 domain upserts");
  assert.ok(db.calls.some((c) => c.startsWith("run:DELETE FROM reco_pairs")));
  assert.ok(db.calls.some((c) => c.startsWith("run:DELETE FROM reco_popular")));
});

test("warehouse: red drill 1 shape — an empty day rolls zeros, still 7 rows", async () => {
  const db = fakeDb({});
  const s = await rollupDaily(db as any, "2020-01-01");
  assert.deepEqual([s.rows, s.bookings, s.gmvMinor, s.searches, s.views, s.pairs, s.popular], [7, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(db.facts, [7]);
});

test("warehouse: rollupDailyJob forces explicit dates, skips fresh cron days", async () => {
  // Explicit date always runs.
  const forced = fakeDb({});
  const f = await rollupDailyJob({ DB: forced } as any, "2026-11-17");
  assert.equal(f.skipped, 0);
  assert.deepEqual(forced.facts, [7]);

  // Cron (null date) rolls yesterday when stale.
  const stale = fakeDb({ factFresh: 0 });
  const nowMs = Date.parse("2026-11-17T12:00:00Z");
  const r = await rollupDailyJob({ DB: stale } as any, null, nowMs);
  assert.equal(r.skipped, 0);
  assert.deepEqual(stale.facts, [7]);

  // Cron skips when yesterday already ran fresh (7 rows < 20h old).
  const fresh = fakeDb({ factFresh: 7 });
  const s = await rollupDailyJob({ DB: fresh } as any, null, nowMs);
  assert.equal(s.skipped, 1);
  assert.deepEqual(fresh.facts, []);
});

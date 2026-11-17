import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../../src/lib/http.ts";
import {
  assignVariant,
  bucketFor,
  fnv1a,
  recoMetrics,
  recommend,
  recordRecoClick,
} from "../../src/services/reco-service.ts";

/** TG-19: bucketing, slots, clicks, and metrics against a fake Db. */

function fakeDb(opts: {
  assigned?: Map<string, string>;
  pairs?: Array<{ id: string; score: number }>;
  popular?: Array<{ id: string; score: number }>;
  recent?: Array<{ id: string; m: number }>;
  exposures?: Array<{ id: string; clicked: number; user_id?: string | null; item_id?: string }>;
  metricsBase?: Array<{ variant: string; exposures: number; clicks: number }>;
  metricsAttr?: Array<{ variant: string; bookings: number }>;
} = {}) {
  const assigned = opts.assigned || new Map<string, string>();
  const exposures = opts.exposures || [];
  const inserted: any[] = [];
  const db = {
    inserted,
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              if (sql.includes("FROM experiment_assignments")) {
                const v = assigned.get(String(args[1]));
                return (v ? { variant: v } : null) as T | null;
              }
              if (sql.includes("FROM reco_exposures WHERE id")) {
                const row = exposures.find((e) => e.id === args[0]);
                return (row ? { clicked: row.clicked } : null) as T | null;
              }
              return null;
            },
            async all<T>(): Promise<{ results: T[] }> {
              if (sql.includes("FROM reco_pairs")) return { results: (opts.pairs || []) as T[] };
              if (sql.includes("FROM reco_popular")) return { results: (opts.popular || []) as T[] };
              if (sql.includes("FROM analytics_events")) return { results: (opts.recent || []) as T[] };
              if (sql.includes("FROM reco_exposures") && sql.includes("GROUP BY variant") && !sql.includes("JOIN")) {
                return { results: (opts.metricsBase || []) as T[] };
              }
              if (sql.includes("JOIN bookings b")) return { results: (opts.metricsAttr || []) as T[] };
              return { results: [] };
            },
            async run(): Promise<any> {
              if (sql.includes("INTO experiment_assignments")) assigned.set(String(args[1]), String(args[2]));
              if (sql.includes("INTO reco_exposures")) {
                inserted.push({ id: args[0], variant: args[1], user_id: args[2], item_id: args[3], slot: args[4], exp_day: args[5], attr_until: args[6] });
              }
              if (sql.includes("UPDATE reco_exposures")) {
                const row = exposures.find((e) => e.id === args[1]);
                if (row) row.clicked = 1;
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(stmts: any[]): Promise<any> {
      return stmts.map(() => ({ meta: { changes: 1 } }));
    },
  };
  return db;
}

const resolve = async (domain: string, id: string) => {
  if (id === "dead_item") return null;
  return { title: `T-${id}`, priceKrw: 10000 };
};

const envFor = (db: any) => ({ DB: db }) as any;

test("reco: bucketing is deterministic and sticky", async () => {
  assert.equal(fnv1a("x"), fnv1a("x"));
  assert.notEqual(fnv1a("a"), fnv1a("b"));
  assert.equal(bucketFor("u1"), bucketFor("u1"));
  const db = fakeDb({});
  const first = await assignVariant(db as any, "u1");
  assert.ok(first === "control" || first === "treatment");
  // Sticky: a later read returns the stored row, not a recompute.
  assert.equal(await assignVariant(db as any, "u1"), first);
  const db2 = fakeDb({ assigned: new Map([["u2", "control"]]) });
  assert.equal(await assignVariant(db2 as any, "u2"), "control");
});

test("reco: red drill 3 — buckets split 45–55% over 2000 subjects", () => {
  let treatment = 0;
  for (let i = 0; i < 2000; i++) {
    if (bucketFor(`subject_${i}`) === "treatment") treatment += 1;
  }
  const pct = (treatment / 2000) * 100;
  assert.ok(pct >= 45 && pct <= 55, `treatment ${pct}%`);
});

test("reco: treatment fills 3 slots; control and anonymous get popular only", async () => {
  const shape = {
    pairs: [{ id: "p1", score: 9 }, { id: "p2", score: 5 }],
    popular: [{ id: "h1", score: 30 }, { id: "h2", score: 20 }, { id: "dead_item", score: 10 }, { id: "h3", score: 5 }],
    recent: [{ id: "r1", m: 99 }, { id: "r2", m: 98 }],
  };
  // Find one subject per arm (bucketing is opaque by design).
  const samples = Array.from({ length: 40 }, (_, i) => `arm_${i}`);
  const treated = samples.find((s) => bucketFor(s) === "treatment")!;
  const controlled = samples.find((s) => bucketFor(s) === "control")!;

  const t = await recommend(envFor(fakeDb(shape)), { domain: "HOTEL", itemId: "cur", userId: treated }, resolve);
  assert.equal(t.variant, "treatment");
  assert.deepEqual(t.slots.together.map((c) => c.itemId), ["p1", "p2"]);
  assert.deepEqual(t.slots.popular.map((c) => c.itemId), ["h1", "h2", "h3"]);
  assert.deepEqual(t.slots.recent.map((c) => c.itemId), ["r1", "r2"]);
  assert.equal(t.slots.popular[0].title, "T-h1");
  assert.ok(t.slots.popular[0].exposureId.startsWith("rcx_"));

  const c = await recommend(envFor(fakeDb(shape)), { domain: "HOTEL", itemId: "cur", userId: controlled }, resolve);
  assert.equal(c.variant, "control");
  assert.deepEqual(c.slots.together, []);
  assert.deepEqual(c.slots.recent, []);
  assert.ok(c.slots.popular.length > 0);

  const a = await recommend(envFor(fakeDb(shape)), { domain: "HOTEL", itemId: "cur", userId: null }, resolve);
  assert.equal(a.variant, "none");
  assert.deepEqual(a.slots.together, []);
  assert.deepEqual(a.slots.recent, []);
  assert.ok(a.slots.popular.length > 0);
});

test("reco: slots dedupe across each other and skip the current item", async () => {
  const db = fakeDb({
    pairs: [{ id: "dup", score: 9 }],
    popular: [{ id: "dup", score: 30 }, { id: "fresh", score: 1 }],
    recent: [{ id: "dup", m: 5 }, { id: "cur", m: 4 }],
  });
  const treated = Array.from({ length: 40 }, (_, i) => `dd_${i}`).find((s) => bucketFor(s) === "treatment")!;
  const r = await recommend(envFor(db), { domain: "HOTEL", itemId: "cur", userId: treated }, resolve);
  const all = [...r.slots.together, ...r.slots.popular, ...r.slots.recent].map((c) => c.itemId);
  assert.deepEqual(all.sort(), ["dup", "fresh"]);
});

test("reco: exposures log every shown item with a 7-day window", async () => {
  const db = fakeDb({ popular: [{ id: "h1", score: 1 }] });
  const controlled = Array.from({ length: 40 }, (_, i) => `ex_${i}`).find((s) => bucketFor(s) === "control")!;
  const r = await recommend(envFor(db), { domain: "HOTEL", itemId: "cur", userId: controlled }, resolve);
  assert.equal(db.inserted.length, r.slots.popular.length);
  const row = db.inserted[0];
  assert.equal(row.variant, "control");
  assert.equal(row.item_id, "h1");
  assert.equal(row.slot, "popular");
  const expDay = new Date().toISOString().slice(0, 10);
  assert.equal(row.exp_day, expDay);
  assert.equal(row.attr_until, new Date(Date.parse(`${expDay}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10));
});

test("reco: clicks record once; unknown exposures 404", async () => {
  const db = fakeDb({ exposures: [{ id: "rcx_1", clicked: 0 }] });
  assert.deepEqual(await recordRecoClick(db as any, "rcx_1"), { recorded: true, duplicate: false });
  assert.deepEqual(await recordRecoClick(db as any, "rcx_1"), { recorded: false, duplicate: true });
  await assert.rejects(() => recordRecoClick(db as any, "rcx_nope"), (e: unknown) => {
    assert.ok(e instanceof HttpError);
    assert.equal((e as HttpError).code, "EXPOSURE_NOT_FOUND");
    return true;
  });
});

test("reco: metrics map exposures, CTR, and attributed bookings per arm", async () => {
  const db = fakeDb({
    metricsBase: [
      { variant: "control", exposures: 100, clicks: 5 },
      { variant: "treatment", exposures: 100, clicks: 12 },
    ],
    metricsAttr: [
      { variant: "control", bookings: 1 },
      { variant: "treatment", bookings: 4 },
    ],
  });
  const m = await recoMetrics(db as any);
  assert.deepEqual(m, [
    { variant: "control", exposures: 100, clicks: 5, ctr: 0.05, attributedBookings: 1 },
    { variant: "treatment", exposures: 100, clicks: 12, ctr: 0.12, attributedBookings: 4 },
  ]);
  const empty = await recoMetrics(fakeDb({}) as any);
  assert.deepEqual(empty.map((v) => v.ctr), [0, 0]);
});

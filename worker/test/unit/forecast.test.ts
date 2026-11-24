import { test } from "node:test";
import assert from "node:assert/strict";
import { recognitionSplit } from "../../src/domain/ledger.ts";
import {
  MARKUP_CAP_BPS,
  floorPriceMinor,
  forecastDemand,
  loadMarkupForBooking,
  loadMarkupForQuote,
  markupBps,
  markupForQuote,
  occupancyFor,
  quoteMarkup,
} from "../../src/services/forecast-service.ts";
import { fakeDb } from "./_fakedb.ts";

/** TG-21: forecast math, markup caps, settlement basis, decision plumbing. */

test("forecast: recognitionSplit keeps suppliers off platform markup", () => {
  const base = recognitionSplit(100000, 0, 9000);
  assert.deepEqual(base, { supplierPayableMinor: 90000, commissionMinor: 10000, promotionMinor: 0 });
  // Surge +10k: seller still paid on 100k, platform keeps the 10k.
  const surge = recognitionSplit(110000, 0, 9000, 10000);
  assert.equal(surge.supplierPayableMinor, 90000);
  assert.equal(surge.commissionMinor, 20000);
  // Platform-funded -10k discount: seller whole, platform funds it.
  const disc = recognitionSplit(90000, 0, 9000, -10000);
  assert.equal(disc.supplierPayableMinor, 90000);
  assert.equal(disc.commissionMinor, 0);
});

function seriesDb(days: Array<{ day: string; c: number }>, extra: Record<string, any> = {}) {
  return fakeDb({
    all: (sql) => {
      if (sql.includes("FROM fact_daily")) return days;
      if (sql.includes("FROM bookings WHERE domain_type")) return [];
      return [];
    },
    first: (sql, params = []) => {
      if (sql.includes("FROM bookings WHERE domain_type")) return { c: extra.itemBooks ?? 0 };
      if (sql.includes("FROM bookings WHERE id =")) return extra.booking ?? null;
      if (sql.includes("FROM inventory_holds")) return { c: extra.held ?? 0 };
      if (sql.includes("FROM hotels WHERE")) return { rooms_json: JSON.stringify(extra.rooms ?? [{ available_inventory: 10 }]) };
      if (sql.includes("FROM product_policies")) return { floor_price_minor: extra.floor ?? null };
      if (sql.includes("FROM pricing_decisions")) {
        if (extra.decisionsByQuote) return extra.decisionsByQuote[String(params[0])] ?? null;
        return extra.decision ?? null;
      }
      if (sql.includes("FROM feature_flags")) return { is_enabled: extra.flag ?? 0 };
      if (sql.includes("FROM experiment_assignments")) return extra.assignment ?? null;
      return null;
    },
    run: () => ({ meta: { changes: 1 } }),
  });
}

const flat28 = (c: number, end = "2026-11-16") => Array.from({ length: 28 }, (_, i) => {
  const d = new Date(Date.parse(`${end}T00:00:00Z`) - (27 - i) * 86400000).toISOString().slice(0, 10);
  return { day: d, c };
});

test("forecast: mart-first smoothing with bounded factors", async () => {
  const db = seriesDb(flat28(10));
  const f = await forecastDemand(db, { domain: "HOTEL", itemId: "h1", date: "2026-11-20" }, "2026-11-17", 10);
  assert.equal(f.source, "mart");
  assert.equal(f.sampleDays, 28);
  assert.ok(Math.abs(f.base - 10) < 0.01);
  assert.ok(f.dowFactor >= 0.5 && f.dowFactor <= 2.0);
  assert.ok(f.seasonFactor >= 0.7 && f.seasonFactor <= 1.5);
  assert.ok(f.share > 0 && f.share < 1);
  assert.equal(f.occupancy, 0);
});

test("forecast: thin mart falls back to live bookings", async () => {
  const db = fakeDb({
    all: (sql) => {
      if (sql.includes("FROM fact_daily")) return [{ day: "2026-11-16", c: 3 }];
      if (sql.includes("FROM bookings WHERE domain_type")) return flat28(4).map((r) => ({ ...r }));
      return [];
    },
    first: () => null,
  });
  const f = await forecastDemand(db, { domain: "HOTEL", itemId: "h1", date: "2026-11-20" }, "2026-11-17", null);
  assert.equal(f.source, "live");
  assert.ok(f.base > 0);
  assert.equal(f.occupancy, null);
});

test("forecast: occupancy blends holds over capacity, unknown reads neutral", async () => {
  const db = seriesDb([], { held: 7 });
  assert.equal(await occupancyFor(db, "h1", ["2026-11-20"], 10), 0.7);
  assert.equal(await occupancyFor(db, "h1", ["2026-11-20"], null), null);
  assert.equal(await occupancyFor(db, "h1", [], 10), null);
  const over = seriesDb([], { held: 99 });
  assert.equal(await occupancyFor(over, "h1", ["2026-11-20"], 10), 1);
});

test("forecast: markup caps at ±1500bps (red drill 1)", async () => {
  assert.equal(MARKUP_CAP_BPS, 1500);
  assert.equal(markupBps(5, 1), 1500);
  assert.equal(markupBps(0, 0), -1500);
  assert.equal(markupBps(1, 0.7), 0);
  assert.equal(markupBps(1.2, null), 200);
  // Pipeline stays inside the caps on realistic shapes.
  const db = seriesDb(flat28(100), { held: 100, itemBooks: 0 });
  const m = await markupForQuote({ DB: db } as any, { domain: "HOTEL", itemId: "h1", startDate: "2026-11-20", baseMinor: 100000 }, "2026-11-17");
  assert.ok(m.bps >= -1500 && m.bps <= 1500);
  assert.equal(m.amountMinor, Math.round((100000 * m.bps) / 10000));
});

test("forecast: flag off yields zeros; control logs zeros; treatment computes", async () => {
  const off = await quoteMarkup({ DB: seriesDb([]) } as any, { userId: "u", domain: "HOTEL", itemId: "h", startDate: "2026-11-20", baseMinor: 100000 });
  assert.equal(off.enabled, false);
  assert.equal(off.variant, null);

  const ctl = await quoteMarkup(
    { DB: seriesDb([], { flag: 1, assignment: { variant: "control" } }) } as any,
    { userId: "u", domain: "HOTEL", itemId: "h", startDate: "2026-11-20", baseMinor: 100000 },
  );
  assert.equal(ctl.enabled, true);
  assert.equal(ctl.variant, "control");
  assert.equal(ctl.amountMinor, 0);

  const tre = await quoteMarkup(
    { DB: seriesDb(flat28(10), { flag: 1, assignment: { variant: "treatment" }, itemBooks: 5, held: 9 }) } as any,
    { userId: "u", domain: "HOTEL", itemId: "h", startDate: "2026-11-20", baseMinor: 100000 },
  );
  assert.equal(tre.variant, "treatment");
  assert.ok(tre.amountMinor !== 0);
  assert.ok(tre.forecast !== null);
});

test("forecast: own discount clamps to the floor instead of rejecting", async () => {
  const db = seriesDb(flat28(0), { flag: 1, assignment: { variant: "treatment" }, floor: 95000 });
  const m = await quoteMarkup(
    { DB: db } as any,
    { userId: "u", domain: "HOTEL", itemId: "h", startDate: "2026-11-20", baseMinor: 100000 },
  );
  // Cold demand discounts, but never below the product floor.
  assert.equal(m.clampedToFloor, true);
  assert.equal(100000 + m.amountMinor >= 95000, true);
});

test("forecast: decision rows load by quote and by booking", async () => {
  const db = seriesDb([], {
    decisionsByQuote: { qt_1: { markup_minor: 1500, m: 1500 }, qt_2: { markup_minor: -500, m: -500 } },
    booking: { quote_id: "qt_2", details_json: "{}" },
  });
  assert.deepEqual(await loadMarkupForQuote(db, "qt_1"), { amount: 1500, found: true });
  assert.deepEqual(await loadMarkupForQuote(seriesDb([]), "qt_x"), { amount: 0, found: false });
  assert.equal(await loadMarkupForBooking(db, "bkg_1"), -500);
  assert.equal(await loadMarkupForBooking(seriesDb([]), "bkg_x"), 0);
  // GAP-07: cart bookings sum every leg's stored decision.
  const cartDb = seriesDb([], {
    decisionsByQuote: { qt_a: { markup_minor: 100, m: 100 }, qt_b: { markup_minor: 200, m: 200 } },
    booking: { quote_id: "qt_a", details_json: JSON.stringify({ cartQuoteIds: ["qt_a", "qt_b"] }) },
  });
  assert.equal(await loadMarkupForBooking(cartDb, "bkg_cart"), 300);
  assert.equal(await floorPriceMinor(seriesDb([], { floor: 5000 }), "HOTEL", "h"), 5000);
  assert.equal(await floorPriceMinor(seriesDb([]), "HOTEL", "h"), null);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { toMinor, percentOf, convertMinor } from "../../src/domain/money.ts";
import { canTransition, assertTransition, BOOKING_STATUSES, TERMINAL_STATUSES, allowedNext } from "../../src/domain/state-machine.ts";
import { computeQuote, computeCancellation, QuoteError, type CatalogProduct, type Promotion } from "../../src/domain/pricing.ts";

const NOW = new Date("2026-11-05T03:00:00Z");

const hotel: CatalogProduct = {
  domain: "HOTEL", itemId: "htl_x", unitId: "rm_1", title: "Test Hotel", supplierId: "sup", currency: "KRW",
  unitPriceMajor: 550000, capacity: 5, maxOccupancy: 2, freeCancellation: true, instantConfirmation: true, departureClock: null,
};

test("money: minor units are exact integers", () => {
  assert.equal(toMinor(550000, "KRW"), 550000);
  assert.equal(toMinor(1.005, "USD"), 101);
  assert.equal(toMinor(0.1 + 0.2, "USD"), 30);
  assert.equal(percentOf(550000, 1000), 55000);
  assert.equal(percentOf(15, 5000), 8); // half-up
  assert.equal(convertMinor(1350, "KRW", "USD", { KRW: 1, USD: 1350 }), 100);
  assert.throws(() => toMinor(Number.NaN, "KRW"));
  assert.throws(() => toMinor(1, "XXX"));
});

test("state machine: payment alone never reaches a confirmed state", () => {
  assert.equal(canTransition("PAYMENT_AUTHORIZED", "VOUCHER_ISSUED"), false);
  assert.equal(canTransition("PAYMENT_AUTHORIZED", "SUPPLIER_CONFIRMED"), false);
  assert.equal(canTransition("AWAITING_PAYMENT", "SUPPLIER_CONFIRMED"), false);
  assert.equal(canTransition("SUPPLIER_BOOKING_PENDING", "SUPPLIER_CONFIRMED"), true);
});

test("state machine: PNR (SUPPLIER_CONFIRMED) and ticket (TICKETED) are distinct", () => {
  assert.equal(canTransition("SUPPLIER_CONFIRMED", "TICKETED"), false);
  assert.equal(canTransition("SUPPLIER_CONFIRMED", "TICKETING_PENDING"), true);
  assert.equal(canTransition("TICKETING_PENDING", "TICKETED"), true);
});

test("state machine: terminal states have no exits; every state is reachable-defined", () => {
  for (const s of TERMINAL_STATUSES) {
    // Deliberate contract change (B3/B7): a COMPLETED order can enter review
    // for a post-completion dispute, but never refunds or cancels directly.
    if (s === "COMPLETED") assert.deepEqual([...allowedNext(s)], ["MANUAL_REVIEW_REQUIRED"]);
    else assert.deepEqual([...allowedNext(s)], []);
  }
  for (const s of BOOKING_STATUSES) assert.ok(Array.isArray(allowedNext(s)));
  assert.equal(canTransition("COMPLETED", "REFUND_PENDING"), false);
  assert.equal(canTransition("COMPLETED", "CANCELLATION_REQUESTED"), false);
  assert.throws(() => assertTransition("REFUNDED", "AWAITING_PAYMENT"), /ILLEGAL_TRANSITION/);
  assert.throws(() => assertTransition("BOGUS", "FAILED"), /ILLEGAL_TRANSITION/);
});

test("quote: hotel nights x rooms + 10% tax, integer total", () => {
  const q = computeQuote(hotel, { startDate: "2026-12-01", endDate: "2026-12-03", rooms: 1, travelers: { adults: 2, children: 0, infants: 0 } }, null, NOW);
  assert.equal(q.baseMinor, 1_100_000);
  assert.equal(q.taxMinor, 110_000);
  assert.equal(q.totalMinor, 1_210_000);
  assert.equal(q.serviceEnd, "2026-12-03");
  assert.equal(q.cancellationPolicy.type, "FREE_UNTIL");
  assert.equal(q.cancellationPolicy.freeUntil, "2026-11-30T00:00:00.000Z");
});

test("quote: partner nightly overrides reprice per night; uniform stays aggregated", () => {
  const params = { startDate: "2026-12-01", endDate: "2026-12-03", rooms: 1, travelers: { adults: 2, children: 0, infants: 0 } };
  const mixed = computeQuote(hotel, params, null, NOW, (id, d) => (id === "htl_x" && d === "2026-12-01" ? 600_000 : null));
  assert.equal(mixed.baseMinor, 1_150_000);
  assert.equal(mixed.totalMinor, 1_265_000);
  assert.equal(mixed.lines.filter((l) => l.code === "ROOM_NIGHT").length, 2);
  assert.ok(mixed.lines.some((l) => l.label.includes("2026-12-01") && l.unitMinor === 600_000));
  const uniform = computeQuote(hotel, params, null, NOW, () => null);
  assert.equal(uniform.lines.filter((l) => l.code === "ROOM_NIGHT").length, 1);
  assert.equal(uniform.totalMinor, 1_210_000);
  const act = { ...hotel, domain: "ACTIVITY" as const, unitId: null, unitPriceMajor: 30000 };
  const single = computeQuote(act, { startDate: "2026-12-01", travelers: { adults: 2, children: 0, infants: 0 } }, null, NOW, () => 45000);
  assert.equal(single.totalMinor, 90000);
});

test("quote: rejects past dates, impossible dates, zero nights, occupancy overflow", () => {
  const t = { adults: 2, children: 0, infants: 0 };
  assert.throws(() => computeQuote(hotel, { startDate: "2026-11-01", endDate: "2026-11-03", travelers: t }, null, NOW), (e: any) => e instanceof QuoteError && e.code === "DATE_IN_PAST");
  assert.throws(() => computeQuote(hotel, { startDate: "2026-02-30", endDate: "2026-03-02", travelers: t }, null, NOW), (e: any) => e.code === "INVALID_DATE");
  assert.throws(() => computeQuote(hotel, { startDate: "2026-12-01", endDate: "2026-12-01", travelers: t }, null, NOW), (e: any) => e.code === "INVALID_STAY");
  assert.throws(() => computeQuote(hotel, { startDate: "2026-12-01", endDate: "2026-12-02", rooms: 1, travelers: { adults: 3, children: 0, infants: 0 } }, null, NOW), (e: any) => e.code === "OCCUPANCY_EXCEEDED");
  assert.throws(() => computeQuote(hotel, { startDate: "2026-12-01", endDate: "2026-12-02", travelers: { adults: 0, children: 1, infants: 0 } }, null, NOW), (e: any) => e.code === "INVALID_TRAVELERS");
  assert.throws(() => computeQuote(hotel, { startDate: "2026-12-01", endDate: "2026-12-02", travelers: { adults: 1.5 as any, children: 0, infants: 0 } }, null, NOW), (e: any) => e.code === "INVALID_TRAVELERS");
});

test("quote: flight infant fare is 10%, children full fare", () => {
  const flight: CatalogProduct = { ...hotel, domain: "FLIGHT", unitId: null, unitPriceMajor: 245000, maxOccupancy: null, freeCancellation: false };
  const q = computeQuote(flight, { startDate: "2026-12-01", travelers: { adults: 2, children: 1, infants: 1 } }, null, NOW);
  assert.equal(q.baseMinor, 245000 * 3 + 24500);
  assert.equal(q.totalMinor, q.baseMinor);
  assert.equal(q.cancellationPolicy.type, "NON_REFUNDABLE");
});

test("quote: promotion validated server-side (min order, cap, expiry)", () => {
  const promo: Promotion = { code: "WELCOME2026", discountType: "PERCENTAGE", discountValue: 10, minOrderMajor: 50000, maxDiscountMajor: 30000, validFrom: "2026-01-01T00:00:00Z", validUntil: "2026-12-31T23:59:59Z", active: true };
  const q = computeQuote(hotel, { startDate: "2026-12-01", endDate: "2026-12-02", travelers: { adults: 1, children: 0, infants: 0 } }, promo, NOW);
  assert.equal(q.discountMinor, 30000); // 10% of 605,000 capped at 30,000
  assert.equal(q.totalMinor, 605000 - 30000);
  const expired = { ...promo, validUntil: "2026-10-01T00:00:00Z" };
  assert.throws(() => computeQuote(hotel, { startDate: "2026-12-01", endDate: "2026-12-02", travelers: { adults: 1, children: 0, infants: 0 } }, expired, NOW), (e: any) => e.code === "PROMO_EXPIRED");
  const cheap: CatalogProduct = { ...hotel, domain: "ACTIVITY", unitPriceMajor: 10000 };
  assert.throws(() => computeQuote(cheap, { startDate: "2026-12-01", travelers: { adults: 1, children: 0, infants: 0 } }, promo, NOW), (e: any) => e.code === "PROMO_MIN_ORDER");
});

test("cancellation: free window, then fee; non-refundable keeps 100%", () => {
  const policy = { type: "FREE_UNTIL" as const, freeUntil: "2026-11-30T00:00:00.000Z", feeBpsAfter: 10000, source: "CATALOG_RULE" as const };
  assert.deepEqual(computeCancellation(policy, 1_210_000, NOW), { feeMinor: 0, refundMinor: 1_210_000 });
  assert.deepEqual(computeCancellation(policy, 1_210_000, new Date("2026-11-30T01:00:00Z")), { feeMinor: 1_210_000, refundMinor: 0 });
  const half = { ...policy, feeBpsAfter: 5000 };
  const r = computeCancellation(half, 1001, new Date("2026-12-01T00:00:00Z"));
  assert.equal(r.feeMinor + r.refundMinor, 1001);
  assert.deepEqual(computeCancellation({ type: "NON_REFUNDABLE", freeUntil: null, feeBpsAfter: 10000, source: "CATALOG_RULE" }, 5000, NOW), { feeMinor: 5000, refundMinor: 0 });
});

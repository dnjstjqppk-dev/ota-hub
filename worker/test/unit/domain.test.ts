import { test } from "node:test";
import assert from "node:assert/strict";
import { toMinor, percentOf, convertMinor } from "../../src/domain/money.ts";
import { canTransition, assertTransition, BOOKING_STATUSES, TERMINAL_STATUSES, allowedNext } from "../../src/domain/state-machine.ts";
import { computeQuote, computeCancellation, QuoteError, type CatalogProduct, type Promotion } from "../../src/domain/pricing.ts";
import { voucherCode } from "../../src/services/booking-service.ts";

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

test("#104: slot pricing overrides the catalog with adult/child lines", () => {
  const act: CatalogProduct = { ...hotel, domain: "ACTIVITY", itemId: "act_x", unitId: null, unitPriceMajor: 30000 };
  const params = { startDate: "2026-12-01", travelers: { adults: 2, children: 1, infants: 0 } };
  const slot = { start: "14:00", end: "16:00", adultMinor: 40000, childMinor: 20000 };
  const q = computeQuote(act, params, null, NOW, null, slot);
  assert.equal(q.lines.filter((l) => l.code === "SLOT_ADULT")[0].amountMinor, 80000);
  assert.equal(q.lines.filter((l) => l.code === "SLOT_CHILD")[0].amountMinor, 20000);
  assert.equal(q.baseMinor, 100000);
  const plain = computeQuote(act, params, null, NOW);
  assert.ok(plain.lines.some((l) => l.code === "PER_PERSON"));
  assert.equal(plain.baseMinor, 90000);
});

test("#105: voucher codes are long, prefixed, and unique", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const c = voucherCode();
    assert.match(c, /^GFV-[0-9A-F]{16}$/);
    seen.add(c);
  }
  assert.equal(seen.size, 200);
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

test("cancellation: structured tiers pick by hours-before-service (C6)", () => {
  const start = "2026-12-10T00:00:00.000Z";
  const policy = {
    type: "TIERED" as const, freeUntil: null, feeBpsAfter: 10000, serviceStart: start, source: "PRODUCT_POLICY" as const,
    tiers: [{ hoursBefore: 168, refundBps: 10000 }, { hoursBefore: 72, refundBps: 5000 }, { hoursBefore: 24, refundBps: 0 }],
  };
  // 9 days before -> top tier, full refund.
  assert.deepEqual(computeCancellation(policy, 100000, new Date("2026-12-01T00:00:00Z")), { feeMinor: 0, refundMinor: 100000 });
  // Exactly on a cutoff -> that tier.
  assert.deepEqual(computeCancellation(policy, 100000, new Date("2026-12-07T00:00:00Z")), { feeMinor: 50000, refundMinor: 50000 });
  // Between cutoffs (120h) -> the largest cutoff at or under (72h tier).
  assert.deepEqual(computeCancellation(policy, 100000, new Date("2026-12-05T00:00:00Z")), { feeMinor: 50000, refundMinor: 50000 });
  // Past every cutoff -> nothing back.
  assert.deepEqual(computeCancellation(policy, 100000, new Date("2026-12-09T12:00:00Z")), { feeMinor: 100000, refundMinor: 0 });
  // After the service started -> nothing back.
  assert.deepEqual(computeCancellation(policy, 100000, new Date("2026-12-11T00:00:00Z")), { feeMinor: 100000, refundMinor: 0 });
  // A zero-hour tier makes even last-minute cancels refundable at its rate.
  const zero = { ...policy, tiers: [{ hoursBefore: 0, refundBps: 5000 }] };
  assert.deepEqual(computeCancellation(zero, 100000, new Date("2026-12-09T23:00:00Z")), { feeMinor: 50000, refundMinor: 50000 });
});

test("quote: structured policy snapshots tiers and free-cancel hours (C6)", () => {
  const tiered: CatalogProduct = { ...hotel, structuredPolicy: { freeCancelHours: 48, tiers: [{ hoursBefore: 48, refundBps: 10000 }] } };
  const q = computeQuote(tiered, { startDate: "2026-12-01", endDate: "2026-12-02", travelers: { adults: 1, children: 0, infants: 0 } }, null, NOW);
  assert.equal(q.cancellationPolicy.type, "TIERED");
  assert.equal(q.cancellationPolicy.source, "PRODUCT_POLICY");
  assert.equal(q.cancellationPolicy.serviceStart, "2026-12-01T00:00:00.000Z");
  const hours: CatalogProduct = { ...hotel, structuredPolicy: { freeCancelHours: 72, tiers: [] } };
  const q2 = computeQuote(hours, { startDate: "2026-12-01", endDate: "2026-12-02", travelers: { adults: 1, children: 0, infants: 0 } }, null, NOW);
  assert.equal(q2.cancellationPolicy.type, "FREE_UNTIL");
  assert.equal(q2.cancellationPolicy.freeUntil, "2026-11-28T00:00:00.000Z");
});

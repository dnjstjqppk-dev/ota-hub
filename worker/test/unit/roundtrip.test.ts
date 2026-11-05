import { test } from "node:test";
import assert from "node:assert/strict";
import { computeQuote, computeRoundTripQuote, type CatalogProduct, type Promotion } from "../../src/domain/pricing.ts";

const NOW = new Date("2026-11-05T03:00:00Z");
const base: CatalogProduct = {
  domain: "FLIGHT", itemId: "flt_out", unitId: "ECONOMY", title: "KE703 ICN→NRT", supplierId: "sup_ke", currency: "KRW",
  unitPriceMajor: 245000, capacity: 9, maxOccupancy: null, freeCancellation: false, instantConfirmation: false, departureClock: null,
  route: { from: "ICN", to: "NRT" },
};
const out = base;
const ret: CatalogProduct = { ...base, itemId: "flt_ret", title: "KE704 NRT→ICN", unitPriceMajor: 198000, route: { from: "NRT", to: "ICN" } };
const pax = { adults: 2, children: 0, infants: 1 };

test("round trip: legs priced separately, combined once; service span covers both dates", () => {
  const q = computeRoundTripQuote(out, ret, { startDate: "2026-12-01", returnDate: "2026-12-05", travelers: pax }, null, NOW);
  const oneOut = computeQuote(out, { startDate: "2026-12-01", travelers: pax }, null, NOW);
  const oneRet = computeQuote(ret, { startDate: "2026-12-05", travelers: pax }, null, NOW);
  assert.equal(q.baseMinor, oneOut.baseMinor + oneRet.baseMinor);
  assert.equal(q.totalMinor, oneOut.totalMinor + oneRet.totalMinor);
  assert.equal(q.serviceStart, "2026-12-01");
  assert.equal(q.serviceEnd, "2026-12-05");
  assert.deepEqual(q.legs.map((l) => [l.itemId, l.serviceDate, l.baseMinor]), [["flt_out", "2026-12-01", oneOut.baseMinor], ["flt_ret", "2026-12-05", oneRet.baseMinor]]);
  assert.ok(q.lines.every((l) => /^(OUT|RET)_/.test(l.code)));
  assert.equal(q.pricedUnits, 2);
});

test("round trip: a promotion is applied once to the whole order (cap not doubled)", () => {
  const promo: Promotion = { code: "AIR10", discountType: "PERCENTAGE", discountValue: 10, minOrderMajor: 0, maxDiscountMajor: 50000, validFrom: null, validUntil: null, active: true };
  const q = computeRoundTripQuote(out, ret, { startDate: "2026-12-01", returnDate: "2026-12-05", travelers: pax }, promo, NOW);
  assert.equal(q.discountMinor, 50000);
  assert.equal(q.lines.filter((l) => l.code === "PROMOTION").length, 1);
});

test("round trip: rejects different suppliers, wrong direction, return before departure, missing return date", () => {
  const p = { startDate: "2026-12-01", returnDate: "2026-12-05", travelers: pax };
  assert.throws(() => computeRoundTripQuote(out, { ...ret, supplierId: "sup_oz" }, p, null, NOW), (e: any) => e.code === "ROUND_TRIP_SUPPLIER_MISMATCH");
  assert.throws(() => computeRoundTripQuote(out, { ...ret, route: { from: "NRT", to: "GMP" } }, p, null, NOW), (e: any) => e.code === "ROUND_TRIP_ROUTE_MISMATCH");
  assert.throws(() => computeRoundTripQuote(out, ret, { ...p, returnDate: "2026-11-30" }, null, NOW), (e: any) => e.code === "INVALID_RETURN_DATE");
  assert.throws(() => computeRoundTripQuote(out, ret, { ...p, returnDate: null }, null, NOW), (e: any) => e.code === "INVALID_DATE");
});

test("round trip: the stricter cancellation policy governs the order", () => {
  const p = { startDate: "2026-12-01", returnDate: "2026-12-05", travelers: pax };
  const refundableOut = { ...out, freeCancellation: true };
  assert.equal(computeRoundTripQuote(refundableOut, ret, p, null, NOW).cancellationPolicy.type, "NON_REFUNDABLE");
  const both = computeRoundTripQuote(refundableOut, { ...ret, freeCancellation: true }, p, null, NOW).cancellationPolicy;
  assert.equal(both.type, "FREE_UNTIL");
  assert.equal(both.freeUntil, "2026-11-30T00:00:00.000Z");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { hotelRatePlans } from "../../src/services/catalog.ts";

test("rate plans: room without plans sells exactly one plan at base price", () => {
  const plans = hotelRatePlans({ free_breakfast: 0, free_cancellation: 1 }, { id: "rm_1", base_price_krw: 120000 });
  assert.deepEqual(plans, [{ id: "ROOM_ONLY", name_ko: "룸 온리 (식사 불포함)", meal: "NONE", price_krw: 120000, free_cancellation: true }]);
});

test("rate plans: hotel free_breakfast makes the default plan breakfast-included at the same price", () => {
  const [p] = hotelRatePlans({ free_breakfast: 1 }, { id: "rm_1", base_price_krw: 90000, free_cancellation: false });
  assert.equal(p.id, "BREAKFAST_INCLUDED");
  assert.equal(p.meal, "BREAKFAST");
  assert.equal(p.price_krw, 90000);
  assert.equal(p.free_cancellation, false);
  // A room-level flag wins over the hotel-level one.
  assert.equal(hotelRatePlans({ free_breakfast: 1 }, { id: "rm_2", base_price_krw: 90000, breakfast_included: false })[0].meal, "NONE");
});

test("rate plans: catalog-defined plans are used verbatim; invalid entries are dropped", () => {
  const plans = hotelRatePlans({ free_cancellation: 1 }, {
    id: "rm_1",
    base_price_krw: 100000,
    rate_plans: [
      { id: "RO_NR", name_ko: "환불 불가 특가", price_krw: 85000, free_cancellation: false },
      { id: "BB", name_ko: "조식 포함", meal: "BREAKFAST", price_krw: 125000 },
      { id: "BAD", price_krw: -1 },
      { name_ko: "id 없음", price_krw: 1000 },
    ],
  });
  assert.deepEqual(plans.map((p) => [p.id, p.price_krw, p.meal, p.free_cancellation]), [
    ["RO_NR", 85000, "NONE", false],
    ["BB", 125000, "BREAKFAST", true],
  ]);
});

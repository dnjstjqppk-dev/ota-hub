import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSlotUpsert } from "../../src/routes/partner.ts";

test("#82: slot upsert validation accepts full and minimal shapes", () => {
  assert.deepEqual(parseSlotUpsert({ startTime: "09:30", endTime: "12:00", capacity: 20, priceAdult: 50000, priceChild: 30000 }), {
    startTime: "09:30", endTime: "12:00", capacity: 20, priceAdult: 50000, priceChild: 30000, closed: false,
  });
  // Child defaults to adult; end time optional; closed coerces truthy 1.
  assert.deepEqual(parseSlotUpsert({ startTime: "14:00", capacity: 0, priceAdult: 1000, closed: 1 }), {
    startTime: "14:00", endTime: null, capacity: 0, priceAdult: 1000, priceChild: 1000, closed: true,
  });
});

test("#82: slot upsert validation rejects bad times, prices, and capacity", () => {
  for (const bad of [
    {},
    { startTime: "9:30", capacity: 1, priceAdult: 1 },
    { startTime: "24:00", capacity: 1, priceAdult: 1 },
    { startTime: "10:00", endTime: "10:00", capacity: 1, priceAdult: 1 },
    { startTime: "10:00", endTime: "09:59", capacity: 1, priceAdult: 1 },
    { startTime: "10:00", capacity: -1, priceAdult: 1 },
    { startTime: "10:00", capacity: 1.5, priceAdult: 1 },
    { startTime: "10:00", capacity: 1, priceAdult: -5 },
    { startTime: "10:00", capacity: 1, priceAdult: 5, priceChild: -1 },
  ]) {
    assert.throws(() => parseSlotUpsert(bad), (e: any) => e.status === 400 && String(e.code).startsWith("INVALID_SLOT"), JSON.stringify(bad));
  }
});

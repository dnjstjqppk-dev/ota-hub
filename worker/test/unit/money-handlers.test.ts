import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertAboveFloor,
  cancellationPreview,
  cancelByCustomer,
  confirmPayment,
  settlementPayoutStmts,
  throwOnRefundConflict,
  voucherCode,
} from "../../src/services/booking-service.ts";
import { fakeDb } from "./_fakedb.ts";

// #143: the money paths (confirm/cancel/refund/settle) had zero unit tests —
// E2E covered them live, but the guards and the pure money math had no fast
// pins. Full capture/fulfil flows stay E2E-only (supplier adapters); these
// tests pin guards, previews, floors, journals, and conflict mapping.

const user = { id: "usr_u143", email: "u143@local.test", role: "USER" } as any;
const other = { id: "usr_other", email: "o@local.test", role: "USER" } as any;

const booking = (over: Record<string, unknown> = {}) => ({
  id: "bkg_u143",
  user_id: "usr_u143",
  status: "AWAITING_PAYMENT",
  payment_status: "PENDING",
  payment_mode: "SANDBOX",
  total_minor: 50000,
  paid_minor: 0,
  currency: "KRW",
  inventory_lock_expires_at: new Date(Date.now() + 600_000).toISOString(),
  version: 1,
  ...over,
});

const envFor = (row: Record<string, unknown> | null) =>
  ({
    APP_ENV: "test",
    PAYMENT_PROVIDER: "sandbox",
    DB: {
      ...fakeDb({
        first: (sql: string) => (sql.includes("FROM bookings") ? row : null),
      }),
      batch: async () => [],
    },
  }) as any;

const confirmBody = { bookingId: "bkg_u143", orderId: "bkg_u143", amount: 50000, paymentKey: "sbx_ok_u143" };

test("confirmPayment: ownership, provider, state, and field guards fire before money moves", async () => {
  // Cross-user and provider-off short-circuit first.
  await assert.rejects(confirmPayment(envFor(booking()), other, confirmBody), (e: any) => e.code === "FORBIDDEN");
  await assert.rejects(
    confirmPayment({ APP_ENV: "test", DB: fakeDb() } as any, user, confirmBody),
    (e: any) => e.code === "PAYMENTS_DISABLED",
  );
  // A non-awaiting booking is never charged.
  await assert.rejects(
    confirmPayment(envFor(booking({ status: "COMPLETED" })), user, confirmBody),
    (e: any) => e.code === "NOT_AWAITING_PAYMENT",
  );
  // Order, amount, and key must match the booking exactly.
  await assert.rejects(confirmPayment(envFor(booking()), user, { ...confirmBody, orderId: "bkg_else" }), (e: any) => e.code === "ORDER_MISMATCH");
  await assert.rejects(confirmPayment(envFor(booking()), user, { ...confirmBody, amount: 49999 }), (e: any) => e.code === "AMOUNT_MISMATCH");
  await assert.rejects(confirmPayment(envFor(booking()), user, { ...confirmBody, amount: "49,999" }), (e: any) => e.code === "AMOUNT_MISMATCH");
  await assert.rejects(confirmPayment(envFor(booking()), user, { ...confirmBody, paymentKey: "" }), (e: any) => e.code === "PAYMENT_KEY_REQUIRED");
  // An elapsed payment window expires the booking instead of charging it.
  await assert.rejects(
    confirmPayment(envFor(booking({ inventory_lock_expires_at: new Date(Date.now() - 1000).toISOString() })), user, confirmBody),
    (e: any) => e.code === "PAYMENT_WINDOW_EXPIRED",
  );
});

test("cancelByCustomer: ownership, existence, and cancellability guards", async () => {
  await assert.rejects(cancelByCustomer(envFor(booking()), other, "bkg_u143"), (e: any) => e.code === "FORBIDDEN");
  await assert.rejects(cancelByCustomer(envFor(null), user, "bkg_missing"), (e: any) => e.code === "BOOKING_NOT_FOUND");
  await assert.rejects(cancelByCustomer(envFor(booking({ status: "COMPLETED" })), user, "bkg_u143"), (e: any) => e.code === "NOT_CANCELLABLE");
  await assert.rejects(cancelByCustomer(envFor(booking({ status: "REFUNDED" })), user, "bkg_u143"), (e: any) => e.code === "NOT_CANCELLABLE");
});

test("cancellationPreview: default, free-until, and tiered policies", () => {
  const row = (policy: unknown, paid: number) => ({ cancellation_policy_json: JSON.stringify(policy), paid_minor: paid }) as any;
  // No stored policy: the non-refundable default keeps everything.
  assert.deepEqual(cancellationPreview({ paid_minor: 50000 } as any), {
    feeMinor: 50000,
    refundMinor: 0,
    policy: { type: "NON_REFUNDABLE", freeUntil: null, feeBpsAfter: 10000 },
  });
  const free = { type: "FREE_UNTIL", freeUntil: new Date(Date.now() + 3600_000).toISOString(), feeBpsAfter: 10000 };
  assert.deepEqual(cancellationPreview(row(free, 50000)).feeMinor, 0);
  const past = { type: "FREE_UNTIL", freeUntil: new Date(Date.now() - 3600_000).toISOString(), feeBpsAfter: 5000 };
  const late = cancellationPreview(row(past, 50000));
  assert.equal(late.feeMinor, 25000);
  assert.equal(late.refundMinor, 25000);
  // Tiered: the 72h tier refunds fully at 100h out, halves at 48h out.
  const start = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
  const tiers = [
    { hoursBefore: 72, refundBps: 10000 },
    { hoursBefore: 24, refundBps: 5000 },
  ];
  assert.equal(cancellationPreview(row({ type: "TIERED", serviceStart: start(100), tiers }, 80000)).feeMinor, 0);
  assert.equal(cancellationPreview(row({ type: "TIERED", serviceStart: start(48), tiers }, 80000)).feeMinor, 40000);
  assert.equal(cancellationPreview(row({ type: "TIERED", serviceStart: start(2), tiers }, 80000)).refundMinor, 0);
});

test("voucherCode: GFV-16HEX shape, unique across mints", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const c = voucherCode();
    assert.match(c, /^GFV-[0-9A-F]{16}$/);
    seen.add(c);
  }
  assert.equal(seen.size, 500);
});

test("throwOnRefundConflict: racing refunds 409, anything else rethrows", () => {
  assert.throws(() => throwOnRefundConflict(new Error("UNIQUE constraint failed: refunds.idx_refunds_one_pending")), (e: any) => e.code === "REFUND_IN_PROGRESS");
  const other = new Error("boom");
  assert.throws(() => throwOnRefundConflict(other), (e: unknown) => e === other);
});

test("assertAboveFloor: unprotected products pass, floored products hold the line", async () => {
  const envFloor = (floor: number | null) =>
    ({
      DB: fakeDb({ first: () => ({ floor_price_minor: floor }) }),
    }) as any;
  await assertAboveFloor(envFloor(null), "HOTEL", "htl_x", 1);
  await assertAboveFloor(envFloor(0), "HOTEL", "htl_x", 1);
  await assertAboveFloor(envFloor(10000), "HOTEL", "htl_x", 50000);
  await assert.rejects(assertAboveFloor(envFloor(100000), "HOTEL", "htl_x", 50000), (e: any) => e.code === "BELOW_FLOOR_PRICE" && e.details.floorPriceMinor === 100000);
});

test("settlementPayoutStmts: payable relieved in full, cash and claim split the credit", () => {
  const seen: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    prepare: (sql: string) => ({ bind: (...params: unknown[]) => { seen.push({ sql, params }); return {}; } }),
  } as any;
  const stmts = settlementPayoutStmts(db, { id: "bkg_u143", entity_id: "ent_primary", supplier_id: "ptn_x", currency: "KRW" }, "stl_u143", 100000, 90000);
  assert.equal(stmts.length, 3);
  const legs = seen.map((s) => ({ account: s.params[5], direction: s.params[6], amount: s.params[7], event: s.params[9], ref: s.params[10] }));
  assert.deepEqual(
    legs.map((l) => [l.account, l.direction, l.amount]),
    [
      ["SUPPLIER_PAYABLE", "DEBIT", 100000],
      ["OPERATING_CASH", "CREDIT", 90000],
      ["SELLER_CLAIM_RECEIVABLE", "CREDIT", 10000],
    ],
  );
  assert.ok(legs.every((l) => l.event === "SETTLEMENT_PAID_OUT" && l.ref === "stl_u143"));
  const debit = legs.filter((l) => l.direction === "DEBIT").reduce((s, l) => s + Number(l.amount), 0);
  const credit = legs.filter((l) => l.direction === "CREDIT").reduce((s, l) => s + Number(l.amount), 0);
  assert.equal(debit, credit);
  // Degenerate inputs journal nothing instead of corrupting the books.
  assert.deepEqual(settlementPayoutStmts(db, { id: "b", entity_id: "e", supplier_id: "s", currency: "KRW" }, "stl_0", 0, 0), []);
  assert.deepEqual(settlementPayoutStmts(db, { id: "b", entity_id: "e", supplier_id: "s", currency: "KRW" }, "stl_0", 100, 101), []);
});

/** TG-17 FDS rules: each rule fires on its own evidence, holds at 60. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fdsEnforced, scoreAttempt } from "../../src/services/fds-service.ts";
import { fakeDb } from "./_fakedb.ts";

function envWith(o: { velocity?: number; daily?: number; declines?: number; userCreatedAt?: string | null; promoCode?: string | null; ring?: number }) {
  return {
    DB: fakeDb({
      first: (sql: string) => {
        if (sql.includes("FROM users")) return o.userCreatedAt === undefined ? null : { created_at: o.userCreatedAt };
        if (sql.includes("AS code")) return { code: o.promoCode ?? null };
        if (sql.includes("SUM(p.amount_minor)")) return { c: o.daily ?? 0 };
        if (sql.includes("status = 'FAILED'")) return { c: o.declines ?? 0 };
        if (sql.includes("COUNT(DISTINCT b.user_id)")) return { c: o.ring ?? 0 };
        return { c: o.velocity ?? 0 };
      },
    }),
  } as any;
}

test("fds: quiet user passes with score 0", async () => {
  const r = await scoreAttempt(envWith({}), "u1", "b1", 605000);
  assert.deepEqual(r, { score: 0, reasons: [], held: false });
});

test("fds: velocity + amount stack into a hold", async () => {
  const r = await scoreAttempt(envWith({ velocity: 10 }), "u1", "b1", 3_000_000);
  assert.equal(r.held, true);
  assert.equal(r.score, 70);
  assert.ok(r.reasons.some((x) => x.startsWith("velocity:")) && r.reasons.some((x) => x.startsWith("amount:")));
});

test("fds: declines + daily exposure hold card testers", async () => {
  const r = await scoreAttempt(envWith({ declines: 3, daily: 5_000_000 }), "u1", "b1", 100000);
  assert.equal(r.held, false); // 25 + 25 = 50, under threshold
  const r2 = await scoreAttempt(envWith({ declines: 3, daily: 5_000_000, velocity: 5 }), "u1", "b1", 100000);
  assert.equal(r2.held, true); // +30 = 80
});

test("fds: new account high value + coupon ring", async () => {
  const fresh = new Date().toISOString();
  const r = await scoreAttempt(envWith({ userCreatedAt: fresh, promoCode: "RING10", ring: 4 }), "u1", "b1", 1_200_000);
  assert.equal(r.held, false); // 20 + 20 = 40
  assert.ok(r.reasons.includes("new_account_high_value"));
  const old = new Date(Date.now() - 30 * 86400000).toISOString();
  const r2 = await scoreAttempt(envWith({ userCreatedAt: old, promoCode: "RING10", ring: 4 }), "u1", "b1", 1_200_000);
  assert.equal(r2.score, 20); // old account skips R4
  const r3 = await scoreAttempt(envWith({ userCreatedAt: fresh, promoCode: null }), "u1", "b1", 100000);
  assert.equal(r3.score, 0); // no coupon, low amount
});

test("fds: enforcement flag gates everything", () => {
  assert.equal(fdsEnforced({ FRAUD_REVIEW: "1" } as any), true);
  assert.equal(fdsEnforced({} as any), false);
  assert.equal(fdsEnforced({ FRAUD_REVIEW: "0" } as any), false);
});

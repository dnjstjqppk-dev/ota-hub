/** GAP-06 (2026-11-24 commercialization audit): Toss + Stripe simultaneously. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { availablePaymentProviders, getPaymentProvider, getPaymentProviderFor } from "../../src/payments/provider.ts";
import { handleBookings } from "../../src/routes/bookings.ts";
import { confirmPayment } from "../../src/services/booking-service.ts";
import { fakeDb } from "./_fakedb.ts";
import type { Env } from "../../src/env.ts";

const names = (env: Env) => availablePaymentProviders(env).map((p) => p.name);
const KEYS = { TOSS_SECRET_KEY: "test_sk_t", TOSS_CLIENT_KEY: "test_ck_t", STRIPE_SECRET_KEY: "sk_test_s", STRIPE_PUBLISHABLE_KEY: "pk_test_s" };

test("multipg: PAYMENT_PROVIDER is an allowlist; unset/disabled stays fail-closed", () => {
  assert.deepEqual(names({} as Env), []);
  assert.deepEqual(names({ PAYMENT_PROVIDER: "bogus" } as Env), []);
  assert.deepEqual(names({ PAYMENT_PROVIDER: "toss" } as Env), []); // no key, no provider
  assert.deepEqual(names({ APP_ENV: "production", PAYMENT_PROVIDER: "sandbox" } as Env), []);
  assert.deepEqual(names({ APP_ENV: "test", PAYMENT_PROVIDER: "sandbox" } as Env), ["sandbox"]);
});

test("multipg: single values behave exactly as before; lists enable both in order", () => {
  const t = { APP_ENV: "test", PAYMENT_PROVIDER: "toss", ...KEYS } as Env;
  assert.deepEqual(names(t), ["toss"]);
  assert.equal(getPaymentProvider(t)?.name, "toss");
  const both = { APP_ENV: "test", PAYMENT_PROVIDER: "toss,stripe", ...KEYS } as Env;
  assert.deepEqual(names(both), ["toss", "stripe"]);
  assert.equal(getPaymentProvider(both)?.name, "toss"); // first listed is the default
  const rev = { APP_ENV: "test", PAYMENT_PROVIDER: "stripe,toss", ...KEYS } as Env;
  assert.deepEqual(names(rev), ["stripe", "toss"]);
  assert.equal(getPaymentProvider(rev)?.name, "stripe");
  assert.deepEqual(names({ APP_ENV: "test", PAYMENT_PROVIDER: "toss,stripe", TOSS_SECRET_KEY: "test_sk_t" } as Env), ["toss"]);
  assert.deepEqual(names({ APP_ENV: "test", PAYMENT_PROVIDER: "Toss, STRIPE ,toss", ...KEYS } as Env), ["toss", "stripe"]);
});

test("multipg: named resolution finds a listed provider or null", () => {
  const env = { APP_ENV: "test", PAYMENT_PROVIDER: "toss,stripe", ...KEYS } as Env;
  assert.equal(getPaymentProviderFor(env, "stripe")?.name, "stripe");
  assert.equal(getPaymentProviderFor(env, "toss")?.name, "toss");
  assert.equal(getPaymentProviderFor(env, "sandbox"), null);
  assert.equal(getPaymentProviderFor({ APP_ENV: "test", PAYMENT_PROVIDER: "toss", ...KEYS } as Env, "stripe"), null);
});

test("multipg: /payments/config advertises every provider, legacy fields stay the default", async () => {
  const call = async (env: Env) => {
    const r = await handleBookings(new Request("https://api.test/api/v1/payments/config"), env, new URL("https://api.test/api/v1/payments/config"));
    return (await r!.json()) as any;
  };
  const single = await call({ APP_ENV: "test", PAYMENT_PROVIDER: "toss", ...KEYS } as Env);
  assert.equal(single.enabled, true);
  assert.equal(single.provider, "toss");
  assert.equal(single.clientKey, "test_ck_t");
  assert.deepEqual(single.providers.map((p: any) => p.provider), ["toss"]);
  const multi = await call({ APP_ENV: "test", PAYMENT_PROVIDER: "toss,stripe", ...KEYS } as Env);
  assert.equal(multi.enabled, true);
  assert.equal(multi.provider, "toss"); // default unchanged for old clients
  assert.deepEqual(multi.providers.map((p: any) => p.provider), ["toss", "stripe"]);
  assert.equal(multi.providers[1].publishableKey, "pk_test_s");
  const off = await call({} as Env);
  assert.equal(off.enabled, false);
  assert.equal(off.provider, null);
  assert.deepEqual(off.providers, []);
});

async function confirmErr(env: Env, body: Record<string, unknown>): Promise<any> {
  try {
    await confirmPayment({ ...env, DB: fakeDb() } as Env, { id: "usr_1" } as any, body);
  } catch (e) {
    return e;
  }
  assert.fail("expected confirmPayment to throw");
}

test("multipg: confirm validates the chosen provider before touching the DB", async () => {
  const env = { APP_ENV: "test", PAYMENT_PROVIDER: "toss", ...KEYS } as Env;
  assert.equal((await confirmErr(env, { provider: "bogus" }) as any).code, "UNKNOWN_PROVIDER");
  assert.equal((await confirmErr(env, { provider: "stripe" }) as any).code, "PROVIDER_UNAVAILABLE");
  assert.equal((await confirmErr({ APP_ENV: "test" } as Env, {}) as any).code, "PAYMENTS_DISABLED");
});

test("multipg: confirm rejects a return origin outside the allowlist", async () => {
  const env = { APP_ENV: "test", PAYMENT_PROVIDER: "toss,stripe", ALLOWED_ORIGINS: "https://getfortrip.com", ...KEYS } as Env;
  assert.equal((await confirmErr(env, { provider: "stripe", returnOrigin: "https://evil.test" }) as any).code, "INVALID_RETURN_ORIGIN");
});

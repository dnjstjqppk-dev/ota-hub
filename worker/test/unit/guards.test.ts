import { test } from "node:test";
import assert from "node:assert/strict";
import { getPaymentProvider } from "../../src/payments/provider.ts";
import { bookabilityOf, type SupplierRow } from "../../src/services/catalog.ts";
import * as L from "../../src/domain/ledger.ts";

const env = (o: Record<string, string>) => o as any;
const sup = (o: Partial<SupplierRow>): SupplierRow => ({ id: "s", name: "s", adapter: "none", integration_status: "NOT_INTEGRATED", transaction_model: "MERCHANT_OF_RECORD", settlement_rate_bps: 9000, ...o });

test("production refuses the sandbox payment provider", () => {
  assert.equal(getPaymentProvider(env({ PAYMENT_PROVIDER: "sandbox" })), null);
  assert.equal(getPaymentProvider(env({ PAYMENT_PROVIDER: "sandbox", APP_ENV: "production" })), null);
  assert.equal(getPaymentProvider(env({ PAYMENT_PROVIDER: "sandbox", APP_ENV: "development" }))?.mode, "SANDBOX");
  assert.equal(getPaymentProvider(env({})), null);
  assert.equal(getPaymentProvider(env({ PAYMENT_PROVIDER: "toss" })), null, "toss without key = disabled");
  assert.equal(getPaymentProvider(env({ PAYMENT_PROVIDER: "toss", TOSS_SECRET_KEY: "test_sk_x" }))?.mode, "SANDBOX");
  assert.equal(getPaymentProvider(env({ PAYMENT_PROVIDER: "toss", TOSS_SECRET_KEY: "live_sk_x" }))?.mode, "LIVE");
});

test("production refuses simulated / unintegrated / affiliate suppliers", () => {
  assert.equal(bookabilityOf(env({ ALLOW_SIMULATED_SUPPLIERS: "true" }), sup({ adapter: "simulator" })).bookable, false);
  assert.equal(bookabilityOf(env({ ALLOW_SIMULATED_SUPPLIERS: "true", APP_ENV: "development" }), sup({ adapter: "simulator" })).bookable, true);
  assert.equal(bookabilityOf(env({}), sup({ adapter: "none" })).bookable, false);
  assert.equal(bookabilityOf(env({}), sup({ adapter: "direct_contract", integration_status: "CONTRACTED_IN_DEV" })).bookable, false);
  assert.equal(bookabilityOf(env({}), sup({ adapter: "direct_contract", integration_status: "LIVE" })).bookable, true);
  assert.equal(bookabilityOf(env({}), sup({ adapter: "api", integration_status: "LIVE", transaction_model: "AFFILIATE" })).reason, "EXTERNAL_LINK_ONLY");
  assert.equal(bookabilityOf(env({}), null).bookable, false);
});

test("ledger journals always balance; cancel-after-confirm nets customer deposits to zero", () => {
  const paid = 575000, disc = 30000;
  const split = L.recognitionSplit(paid, disc, 9000);
  assert.equal(split.supplierPayableMinor + split.commissionMinor, paid + disc);
  const fee = 100000;
  const journals = [
    L.paymentCaptured("p", paid),
    L.fulfilmentRecognized("b", paid, split),
    L.fulfilmentReversed("b", paid, split),
    L.cancellationFeeRetained("b", fee)!,
    L.refundPaid("r", paid - fee),
  ];
  let deposits = 0;
  for (const j of journals) {
    assert.ok(L.balanced(j.lines), j.eventType);
    for (const l of j.lines) if (l.account === "CUSTOMER_DEPOSITS") deposits += l.direction === "CREDIT" ? l.amountMinor : -l.amountMinor;
  }
  assert.equal(deposits, 0);
  assert.equal(L.cancellationFeeRetained("b", 0), null);
});

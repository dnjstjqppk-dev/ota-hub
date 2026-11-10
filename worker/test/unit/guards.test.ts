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

test("ESIM/INSURANCE quotes refused explicitly; quotable domains pass", async () => {
  const { assertQuotableDomain } = await import("../../src/services/catalog.ts");
  for (const d of ["ESIM", "INSURANCE"]) {
    assert.throws(() => assertQuotableDomain(d), (e: any) => e.status === 409 && e.code === "ESIM_INSURANCE_QUOTE_UNSUPPORTED");
  }
  for (const d of ["HOTEL", "FLIGHT", "BOAT"]) assert.doesNotThrow(() => assertQuotableDomain(d));
});

test("dated-inventory domains refuse sale without configured capacity", async () => {
  const { assertInventoryConfigured } = await import("../../src/services/catalog.ts");
  for (const d of ["ACTIVITY", "TRANSFER", "PACKAGE"]) {
    assert.throws(() => assertInventoryConfigured(d, { capacity: null }), (e: any) => e.status === 409 && e.code === "INVENTORY_NOT_CONFIGURED");
    assert.doesNotThrow(() => assertInventoryConfigured(d, { capacity: 0 }));
    assert.doesNotThrow(() => assertInventoryConfigured(d, { capacity: 5 }));
  }
  for (const d of ["HOTEL", "FLIGHT", "TRAIN", "CAR"]) assert.doesNotThrow(() => assertInventoryConfigured(d, { capacity: null }));
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

test("public reviewer names are masked", async () => {
  const { maskName } = await import("../../src/lib/crypto.ts");
  assert.equal(maskName("김민지"), "김*지");
  assert.equal(maskName("이수"), "이*");
  assert.equal(maskName("Kim Minji"), "K*******i");
  assert.equal(maskName(""), "여행자");
  assert.equal(maskName(null), "여행자");
});

test("sitemap: absolute, de-duplicated, XML-escaped URLs", async () => {
  const { buildSitemap } = await import("../../src/routes/seo.ts");
  const xml = buildSitemap("https://getfortrip.com/", ["", "/hotels", "/hotels", "/a&b"]);
  assert.equal((xml.match(/<url>/g) || []).length, 3);
  assert.ok(xml.includes("<loc>https://getfortrip.com</loc>"));
  assert.ok(xml.includes("<loc>https://getfortrip.com/a&amp;b</loc>"));
});

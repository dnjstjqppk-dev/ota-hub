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

test("partial reversal unwinds only the refunded slice and stays balanced", () => {
  const paid = 605000, disc = 0;
  const split = L.recognitionSplit(paid, disc, 9000);
  const half = Math.floor(paid / 2);
  const j = L.fulfilmentReversedPartial("b", half, split, paid)!;
  assert.ok(L.balanced(j.lines), "partial journal balances");
  assert.equal(j.eventType, "FULFILMENT_REVERSED");
  const dep = (jj: L.Journal) => jj.lines.filter((l) => l.account === "CUSTOMER_DEPOSITS").reduce((s, l) => s + (l.direction === "CREDIT" ? l.amountMinor : -l.amountMinor), 0);
  // Capture + recognition + partial reversal + partial payout nets deposits to zero.
  const flow = [L.paymentCaptured("p", paid), L.fulfilmentRecognized("b", paid, split), j, L.refundPaid("r", half)];
  assert.equal(flow.reduce((s, x) => s + dep(x), 0), 0);
  // A second partial for the remainder also nets out (cumulative tracking).
  const rest = L.fulfilmentReversedPartial("b", paid - half, split, paid)!;
  assert.ok(L.balanced(rest.lines));
  assert.equal(dep(rest) - (paid - half), 0);
  // Full-or-more delegates to the whole reversal; garbage returns null.
  assert.equal(L.fulfilmentReversedPartial("b", paid, split, paid)!.lines.length, L.fulfilmentReversed("b", paid, split).lines.length);
  assert.equal(L.fulfilmentReversedPartial("b", 0, split, paid), null);
  assert.equal(L.fulfilmentReversedPartial("b", -5, split, paid), null);
});

test("#17: payout relieves the payable; recovery slices extinguish the claim", () => {
  // Plain payout: payable out, cash out.
  const p = L.settlementPaidOut("stl_1", 544500, 544500)!;
  assert.ok(L.balanced(p.lines));
  assert.equal(p.eventType, "SETTLEMENT_PAID_OUT");
  // Payout with a recovery offset: the offset slice kills the receivable.
  const q = L.settlementPaidOut("stl_2", 544500, 244500)!;
  assert.ok(L.balanced(q.lines));
  const recv = q.lines.find((l) => l.account === "SELLER_CLAIM_RECEIVABLE")!;
  assert.equal(recv.direction, "CREDIT");
  assert.equal(recv.amountMinor, 300000);
  // Fully offset payout (no bank movement): payable vs receivable only.
  const z = L.settlementPaidOut("stl_3", 100000, 0)!;
  assert.ok(L.balanced(z.lines));
  assert.ok(!z.lines.some((l) => l.account === "OPERATING_CASH"));
  // The claim funds the customer refund via deposits (settled books are relieved).
  const c = L.recoveryClaimRaised("rcv_1", 605000)!;
  assert.ok(L.balanced(c.lines));
  assert.equal(c.lines.find((l) => l.account === "CUSTOMER_DEPOSITS")!.direction, "CREDIT");
  // Guards.
  assert.equal(L.settlementPaidOut("s", 0, 0), null);
  assert.equal(L.settlementPaidOut("s", 100, 101), null);
  assert.equal(L.settlementPaidOut("s", 100, -1), null);
  assert.equal(L.recoveryClaimRaised("c", 0), null);
});

test("#17: repeated reversals carry per-refund references (no unique clash)", () => {
  const split = L.recognitionSplit(605000, 0, 9000);
  const a = L.fulfilmentReversedPartial("b", 302500, split, 605000, "rfd_1")!;
  const c = L.fulfilmentReversedPartial("b", 302500, split, 605000, "rfd_2")!;
  assert.equal(a.referenceId, "rfd_1");
  assert.equal(c.referenceId, "rfd_2");
  assert.ok(L.balanced(a.lines) && L.balanced(c.lines));
  const full = L.fulfilmentReversedPartial("b", 605000, split, 605000, "rfd_3")!;
  assert.equal(full.referenceId, "rfd_3");
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

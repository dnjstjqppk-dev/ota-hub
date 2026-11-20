/** Phase 1 checkout routing: mode resolution + strategy delegation. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertCheckoutInput, resolveCheckoutMode } from "../../src/payments/checkout-modes.ts";
import { affiliateReason, affiliateReasonKo, affiliateRedirectStrategy, affiliateRefusal } from "../../src/payments/strategies/affiliate-redirect.ts";
import { assertDirectDecision, directPgStrategy } from "../../src/payments/strategies/direct-pg.ts";
import { hybridBranch, hybridFilteredStrategy, isHybridDirect } from "../../src/payments/strategies/hybrid-filtered.ts";
import { checkoutDisclosure, isCheckoutMode, routeCheckout, strategyFor } from "../../src/payments/strategies/router.ts";

test("resolver: plan listings and affiliate suppliers always redirect", () => {
  assert.equal(resolveCheckoutMode({ domain: "ESIM", transactionModel: null }), "AFFILIATE_REDIRECT");
  assert.equal(resolveCheckoutMode({ domain: "INSURANCE", transactionModel: null }), "AFFILIATE_REDIRECT");
  assert.equal(resolveCheckoutMode({ domain: "esim", transactionModel: null }), "AFFILIATE_REDIRECT");
  assert.equal(resolveCheckoutMode({ domain: "HOTEL", transactionModel: "AFFILIATE" }), "AFFILIATE_REDIRECT");
  assert.equal(resolveCheckoutMode({ domain: "FLIGHT", transactionModel: "AFFILIATE" }), "AFFILIATE_REDIRECT");
});

test("resolver: hotels filter per supplier, everything else sells direct", () => {
  assert.equal(resolveCheckoutMode({ domain: "HOTEL", transactionModel: "MERCHANT_OF_RECORD" }), "HYBRID_FILTERED");
  assert.equal(resolveCheckoutMode({ domain: "HOTEL", transactionModel: null }), "HYBRID_FILTERED");
  for (const domain of ["FLIGHT", "TRAIN", "CAR", "TRANSFER", "PACKAGE"]) {
    assert.equal(resolveCheckoutMode({ domain, transactionModel: "MERCHANT_OF_RECORD" }), "DIRECT_PG", domain);
    assert.equal(resolveCheckoutMode({ domain, transactionModel: "AGENCY" }), "DIRECT_PG", domain);
  }
});

test("resolver: tours sell direct only with their own instant voucher", () => {
  assert.equal(resolveCheckoutMode({ domain: "ACTIVITY", transactionModel: "MERCHANT_OF_RECORD", isVoucherOnly: true }), "DIRECT_PG");
  assert.equal(resolveCheckoutMode({ domain: "ACTIVITY", transactionModel: "MERCHANT_OF_RECORD", isVoucherOnly: false }), "AFFILIATE_REDIRECT");
  // Pre-0054 rows carry no flag: legacy direct sale is preserved.
  assert.equal(resolveCheckoutMode({ domain: "ACTIVITY", transactionModel: "MERCHANT_OF_RECORD", isVoucherOnly: null }), "DIRECT_PG");
  assert.equal(resolveCheckoutMode({ domain: "ACTIVITY", transactionModel: "MERCHANT_OF_RECORD" }), "DIRECT_PG");
});

test("direct-pg: proceeds, but never for an affiliate supplier", () => {
  const ok = directPgStrategy.decide({ domain: "FLIGHT", transactionModel: "AGENCY" });
  assert.deepEqual(ok, { mode: "DIRECT_PG", action: "PROCEED_QUOTE", reason: null });
  const blocked = directPgStrategy.decide({ domain: "FLIGHT", transactionModel: "AFFILIATE" });
  assert.equal(blocked.action, "REDIRECT_OUTLINK");
  assert.throws(() => assertDirectDecision(blocked, (r) => { throw new Error(`redirect:${r}`); }), /redirect:EXTERNAL_LINK_ONLY/);
  assert.doesNotThrow(() => assertDirectDecision(ok, () => { throw new Error("must not throw"); }));
});

test("affiliate-redirect: always redirects with a machine reason + 409 payload", () => {
  assert.equal(affiliateReason({ domain: "ESIM", transactionModel: null }), "PLAN_LISTING_ONLY");
  assert.equal(affiliateReason({ domain: "HOTEL", transactionModel: "AFFILIATE" }), "EXTERNAL_LINK_ONLY");
  assert.equal(affiliateReason({ domain: "ACTIVITY", transactionModel: "AGENCY", isVoucherOnly: false }), "PARTNER_VOUCHER_ONLY");
  const d = affiliateRedirectStrategy.decide({ domain: "ESIM", transactionModel: null });
  assert.equal(d.mode, "AFFILIATE_REDIRECT");
  assert.equal(d.action, "REDIRECT_OUTLINK");
  assert.deepEqual(affiliateRefusal(d.reason), { code: "NOT_DIRECTLY_BOOKABLE", message: affiliateReasonKo("PLAN_LISTING_ONLY"), reason: "PLAN_LISTING_ONLY" });
  assert.match(affiliateReasonKo("PARTNER_VOUCHER_ONLY"), /제휴사/);
  assert.match(affiliateReasonKo("EXTERNAL_LINK_ONLY"), /제휴사 사이트/);
});

test("hybrid-filtered: direct models proceed, affiliate and unknown redirect", () => {
  assert.equal(hybridFilteredStrategy.decide({ domain: "HOTEL", transactionModel: "MERCHANT_OF_RECORD" }).action, "PROCEED_QUOTE");
  assert.equal(hybridFilteredStrategy.decide({ domain: "HOTEL", transactionModel: "AGENCY" }).action, "PROCEED_QUOTE");
  assert.equal(hybridFilteredStrategy.decide({ domain: "HOTEL", transactionModel: "AFFILIATE" }).action, "REDIRECT_OUTLINK");
  assert.equal(hybridFilteredStrategy.decide({ domain: "HOTEL", transactionModel: null }).action, "REDIRECT_OUTLINK");
  assert.equal(isHybridDirect({ domain: "HOTEL", transactionModel: "AGENCY" }), true);
  assert.equal(isHybridDirect({ domain: "HOTEL", transactionModel: null }), false);
  assert.equal(hybridBranch({ domain: "HOTEL", transactionModel: "AGENCY" }), "DIRECT");
  assert.equal(hybridBranch({ domain: "HOTEL", transactionModel: "AFFILIATE" }), "AFFILIATE");
  assert.equal(hybridBranch({ domain: "HOTEL", transactionModel: null }), "AFFILIATE");
});

test("router: resolves then delegates to the matching strategy", () => {
  assert.equal(strategyFor("DIRECT_PG"), directPgStrategy);
  const tour = routeCheckout({ domain: "ACTIVITY", transactionModel: "AGENCY", isVoucherOnly: false });
  assert.deepEqual(tour, { mode: "AFFILIATE_REDIRECT", action: "REDIRECT_OUTLINK", reason: "PARTNER_VOUCHER_ONLY" });
  const hotel = routeCheckout({ domain: "HOTEL", transactionModel: "AGENCY" });
  assert.deepEqual(hotel, { mode: "HYBRID_FILTERED", action: "PROCEED_QUOTE", reason: null });
  const flight = routeCheckout({ domain: "FLIGHT", transactionModel: "MERCHANT_OF_RECORD" });
  assert.deepEqual(flight, { mode: "DIRECT_PG", action: "PROCEED_QUOTE", reason: null });
});

test("router: malformed input throws, mode guard and disclosures behave", () => {
  assert.throws(() => routeCheckout({ domain: "", transactionModel: null }), /CHECKOUT_INPUT_DOMAIN_REQUIRED/);
  assert.throws(() => routeCheckout({ domain: "HOTEL", transactionModel: "BOGUS" as any }), /CHECKOUT_INPUT_MODEL_UNKNOWN/);
  assert.doesNotThrow(() => assertCheckoutInput({ domain: "HOTEL", transactionModel: null }));
  assert.equal(isCheckoutMode("HYBRID_FILTERED"), true);
  assert.equal(isCheckoutMode("DIRECT_PG"), true);
  assert.equal(isCheckoutMode("cash"), false);
  assert.equal(checkoutDisclosure({ domain: "FLIGHT", transactionModel: "AGENCY" }).checkoutMode, "DIRECT_PG");
  assert.equal(checkoutDisclosure({ domain: "ESIM", transactionModel: null }).checkoutMode, "AFFILIATE_REDIRECT");
  assert.equal(checkoutDisclosure({ domain: "HOTEL", transactionModel: "AFFILIATE" }).seller, "제휴사 판매");
});

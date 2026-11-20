/**
 * HYBRID_FILTERED strategy: a mixed shelf filtered per supplier (hotels).
 *
 * Direct-contract rooms are quoted and paid here; meta-search rows link
 * out to the partner. The filter runs per product — a listing may show
 * both badges, but one product is never both at once. Unregistered
 * suppliers (null model) fail closed to the outlink branch.
 */
import type { CheckoutDecision, CheckoutInput, PaymentStrategy } from "../checkout-modes.ts";

export const hybridFilteredStrategy: PaymentStrategy = {
  mode: "HYBRID_FILTERED",
  /**
   * @example decide({ domain: "HOTEL", transactionModel: "AGENCY" })
   * // { mode: "HYBRID_FILTERED", action: "PROCEED_QUOTE", reason: null }
   */
  decide(input: CheckoutInput): CheckoutDecision {
    if (input.transactionModel === "MERCHANT_OF_RECORD" || input.transactionModel === "AGENCY") {
      return { mode: "HYBRID_FILTERED", action: "PROCEED_QUOTE", reason: null };
    }
    return { mode: "HYBRID_FILTERED", action: "REDIRECT_OUTLINK", reason: "EXTERNAL_LINK_ONLY" };
  },
};

/** True when this hybrid product sells direct (badge + checkout button). */
export function isHybridDirect(input: CheckoutInput): boolean {
  return input.transactionModel === "MERCHANT_OF_RECORD" || input.transactionModel === "AGENCY";
}

/**
 * Badge branch for a hybrid product: DIRECT renders the direct-sale badge
 * and checkout button, AFFILIATE renders the outlink button. Fails closed
 * (AFFILIATE) for unregistered suppliers, matching decide() above.
 */
export function hybridBranch(input: CheckoutInput): "DIRECT" | "AFFILIATE" {
  return isHybridDirect(input) ? "DIRECT" : "AFFILIATE";
}

/** Seller disclosure for hybrid shelves; the per-product branch picks one. */
export function hybridDisclosure(direct: boolean): { checkoutMode: "HYBRID_FILTERED"; seller: string; note: string } {
  return direct
    ? {
        checkoutMode: "HYBRID_FILTERED",
        seller: "getfortrip 직접판매",
        note: "이 숙소 상품은 getfortrip에서 결제하고 바우처를 발급해요.",
      }
    : {
        checkoutMode: "HYBRID_FILTERED",
        seller: "제휴사 판매",
        note: "이 숙소 상품은 제휴사 사이트에서 예약·결제해요.",
      };
}

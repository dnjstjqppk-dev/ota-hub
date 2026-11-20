/**
 * DIRECT_PG strategy: the order is quoted and paid on getfortrip.
 *
 * Covers MERCHANT_OF_RECORD (company sells) and AGENCY (supplier sells,
 * company collects) — both move money through our PG, so both proceed to
 * the quote gate. Fulfilment (voucher / ticket) happens after confirmation.
 * Tours land here only with their own instant voucher (is_voucher_only).
 *
 * Routed here: FLIGHT, TRAIN, CAR, TRANSFER, PACKAGE on direct suppliers,
 * voucher-owning ACTIVITY, and the direct branch of HYBRID_FILTERED hotels.
 * Decision table: AFFILIATE model -> REDIRECT_OUTLINK (defense in depth;
 * the resolver normally reroutes such suppliers before we ever run),
 * anything else -> PROCEED_QUOTE.
 */
import type { CheckoutDecision, CheckoutInput, PaymentStrategy } from "../checkout-modes.ts";

export const directPgStrategy: PaymentStrategy = {
  mode: "DIRECT_PG",
  /**
   * @example decide({ domain: "FLIGHT", transactionModel: "AGENCY" })
   * // { mode: "DIRECT_PG", action: "PROCEED_QUOTE", reason: null }
   */
  decide(input: CheckoutInput): CheckoutDecision {
    // Defense in depth: an AFFILIATE supplier must never reach our PG even
    // if a caller skips the resolver and invokes this strategy directly.
    if (input.transactionModel === "AFFILIATE") {
      return { mode: "DIRECT_PG", action: "REDIRECT_OUTLINK", reason: "EXTERNAL_LINK_ONLY" };
    }
    return { mode: "DIRECT_PG", action: "PROCEED_QUOTE", reason: null };
  },
};

/** Seller disclosure shown on quotes and booking cards for direct sales. */
export function directDisclosure(): { checkoutMode: "DIRECT_PG"; seller: string; note: string } {
  return {
    checkoutMode: "DIRECT_PG",
    seller: "getfortrip 직접판매",
    note: "getfortrip에서 결제하고 공급사 확정 후 바우처를 발급해요.",
  };
}

/**
 * Guard helper for money gates: throws the honest 409 when a redirect-mode
 * decision reaches a quotable path (defense in depth behind the router).
 */
export function assertDirectDecision(
  decision: CheckoutDecision,
  thrower: (reason: string | null) => never,
): void {
  if (decision.action !== "PROCEED_QUOTE") thrower(decision.reason);
}

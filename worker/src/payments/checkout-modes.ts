/**
 * Checkout modes (Phase 1): WHERE the money moves for an order.
 *
 * - DIRECT_PG: quoted and paid on getfortrip, voucher issued after confirm.
 * - AFFILIATE_REDIRECT: sold on a partner site via /out/; we take no money.
 * - HYBRID_FILTERED: mixed shelf (hotels) — each product filters to direct
 *   sale or outlink by its own supplier, never both at once.
 *
 * Pure input -> mode mapping. Money gates call routeCheckout() (strategies/
 * router.ts), which delegates the mode to its strategy. No DB, no fetch.
 */

export type CheckoutMode = "DIRECT_PG" | "AFFILIATE_REDIRECT" | "HYBRID_FILTERED";

export type CheckoutAction = "PROCEED_QUOTE" | "REDIRECT_OUTLINK";

export interface CheckoutInput {
  /** Uppercase catalog domain, or ESIM / INSURANCE for plan listings. */
  domain: string;
  /** Owning supplier's settlement relationship, null when unregistered. */
  transactionModel: "MERCHANT_OF_RECORD" | "AGENCY" | "AFFILIATE" | null;
  /**
   * ACTIVITY only: true when the tour sells its own instant voucher.
   * Undefined on rows written before migration 0054 (treated as direct,
   * matching legacy behavior); an explicit false redirects to the partner.
   */
  isVoucherOnly?: boolean | null;
}

export interface CheckoutDecision {
  mode: CheckoutMode;
  action: CheckoutAction;
  /** Machine reason for the redirect branch; null when quoting proceeds. */
  reason: string | null;
}

export interface PaymentStrategy {
  mode: CheckoutMode;
  decide(input: CheckoutInput): CheckoutDecision;
}

const TRANSACTION_MODELS = ["MERCHANT_OF_RECORD", "AGENCY", "AFFILIATE"] as const;

/** Fail fast on malformed router input (programming error, never user input). */
export function assertCheckoutInput(input: CheckoutInput): void {
  if (!input || typeof input.domain !== "string" || !input.domain.trim()) {
    throw new Error("CHECKOUT_INPUT_DOMAIN_REQUIRED");
  }
  if (input.transactionModel !== null && !(TRANSACTION_MODELS as readonly string[]).includes(input.transactionModel)) {
    throw new Error("CHECKOUT_INPUT_MODEL_UNKNOWN");
  }
}

export function resolveCheckoutMode(input: CheckoutInput): CheckoutMode {
  const domain = input.domain.toUpperCase();
  // Plan listings only: no quote, no payment, no voucher on our side.
  if (domain === "ESIM" || domain === "INSURANCE") return "AFFILIATE_REDIRECT";
  if (input.transactionModel === "AFFILIATE") return "AFFILIATE_REDIRECT";
  // Mixed shelf: direct-contract rooms sell here, meta rows link out.
  if (domain === "HOTEL") return "HYBRID_FILTERED";
  // Tours sell direct only with their own instant voucher; otherwise the
  // partner site owns the transaction.
  if (domain === "ACTIVITY") return input.isVoucherOnly === false ? "AFFILIATE_REDIRECT" : "DIRECT_PG";
  return "DIRECT_PG";
}

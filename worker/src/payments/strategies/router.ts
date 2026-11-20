/**
 * Checkout router: resolves the mode, then delegates to its strategy.
 *
 * The router owns no policy — resolveCheckoutMode() picks the mode and the
 * matching strategy decides. Money gates call routeCheckout() and honor
 * REDIRECT_OUTLINK with the honest 409 (see affiliateRefusal()).
 */
import {
  assertCheckoutInput,
  resolveCheckoutMode,
  type CheckoutDecision,
  type CheckoutInput,
  type CheckoutMode,
  type PaymentStrategy,
} from "../checkout-modes.ts";
import { affiliateDisclosure, affiliateRedirectStrategy } from "./affiliate-redirect.ts";
import { directDisclosure, directPgStrategy } from "./direct-pg.ts";
import { hybridDisclosure, hybridFilteredStrategy, isHybridDirect } from "./hybrid-filtered.ts";

const STRATEGIES: Record<CheckoutMode, PaymentStrategy> = {
  DIRECT_PG: directPgStrategy,
  AFFILIATE_REDIRECT: affiliateRedirectStrategy,
  HYBRID_FILTERED: hybridFilteredStrategy,
};

/** Strategy lookup for callers that already resolved the mode (rare). */
export function strategyFor(mode: CheckoutMode): PaymentStrategy {
  return STRATEGIES[mode];
}

/** Type guard for mode values arriving from API input or stored rows. */
export function isCheckoutMode(value: unknown): value is CheckoutMode {
  return value === "DIRECT_PG" || value === "AFFILIATE_REDIRECT" || value === "HYBRID_FILTERED";
}

/**
 * Resolve + delegate in one call. Pure: no DB, no fetch, no clock.
 * Malformed input throws (assertCheckoutInput) — callers pass domain and
 * supplier fields they already loaded, so a throw is always a bug.
 */
export function routeCheckout(input: CheckoutInput): CheckoutDecision {
  assertCheckoutInput(input);
  const mode = resolveCheckoutMode(input);
  return STRATEGIES[mode].decide(input);
}

/** Per-mode seller disclosure for quote responses (client display only). */
export function checkoutDisclosure(input: CheckoutInput): { checkoutMode: CheckoutMode; seller: string; note: string } {
  const mode = resolveCheckoutMode(input);
  if (mode === "AFFILIATE_REDIRECT") return affiliateDisclosure();
  if (mode === "HYBRID_FILTERED") return hybridDisclosure(isHybridDirect(input));
  return directDisclosure();
}

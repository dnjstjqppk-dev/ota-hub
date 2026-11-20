/**
 * AFFILIATE_REDIRECT strategy: the transaction happens on a partner site.
 *
 * Reached for AFFILIATE suppliers, eSIM / insurance plan listings, and
 * tours without their own instant voucher. The platform takes no money:
 * quote and payment gates refuse with 409, and the UI renders the /out/
 * click-tracking link instead of a checkout button.
 */
import type { CheckoutDecision, CheckoutInput, PaymentStrategy } from "../checkout-modes.ts";

/** Machine reason per redirect cause, so clients can explain the state. */
export function affiliateReason(input: CheckoutInput): string {
  const domain = input.domain.toUpperCase();
  if (domain === "ESIM" || domain === "INSURANCE") return "PLAN_LISTING_ONLY";
  if (input.transactionModel === "AFFILIATE") return "EXTERNAL_LINK_ONLY";
  if (domain === "ACTIVITY") return "PARTNER_VOUCHER_ONLY";
  return "EXTERNAL_LINK_ONLY";
}

export const affiliateRedirectStrategy: PaymentStrategy = {
  mode: "AFFILIATE_REDIRECT",
  /**
   * @example decide({ domain: "ESIM", transactionModel: null })
   * // { mode: "AFFILIATE_REDIRECT", action: "REDIRECT_OUTLINK", reason: "PLAN_LISTING_ONLY" }
   */
  decide(input: CheckoutInput): CheckoutDecision {
    return { mode: "AFFILIATE_REDIRECT", action: "REDIRECT_OUTLINK", reason: affiliateReason(input) };
  },
};

/** Seller disclosure shown on catalog cards for affiliate products. */
export function affiliateDisclosure(): { checkoutMode: "AFFILIATE_REDIRECT"; seller: string; note: string } {
  return {
    checkoutMode: "AFFILIATE_REDIRECT",
    seller: "제휴사 판매",
    note: "예약·결제는 외부 제휴사 사이트에서 진행돼요. 이 상품은 getfortrip에서 직접 판매하지 않아요.",
  };
}

/** Per-reason customer message, so the 409 explains the actual state. */
export function affiliateReasonKo(reason: string | null): string {
  if (reason === "PLAN_LISTING_ONLY") return "eSIM·여행자보험은 요금제 조회만 지원하며 견적·예약은 준비 중입니다.";
  if (reason === "PARTNER_VOUCHER_ONLY") return "이 투어 상품은 제휴사 발급 바우처로만 이용할 수 있어 제휴사 사이트에서 예약해주세요.";
  return "이 상품은 제휴사 사이트에서 예약하는 상품입니다.";
}

/** 409 payload when a redirect-mode product reaches the quote gate. */
export function affiliateRefusal(reason: string | null): { code: string; message: string; reason: string | null } {
  return { code: "NOT_DIRECTLY_BOOKABLE", message: affiliateReasonKo(reason), reason };
}

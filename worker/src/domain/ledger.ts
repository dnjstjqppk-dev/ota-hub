/**
 * Double-entry journal builder (pure). Every financial event produces a set of
 * lines whose debits equal credits. Zero-amount lines are dropped.
 */
import { assertMinor, percentOf } from "./money.ts";

export type Account =
  | "PG_CLEARING"
  | "CUSTOMER_DEPOSITS"
  | "SUPPLIER_PAYABLE"
  | "COMMISSION_REVENUE"
  | "CANCELLATION_FEE_REVENUE"
  | "PROMOTION_EXPENSE"
  | "OPERATING_CASH"
  | "SELLER_CLAIM_RECEIVABLE";

export interface JournalLine {
  account: Account;
  direction: "DEBIT" | "CREDIT";
  amountMinor: number;
}

export interface Journal {
  eventType: string;
  referenceId: string;
  lines: JournalLine[];
}

export function balanced(lines: JournalLine[]): boolean {
  let d = 0;
  let c = 0;
  for (const l of lines) {
    assertMinor(l.amountMinor);
    if (l.amountMinor <= 0) return false;
    if (l.direction === "DEBIT") d += l.amountMinor;
    else c += l.amountMinor;
  }
  return d === c && d > 0;
}

function journal(eventType: string, referenceId: string, lines: JournalLine[]): Journal {
  const kept = lines.filter((l) => l.amountMinor !== 0);
  if (!balanced(kept)) throw new Error(`UNBALANCED_JOURNAL:${eventType}`);
  return { eventType, referenceId, lines: kept };
}

/** Customer money captured by the PG; held as a liability until fulfilment. */
export function paymentCaptured(paymentId: string, amountMinor: number): Journal {
  return journal("PAYMENT_CAPTURED", paymentId, [
    { account: "PG_CLEARING", direction: "DEBIT", amountMinor },
    { account: "CUSTOMER_DEPOSITS", direction: "CREDIT", amountMinor },
  ]);
}

export interface RecognitionSplit {
  supplierPayableMinor: number;
  commissionMinor: number;
  promotionMinor: number;
}

/**
 * Split at fulfilment. Supplier payable is computed on the gross (pre-discount)
 * amount at the supplier's settlement rate; the discount is a platform
 * promotion expense.
 */
export function recognitionSplit(paidMinor: number, discountMinor: number, settlementRateBps: number): RecognitionSplit {
  const gross = paidMinor + discountMinor;
  const payable = percentOf(gross, settlementRateBps);
  return { supplierPayableMinor: payable, commissionMinor: gross - payable, promotionMinor: discountMinor };
}

export function fulfilmentRecognized(bookingId: string, paidMinor: number, split: RecognitionSplit): Journal {
  return journal("FULFILMENT_RECOGNIZED", bookingId, [
    { account: "CUSTOMER_DEPOSITS", direction: "DEBIT", amountMinor: paidMinor },
    { account: "PROMOTION_EXPENSE", direction: "DEBIT", amountMinor: split.promotionMinor },
    { account: "SUPPLIER_PAYABLE", direction: "CREDIT", amountMinor: split.supplierPayableMinor },
    { account: "COMMISSION_REVENUE", direction: "CREDIT", amountMinor: split.commissionMinor },
  ]);
}

export function fulfilmentReversed(bookingId: string, paidMinor: number, split: RecognitionSplit): Journal {
  return journal("FULFILMENT_REVERSED", bookingId, [
    { account: "SUPPLIER_PAYABLE", direction: "DEBIT", amountMinor: split.supplierPayableMinor },
    { account: "COMMISSION_REVENUE", direction: "DEBIT", amountMinor: split.commissionMinor },
    { account: "CUSTOMER_DEPOSITS", direction: "CREDIT", amountMinor: paidMinor },
    { account: "PROMOTION_EXPENSE", direction: "CREDIT", amountMinor: split.promotionMinor },
  ]);
}

/**
 * Pro-rata reversal for a partial refund on a recognized order: the refunded
 * slice of payable/commission/promo is unwound so CUSTOMER_DEPOSITS never
 * goes negative while the live remainder stays recognized.
 */
export function fulfilmentReversedPartial(bookingId: string, takeMinor: number, split: RecognitionSplit, paidMinor: number, referenceId?: string): Journal | null {
  if (!Number.isSafeInteger(takeMinor) || takeMinor <= 0 || !Number.isSafeInteger(paidMinor) || paidMinor <= 0) return null;
  if (takeMinor >= paidMinor) {
    if (!referenceId || referenceId === bookingId) return fulfilmentReversed(bookingId, paidMinor, split);
    const full = fulfilmentReversed(bookingId, paidMinor, split);
    return { ...full, referenceId };
  }
  const promo = Math.max(0, Math.round(split.promotionMinor * takeMinor / paidMinor));
  const supplier = Math.min(Math.max(0, Math.round(split.supplierPayableMinor * takeMinor / paidMinor)), takeMinor + promo);
  const commission = takeMinor + promo - supplier;
  return journal("FULFILMENT_REVERSED", referenceId || bookingId, [
    { account: "SUPPLIER_PAYABLE", direction: "DEBIT", amountMinor: supplier },
    { account: "COMMISSION_REVENUE", direction: "DEBIT", amountMinor: commission },
    { account: "CUSTOMER_DEPOSITS", direction: "CREDIT", amountMinor: takeMinor },
    { account: "PROMOTION_EXPENSE", direction: "CREDIT", amountMinor: promo },
  ]);
}

/**
 * Settlement payout (#17): the bank transfer relieves the full recognized
 * payable. `cashMinor` is the money that actually moved; any recovery-offset
 * slice extinguishes the SELLER_CLAIM_RECEIVABLE raised at claim time.
 */
export function settlementPaidOut(settlementId: string, grossMinor: number, cashMinor: number): Journal | null {
  if (!Number.isSafeInteger(grossMinor) || grossMinor <= 0) return null;
  if (!Number.isSafeInteger(cashMinor) || cashMinor < 0 || cashMinor > grossMinor) return null;
  return journal("SETTLEMENT_PAID_OUT", settlementId, [
    { account: "SUPPLIER_PAYABLE", direction: "DEBIT", amountMinor: grossMinor },
    { account: "OPERATING_CASH", direction: "CREDIT", amountMinor: cashMinor },
    { account: "SELLER_CLAIM_RECEIVABLE", direction: "CREDIT", amountMinor: grossMinor - cashMinor },
  ]);
}

/**
 * Post-payout refund, seller owes us back (#17/B3): book the claim as a
 * receivable that funds the customer refund. The credit lands in
 * CUSTOMER_DEPOSITS (not PG_CLEARING): on a settled order the deposits were
 * already relieved at recognition and the payout relieved the payable, so the
 * outgoing refund must be funded by the seller's reimbursement — otherwise
 * deposits strand negative. Extinguished by a later payout offset.
 */
export function recoveryClaimRaised(claimId: string, amountMinor: number): Journal | null {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null;
  return journal("SETTLEMENT_RECOVERY_RAISED", claimId, [
    { account: "SELLER_CLAIM_RECEIVABLE", direction: "DEBIT", amountMinor },
    { account: "CUSTOMER_DEPOSITS", direction: "CREDIT", amountMinor },
  ]);
}

export function cancellationFeeRetained(bookingId: string, feeMinor: number): Journal | null {
  if (feeMinor <= 0) return null;
  return journal("CANCELLATION_FEE", bookingId, [
    { account: "CUSTOMER_DEPOSITS", direction: "DEBIT", amountMinor: feeMinor },
    { account: "CANCELLATION_FEE_REVENUE", direction: "CREDIT", amountMinor: feeMinor },
  ]);
}

export function refundPaid(refundId: string, amountMinor: number): Journal {
  return journal("REFUND_PAID", refundId, [
    { account: "CUSTOMER_DEPOSITS", direction: "DEBIT", amountMinor },
    { account: "PG_CLEARING", direction: "CREDIT", amountMinor },
  ]);
}

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
  | "PROMOTION_EXPENSE";

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

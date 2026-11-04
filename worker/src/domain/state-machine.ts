/**
 * Booking lifecycle state machine.
 *
 * Key invariants:
 *  - A payment capture alone never makes a booking "confirmed". Only a supplier
 *    confirmation (SUPPLIER_CONFIRMED) and the subsequent voucher / ticket
 *    issuance do.
 *  - PNR creation (SUPPLIER_CONFIRMED for flights) and ticket issuance (TICKETED)
 *    are distinct states.
 *  - Every transition is validated here and persisted with an optimistic
 *    `version` check so concurrent workers cannot both win.
 */

export const BOOKING_STATUSES = [
  "AWAITING_PAYMENT",
  "PAYMENT_PROCESSING",
  "PAYMENT_AUTHORIZED",
  "SUPPLIER_BOOKING_PENDING",
  "SUPPLIER_CONFIRMED",
  "TICKETING_PENDING",
  "TICKETED",
  "VOUCHER_ISSUED",
  "COMPLETED",
  "CANCELLATION_REQUESTED",
  "REFUND_PENDING",
  "REFUNDED",
  "CANCELLED",
  "EXPIRED",
  "FAILED",
  "MANUAL_REVIEW_REQUIRED",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const T: Record<BookingStatus, readonly BookingStatus[]> = {
  AWAITING_PAYMENT: ["PAYMENT_PROCESSING", "EXPIRED", "CANCELLED"],
  PAYMENT_PROCESSING: ["PAYMENT_AUTHORIZED", "AWAITING_PAYMENT", "FAILED", "MANUAL_REVIEW_REQUIRED"],
  PAYMENT_AUTHORIZED: ["SUPPLIER_BOOKING_PENDING", "REFUND_PENDING", "MANUAL_REVIEW_REQUIRED"],
  SUPPLIER_BOOKING_PENDING: ["SUPPLIER_CONFIRMED", "REFUND_PENDING", "MANUAL_REVIEW_REQUIRED"],
  SUPPLIER_CONFIRMED: ["TICKETING_PENDING", "VOUCHER_ISSUED", "CANCELLATION_REQUESTED", "MANUAL_REVIEW_REQUIRED"],
  TICKETING_PENDING: ["TICKETED", "REFUND_PENDING", "MANUAL_REVIEW_REQUIRED"],
  TICKETED: ["COMPLETED", "CANCELLATION_REQUESTED"],
  VOUCHER_ISSUED: ["COMPLETED", "CANCELLATION_REQUESTED"],
  // The last three: supplier rejected the cancellation, booking reverts to where it was.
  CANCELLATION_REQUESTED: ["REFUND_PENDING", "CANCELLED", "MANUAL_REVIEW_REQUIRED", "SUPPLIER_CONFIRMED", "VOUCHER_ISSUED", "TICKETED"],
  REFUND_PENDING: ["REFUNDED", "MANUAL_REVIEW_REQUIRED"],
  MANUAL_REVIEW_REQUIRED: [
    "PAYMENT_AUTHORIZED",
    "SUPPLIER_BOOKING_PENDING",
    "SUPPLIER_CONFIRMED",
    "VOUCHER_ISSUED",
    "TICKETED",
    "REFUND_PENDING",
    "CANCELLED",
    "FAILED",
  ],
  COMPLETED: [],
  REFUNDED: [],
  CANCELLED: [],
  EXPIRED: [],
  FAILED: [],
};

export const TERMINAL_STATUSES: readonly BookingStatus[] = ["COMPLETED", "REFUNDED", "CANCELLED", "EXPIRED", "FAILED"];

/** States in which the customer holds a valid, fulfilled travel product. */
export const FULFILLED_STATUSES: readonly BookingStatus[] = ["VOUCHER_ISSUED", "TICKETED", "COMPLETED"];

/** States in which the customer may request a cancellation themselves. */
export const CUSTOMER_CANCELLABLE: readonly BookingStatus[] = ["AWAITING_PAYMENT", "SUPPLIER_CONFIRMED", "VOUCHER_ISSUED", "TICKETED"];

export function isBookingStatus(s: unknown): s is BookingStatus {
  return typeof s === "string" && (BOOKING_STATUSES as readonly string[]).includes(s);
}

export function canTransition(from: string, to: string): boolean {
  if (!isBookingStatus(from) || !isBookingStatus(to)) return false;
  return T[from].includes(to);
}

export function assertTransition(from: string, to: string): void {
  if (!canTransition(from, to)) {
    throw new TransitionError(from, to);
  }
}

export function allowedNext(from: string): readonly BookingStatus[] {
  return isBookingStatus(from) ? T[from] : [];
}

export class TransitionError extends Error {
  from: string;
  to: string;
  constructor(from: string, to: string) {
    super(`ILLEGAL_TRANSITION:${from}->${to}`);
    this.from = from;
    this.to = to;
  }
}

/** Customer-facing label + tone. Kept here so API and UI agree on semantics. */
export const STATUS_LABEL_KO: Record<BookingStatus, string> = {
  AWAITING_PAYMENT: "결제 대기",
  PAYMENT_PROCESSING: "결제 처리 중",
  PAYMENT_AUTHORIZED: "결제 완료 · 예약 요청 전",
  SUPPLIER_BOOKING_PENDING: "결제 완료 · 공급사 확정 대기",
  SUPPLIER_CONFIRMED: "공급사 예약 확정",
  TICKETING_PENDING: "발권 대기",
  TICKETED: "발권 완료",
  VOUCHER_ISSUED: "예약 확정 · 바우처 발급",
  COMPLETED: "이용 완료",
  CANCELLATION_REQUESTED: "취소 요청 처리 중",
  REFUND_PENDING: "환불 처리 중",
  REFUNDED: "환불 완료",
  CANCELLED: "취소 완료",
  EXPIRED: "결제 시간 만료",
  FAILED: "예약 실패",
  MANUAL_REVIEW_REQUIRED: "상담원 확인 중",
};

/**
 * Server-side quote computation (pure, deterministic, unit-tested).
 *
 * The client NEVER supplies a price. It supplies a product reference and
 * search parameters; the server loads the product from its own catalog and
 * computes every amount here in integer minor units.
 */
import { assertMinor, percentOf, toMinor } from "./money.ts";

export const DOMAINS = ["HOTEL", "FLIGHT", "TRAIN", "CAR", "TRANSFER", "ACTIVITY", "PACKAGE"] as const;
export type Domain = (typeof DOMAINS)[number];

export function isDomain(v: unknown): v is Domain {
  return typeof v === "string" && (DOMAINS as readonly string[]).includes(v);
}

export interface CatalogProduct {
  domain: Domain;
  itemId: string;
  /** Sub-unit such as a hotel room type id. */
  unitId: string | null;
  title: string;
  supplierId: string;
  currency: "KRW";
  /** Catalog price in major units as stored by the catalog (REAL column). */
  unitPriceMajor: number;
  /** Per-date sellable capacity for direct-contract inventory, null when supplier-managed. */
  capacity: number | null;
  maxOccupancy: number | null;
  freeCancellation: boolean;
  instantConfirmation: boolean;
  /** Clock time "HH:MM" for scheduled products (flights / trains). */
  departureClock: string | null;
}

export interface Travelers {
  adults: number;
  children: number;
  infants: number;
}

export interface QuoteParams {
  /** Service start date YYYY-MM-DD (check-in, departure, pickup, activity date). */
  startDate: string;
  /** Service end date YYYY-MM-DD (check-out, drop-off). Required for HOTEL and CAR. */
  endDate?: string | null;
  rooms?: number;
  travelers: Travelers;
}

export interface Promotion {
  code: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  minOrderMajor: number;
  maxDiscountMajor: number;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
}

export interface CancellationPolicy {
  /** FREE_UNTIL: full refund until `freeUntil`, then `feeBpsAfter` charged. NON_REFUNDABLE: 100% fee. */
  type: "FREE_UNTIL" | "NON_REFUNDABLE";
  freeUntil: string | null;
  feeBpsAfter: number;
  source: "CATALOG_RULE";
}

export interface QuoteLine {
  code: string;
  label: string;
  quantity: number;
  unitMinor: number;
  amountMinor: number;
}

export interface QuoteResult {
  currency: "KRW";
  lines: QuoteLine[];
  baseMinor: number;
  taxMinor: number;
  feeMinor: number;
  discountMinor: number;
  totalMinor: number;
  pricedUnits: number;
  serviceStart: string;
  serviceEnd: string;
  cancellationPolicy: CancellationPolicy;
  promotionCode: string | null;
}

export class QuoteError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Tax rules are explicit and visible in the breakdown. These are placeholders
 * for direct-contract inventory; supplier-sourced rates must carry the
 * supplier's own tax lines instead.
 */
export const TAX_BPS: Record<Domain, number> = {
  HOTEL: 1000,
  FLIGHT: 0,
  TRAIN: 0,
  CAR: 1000,
  TRANSFER: 1000,
  ACTIVITY: 0,
  PACKAGE: 0,
};

/** Platform service fee (basis points). Currently none is charged. */
export const SERVICE_FEE_BPS = 0;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_DAY = 86_400_000;

function parseDate(label: string, v: string | null | undefined): number {
  if (!v || !DATE_RE.test(v)) throw new QuoteError("INVALID_DATE", `${label} 날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).`);
  const t = Date.parse(`${v}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v) {
    throw new QuoteError("INVALID_DATE", `${label} 날짜가 존재하지 않습니다.`);
  }
  return t;
}

function int(v: unknown, fallback: number): number {
  const n = Number(v ?? fallback);
  return Number.isInteger(n) ? n : NaN;
}

export function normalizeTravelers(t: Partial<Travelers> | undefined): Travelers {
  const adults = int(t?.adults, 1);
  const children = int(t?.children, 0);
  const infants = int(t?.infants, 0);
  if ([adults, children, infants].some((n) => Number.isNaN(n) || n < 0)) {
    throw new QuoteError("INVALID_TRAVELERS", "인원 수가 올바르지 않습니다.");
  }
  if (adults < 1) throw new QuoteError("INVALID_TRAVELERS", "성인 1명 이상이 필요합니다.");
  if (adults + children > 9) throw new QuoteError("INVALID_TRAVELERS", "한 번에 최대 9명까지 예약할 수 있습니다.");
  if (infants > adults) throw new QuoteError("INVALID_TRAVELERS", "유아 수는 성인 수를 초과할 수 없습니다.");
  return { adults, children, infants };
}

export function cancellationPolicyFor(product: CatalogProduct, serviceStartMs: number): CancellationPolicy {
  if (!product.freeCancellation) {
    return { type: "NON_REFUNDABLE", freeUntil: null, feeBpsAfter: 10000, source: "CATALOG_RULE" };
  }
  // Free cancellation until 24h before the service starts (00:00 UTC of service date).
  const freeUntil = new Date(serviceStartMs - MS_DAY).toISOString();
  return { type: "FREE_UNTIL", freeUntil, feeBpsAfter: 10000, source: "CATALOG_RULE" };
}

export function promotionDiscount(promo: Promotion | null, subtotalMinor: number, nowIso: string): number {
  if (!promo) return 0;
  if (!promo.active) throw new QuoteError("PROMO_INACTIVE", "사용할 수 없는 쿠폰입니다.");
  if (promo.validFrom && nowIso < promo.validFrom) throw new QuoteError("PROMO_NOT_STARTED", "아직 사용 기간이 아닌 쿠폰입니다.");
  if (promo.validUntil && nowIso > promo.validUntil) throw new QuoteError("PROMO_EXPIRED", "사용 기간이 만료된 쿠폰입니다.");
  const minOrder = toMinor(promo.minOrderMajor || 0, "KRW");
  if (subtotalMinor < minOrder) {
    throw new QuoteError("PROMO_MIN_ORDER", `최소 주문 금액 ${minOrder.toLocaleString("ko-KR")}원 이상에서 사용할 수 있습니다.`);
  }
  const cap = toMinor(promo.maxDiscountMajor || 0, "KRW");
  let discount: number;
  if (promo.discountType === "PERCENTAGE") {
    const bps = Math.round(promo.discountValue * 100);
    discount = percentOf(subtotalMinor, bps);
  } else {
    discount = toMinor(promo.discountValue, "KRW");
  }
  if (cap > 0) discount = Math.min(discount, cap);
  return Math.max(0, Math.min(discount, subtotalMinor));
}

/**
 * Compute a quote. `now` is injected for determinism in tests.
 */
export function computeQuote(
  product: CatalogProduct,
  rawParams: QuoteParams,
  promo: Promotion | null,
  now: Date,
): QuoteResult {
  const travelers = normalizeTravelers(rawParams.travelers);
  const startMs = parseDate("이용 시작", rawParams.startDate);
  const todayMs = Date.parse(now.toISOString().slice(0, 10) + "T00:00:00Z");
  if (startMs < todayMs) throw new QuoteError("DATE_IN_PAST", "지난 날짜는 예약할 수 없습니다.");
  if (startMs > todayMs + 365 * MS_DAY) throw new QuoteError("DATE_TOO_FAR", "최대 1년 이내 일정만 예약할 수 있습니다.");

  const unitMinor = toMinor(product.unitPriceMajor, "KRW");
  if (unitMinor <= 0) throw new QuoteError("PRICE_UNAVAILABLE", "현재 판매 가격을 확인할 수 없는 상품입니다.");

  const lines: QuoteLine[] = [];
  let endMs = startMs;
  let pricedUnits = 0;
  const seatTravelers = travelers.adults + travelers.children;

  switch (product.domain) {
    case "HOTEL": {
      endMs = parseDate("체크아웃", rawParams.endDate);
      const nights = Math.round((endMs - startMs) / MS_DAY);
      if (nights < 1) throw new QuoteError("INVALID_STAY", "체크아웃은 체크인 다음 날 이후여야 합니다.");
      if (nights > 30) throw new QuoteError("INVALID_STAY", "최대 30박까지 예약할 수 있습니다.");
      const rooms = int(rawParams.rooms, 1);
      if (Number.isNaN(rooms) || rooms < 1 || rooms > 9) throw new QuoteError("INVALID_ROOMS", "객실 수가 올바르지 않습니다.");
      if (product.maxOccupancy && seatTravelers > product.maxOccupancy * rooms) {
        throw new QuoteError("OCCUPANCY_EXCEEDED", `객실당 최대 ${product.maxOccupancy}명까지 투숙할 수 있습니다.`);
      }
      pricedUnits = rooms;
      lines.push({ code: "ROOM_NIGHT", label: `객실 ${rooms}개 × ${nights}박`, quantity: rooms * nights, unitMinor, amountMinor: unitMinor * rooms * nights });
      break;
    }
    case "CAR": {
      endMs = parseDate("반납", rawParams.endDate);
      const days = Math.round((endMs - startMs) / MS_DAY);
      if (days < 1 || days > 60) throw new QuoteError("INVALID_RENTAL", "대여 기간은 1~60일이어야 합니다.");
      pricedUnits = 1;
      lines.push({ code: "VEHICLE_DAY", label: `차량 1대 × ${days}일`, quantity: days, unitMinor, amountMinor: unitMinor * days });
      break;
    }
    case "FLIGHT": {
      pricedUnits = seatTravelers;
      lines.push({ code: "FARE_ADULT", label: `성인 운임 × ${travelers.adults}`, quantity: travelers.adults, unitMinor, amountMinor: unitMinor * travelers.adults });
      if (travelers.children > 0) {
        lines.push({ code: "FARE_CHILD", label: `소아 운임 × ${travelers.children}`, quantity: travelers.children, unitMinor, amountMinor: unitMinor * travelers.children });
      }
      if (travelers.infants > 0) {
        const infantUnit = percentOf(unitMinor, 1000);
        lines.push({ code: "FARE_INFANT", label: `유아 운임(좌석 미점유) × ${travelers.infants}`, quantity: travelers.infants, unitMinor: infantUnit, amountMinor: infantUnit * travelers.infants });
      }
      break;
    }
    case "TRAIN":
    case "ACTIVITY":
    case "PACKAGE": {
      pricedUnits = seatTravelers;
      const label = product.domain === "TRAIN" ? "승차권" : product.domain === "ACTIVITY" ? "이용권" : "패키지(1인)";
      lines.push({ code: "PER_PERSON", label: `${label} × ${seatTravelers}`, quantity: seatTravelers, unitMinor, amountMinor: unitMinor * seatTravelers });
      break;
    }
    case "TRANSFER": {
      if (product.maxOccupancy && seatTravelers > product.maxOccupancy) {
        throw new QuoteError("OCCUPANCY_EXCEEDED", `차량 최대 탑승 인원은 ${product.maxOccupancy}명입니다.`);
      }
      pricedUnits = 1;
      lines.push({ code: "VEHICLE", label: "차량 1대 (편도)", quantity: 1, unitMinor, amountMinor: unitMinor });
      break;
    }
  }

  const baseMinor = assertMinor(lines.reduce((s, l) => s + l.amountMinor, 0));
  const taxMinor = percentOf(baseMinor, TAX_BPS[product.domain]);
  const feeMinor = percentOf(baseMinor, SERVICE_FEE_BPS);
  if (taxMinor > 0) lines.push({ code: "TAX", label: "세금 및 봉사료", quantity: 1, unitMinor: taxMinor, amountMinor: taxMinor });
  if (feeMinor > 0) lines.push({ code: "SERVICE_FEE", label: "서비스 수수료", quantity: 1, unitMinor: feeMinor, amountMinor: feeMinor });

  const subtotal = baseMinor + taxMinor + feeMinor;
  const discountMinor = promotionDiscount(promo, subtotal, now.toISOString());
  if (discountMinor > 0) {
    lines.push({ code: "PROMOTION", label: `쿠폰 할인 (${promo!.code})`, quantity: 1, unitMinor: -discountMinor, amountMinor: -discountMinor });
  }
  const totalMinor = assertMinor(subtotal - discountMinor);
  if (totalMinor <= 0) throw new QuoteError("INVALID_TOTAL", "결제 금액이 0원 이하가 될 수 없습니다.");

  const serviceStart = new Date(startMs).toISOString().slice(0, 10);
  const serviceEnd = new Date(endMs).toISOString().slice(0, 10);

  return {
    currency: "KRW",
    lines,
    baseMinor,
    taxMinor,
    feeMinor,
    discountMinor,
    totalMinor,
    pricedUnits,
    serviceStart,
    serviceEnd,
    cancellationPolicy: cancellationPolicyFor(product, startMs),
    promotionCode: discountMinor > 0 ? promo!.code : null,
  };
}

/**
 * Compute cancellation fee / refund from the policy snapshot captured at
 * booking time. Called only for supplier-confirmed bookings; unconfirmed
 * bookings are always refunded in full.
 */
export function computeCancellation(
  policy: CancellationPolicy,
  paidMinor: number,
  now: Date,
): { feeMinor: number; refundMinor: number } {
  assertMinor(paidMinor);
  let feeBps = 0;
  if (policy.type === "NON_REFUNDABLE") {
    feeBps = policy.feeBpsAfter;
  } else if (policy.freeUntil && now.toISOString() > policy.freeUntil) {
    feeBps = policy.feeBpsAfter;
  }
  const feeMinor = Math.min(paidMinor, percentOf(paidMinor, feeBps));
  return { feeMinor, refundMinor: paidMinor - feeMinor };
}

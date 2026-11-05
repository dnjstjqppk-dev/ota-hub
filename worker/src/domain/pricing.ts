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
  /** Hotel rate plan id (price/meal/cancellation variant of a room). Does not split inventory. */
  ratePlanId?: string | null;
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
  /** FLIGHT: origin / destination airport codes, used to validate round trips. */
  route?: { from: string; to: string } | null;
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
  /** HOTEL only: catalog rate plan id; omitted means the room's first plan. */
  ratePlanId?: string | null;
  /** FLIGHT round trip: inbound flight id and its date. */
  returnItemId?: string | null;
  returnDate?: string | null;
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

interface PricedLines {
  lines: QuoteLine[];
  pricedUnits: number;
  startMs: number;
  endMs: number;
}

/** Base (pre-tax) price lines of one product for the given parameters. Validates dates and occupancy. */
function priceLines(product: CatalogProduct, rawParams: QuoteParams, now: Date): PricedLines {
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

  return { lines, pricedUnits, startMs, endMs };
}

/** Tax, service fee and (one) promotion over the combined base lines. */
function finalizeQuote(domain: Domain, lines: QuoteLine[], promo: Promotion | null, now: Date) {
  const baseMinor = assertMinor(lines.reduce((s, l) => s + l.amountMinor, 0));
  const taxMinor = percentOf(baseMinor, TAX_BPS[domain]);
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
  return { baseMinor, taxMinor, feeMinor, discountMinor, totalMinor, promotionCode: discountMinor > 0 ? promo!.code : null };
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Compute a quote. `now` is injected for determinism in tests.
 */
export function computeQuote(
  product: CatalogProduct,
  rawParams: QuoteParams,
  promo: Promotion | null,
  now: Date,
): QuoteResult {
  const p = priceLines(product, rawParams, now);
  const lines = [...p.lines];
  const f = finalizeQuote(product.domain, lines, promo, now);
  return {
    currency: "KRW",
    lines,
    ...f,
    pricedUnits: p.pricedUnits,
    serviceStart: isoDay(p.startMs),
    serviceEnd: isoDay(p.endMs),
    cancellationPolicy: cancellationPolicyFor(product, p.startMs),
  };
}

export interface LegResult {
  itemId: string;
  serviceDate: string;
  baseMinor: number;
}

/**
 * Round-trip flight: two legs priced from the catalog, combined into one order.
 * Tax/fee are applied to the combined fare and a promotion is applied once.
 * Both legs must be from the same supplier (one PNR) and fly the reverse route.
 */
export function computeRoundTripQuote(
  outbound: CatalogProduct,
  inbound: CatalogProduct,
  rawParams: QuoteParams,
  promo: Promotion | null,
  now: Date,
): QuoteResult & { legs: [LegResult, LegResult] } {
  if (outbound.domain !== "FLIGHT" || inbound.domain !== "FLIGHT") throw new QuoteError("ROUND_TRIP_FLIGHT_ONLY", "왕복 예약은 항공권에만 적용됩니다.");
  if (outbound.supplierId !== inbound.supplierId) {
    throw new QuoteError("ROUND_TRIP_SUPPLIER_MISMATCH", "가는 편과 오는 편의 판매 공급사가 달라 한 번에 예약할 수 없습니다. 각각 편도로 예약해주세요.");
  }
  if (outbound.route && inbound.route && (outbound.route.from !== inbound.route.to || outbound.route.to !== inbound.route.from)) {
    throw new QuoteError("ROUND_TRIP_ROUTE_MISMATCH", "오는 편은 가는 편의 역방향 노선이어야 합니다.");
  }
  const out = priceLines(outbound, rawParams, now);
  const ret = priceLines(inbound, { ...rawParams, startDate: rawParams.returnDate || "" }, now);
  if (ret.startMs < out.startMs) throw new QuoteError("INVALID_RETURN_DATE", "오는 날은 가는 날과 같거나 이후여야 합니다.");
  const tag = (l: QuoteLine, code: string, label: string): QuoteLine => ({ ...l, code: `${code}_${l.code}`, label: `${label} · ${l.label}` });
  const lines = [...out.lines.map((l) => tag(l, "OUT", "가는 편")), ...ret.lines.map((l) => tag(l, "RET", "오는 편"))];
  const f = finalizeQuote("FLIGHT", lines, promo, now);
  // The stricter policy of the two legs governs the whole order; the clock starts at departure.
  const outPolicy = cancellationPolicyFor(outbound, out.startMs);
  const retPolicy = cancellationPolicyFor(inbound, ret.startMs);
  const cancellationPolicy = outPolicy.type === "NON_REFUNDABLE" || retPolicy.type === "NON_REFUNDABLE" ? (outPolicy.type === "NON_REFUNDABLE" ? outPolicy : retPolicy) : outPolicy;
  const sum = (ls: QuoteLine[]) => ls.reduce((s, l) => s + l.amountMinor, 0);
  return {
    currency: "KRW",
    lines,
    ...f,
    pricedUnits: out.pricedUnits,
    serviceStart: isoDay(out.startMs),
    serviceEnd: isoDay(ret.startMs),
    cancellationPolicy,
    legs: [
      { itemId: outbound.itemId, serviceDate: isoDay(out.startMs), baseMinor: sum(out.lines) },
      { itemId: inbound.itemId, serviceDate: isoDay(ret.startMs), baseMinor: sum(ret.lines) },
    ],
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

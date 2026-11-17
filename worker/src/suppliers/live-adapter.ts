import type { Env } from "../env.ts";
import { isNonProduction } from "../env.ts";
import { HttpError } from "../lib/http.ts";
import type {
  BookResult,
  CancelResult,
  FlightOffer,
  OfferQuery,
  OfferResult,
  SupplierAdapter,
  SupplierContext,
  TicketResult,
} from "./adapter.ts";
import { breakerAllows, breakerCooldownMs, breakerStatus, recordBreakerFailure, recordBreakerSuccess } from "./circuit.ts";
import { recentCachedOffers } from "./fare-cache.ts";

/**
 * TG-18: live NDC/GDS supplier fulfilment over a JSON-over-HTTP stub contract.
 *
 * Endpoints (against NDC_API_BASE / GDS_API_BASE):
 *   POST /offers {origin, destination, date, adults, airline?}
 *     -> 200 {offers: [{offerId, airline, flightNo, from, to, date,
 *                        amountMinor, currency, expiresAt}]}
 *   POST /orders {idempotencyKey, productRef, flightNo, from, to,
 *                 serviceDate, travelers: [{type, lastNameEn, firstNameEn,
 *                 birthDate, nationality}]}
 *     -> 200 {reference, pnr} | 409 {code, reference?, pnr?} (idempotent replay)
 *   POST /orders/{reference}/ticket -> 200 {ticketNumbers: [...]}
 *   POST /orders/{reference}/cancel -> 200 {cancelled: true, reference}
 *                                        | 409 {code: "CANCEL_REJECTED", message}
 *
 * This is a stub contract, not an airline-certified NDC wire format: no
 * carrier contract exists to certify against (GO_LIVE 8G owns production
 * certification, including NDC XML profiles and DOCS/passport manifests).
 * Traveler names/DOB/nationality ride the order; passport numbers stay
 * encrypted at rest and are never transmitted in v1 (PII minimization).
 *
 * Mapping (outcome <- supplier answer):
 *   2xx valid      -> CONFIRMED / ISSUED / CANCELLED / OK
 *   2xx malformed  -> UNKNOWN (never confirm on garbage; manual review owns it)
 *   409 + pnr      -> CONFIRMED (idempotent replay of our own order key)
 *   409 cancel     -> REJECTED (a business answer, not an outage)
 *   other 4xx      -> FAILED (supplier refused; callers refund, never retry blind)
 *   5xx / network  -> UNKNOWN (retry queue owns it)
 *
 * Breaker: book/ticket/cancel failures AND unknowns feed the per-adapter
 * breaker; only book() short-circuits while OPEN (ticket/cancel unwind
 * existing commitments and must always attempt). Offer reads never touch
 * the breaker: reads must not block sales.
 */

export type LiveAdapterName = "ndc" | "gds";

export interface LiveSupplierConfig {
  name: LiveAdapterName;
  apiBase: string;
  apiKey: string;
  cooldownMs: number;
}

type DbLike = {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
    };
  };
};

const LOOPBACK_HTTP = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/;

/**
 * Resolve a usable base/key pair, or null. Stub (loopback http) bases are
 * honored in development/test only; production refuses them. Exotic schemes
 * fail closed everywhere.
 */
export function resolveLiveConfig(env: Env, name: LiveAdapterName): LiveSupplierConfig | null {
  const base = (name === "ndc" ? env.NDC_API_BASE : env.GDS_API_BASE) || "";
  const key = (name === "ndc" ? env.NDC_API_KEY : env.GDS_API_KEY) || "";
  if (!base.trim() || !key) return null;
  const apiBase = base.trim().replace(/\/+$/, "");
  const loopback = LOOPBACK_HTTP.test(apiBase + "/");
  if (loopback && !isNonProduction(env)) return null;
  if (!loopback && !apiBase.startsWith("https://")) return null;
  return { name, apiBase, apiKey: key, cooldownMs: breakerCooldownMs(env) };
}

/** Sale gate: the adapter sells only when a usable base/key pair exists. */
export function supplierApiConfigured(env: Env | undefined, name: string): boolean {
  if (!env || (name !== "ndc" && name !== "gds")) return false;
  return resolveLiveConfig(env, name) !== null;
}

const PNR_RE = /^[A-Z0-9]{6}$/;

interface OrderManifest {
  productRef: string;
  flightNo: string;
  from: string;
  to: string;
  serviceDate: string;
  travelers: Array<{ type: string; lastNameEn: string; firstNameEn: string; birthDate: string | null; nationality: string | null }>;
}

async function loadManifest(db: DbLike, c: SupplierContext): Promise<OrderManifest | null> {
  const b = await db.prepare("SELECT service_start FROM bookings WHERE id = ?").bind(c.bookingId).first<{ service_start: string }>();
  const f = await db.prepare("SELECT flight_number, departure_airport, arrival_airport FROM flights WHERE id = ?").bind(c.itemId).first<{ flight_number: string; departure_airport: string; arrival_airport: string }>();
  if (!b || !f) return null;
  const t = await db.prepare("SELECT traveler_type, last_name_en, first_name_en, birth_date, nationality FROM booking_travelers WHERE booking_id = ? ORDER BY is_lead DESC, created_at ASC").bind(c.bookingId).all<{ traveler_type: string; last_name_en: string; first_name_en: string; birth_date: string | null; nationality: string | null }>();
  if (t.results.length === 0) return null;
  return {
    productRef: c.itemId,
    flightNo: f.flight_number,
    from: f.departure_airport,
    to: f.arrival_airport,
    serviceDate: String(b.service_start).slice(0, 10),
    travelers: t.results.map((r) => ({
      type: r.traveler_type,
      lastNameEn: r.last_name_en,
      firstNameEn: r.first_name_en,
      birthDate: r.birth_date,
      nationality: r.nationality,
    })),
  };
}

function validOffer(o: any): o is FlightOffer {
  return !!o && typeof o.offerId === "string" && o.offerId.length > 0 &&
    typeof o.airline === "string" && typeof o.flightNo === "string" &&
    typeof o.from === "string" && typeof o.to === "string" && typeof o.date === "string" &&
    Number.isSafeInteger(o.amountMinor) && o.amountMinor > 0 && typeof o.currency === "string" &&
    typeof o.expiresAt === "string";
}

export function liveSupplierAdapter(env: Env, cfg: LiveSupplierConfig): SupplierAdapter {
  const name = cfg.name;

  async function call(path: string, body: unknown, idem: string): Promise<{ status: number; json: any } | null> {
    try {
      const res = await fetch(cfg.apiBase + path, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idem },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    } catch {
      return null; // network error / timeout => outcome unknown
    }
  }

  const fail = (json: any, status: number): { code: string; message: string } => ({
    code: String(json?.code || `HTTP_${status}`),
    message: String(json?.message || "공급사 요청에 실패했습니다."),
  });

  return {
    name,
    async book(c): Promise<BookResult> {
      if (!breakerAllows(name, { cooldownMs: cfg.cooldownMs })) {
        return { outcome: "FAILED", code: "SUPPLIER_CIRCUIT_OPEN", message: "공급사 연결에 일시적 문제가 있어 예약을 받을 수 없습니다." };
      }
      if (c.domain !== "FLIGHT") {
        // v1 is flight fulfilment only; hotel-through-GDS is a follow-up.
        // A catalog miswire, not an outage: the breaker stays out of it.
        return { outcome: "FAILED", code: "SUPPLIER_DOMAIN_UNSUPPORTED", message: "해당 공급사는 항공 상품만 처리합니다." };
      }
      const m = await loadManifest(env.DB, c);
      if (!m) return { outcome: "UNKNOWN", message: "예약 명단을 확인할 수 없습니다." };
      // Stable per booking: fulfil retries replay the same order, never mint
      // a second PNR (red drill 1 proves the replay path).
      const r = await call("/orders", { ...m, idempotencyKey: `ord_${c.bookingId}` }, `ord_${c.bookingId}`);
      if (!r || r.status >= 500) {
        recordBreakerFailure(name);
        return { outcome: "UNKNOWN", message: "공급사 응답을 확인할 수 없습니다." };
      }
      if (r.status === 200 || r.status === 409) {
        const pnr = String(r.json?.pnr || "");
        const reference = String(r.json?.reference || "");
        if (reference && PNR_RE.test(pnr)) {
          recordBreakerSuccess(name);
          return { outcome: "CONFIRMED", reference, pnr };
        }
        if (r.status === 409) {
          // A bare 409 (no PNR) is a refusal, not a replay.
          recordBreakerFailure(name);
          const f = fail(r.json, r.status);
          return { outcome: "FAILED", code: f.code, message: f.message };
        }
        recordBreakerFailure(name);
        return { outcome: "UNKNOWN", message: "공급사 응답 형식이 올바르지 않습니다." };
      }
      recordBreakerFailure(name);
      const f = fail(r.json, r.status);
      return { outcome: "FAILED", code: f.code, message: f.message };
    },
    async ticket(c): Promise<TicketResult> {
      const ref = c.supplierReference;
      if (!ref) return { outcome: "FAILED", code: "TICKET_NO_REFERENCE", message: "발권할 공급사 참조가 없습니다." };
      const r = await call(`/orders/${encodeURIComponent(ref)}/ticket`, { idempotencyKey: `tkt_${c.bookingId}` }, `tkt_${c.bookingId}`);
      if (!r || r.status >= 500) {
        recordBreakerFailure(name);
        return { outcome: "UNKNOWN", message: "발권 응답을 확인할 수 없습니다." };
      }
      if (r.status === 200) {
        const nums = r.json?.ticketNumbers;
        if (Array.isArray(nums) && nums.length > 0 && nums.every((n: unknown) => typeof n === "string" && n.length > 0)) {
          recordBreakerSuccess(name);
          return { outcome: "ISSUED", ticketNumbers: nums as string[] };
        }
        recordBreakerFailure(name);
        return { outcome: "UNKNOWN", message: "발권 응답 형식이 올바르지 않습니다." };
      }
      recordBreakerFailure(name);
      const f = fail(r.json, r.status);
      return { outcome: "FAILED", code: f.code, message: f.message };
    },
    async cancel(c): Promise<CancelResult> {
      const ref = c.supplierReference;
      if (!ref) return { outcome: "UNKNOWN", message: "취소할 공급사 참조가 없습니다." };
      const r = await call(`/orders/${encodeURIComponent(ref)}/cancel`, { idempotencyKey: `cxl_${c.bookingId}` }, `cxl_${c.bookingId}`);
      if (!r || r.status >= 500) {
        recordBreakerFailure(name);
        return { outcome: "UNKNOWN", message: "취소 응답을 확인할 수 없습니다." };
      }
      if (r.status === 200 && r.json?.cancelled === true) {
        recordBreakerSuccess(name);
        return { outcome: "CANCELLED", reference: String(r.json?.reference || ref) };
      }
      if (r.status === 409 || r.status === 400) {
        // A supplier-side rejection is a business answer, not an outage.
        const f = fail(r.json, r.status);
        return { outcome: "REJECTED", message: f.message };
      }
      recordBreakerFailure(name);
      return { outcome: "UNKNOWN", message: "취소 응답 형식이 올바르지 않습니다." };
    },
    async offers(q: OfferQuery): Promise<OfferResult> {
      const r = await call("/offers", { origin: q.origin, destination: q.destination, date: q.date, adults: q.adults, airline: q.airline ?? null }, `off_${q.origin}${q.destination}${q.date}`);
      if (!r || r.status >= 500) return { outcome: "UNKNOWN", message: "공급사 요금 조회에 실패했습니다." };
      if (r.status === 200) {
        const list = r.json?.offers;
        if (Array.isArray(list) && list.every(validOffer)) return { outcome: "OK", offers: list as FlightOffer[] };
        return { outcome: "UNKNOWN", message: "공급사 요금 응답 형식이 올바르지 않습니다." };
      }
      const f = fail(r.json, r.status);
      return { outcome: "FAILED", code: f.code, message: f.message };
    },
  };
}

/**
 * Money-gate guard (TG-18): while the supplier breaker is OPEN, new quotes
 * and bookings are refused with 503 + the freshest cached alternates for
 * the route (possibly empty — the flag says so honestly). Non-live adapters
 * and CLOSED/HALF breakers pass through untouched.
 */
export async function assertSupplierAvailable(
  env: Env,
  adapterName: string | null,
  route: { from: string; to: string } | null,
): Promise<void> {
  if (adapterName !== "ndc" && adapterName !== "gds") return;
  const st = breakerStatus(adapterName, { cooldownMs: breakerCooldownMs(env) });
  if (st.state !== "OPEN") return;
  const alternates = route ? await recentCachedOffers(env.DB, adapterName, route.from, route.to, 3) : [];
  throw new HttpError(
    503,
    "SUPPLIER_CIRCUIT_OPEN",
    "공급사 연결에 일시적 문제가 있어 예약을 받을 수 없습니다. 잠시 후 다시 시도해주세요.",
    { adapter: adapterName, retryAfterSec: st.retryAfterSec, alternates },
  );
}

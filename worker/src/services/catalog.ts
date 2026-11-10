import type { Env } from "../env.ts";
import { flag } from "../env.ts";
import type { CatalogProduct, Domain } from "../domain/pricing.ts";
import { HttpError } from "../lib/http.ts";

export interface SupplierRow {
  id: string;
  name: string;
  adapter: "none" | "direct_contract" | "simulator" | "api";
  integration_status: string;
  transaction_model: "MERCHANT_OF_RECORD" | "AGENCY" | "AFFILIATE";
  settlement_rate_bps: number;
}

function parseJson<T>(s: unknown, fallback: T): T {
  try {
    return s ? (JSON.parse(String(s)) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** "ICN", "ICN (인천)", "인천 (ICN)" -> "ICN". */
function airportCode(v: unknown): string | null {
  const m = String(v ?? "").toUpperCase().match(/\b([A-Z]{3})\b/);
  return m ? m[1] : null;
}

export interface RatePlan {
  id: string;
  name_ko: string;
  meal: "NONE" | "BREAKFAST";
  price_krw: number;
  free_cancellation: boolean;
}

/**
 * Sellable rate plans of a hotel room, exactly as the catalog defines them.
 * A room without explicit `rate_plans` sells one plan at its base price; meal
 * inclusion then follows the room's `breakfast_included` (else the hotel's
 * `free_breakfast`) flag. Nothing is invented
 * here: a plan that is not in the catalog cannot be quoted.
 */
export function hotelRatePlans(hotel: { free_breakfast?: unknown; free_cancellation?: unknown }, room: any): RatePlan[] {
  const roomFree = Boolean(room?.free_cancellation ?? hotel.free_cancellation);
  const raw = Array.isArray(room?.rate_plans) ? room.rate_plans : [];
  const plans = raw
    .filter((p: any) => p && typeof p.id === "string" && Number.isFinite(Number(p.price_krw)) && Number(p.price_krw) > 0)
    .map((p: any): RatePlan => ({
      id: p.id,
      name_ko: String(p.name_ko || p.name || p.id),
      meal: p.meal === "BREAKFAST" ? "BREAKFAST" : "NONE",
      price_krw: Number(p.price_krw),
      free_cancellation: Boolean(p.free_cancellation ?? roomFree),
    }));
  if (plans.length) return plans;
  const breakfast = Boolean(room?.breakfast_included ?? hotel.free_breakfast);
  return [{
    id: breakfast ? "BREAKFAST_INCLUDED" : "ROOM_ONLY",
    name_ko: breakfast ? "조식 포함" : "룸 온리 (식사 불포함)",
    meal: breakfast ? "BREAKFAST" : "NONE",
    price_krw: Number(room?.base_price_krw),
    free_cancellation: roomFree,
  }];
}

/** Load a product from the server's own catalog. Throws 404 if absent. */
export async function loadProduct(env: Env, domain: Domain, itemId: string, unitId: string | null, ratePlanId: string | null = null): Promise<CatalogProduct> {
  const db = env.DB;
  const notFound = () => new HttpError(404, "PRODUCT_NOT_FOUND", "상품을 찾을 수 없습니다.");
  switch (domain) {
    case "HOTEL": {
      const h = await db.prepare("SELECT * FROM hotels WHERE id = ?").bind(itemId).first<any>();
      if (!h || h.is_active === 0) throw notFound();
      const rooms = parseJson<any[]>(h.rooms_json, []);
      const room = unitId ? rooms.find((r) => r.id === unitId) : null;
      if (!room) throw new HttpError(400, "ROOM_REQUIRED", "객실 유형을 선택해주세요.");
      const plans = hotelRatePlans(h, room);
      const plan = ratePlanId ? plans.find((p) => p.id === ratePlanId) : plans[0];
      if (!plan) throw new HttpError(400, "RATE_PLAN_NOT_FOUND", "선택한 요금제는 이 객실에서 판매하지 않습니다. 요금제를 다시 선택해주세요.");
      return {
        domain, itemId, unitId: room.id, ratePlanId: plan.id, supplierId: h.partner_id || "ptn_htl_01", currency: "KRW",
        title: `${h.name_ko} · ${room.name_ko || room.name} · ${plan.name_ko}`,
        unitPriceMajor: plan.price_krw,
        // Inventory is per room type; every rate plan of the room sells from the same allotment.
        capacity: Number.isInteger(room.available_inventory) ? room.available_inventory : null,
        maxOccupancy: Number(room.max_occupancy) || 2,
        freeCancellation: plan.free_cancellation,
        instantConfirmation: true,
        departureClock: null,
      };
    }
    case "FLIGHT": {
      const f = await db.prepare("SELECT * FROM flights WHERE id = ?").bind(itemId).first<any>();
    if (!f || f.is_active === 0) throw notFound();
      return {
        domain, itemId, unitId: f.cabin_class || "ECONOMY", supplierId: f.partner_id || "ptn_flt_01", currency: "KRW",
        title: `${f.airline_name} ${f.flight_number} ${f.departure_airport}→${f.arrival_airport}`,
        unitPriceMajor: Number(f.base_price_krw), capacity: Number(f.available_seats) || 0, maxOccupancy: null,
        freeCancellation: false, instantConfirmation: false, departureClock: f.departure_time || null,
        route: airportCode(f.departure_airport) && airportCode(f.arrival_airport) ? { from: airportCode(f.departure_airport)!, to: airportCode(f.arrival_airport)! } : null,
      };
    }
    case "TRAIN": {
      const t = await db.prepare("SELECT * FROM trains WHERE id = ?").bind(itemId).first<any>();
    if (!t || t.is_active === 0) throw notFound();
      return {
        domain, itemId, unitId: t.seat_class || "STANDARD", supplierId: "unassigned_train", currency: "KRW",
        title: `${t.train_type} ${t.train_number} ${t.departure_station}→${t.arrival_station}`,
        unitPriceMajor: Number(t.price_krw), capacity: Number(t.available_seats) || 0, maxOccupancy: null,
        freeCancellation: true, instantConfirmation: true, departureClock: t.departure_time || null,
      };
    }
    case "CAR": {
      const c = await db.prepare("SELECT * FROM cars WHERE id = ?").bind(itemId).first<any>();
      if (!c || c.is_active === 0) throw notFound();
      return {
        domain, itemId, unitId: null, supplierId: c.partner_id || "ptn_car_01", currency: "KRW",
        title: `${c.company_name} · ${c.vehicle_model}`,
        unitPriceMajor: Number(c.daily_price_krw), capacity: Number(c.available_stock) || 0, maxOccupancy: Number(c.seats) || null,
        freeCancellation: true, instantConfirmation: true, departureClock: null,
      };
    }
    case "TRANSFER": {
      const t = await db.prepare("SELECT * FROM transfers WHERE id = ?").bind(itemId).first<any>();
    if (!t || t.is_active === 0) throw notFound();
      return {
        domain, itemId, unitId: null, supplierId: t.partner_id || "unassigned_transfer", currency: "KRW",
        title: t.service_title, unitPriceMajor: Number(t.price_krw), capacity: t.daily_capacity === null || t.daily_capacity === undefined ? null : Number(t.daily_capacity), maxOccupancy: Number(t.max_passengers) || null,
        freeCancellation: true, instantConfirmation: true, departureClock: null,
      };
    }
    case "ACTIVITY": {
      const a = await db.prepare("SELECT * FROM activities WHERE id = ?").bind(itemId).first<any>();
      if (!a || a.is_active === 0) throw notFound();
      return {
        domain, itemId, unitId: null, supplierId: a.partner_id || "ptn_tour_01", currency: "KRW",
        title: a.title, unitPriceMajor: Number(a.price_krw), capacity: a.daily_capacity === null || a.daily_capacity === undefined ? null : Number(a.daily_capacity), maxOccupancy: null,
        freeCancellation: Boolean(a.free_cancellation), instantConfirmation: Boolean(a.instant_confirmation), departureClock: null,
      };
    }
    case "PACKAGE": {
      const p = await db.prepare("SELECT * FROM packages WHERE id = ?").bind(itemId).first<any>();
    if (!p || p.is_active === 0) throw notFound();
      return {
        domain, itemId, unitId: null, supplierId: "unassigned_package", currency: "KRW",
        title: p.title, unitPriceMajor: Number(p.total_package_krw), capacity: p.daily_capacity === null || p.daily_capacity === undefined ? null : Number(p.daily_capacity), maxOccupancy: null,
        freeCancellation: false, instantConfirmation: false, departureClock: null,
      };
    }
  }
}

export async function loadSupplier(env: Env, supplierId: string): Promise<SupplierRow | null> {
  return env.DB.prepare("SELECT id, name, adapter, integration_status, transaction_model, settlement_rate_bps FROM suppliers WHERE id = ?")
    .bind(supplierId)
    .first<SupplierRow>();
}

export interface Bookability {
  bookable: boolean;
  reason: string | null;
  mode: "LIVE" | "SIMULATED" | null;
  adapter: string | null;
}

/**
 * A product is directly bookable only if its supplier can actually fulfil it.
 * Suppliers with no contract / no adapter are never sold, so the platform can
 * never take a customer's money for something it cannot deliver.
 *
 * Two deliberate non-bookable states (2026-11-09 audit [M]):
 * - adapter "api" with no implementation: admin may still mark the contract
 *   LIVE, but nothing sells until a real adapter exists in adapterFor().
 * - FLIGHT on direct_contract is handled by assertTicketable(), not here,
 *   because bookability is per supplier while ticketing is per domain.
 */
export function bookabilityOf(env: Env, supplier: SupplierRow | null): Bookability {
  if (!supplier) return { bookable: false, reason: "SUPPLIER_NOT_REGISTERED", mode: null, adapter: null };
  if (supplier.transaction_model === "AFFILIATE") return { bookable: false, reason: "EXTERNAL_LINK_ONLY", mode: null, adapter: supplier.adapter };
  if (supplier.integration_status === "BLOCKED") return { bookable: false, reason: "SUPPLIER_BLOCKED", mode: null, adapter: supplier.adapter };
  if (supplier.adapter === "simulator") {
    return flag(env, "ALLOW_SIMULATED_SUPPLIERS")
      ? { bookable: true, reason: null, mode: "SIMULATED", adapter: supplier.adapter }
      : { bookable: false, reason: "SUPPLIER_NOT_INTEGRATED", mode: null, adapter: supplier.adapter };
  }
  if (supplier.adapter === "api" && supplier.integration_status === "LIVE") {
    return { bookable: false, reason: "SUPPLIER_API_NOT_IMPLEMENTED", mode: null, adapter: supplier.adapter };
  }
  if (supplier.adapter === "direct_contract" && supplier.integration_status === "LIVE") {
    return { bookable: true, reason: null, mode: "LIVE", adapter: supplier.adapter };
  }
  return { bookable: false, reason: "SUPPLIER_NOT_INTEGRATED", mode: null, adapter: supplier.adapter };
}

/**
 * Direct-contract fulfilment is operator confirmation + voucher issuance; no
 * ticketing exists (directContractAdapter.ticket() always fails), so selling
 * a FLIGHT on such a supplier would capture money and auto-refund after the
 * operator's confirmation. Refuse at the money gates instead.
 */
export function assertTicketable(domain: string, supplier: SupplierRow | null): void {
  if (domain === "FLIGHT" && supplier?.adapter === "direct_contract") {
    throw new HttpError(409, "FLIGHT_TICKETING_UNSUPPORTED", "직계약 공급사 상품은 항공 발권이 지원되지 않습니다. 발권 가능 공급사의 상품을 선택해주세요.");
  }
}

/**
 * eSIM and travel insurance sell plan listings only (`/esim/plans`,
 * `/insurance/plans`): quoting was never built for them (pricing DOMAINS has
 * 7 entries, no ESIM/INSURANCE) and the Airalo adapter is an uncontracted
 * sandbox mock. Refuse at the money gates with an explicit code instead of a
 * generic INVALID_DOMAIN so clients can explain the state (2026-11-10 policy:
 * explicit unsupported, not a silent gap). Mirrors assertTicketable().
 */
export function assertQuotableDomain(domain: string): void {
  if (domain === "ESIM" || domain === "INSURANCE") {
    throw new HttpError(409, "ESIM_INSURANCE_QUOTE_UNSUPPORTED", "eSIM·여행자보험은 요금제 조회만 지원하며 견적·예약은 준비 중입니다.", { domain });
  }
}

/**
 * ACTIVITY / TRANSFER / PACKAGE sell dated inventory through the same hold
 * machinery as every other domain — but their capacity used to be hardcoded
 * null, so holdTargets() returned [] and both the quote check and the guarded
 * booking INSERT were skipped (P0 2026-11-10: unlimited paid oversell).
 * A product without configured daily_capacity must not sell at all.
 */
export function assertInventoryConfigured(domain: string, product: { capacity: number | null }): void {
  if ((domain === "ACTIVITY" || domain === "TRANSFER" || domain === "PACKAGE") && product.capacity === null) {
    throw new HttpError(409, "INVENTORY_NOT_CONFIGURED", "해당 상품은 판매 수량이 설정되지 않아 예약할 수 없습니다.", { domain });
  }
}

// Search results only *display* bookability; quoting/booking always re-reads the
// supplier via loadSupplier(), so a short per-isolate cache can never sell
// something a just-blocked supplier cannot deliver.
const SUPPLIER_CACHE_TTL_MS = 30_000;
let supplierCache: { db: unknown; at: number; rows: SupplierRow[] } | null = null;

export function invalidateSupplierCache(): void {
  supplierCache = null;
}

/** Bulk bookability lookup for search results (one cached query). */
export async function supplierBookabilityMap(env: Env): Promise<Map<string, Bookability>> {
  const now = Date.now();
  if (!supplierCache || supplierCache.db !== env.DB || now - supplierCache.at > SUPPLIER_CACHE_TTL_MS) {
    const res = await env.DB.prepare("SELECT id, name, adapter, integration_status, transaction_model, settlement_rate_bps FROM suppliers").all<SupplierRow>();
    supplierCache = { db: env.DB, at: now, rows: res.results || [] };
  }
  const m = new Map<string, Bookability>();
  for (const r of supplierCache.rows) m.set(r.id, bookabilityOf(env, r));
  return m;
}

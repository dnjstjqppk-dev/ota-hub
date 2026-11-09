/**
 * Booking orchestration: quote -> booking -> payment -> supplier -> issuance,
 * cancellation, refund and reconciliation.
 *
 * Every state change goes through `transition()`, which writes a compare-and-set
 * guard (status + version) into the same atomic D1 batch as the update and its
 * side effects (payments, ledger, holds, history). If another request changed
 * the booking first, the guard's CHECK fails and the entire batch rolls back.
 */
import type { Env } from "../env.ts";
import { flag } from "../env.ts";
import { computeQuote, computeRoundTripQuote, computeCancellation, isDomain, QuoteError, type CancellationPolicy, type Domain, type CatalogProduct, type LegResult, type Promotion, type QuoteParams, type QuoteResult } from "../domain/pricing.ts";
import { assertTransition, CUSTOMER_CANCELLABLE, STATUS_LABEL_KO, type BookingStatus } from "../domain/state-machine.ts";
import * as L from "../domain/ledger.ts";
import { convertMinor } from "../domain/money.ts";
import { HttpError, str } from "../lib/http.ts";
import { newBookingNumber, newId, encryptField, decryptField, randomToken } from "../lib/crypto.ts";
import type { AuthUser } from "../lib/auth.ts";
import { loadProduct, loadSupplier, bookabilityOf, assertTicketable, type SupplierRow } from "./catalog.ts";
import { adapterFor, type Simulation, type SupplierContext } from "../suppliers/adapter.ts";
import { getPaymentProvider, requirePaymentProvider } from "../payments/provider.ts";
import { planOrderSettlement } from "./marketplace-service.ts";
import { flushOutbox, outboxInsert } from "./email-service.ts";
import { flushPartnerWebhooks, hookEnqueueStmts, loadPartnerHook } from "./webhook-service.ts";

/** Snapshot stored with a partner order-event delivery (read at dispatch time). */
function hookSnapshot(b: BookingRow, status: string, extra: Record<string, unknown> = {}) {
  return {
    booking_id: b.id,
    booking_number: b.booking_number || null,
    domain_type: b.domain_type || null,
    item_id: b.item_id || null,
    status,
    total_minor: Number(b.total_minor || 0),
    currency: "KRW",
    occurred_at: new Date().toISOString(),
    ...extra,
  };
}

const QUOTE_TTL_MS = 15 * 60_000;
const PAYMENT_WINDOW_MS = 15 * 60_000;
const MAX_REFUND_ATTEMPTS = 5;
const MS_DAY = 86_400_000;

type Stmt = D1PreparedStatement;
type Actor = { type: "CUSTOMER" | "SYSTEM" | "ADMIN" | "SUPPLIER" | "PAYMENT_PROVIDER"; id: string | null };

export interface BookingRow {
  id: string;
  user_id: string;
  partner_id: string | null;
  booking_number: string;
  domain_type: Domain;
  item_id: string;
  title: string;
  status: BookingStatus;
  version: number;
  total_minor: number;
  paid_minor: number;
  refunded_minor: number;
  discount_amount_krw: number;
  trip_coins_used: number;
  cancellation_fee_minor: number;
  currency: string;
  payment_status: string;
  supplier_status: string;
  supplier_id: string;
  supplier_reference: string | null;
  entity_id: string;
  quote_id: string;
  status_reason: string | null;
  service_start: string;
  service_end: string;
  cancellation_policy_json: string;
  inventory_lock_expires_at: string;
  details_json: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  payment_mode: string | null;
  created_at: string;
  updated_at: string;
}

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------
function guard(db: D1Database, b: Pick<BookingRow, "id" | "version" | "status">, label: string): Stmt {
  return db.prepare("INSERT INTO txn_guards (ok, label) SELECT COUNT(*), ? FROM bookings WHERE id = ? AND version = ? AND status = ?").bind(label, b.id, b.version, b.status);
}

function transition(
  db: D1Database,
  b: Pick<BookingRow, "id" | "version" | "status">,
  to: BookingStatus,
  actor: Actor,
  reason: string | null,
  set: Record<string, string | number | null> = {},
): Stmt[] {
  assertTransition(b.status, to);
  const cols = Object.keys(set);
  const sql = `UPDATE bookings SET status = ?, version = version + 1, status_reason = ?, updated_at = CURRENT_TIMESTAMP${cols.map((c) => `, ${c} = ?`).join("")} WHERE id = ?`;
  return [
    guard(db, b, `${b.status}->${to}`),
    db.prepare(sql).bind(to, reason, ...cols.map((c) => set[c]), b.id),
    db.prepare("INSERT INTO booking_status_history (id, booking_id, from_status, to_status, actor_type, actor_id, reason) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(newId("bsh"), b.id, b.status, to, actor.type, actor.id, reason),
  ];
}

/**
 * Coins are a platform-funded discount (1 coin = 1 KRW). They reduce the cash
 * due and sit inside the discount leg, so supplier settlement (gross-based)
 * and the ledger need no coin-specific accounts. Every movement is appended
 * to coin_ledger; the balance column is only ever changed together with one.
 */
function coinRestoreStmts(db: D1Database, b: Pick<BookingRow, "id" | "user_id" | "trip_coins_used">): Stmt[] {
  const used = Number(b.trip_coins_used || 0);
  if (!Number.isSafeInteger(used) || used <= 0) return [];
  return [
    db.prepare("UPDATE users SET trip_coins = trip_coins + ? WHERE id = ?").bind(used, b.user_id),
    db.prepare("INSERT INTO coin_ledger (id, user_id, delta, reason, reference_id) VALUES (?, ?, ?, 'COIN_REFUNDED', ?)")
      .bind(newId("coin"), b.user_id, used, b.id),
  ];
}

function journalStmts(db: D1Database, j: L.Journal | null, b: Pick<BookingRow, "id" | "entity_id" | "supplier_id" | "currency">): Stmt[] {
  if (!j) return [];
  const journalId = newId("jnl");
  return j.lines.map((l) =>
    db.prepare("INSERT INTO ledger_entries (id, journal_id, booking_id, entity_id, supplier_id, account, direction, amount_minor, currency, event_type, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(newId("led"), journalId, b.id, b.entity_id, b.supplier_id, l.account, l.direction, l.amountMinor, b.currency, j.eventType, j.referenceId),
  );
}

async function runBatch(db: D1Database, stmts: Stmt[]): Promise<D1Result[]> {
  try {
    return await db.batch([...stmts, db.prepare("DELETE FROM txn_guards")]);
  } catch (e: any) {
    const m = String(e?.message || e);
    if (m.includes("ok = 1")) throw new HttpError(409, "CONCURRENT_MODIFICATION", "예약 상태가 이미 변경되었습니다. 새로고침 후 다시 시도해주세요.");
    if (m.includes("quantity > 0")) throw new HttpError(409, "SOLD_OUT", "선택하신 일정의 잔여 재고가 소진되었습니다.");
    if (m.includes("bookings.quote_id") || m.includes("idx_bookings_quote")) throw new HttpError(409, "QUOTE_ALREADY_USED", "이미 사용된 견적입니다. 다시 조회해주세요.");
    if (m.includes("idx_payments_one_active")) throw new HttpError(409, "PAYMENT_IN_PROGRESS", "이미 처리 중이거나 완료된 결제가 있습니다.");
    throw e;
  }
}

export async function getBooking(env: Env, id: string): Promise<BookingRow | null> {
  return env.DB.prepare("SELECT * FROM bookings WHERE id = ? OR booking_number = ?").bind(id, id).first<BookingRow>();
}

/**
 * Product floor price (하한가, WO-OTA 09): when a policy row sets
 * floor_price_minor, the cash-due total must stay at or above it, so coupons
 * and coins can never push a protected product under its contracted minimum.
 * No row (or NULL floor) means no floor.
 */
export async function assertAboveFloor(env: Env, domain: string, itemId: string, cashDueMinor: number): Promise<void> {
  const row = await env.DB.prepare("SELECT floor_price_minor FROM product_policies WHERE domain_type = ? AND item_id = ?")
    .bind(domain, itemId).first<{ floor_price_minor: number | null }>();
  const floor = row ? Number(row.floor_price_minor) : NaN;
  if (Number.isSafeInteger(floor) && floor > 0 && cashDueMinor < floor) {
    throw new HttpError(409, "BELOW_FLOOR_PRICE", "쿠폰·코인 적용 후 금액이 상품 최저가(하한가)보다 낮아 예약할 수 없습니다.", { floorPriceMinor: floor });
  }
}

async function mustGet(env: Env, id: string): Promise<BookingRow> {
  const b = await getBooking(env, id);
  if (!b) throw new HttpError(404, "BOOKING_NOT_FOUND", "예약 정보를 찾을 수 없습니다.");
  return b;
}

function assertOwner(b: BookingRow, user: AuthUser): void {
  if (b.user_id !== user.id && user.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "타인의 예약에는 접근할 수 없습니다.");
}

function holdDates(domain: Domain, start: string, end: string): string[] {
  if (domain !== "HOTEL" && domain !== "CAR") return [start];
  const out: string[] = [];
  for (let t = Date.parse(start + "T00:00:00Z"); t < Date.parse(end + "T00:00:00Z"); t += MS_DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

function holdQuantity(domain: Domain, params: QuoteParams): number {
  if (domain === "HOTEL") return params.rooms || 1;
  if (domain === "FLIGHT" || domain === "TRAIN") return params.travelers.adults + params.travelers.children;
  return 1;
}

interface HoldTarget { itemId: string; unitKey: string; date: string; capacity: number }

/** Inventory to hold for an order: every capacity-managed product, on each of its service dates. */
function holdTargets(domain: Domain, product: CatalogProduct, inbound: CatalogProduct | null, q: { serviceStart: string; serviceEnd: string; legs?: LegResult[] }): HoldTarget[] {
  const out: HoldTarget[] = [];
  if (inbound && q.legs) {
    for (const [prod, leg] of [[product, q.legs[0]], [inbound, q.legs[1]]] as const) {
      if (prod.capacity !== null) out.push({ itemId: prod.itemId, unitKey: prod.unitId || "default", date: leg.serviceDate, capacity: prod.capacity });
    }
    return out;
  }
  if (product.capacity === null) return out;
  for (const d of holdDates(domain, q.serviceStart, q.serviceEnd)) out.push({ itemId: product.itemId, unitKey: product.unitId || "default", date: d, capacity: product.capacity });
  return out;
}

/** Load the inbound leg of a round-trip flight order, if the params ask for one. */
async function loadInbound(env: Env, domain: Domain, params: QuoteParams): Promise<CatalogProduct | null> {
  if (domain !== "FLIGHT" || !params.returnItemId) return null;
  if (!params.returnDate) throw new HttpError(400, "RETURN_DATE_REQUIRED", "오는 날을 선택해주세요.");
  return loadProduct(env, "FLIGHT", params.returnItemId, null);
}

function priceOrder(product: CatalogProduct, inbound: CatalogProduct | null, params: QuoteParams, promo: Promotion | null): QuoteResult & { legs?: [LegResult, LegResult] } {
  try {
    return inbound ? computeRoundTripQuote(product, inbound, params, promo, new Date()) : computeQuote(product, params, promo, new Date());
  } catch (e) {
    quoteErr(e);
  }
}

const ACTIVE_HOLD_SUM = "SELECT COALESCE(SUM(quantity), 0) FROM inventory_holds WHERE item_id = ? AND unit_key = ? AND service_date = ? AND (status = 'COMMITTED' OR (status = 'HELD' AND expires_at > ?))";

async function availableUnits(env: Env, itemId: string, unitKey: string, date: string, capacity: number): Promise<number> {
  const r = await env.DB.prepare(`SELECT (${ACTIVE_HOLD_SUM}) AS used`).bind(itemId, unitKey, date, nowIso()).first<{ used: number }>();
  const used = Number(r?.used || 0);
  // Partner-managed allotment wins when present: the calendar PUT has real
  // effect on quotes/bookings (is_closed days sell nothing). Exact unit first,
  // then the "default" row (2026-11-09 audit [M]).
  const ov = await env.DB.prepare(
    `SELECT allocated_units, is_closed FROM partner_inventory WHERE item_id = ? AND service_date = ?
     AND (unit_id = ? OR unit_id = 'default') ORDER BY CASE WHEN unit_id = ? THEN 0 ELSE 1 END LIMIT 1`,
  ).bind(itemId, date, unitKey, unitKey).first<{ allocated_units: number; is_closed: number }>();
  if (ov) {
    if (Number(ov.is_closed) === 1) return 0;
    return Number(ov.allocated_units) - used;
  }
  return capacity - used;
}

async function activeEntity(env: Env): Promise<{ id: string; status: string } | null> {
  const now = nowIso();
  const active = await env.DB.prepare(
    "SELECT id, status FROM business_entities WHERE status = 'ACTIVE' AND (effective_from IS NULL OR effective_from <= ?) AND (effective_to IS NULL OR effective_to > ?) ORDER BY effective_from DESC LIMIT 1",
  ).bind(now, now).first<{ id: string; status: string }>();
  if (active) return active;
  if (flag(env, "ALLOW_DRAFT_ENTITY")) {
    return env.DB.prepare("SELECT id, status FROM business_entities WHERE status = 'DRAFT' ORDER BY created_at LIMIT 1").first<{ id: string; status: string }>();
  }
  return null;
}

async function loadPromotion(env: Env, code: string | null): Promise<Promotion | null> {
  if (!code) return null;
  const p = await env.DB.prepare("SELECT * FROM promotions WHERE code = ?").bind(code.toUpperCase()).first<any>();
  if (!p) throw new HttpError(400, "PROMO_NOT_FOUND", "존재하지 않는 쿠폰 코드입니다.");
  return {
    code: p.code, discountType: p.discount_type === "PERCENTAGE" ? "PERCENTAGE" : "FIXED_AMOUNT", discountValue: Number(p.discount_value),
    minOrderMajor: Number(p.min_order_amount_krw || 0), maxDiscountMajor: Number(p.max_discount_krw || 0),
    validFrom: p.valid_from || null, validUntil: p.valid_until || null, active: p.is_active === 1,
  };
}

function parseParams(body: any): QuoteParams {
  return {
    startDate: str(body.startDate, 10),
    endDate: body.endDate ? str(body.endDate, 10) : null,
    rooms: body.rooms === undefined ? undefined : Number(body.rooms),
    ratePlanId: body.ratePlanId ? str(body.ratePlanId, 60) : null,
    returnItemId: body.returnItemId ? str(body.returnItemId, 100) : null,
    returnDate: body.returnDate ? str(body.returnDate, 10) : null,
    travelers: { adults: Number(body.travelers?.adults ?? 1), children: Number(body.travelers?.children ?? 0), infants: Number(body.travelers?.infants ?? 0) },
  };
}

function quoteErr(e: unknown): never {
  if (e instanceof QuoteError) throw new HttpError(400, e.code, e.message);
  throw e;
}

// ---------------------------------------------------------------------------
// 1. Quote (price snapshot + availability + bookability)
// ---------------------------------------------------------------------------
export async function createQuote(env: Env, user: AuthUser, body: any) {
  const domain = str(body.domain, 20).toUpperCase();
  if (!isDomain(domain)) throw new HttpError(400, "INVALID_DOMAIN", "상품 유형이 올바르지 않습니다.");

  // Feature Flag Guard: check domain availability
  const flagByDomain: Record<string, string> = {
    FLIGHT: 'FLIGHT_BOOKING',
    HOTEL: 'HOTEL_BOOKING',
    ACTIVITY: 'ACTIVITY_BOOKING',
    CAR: 'CAR_RENTAL',
    PACKAGE: 'PACKAGE_TOUR',
    TRAIN: 'TRANSIT_TICKETS',
    TRANSFER: 'TRANSIT_TICKETS'
  };
  const requiredFlag = flagByDomain[domain];
  if (requiredFlag) {
    const { isFeatureEnabled } = await import("./feature-flag-service.ts");
    const enabled = await isFeatureEnabled(env, requiredFlag);
    if (!enabled) {
      throw new HttpError(503, "FEATURE_DISABLED", `${domain} 예약 서비스가 운영 정책에 따라 일시 중단되었습니다. (Feature Flag OFF)`);
    }
  }

  const itemId = str(body.itemId, 100);
  if (!itemId) throw new HttpError(400, "ITEM_REQUIRED", "상품을 선택해주세요.");
  const params = parseParams(body);
  const product = await loadProduct(env, domain, itemId, body.unitId ? str(body.unitId, 100) : null, domain === "HOTEL" ? params.ratePlanId ?? null : null);
  const supplier = await loadSupplier(env, product.supplierId);
  const b = bookabilityOf(env, supplier);
  if (!b.bookable) {
    throw new HttpError(409, "NOT_DIRECTLY_BOOKABLE", "이 상품은 현재 GetForTrip에서 직접 예약·결제할 수 없습니다. (공급사 연동 대기)", { reason: b.reason });
  }
  assertTicketable(domain, supplier);
  const entity = await activeEntity(env);
  if (!entity) throw new HttpError(503, "SALES_NOT_ENABLED", "판매 주체(사업자) 정보가 활성화되지 않아 결제를 받을 수 없습니다.");
  if (!getPaymentProvider(env)) throw new HttpError(503, "PAYMENTS_DISABLED", "현재 온라인 결제가 활성화되어 있지 않습니다. (PG 계약/설정 대기)");

  const inbound = await loadInbound(env, domain, params);
  const promo = await loadPromotion(env, body.promotionCode ? str(body.promotionCode, 40) : null);
  const q = priceOrder(product, inbound, params, promo);
  const coinRaw = body.coinAmount === undefined || body.coinAmount === null || body.coinAmount === "" ? 0 : Number(body.coinAmount);
  if (!Number.isSafeInteger(coinRaw) || coinRaw < 0) throw new HttpError(400, "INVALID_COIN_AMOUNT", "코인 사용 금액이 올바르지 않습니다.");
  let coinsMinor = 0;
  if (coinRaw > 0) {
    const bal = await env.DB.prepare("SELECT trip_coins FROM users WHERE id = ?").bind(user.id).first<{ trip_coins: number }>();
    const balance = Number(bal?.trip_coins || 0);
    if (coinRaw > balance) throw new HttpError(400, "INSUFFICIENT_COINS", "보유 코인이 부족합니다.", { balance });
    if (coinRaw > q.totalMinor) throw new HttpError(400, "COINS_EXCEED_TOTAL", "코인 사용액은 결제 금액을 초과할 수 없습니다.", { maxUsable: q.totalMinor });
    coinsMinor = coinRaw;
  }
  const cashDueMinor = q.totalMinor - coinsMinor;
  await assertAboveFloor(env, domain, itemId, cashDueMinor);
  const discountMinor = q.discountMinor + coinsMinor;
  const title = inbound ? `왕복 · ${product.title} / ${inbound.title}` : product.title;

  const need = holdQuantity(domain, params);
  for (const t of holdTargets(domain, product, inbound, q)) {
    if ((await availableUnits(env, t.itemId, t.unitKey, t.date, t.capacity)) < need) {
      throw new HttpError(409, "SOLD_OUT", `${t.date} 일정의 잔여 재고가 부족합니다.`);
    }
  }

  const displayCurrency = str(body.displayCurrency || "KRW", 3).toUpperCase();
  let displayTotal = cashDueMinor;
  let fxRate: number | null = null;
  if (displayCurrency !== "KRW") {
    const rates = await env.DB.prepare("SELECT currency, rate_to_krw FROM fx_rates").all<{ currency: string; rate_to_krw: number }>();
    const table: Record<string, number> = {};
    for (const r of rates.results || []) table[r.currency] = Number(r.rate_to_krw);
    if (table[displayCurrency]) {
      displayTotal = convertMinor(cashDueMinor, "KRW", displayCurrency, table);
      fxRate = table[displayCurrency];
    }
  }

  const id = newId("qt");
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MS).toISOString();
  await env.DB.prepare(
    `INSERT INTO quotes (id, user_id, domain_type, item_id, unit_id, supplier_id, title, currency, base_minor, tax_minor, fee_minor, discount_minor, total_minor, coins_minor,
      display_currency, display_total_minor, fx_rate_snapshot, promotion_code, lines_json, params_json, cancellation_policy_json, service_start, service_end, priced_units, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'KRW', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, user.id, domain, itemId, product.unitId, product.supplierId, title, q.baseMinor, q.taxMinor, q.feeMinor, discountMinor, cashDueMinor, coinsMinor,
    fxRate ? displayCurrency : "KRW", displayTotal, fxRate, q.promotionCode, JSON.stringify(q.lines), JSON.stringify(params), JSON.stringify(q.cancellationPolicy),
    q.serviceStart, q.serviceEnd, q.pricedUnits, expiresAt,
  ).run();

  return {
    quoteId: id, expiresAt, domain, itemId, unitId: product.unitId, title, currency: "KRW",
    roundTrip: Boolean(inbound), returnItemId: inbound?.itemId ?? null, legs: q.legs ?? null,
    ratePlanId: product.ratePlanId ?? null,
    lines: q.lines, baseMinor: q.baseMinor, taxMinor: q.taxMinor, feeMinor: q.feeMinor, discountMinor, totalMinor: cashDueMinor,
    coinsMinor, grossMinor: q.totalMinor,
    display: fxRate ? { currency: displayCurrency, totalMinor: displayTotal, fxRateToKrw: fxRate, note: "표시용 환산 금액이며 실제 결제는 KRW로 청구됩니다." } : null,
    serviceStart: q.serviceStart, serviceEnd: q.serviceEnd, cancellationPolicy: q.cancellationPolicy,
    travelers: params.travelers, rooms: params.rooms ?? null,
    requiresPassport: domain === "FLIGHT",
    fulfilmentMode: b.mode,
  };
}

// ---------------------------------------------------------------------------
// 2. Booking creation (from quote, idempotent, re-validated)
// ---------------------------------------------------------------------------
const NAME_EN = /^[A-Z][A-Z' -]{0,48}$/;

interface TravelerIn {
  type: "ADULT" | "CHILD" | "INFANT";
  lastNameEn: string;
  firstNameEn: string;
  birthDate: string | null;
  gender: string | null;
  nationality: string | null;
  passportNumber: string | null;
  passportExpiry: string | null;
}

async function validateTravelers(
  env: Env,
  userId: string,
  raw: any[],
  q: { domain_type: string; params: QuoteParams; service_end: string },
): Promise<TravelerIn[]> {
  if (!Array.isArray(raw)) throw new HttpError(400, "TRAVELERS_REQUIRED", "여행자 정보를 입력해주세요.");
  const t = q.params.travelers;
  const expected = { ADULT: t.adults, CHILD: t.children, INFANT: t.infants };
  const counts = { ADULT: 0, CHILD: 0, INFANT: 0 };
  const needsPassport = q.domain_type === "FLIGHT";
  // Saved-traveler import: { savedTravelerId } resolves from the wallet
  // (owner-scoped, passport decrypted); explicit fields override the saved ones.
  const resolved: any[] = [];
  for (const r of raw.slice(0, 20)) {
    if (r?.savedTravelerId) {
      const s = await env.DB.prepare("SELECT * FROM saved_travelers WHERE id = ? AND user_id = ?")
        .bind(str(r.savedTravelerId, 64), userId).first<any>();
      if (!s) throw new HttpError(404, "SAVED_TRAVELER_NOT_FOUND", "저장된 여행자를 찾을 수 없습니다.");
      let savedPassport = s.passport_number ? String(s.passport_number) : null;
      if (savedPassport?.startsWith("v1:")) {
        if (!env.PII_ENC_KEY) throw new HttpError(503, "PII_KEY_MISSING", "여권 정보를 복호화할 수 없습니다.");
        savedPassport = await decryptField(savedPassport, env.PII_ENC_KEY);
      }
      resolved.push({
        type: r.type || "ADULT", lastNameEn: r.lastNameEn || s.last_name_en, firstNameEn: r.firstNameEn || s.first_name_en,
        birthDate: r.birthDate || s.birth_date, gender: r.gender || s.gender, nationality: r.nationality || s.nationality,
        passportNumber: r.passportNumber || savedPassport, passportExpiry: r.passportExpiry || s.passport_expiry,
      });
    } else {
      resolved.push(r);
    }
  }
  const out = resolved.map((r, i): TravelerIn => {
    const type = (["ADULT", "CHILD", "INFANT"].includes(r?.type) ? r.type : "ADULT") as TravelerIn["type"];
    counts[type]++;
    const lastNameEn = str(r?.lastNameEn, 50).toUpperCase();
    const firstNameEn = str(r?.firstNameEn, 50).toUpperCase();
    if (!NAME_EN.test(lastNameEn) || !NAME_EN.test(firstNameEn)) {
      throw new HttpError(400, "INVALID_TRAVELER_NAME", `여행자 ${i + 1}: 영문 성/이름은 여권과 동일한 영문 대문자로 입력해주세요.`);
    }
    const birthDate = r?.birthDate ? str(r.birthDate, 10) : null;
    const passportNumber = r?.passportNumber ? str(r.passportNumber, 20).toUpperCase() : null;
    const passportExpiry = r?.passportExpiry ? str(r.passportExpiry, 10) : null;
    if (needsPassport) {
      if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new HttpError(400, "BIRTH_DATE_REQUIRED", `여행자 ${i + 1}: 생년월일이 필요합니다.`);
      if (!passportNumber || !/^[A-Z0-9]{6,12}$/.test(passportNumber)) throw new HttpError(400, "PASSPORT_REQUIRED", `여행자 ${i + 1}: 여권번호를 확인해주세요.`);
      if (!passportExpiry || !/^\d{4}-\d{2}-\d{2}$/.test(passportExpiry) || passportExpiry <= q.service_end) {
        throw new HttpError(400, "PASSPORT_EXPIRY", `여행자 ${i + 1}: 여권 만료일이 여행 종료일 이후여야 합니다.`);
      }
    }
    return { type, lastNameEn, firstNameEn, birthDate, gender: r?.gender ? str(r.gender, 10).toUpperCase() : null, nationality: r?.nationality ? str(r.nationality, 3).toUpperCase() : null, passportNumber, passportExpiry };
  });
  const travelerRequired = ["FLIGHT", "TRAIN", "PACKAGE"].includes(q.domain_type);
  if (travelerRequired) {
    if (counts.ADULT !== expected.ADULT || counts.CHILD !== expected.CHILD || counts.INFANT !== expected.INFANT) {
      throw new HttpError(400, "TRAVELER_COUNT_MISMATCH", "입력한 여행자 수가 선택한 인원과 일치하지 않습니다.");
    }
  } else if (out.length < 1) {
    throw new HttpError(400, "LEAD_GUEST_REQUIRED", "대표 이용자 정보를 입력해주세요.");
  }
  return out;
}

/**
 * Order lines persisted as booking_items. A round trip is one booking (one PNR) with one item per leg;
 * the order total is allocated to legs pro rata to their fare so item totals sum exactly to the booking total.
 */
function itemRows(quote: any, product: CatalogProduct, inbound: CatalogProduct | null, legs?: [LegResult, LegResult]) {
  if (!inbound || !legs) {
    return [{ itemId: quote.item_id, unitId: quote.unit_id, title: quote.title, start: quote.service_start, end: quote.service_end, totalMinor: quote.total_minor }];
  }
  const fareSum = legs[0].baseMinor + legs[1].baseMinor;
  const outTotal = Math.round((quote.total_minor * legs[0].baseMinor) / fareSum);
  return [
    { itemId: product.itemId, unitId: product.unitId, title: `가는 편 · ${product.title}`, start: legs[0].serviceDate, end: legs[0].serviceDate, totalMinor: outTotal },
    { itemId: inbound.itemId, unitId: inbound.unitId, title: `오는 편 · ${inbound.title}`, start: legs[1].serviceDate, end: legs[1].serviceDate, totalMinor: quote.total_minor - outTotal },
  ];
}

export async function createBooking(env: Env, user: AuthUser, body: any, idemKey: string | null) {
  if (!idemKey || !/^[A-Za-z0-9_-]{16,80}$/.test(idemKey)) {
    throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key 헤더가 필요합니다.");
  }
  const existing = await env.DB.prepare("SELECT id FROM bookings WHERE user_id = ? AND idempotency_key = ?").bind(user.id, idemKey).first<{ id: string }>();
  if (existing) return { replayed: true, booking: await serializeBooking(env, (await getBooking(env, existing.id))!, user) };

  const quote = await env.DB.prepare("SELECT * FROM quotes WHERE id = ?").bind(str(body.quoteId, 64)).first<any>();
  if (!quote || quote.user_id !== user.id) throw new HttpError(404, "QUOTE_NOT_FOUND", "견적을 찾을 수 없습니다. 다시 조회해주세요.");

  // Feature Flag Guard: check domain availability on booking creation
  const flagByDomain: Record<string, string> = {
    FLIGHT: 'FLIGHT_BOOKING',
    HOTEL: 'HOTEL_BOOKING',
    ACTIVITY: 'ACTIVITY_BOOKING',
    CAR: 'CAR_RENTAL',
    PACKAGE: 'PACKAGE_TOUR',
    TRAIN: 'TRANSIT_TICKETS',
    TRANSFER: 'TRANSIT_TICKETS'
  };
  const requiredFlag = flagByDomain[quote.domain_type];
  if (requiredFlag) {
    const { isFeatureEnabled } = await import("./feature-flag-service.ts");
    const enabled = await isFeatureEnabled(env, requiredFlag);
    if (!enabled) {
      throw new HttpError(503, "FEATURE_DISABLED", `${quote.domain_type} 예약 서비스가 운영 정책에 따라 일시 중단되었습니다. (Feature Flag OFF)`);
    }
  }
  if (quote.status === "CONSUMED") throw new HttpError(409, "QUOTE_ALREADY_USED", "이미 예약에 사용된 견적입니다. 다시 조회해주세요.");
  if (quote.status !== "ACTIVE" || quote.expires_at <= nowIso()) throw new HttpError(409, "QUOTE_EXPIRED", "견적 유효시간이 지났습니다. 가격을 다시 확인해주세요.");

  // Price revalidation against the live catalog before taking money.
  const params: QuoteParams = JSON.parse(quote.params_json);
  const product = await loadProduct(env, quote.domain_type, quote.item_id, quote.unit_id, params.ratePlanId ?? null);
  const inbound = await loadInbound(env, quote.domain_type, params);
  const supplier = (await loadSupplier(env, product.supplierId)) as SupplierRow;
  const bk = bookabilityOf(env, supplier);
  if (!bk.bookable) throw new HttpError(409, "NOT_DIRECTLY_BOOKABLE", "이 상품은 현재 직접 예약할 수 없습니다.", { reason: bk.reason });
  assertTicketable(quote.domain_type, supplier);
  const fresh = priceOrder(product, inbound, params, await loadPromotion(env, quote.promotion_code));
  const coinsMinor = Number(quote.coins_minor || 0);
  const freshCashDue = fresh.totalMinor - coinsMinor;
  await assertAboveFloor(env, quote.domain_type, quote.item_id, freshCashDue);
  if (freshCashDue !== quote.total_minor) {
    await env.DB.prepare("UPDATE quotes SET status = 'EXPIRED' WHERE id = ?").bind(quote.id).run();
    throw new HttpError(409, "PRICE_CHANGED", "가격이 변경되었습니다. 변경된 금액을 확인해주세요.", { previousTotalMinor: quote.total_minor, newTotalMinor: freshCashDue });
  }
  const entity = await activeEntity(env);
  if (!entity) throw new HttpError(503, "SALES_NOT_ENABLED", "판매 주체(사업자) 정보가 활성화되지 않았습니다.");

  const contactName = str(body.contact?.name, 80);
  const contactEmail = str(body.contact?.email, 120).toLowerCase();
  const contactPhone = str(body.contact?.phone, 30);
  if (!contactName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || !/^[+0-9][0-9 -]{6,20}$/.test(contactPhone)) {
    throw new HttpError(400, "CONTACT_REQUIRED", "예약자 이름, 이메일, 연락처를 정확히 입력해주세요.");
  }
  const travelers = await validateTravelers(env, user.id, body.travelers, { domain_type: quote.domain_type, params, service_end: quote.service_end });
  if (travelers.some((t) => t.passportNumber) && !env.PII_ENC_KEY) {
    throw new HttpError(503, "PII_KEY_MISSING", "여권 정보 암호화 키가 설정되지 않아 예약을 받을 수 없습니다.");
  }

  let simulation: Simulation = {};
  if (bk.mode === "SIMULATED" && body.simulation && typeof body.simulation === "object") {
    simulation = { supplier: body.simulation.supplier, ticketing: body.simulation.ticketing, cancel: body.simulation.cancel };
  }

  const db = env.DB;
  const id = newId("bkg");
  const number = newBookingNumber();
  // Deduct coins before the booking batch so a lost balance race never creates
  // an underfunded booking; compensated below if the batch itself fails.
  if (coinsMinor > 0) {
    const spent = await db.prepare("UPDATE users SET trip_coins = trip_coins - ? WHERE id = ? AND trip_coins >= ?").bind(coinsMinor, user.id, coinsMinor).run();
    if (!spent.meta.changes) throw new HttpError(409, "INSUFFICIENT_COINS", "보유 코인이 부족합니다. 금액을 다시 확인해주세요.");
  }
  const lockExpires = new Date(Date.now() + PAYMENT_WINDOW_MS).toISOString();
  const stmts: Stmt[] = [
    db.prepare(
      `INSERT INTO bookings (id, user_id, partner_id, booking_number, domain_type, item_id, title, base_amount_krw, tax_amount_krw, service_fee_krw, discount_amount_krw,
        total_price, currency, status, customer_name, customer_email, customer_phone, details_json, inventory_lock_expires_at,
        quote_id, entity_id, supplier_id, total_minor, payment_status, supplier_status, idempotency_key, version, service_start, service_end,
        cancellation_policy_json, payment_mode, transaction_model, trip_coins_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'KRW', 'AWAITING_PAYMENT', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNPAID', 'NOT_REQUESTED', ?, 0, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, user.id, supplier.id, number, quote.domain_type, quote.item_id, quote.title, quote.base_minor, quote.tax_minor, quote.fee_minor, quote.discount_minor,
      quote.total_minor, contactName, contactEmail, contactPhone,
      JSON.stringify({ travelers: params.travelers, rooms: params.rooms ?? null, simulation, specialRequests: str(body.specialRequests, 500) }),
      lockExpires, quote.id, entity.id, supplier.id, quote.total_minor, idemKey, quote.service_start, quote.service_end,
      quote.cancellation_policy_json, bk.mode === "SIMULATED" ? "SANDBOX" : "LIVE", supplier.transaction_model, coinsMinor,
    ),
    ...itemRows(quote, product, inbound, fresh.legs).map((it) =>
      db.prepare(
        `INSERT INTO booking_items (id, booking_id, domain_type, item_id, unit_id, supplier_id, title, service_start, service_end, quantity, total_minor, params_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(newId("bki"), id, quote.domain_type, it.itemId, it.unitId, supplier.id, it.title, it.start, it.end, quote.priced_units, it.totalMinor, quote.params_json),
    ),
    db.prepare("UPDATE quotes SET status = 'CONSUMED' WHERE id = ?").bind(quote.id),
    db.prepare("INSERT INTO booking_status_history (id, booking_id, from_status, to_status, actor_type, actor_id, reason) VALUES (?, ?, NULL, 'AWAITING_PAYMENT', 'CUSTOMER', ?, 'BOOKING_CREATED')")
      .bind(newId("bsh"), id, user.id),
    ...(coinsMinor > 0
      ? [db.prepare("INSERT INTO coin_ledger (id, user_id, delta, reason, reference_id) VALUES (?, ?, ?, 'COIN_SPENT', ?)")
          .bind(newId("coin"), user.id, -coinsMinor, id)]
      : []),
    // A claimed coupon is single-use: booking with its code consumes the claim.
    ...(quote.promotion_code
      ? [db.prepare("UPDATE user_coupons SET is_used = 1 WHERE user_id = ? AND coupon_code = ? AND is_used = 0").bind(user.id, quote.promotion_code)]
      : []),
  ];
  for (const [i, t] of travelers.entries()) {
    const enc = t.passportNumber ? await encryptField(t.passportNumber, env.PII_ENC_KEY!) : null;
    stmts.push(
      db.prepare(
        `INSERT INTO booking_travelers (id, booking_id, traveler_type, last_name_en, first_name_en, birth_date, gender, nationality, passport_enc, passport_expiry, is_lead)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(newId("btr"), id, t.type, t.lastNameEn, t.firstNameEn, t.birthDate, t.gender, t.nationality, enc, t.passportExpiry, i === 0 ? 1 : 0),
    );
  }
  const qty = holdQuantity(quote.domain_type, params);
  for (const t of holdTargets(quote.domain_type, product, inbound, { serviceStart: quote.service_start, serviceEnd: quote.service_end, legs: fresh.legs })) {
    stmts.push(
      db.prepare(
        `INSERT INTO inventory_holds (id, booking_id, domain_type, item_id, unit_key, service_date, quantity, status, expires_at)
         SELECT ?, ?, ?, ?, ?, ?, CASE WHEN ? - (${ACTIVE_HOLD_SUM}) >= ? THEN ? ELSE 0 END, 'HELD', ?`,
      ).bind(newId("hld"), id, quote.domain_type, t.itemId, t.unitKey, t.date, t.capacity, t.itemId, t.unitKey, t.date, nowIso(), qty, qty, lockExpires),
    );
  }
  try {
    await runBatch(db, stmts);
  } catch (e) {
    // A concurrent request with the same Idempotency-Key may have won the race.
    const winner = await env.DB.prepare("SELECT id FROM bookings WHERE user_id = ? AND idempotency_key = ?").bind(user.id, idemKey).first<{ id: string }>();
    if (winner) {
      if (coinsMinor > 0) {
        // The winner already spent its own coins: return this attempt's deduct.
        await db.prepare("UPDATE users SET trip_coins = trip_coins + ? WHERE id = ?").bind(coinsMinor, user.id).run();
        await db.prepare("INSERT INTO coin_ledger (id, user_id, delta, reason, reference_id) VALUES (?, ?, ?, 'COIN_SPENT_COMPENSATED', ?)")
          .bind(newId("coin"), user.id, coinsMinor, winner.id).run();
      }
      return { replayed: true, booking: await serializeBooking(env, (await getBooking(env, winner.id))!, user) };
    }
    if (coinsMinor > 0) {
      // No booking was created: return the pre-deducted coins.
      await db.prepare("UPDATE users SET trip_coins = trip_coins + ? WHERE id = ?").bind(coinsMinor, user.id).run();
      await db.prepare("INSERT INTO coin_ledger (id, user_id, delta, reason, reference_id) VALUES (?, ?, ?, 'COIN_SPENT_COMPENSATED', ?)")
        .bind(newId("coin"), user.id, coinsMinor, id).run();
    }
    throw e;
  }
  return { replayed: false, booking: await serializeBooking(env, (await getBooking(env, id))!, user) };
}

// ---------------------------------------------------------------------------
// 3. Payment confirmation (server-to-server with the PG)
// ---------------------------------------------------------------------------
export async function confirmPayment(env: Env, user: AuthUser, body: any) {
  const provider = requirePaymentProvider(env);
  const b = await mustGet(env, str(body.bookingId, 64));
  assertOwner(b, user);
  const paymentKey = str(body.paymentKey, 200);
  const orderId = str(body.orderId, 64);
  const amount = Number(body.amount);

  if (b.status !== "AWAITING_PAYMENT") {
    if (b.payment_status === "CAPTURED") return { alreadyProcessed: true, booking: await serializeBooking(env, b, user) };
    throw new HttpError(409, "NOT_AWAITING_PAYMENT", `결제할 수 없는 예약 상태입니다. (${STATUS_LABEL_KO[b.status] || b.status})`);
  }
  if (orderId !== b.id) throw new HttpError(400, "ORDER_MISMATCH", "주문 정보가 일치하지 않습니다.");
  if (!Number.isSafeInteger(amount) || amount !== b.total_minor) throw new HttpError(400, "AMOUNT_MISMATCH", "결제 금액이 예약 금액과 일치하지 않습니다.");
  if (!paymentKey) throw new HttpError(400, "PAYMENT_KEY_REQUIRED", "결제 키가 없습니다.");
  if (b.inventory_lock_expires_at <= nowIso()) {
    await expireBooking(env, b, "PAYMENT_WINDOW_ELAPSED");
    throw new HttpError(409, "PAYMENT_WINDOW_EXPIRED", "결제 가능 시간이 지났습니다. 다시 예약해주세요.");
  }
  // Real money must never be taken for a booking fulfilled by a simulated supplier.
  if (b.payment_mode === "SANDBOX" && provider.mode === "LIVE") {
    throw new HttpError(409, "MODE_MISMATCH", "테스트(시뮬레이션) 예약에는 실결제를 진행할 수 없습니다.");
  }

  // Claim the booking for payment (only one request can win) and extend the holds.
  const paymentId = newId("pay");
  const db = env.DB;
  await runBatch(db, [
    ...transition(db, b, "PAYMENT_PROCESSING", { type: "CUSTOMER", id: user.id }, null),
    db.prepare("INSERT INTO payments (id, booking_id, provider, mode, order_id, provider_payment_key, amount_minor, currency, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING')")
      .bind(paymentId, b.id, provider.name, provider.mode, `${b.id}:${paymentId}`, paymentKey, b.total_minor, b.currency),
    db.prepare("UPDATE inventory_holds SET expires_at = ? WHERE booking_id = ? AND status = 'HELD'").bind(new Date(Date.now() + 10 * 60_000).toISOString(), b.id),
  ]);
  let cur = await mustGet(env, b.id);

  const r = await provider.confirm({ orderId: b.id, paymentKey, amountMinor: b.total_minor, currency: b.currency, idempotencyKey: `confirm_${b.id}` });

  if (r.outcome === "CAPTURED" && r.amountMinor !== b.total_minor) {
    // Provider captured a different amount: never accept; refund immediately.
    await provider.refund({ paymentKey: r.paymentKey, amountMinor: r.amountMinor, reason: "AMOUNT_MISMATCH", idempotencyKey: `mismatch_${paymentId}` });
    await runBatch(db, [
      ...transition(db, cur, "FAILED", { type: "PAYMENT_PROVIDER", id: provider.name }, "PG_AMOUNT_MISMATCH_REFUNDED", { payment_status: "FAILED" }),
      db.prepare("UPDATE payments SET status = 'FAILED', failure_code = 'AMOUNT_MISMATCH', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(paymentId),
      db.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ? AND status = 'HELD'").bind(b.id),
    ]);
    throw new HttpError(502, "PG_AMOUNT_MISMATCH", "결제 금액 검증에 실패하여 결제를 취소했습니다.");
  }

  if (r.outcome === "CAPTURED") {
    const hook = await loadPartnerHook(db, b.partner_id);
    await runBatch(db, [
      ...transition(db, cur, "PAYMENT_AUTHORIZED", { type: "PAYMENT_PROVIDER", id: provider.name }, null, { payment_status: "CAPTURED", paid_minor: r.amountMinor }),
      db.prepare("UPDATE payments SET status = 'CAPTURED', provider_payment_key = ?, method = ?, approved_at = ?, raw_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(r.paymentKey, r.method, r.approvedAt, JSON.stringify(r.raw ?? null).slice(0, 8000), paymentId),
      db.prepare("UPDATE inventory_holds SET status = 'COMMITTED' WHERE booking_id = ? AND status = 'HELD'").bind(b.id),
      ...journalStmts(db, L.paymentCaptured(paymentId, r.amountMinor), cur),
      ...hookEnqueueStmts(db, hook, "booking.created", hookSnapshot(b, "PAYMENT_AUTHORIZED", { paid_minor: r.amountMinor, payment_id: paymentId })),
    ]);
    cur = await fulfil(env, await mustGet(env, b.id));
    return { alreadyProcessed: false, booking: await serializeBooking(env, cur, user) };
  }

  if (r.outcome === "FAILED") {
    await runBatch(db, [
      ...transition(db, cur, "AWAITING_PAYMENT", { type: "PAYMENT_PROVIDER", id: provider.name }, `PAYMENT_FAILED:${r.code}`),
      db.prepare("UPDATE payments SET status = 'FAILED', failure_code = ?, failure_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(r.code, r.message.slice(0, 300), paymentId),
    ]);
    throw new HttpError(402, "PAYMENT_FAILED", r.message, { providerCode: r.code });
  }

  // UNKNOWN: we do not know whether money moved. Never assume either way.
  await runBatch(db, [
    ...transition(db, cur, "MANUAL_REVIEW_REQUIRED", { type: "PAYMENT_PROVIDER", id: provider.name }, "PAYMENT_STATUS_UNKNOWN"),
    db.prepare("UPDATE payments SET status = 'UNKNOWN', failure_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(r.message, paymentId),
  ]);
  return { alreadyProcessed: false, booking: await serializeBooking(env, await mustGet(env, b.id), user) };
}

// ---------------------------------------------------------------------------
// 4. Supplier fulfilment
// ---------------------------------------------------------------------------
function supplierCtx(b: BookingRow, travelerCount: number): SupplierContext {
  let sim: Simulation = {};
  try {
    sim = JSON.parse(b.details_json || "{}").simulation || {};
  } catch {}
  return { bookingId: b.id, domain: b.domain_type, itemId: b.item_id, travelerCount, supplierReference: b.supplier_reference, simulation: sim };
}

async function travelerCount(env: Env, bookingId: string): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS c FROM booking_travelers WHERE booking_id = ?").bind(bookingId).first<{ c: number }>();
  return Math.max(1, Number(r?.c || 1));
}

async function logSupplierCall(env: Env, supplierId: string, bookingId: string, op: string, outcome: string, ms: number, summary: string) {
  await env.DB.prepare("INSERT INTO supplier_api_calls (id, supplier_id, booking_id, operation, outcome, latency_ms, response_summary) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(newId("sac"), supplierId, bookingId, op, outcome, ms, summary.slice(0, 500)).run();
}

export async function fulfil(env: Env, b: BookingRow): Promise<BookingRow> {
  const db = env.DB;
  const supplier = await loadSupplier(env, b.supplier_id);
  const adapter = adapterFor(supplier?.adapter || "none");
  await runBatch(db, transition(db, b, "SUPPLIER_BOOKING_PENDING", { type: "SYSTEM", id: null }, null, { supplier_status: "REQUESTED" }));
  let cur = await mustGet(env, b.id);
  const t0 = Date.now();
  const r = await adapter.book(supplierCtx(cur, await travelerCount(env, b.id)));
  await logSupplierCall(env, b.supplier_id, b.id, "BOOK", r.outcome, Date.now() - t0, JSON.stringify(r));

  if (r.outcome === "CONFIRMED") {
    await runBatch(db, [
      ...transition(db, cur, "SUPPLIER_CONFIRMED", { type: "SUPPLIER", id: b.supplier_id }, null, { supplier_status: "CONFIRMED", supplier_reference: r.reference }),
      db.prepare("UPDATE booking_items SET supplier_status = 'CONFIRMED', supplier_reference = ?, pnr = ?, updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?").bind(r.reference, r.pnr, b.id),
    ]);
    return issue(env, await mustGet(env, b.id));
  }
  if (r.outcome === "PENDING") {
    if (r.reference) await db.prepare("UPDATE bookings SET supplier_reference = ? WHERE id = ?").bind(r.reference, b.id).run();
    return mustGet(env, b.id); // awaits operator/partner confirmation
  }
  if (r.outcome === "FAILED") {
    await runBatch(db, [
      ...transition(db, cur, "REFUND_PENDING", { type: "SUPPLIER", id: b.supplier_id }, `SUPPLIER_FAILED:${r.code}`, { supplier_status: "FAILED" }),
      db.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ?").bind(b.id),
    ]);
    cur = await mustGet(env, b.id);
    await startRefund(env, cur, cur.paid_minor, `공급사 예약 실패 전액 환불 (${r.code})`);
    return mustGet(env, b.id);
  }
  await runBatch(db, transition(db, cur, "MANUAL_REVIEW_REQUIRED", { type: "SUPPLIER", id: b.supplier_id }, "SUPPLIER_RESPONSE_UNKNOWN", { supplier_status: "UNKNOWN" }));
  return mustGet(env, b.id);
}

function voucherCode(): string {
  return `GFV-${randomToken(5).toUpperCase()}`;
}

/** Ticket (flights) or voucher (others) issuance after supplier confirmation. */
export async function issue(env: Env, b: BookingRow): Promise<BookingRow> {
  const db = env.DB;
  const supplier = await loadSupplier(env, b.supplier_id);
  const split = L.recognitionSplit(b.paid_minor, Math.round(Number(b.discount_amount_krw || 0)), supplier?.settlement_rate_bps ?? 9000);
  const notify = (template: string) =>
    db.prepare("INSERT INTO notification_outbox (id, channel, recipient, template, payload_json, status) VALUES (?, 'EMAIL', ?, ?, ?, 'PENDING')")
      .bind(newId("ntf"), b.customer_email, template, JSON.stringify({ bookingId: b.id, bookingNumber: b.booking_number }));

  if (b.domain_type === "FLIGHT") {
    await runBatch(db, transition(db, b, "TICKETING_PENDING", { type: "SYSTEM", id: null }, null));
    let cur = await mustGet(env, b.id);
    const adapter = adapterFor(supplier?.adapter || "none");
    const t0 = Date.now();
    const r = await adapter.ticket(supplierCtx(cur, await travelerCount(env, b.id)));
    await logSupplierCall(env, b.supplier_id, b.id, "TICKET", r.outcome, Date.now() - t0, JSON.stringify(r));
    if (r.outcome === "ISSUED") {
      // Planned first (reads only), written in the same batch: a ticketed
      // booking can never lack its settlement row (2026-11-09 audit [M]).
      const settlement = await planOrderSettlement(env, b.id, b.domain_type, b.item_id, b.paid_minor);
      await runBatch(db, [
        ...transition(db, cur, "TICKETED", { type: "SUPPLIER", id: b.supplier_id }, null, { supplier_status: "TICKETED" }),
        db.prepare("UPDATE booking_items SET ticket_numbers_json = ?, supplier_status = 'TICKETED', updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?").bind(JSON.stringify(r.ticketNumbers), b.id),
        ...journalStmts(db, L.fulfilmentRecognized(b.id, b.paid_minor, split), cur),
        notify("FLIGHT_TICKETED"),
        settlement.stmt(db),
      ]);
      return mustGet(env, b.id);
    }
    // Ticketing failed after PNR: void the PNR at the supplier, then refund.
    const cx = await adapter.cancel(supplierCtx(cur, 1));
    if (r.outcome === "FAILED" && cx.outcome === "CANCELLED") {
      await runBatch(db, [
        ...transition(db, cur, "REFUND_PENDING", { type: "SUPPLIER", id: b.supplier_id }, `TICKETING_FAILED:${r.code}`, { supplier_status: "CANCELLED" }),
        db.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ?").bind(b.id),
      ]);
      cur = await mustGet(env, b.id);
      await startRefund(env, cur, cur.paid_minor, "발권 실패로 인한 전액 환불");
      return mustGet(env, b.id);
    }
    await runBatch(db, transition(db, cur, "MANUAL_REVIEW_REQUIRED", { type: "SYSTEM", id: null }, "TICKETING_FAILED_PNR_NOT_VOIDED"));
    return mustGet(env, b.id);
  }

  const settlement = await planOrderSettlement(env, b.id, b.domain_type, b.item_id, b.paid_minor);
  await runBatch(db, [
    ...transition(db, b, "VOUCHER_ISSUED", { type: "SYSTEM", id: null }, null, { voucher_code: voucherCode() }),
    db.prepare("UPDATE booking_items SET voucher_code = (SELECT voucher_code FROM bookings WHERE id = ?), updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?").bind(b.id, b.id),
    ...journalStmts(db, L.fulfilmentRecognized(b.id, b.paid_minor, split), b),
    notify("BOOKING_CONFIRMED"),
    settlement.stmt(db),
  ]);
  return mustGet(env, b.id);
}

// ---------------------------------------------------------------------------
// 5. Refunds
// ---------------------------------------------------------------------------
async function capturedPayment(env: Env, bookingId: string) {
  return env.DB.prepare("SELECT * FROM payments WHERE booking_id = ? AND status IN ('CAPTURED', 'PARTIALLY_REFUNDED') ORDER BY created_at DESC LIMIT 1").bind(bookingId).first<any>();
}

/** Create a refund record for a booking in REFUND_PENDING and attempt it once. */
export async function startRefund(env: Env, b: BookingRow, amountMinor: number, reason: string): Promise<void> {
  const pay = await capturedPayment(env, b.id);
  if (!pay) {
    await runBatch(env.DB, transition(env.DB, b, "MANUAL_REVIEW_REQUIRED", { type: "SYSTEM", id: null }, "REFUND_WITHOUT_CAPTURED_PAYMENT"));
    return;
  }
  const refundable = pay.amount_minor - pay.refunded_minor;
  const amt = Math.min(amountMinor, refundable);
  if (amt <= 0) {
    await runBatch(env.DB, transition(env.DB, b, "REFUNDED", { type: "SYSTEM", id: null }, "NOTHING_TO_REFUND"));
    return;
  }
  const rid = newId("rfd");
  await env.DB.prepare("INSERT INTO refunds (id, booking_id, payment_id, amount_minor, currency, reason, status) VALUES (?, ?, ?, ?, ?, ?, 'PENDING')")
    .bind(rid, b.id, pay.id, amt, b.currency, reason.slice(0, 300)).run();
  await processRefund(env, rid);
}

export async function processRefund(env: Env, refundId: string): Promise<void> {
  const db = env.DB;
  const rf = await db.prepare("SELECT * FROM refunds WHERE id = ?").bind(refundId).first<any>();
  if (!rf || rf.status !== "PENDING") return;
  const pay = await db.prepare("SELECT * FROM payments WHERE id = ?").bind(rf.payment_id).first<any>();
  const provider = getPaymentProvider(env);
  const b = await mustGet(env, rf.booking_id);
  if (!provider || provider.name !== pay.provider) {
    await db.prepare("UPDATE refunds SET attempts = attempts + 1, last_error = 'PROVIDER_UNAVAILABLE', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(rf.id).run();
    return;
  }
  // The refund id is the provider idempotency key: retries can never double-refund.
  const r = await provider.refund({ paymentKey: pay.provider_payment_key, amountMinor: rf.amount_minor, reason: rf.reason, idempotencyKey: rf.id });
  if (r.outcome === "SUCCEEDED") {
    const newRefunded = pay.refunded_minor + rf.amount_minor;
    const fullyRefunded = newRefunded >= pay.amount_minor;
    const hook = await loadPartnerHook(db, b.partner_id);
    await runBatch(db, [
      ...transition(db, b, "REFUNDED", { type: "PAYMENT_PROVIDER", id: provider.name }, null, {
        refunded_minor: b.refunded_minor + rf.amount_minor,
        refund_amount_krw: b.refunded_minor + rf.amount_minor,
        payment_status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
      }),
      db.prepare("UPDATE refunds SET status = 'SUCCEEDED', provider_refund_id = ?, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'").bind(r.refundId, rf.id),
      db.prepare("UPDATE payments SET refunded_minor = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(newRefunded, fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED", pay.id),
      ...journalStmts(db, L.refundPaid(rf.id, rf.amount_minor), b),
      ...hookEnqueueStmts(db, hook, "booking.cancelled", hookSnapshot(b, "REFUNDED", { refunded_minor: newRefunded, refund_id: rf.id })),
      // A fully refunded order must never stay payable (2026-11-09 audit [M]).
      // Partial refunds keep the settlement PENDING until the remainder settles.
      ...(fullyRefunded ? [db.prepare("UPDATE marketplace_order_settlements SET settlement_status = 'REFUNDED', fulfillment_status = 'FAILED' WHERE booking_id = ? AND settlement_status IN ('PENDING', 'HELD')").bind(b.id)] : []),
    ]);
    return;
  }
  const attempts = rf.attempts + 1;
  await db.prepare("UPDATE refunds SET attempts = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(attempts, r.message.slice(0, 300), rf.id).run();
  if (attempts >= MAX_REFUND_ATTEMPTS && b.status === "REFUND_PENDING") {
    await runBatch(db, transition(db, b, "MANUAL_REVIEW_REQUIRED", { type: "SYSTEM", id: null }, `REFUND_FAILED_AFTER_${attempts}_ATTEMPTS`));
  }
}

// ---------------------------------------------------------------------------
// 6. Customer cancellation
// ---------------------------------------------------------------------------
export function cancellationPreview(b: BookingRow): { feeMinor: number; refundMinor: number; policy: CancellationPolicy } {
  const policy: CancellationPolicy = JSON.parse(b.cancellation_policy_json || '{"type":"NON_REFUNDABLE","freeUntil":null,"feeBpsAfter":10000}');
  return { ...computeCancellation(policy, b.paid_minor, new Date()), policy };
}

export async function cancelByCustomer(env: Env, user: AuthUser, bookingId: string) {
  const db = env.DB;
  const b = await mustGet(env, bookingId);
  assertOwner(b, user);
  const actor: Actor = { type: user.role === "ADMIN" ? "ADMIN" : "CUSTOMER", id: user.id };
  if (!CUSTOMER_CANCELLABLE.includes(b.status)) {
    throw new HttpError(409, "NOT_CANCELLABLE", `현재 상태(${STATUS_LABEL_KO[b.status] || b.status})에서는 취소할 수 없습니다.`);
  }
  if (b.status === "AWAITING_PAYMENT") {
    const hook = await loadPartnerHook(db, b.partner_id);
    await runBatch(db, [
      ...transition(db, b, "CANCELLED", actor, "CANCELLED_BEFORE_PAYMENT"),
      db.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ?").bind(b.id),
      ...coinRestoreStmts(db, b),
      ...hookEnqueueStmts(db, hook, "booking.cancelled", hookSnapshot(b, "CANCELLED")),
    ]);
    return serializeBooking(env, await mustGet(env, b.id), user);
  }

  const { feeMinor, refundMinor } = cancellationPreview(b);
  await runBatch(db, transition(db, b, "CANCELLATION_REQUESTED", actor, null, { cancellation_fee_minor: feeMinor, cancellation_fee_krw: feeMinor }));
  let cur = await mustGet(env, b.id);
  const supplier = await loadSupplier(env, b.supplier_id);
  const adapter = adapterFor(supplier?.adapter || "none");
  const t0 = Date.now();
  const cx = await adapter.cancel(supplierCtx(cur, 1));
  await logSupplierCall(env, b.supplier_id, b.id, "CANCEL", cx.outcome, Date.now() - t0, JSON.stringify(cx));

  if (cx.outcome === "REJECTED") {
    await runBatch(db, transition(db, cur, b.status as BookingStatus, { type: "SUPPLIER", id: b.supplier_id }, `SUPPLIER_REJECTED_CANCEL`, { cancellation_fee_minor: 0, cancellation_fee_krw: 0 }));
    throw new HttpError(409, "SUPPLIER_REJECTED_CANCELLATION", `공급사가 취소를 거절했습니다: ${cx.message}`);
  }
  if (cx.outcome === "UNKNOWN") {
    await runBatch(db, transition(db, cur, "MANUAL_REVIEW_REQUIRED", { type: "SUPPLIER", id: b.supplier_id }, "SUPPLIER_CANCEL_UNKNOWN"));
    return serializeBooking(env, await mustGet(env, b.id), user);
  }

  // Supplier cancelled: reverse revenue recognition, retain fee, refund the rest.
  const wasRecognized = ["VOUCHER_ISSUED", "TICKETED"].includes(b.status);
  const split = L.recognitionSplit(b.paid_minor, Math.round(Number(b.discount_amount_krw || 0)), supplier?.settlement_rate_bps ?? 9000);
  const ledger = [
    ...(wasRecognized ? journalStmts(db, L.fulfilmentReversed(b.id, b.paid_minor, split), cur) : []),
    ...journalStmts(db, L.cancellationFeeRetained(b.id, feeMinor), cur),
    db.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ?").bind(b.id),
    db.prepare("UPDATE booking_items SET supplier_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?").bind(b.id),
    // The coin portion is always restored in full on cancel; any fee comes from cash.
    ...coinRestoreStmts(db, b),
  ];
  if (refundMinor <= 0) {
    const hook = await loadPartnerHook(db, b.partner_id);
    await runBatch(db, [...transition(db, cur, "CANCELLED", { type: "SUPPLIER", id: b.supplier_id }, "CANCELLED_NO_REFUND_DUE", { supplier_status: "CANCELLED" }), ...ledger,
      ...hookEnqueueStmts(db, hook, "booking.cancelled", hookSnapshot(b, "CANCELLED"))]);
    return serializeBooking(env, await mustGet(env, b.id), user);
  }
  await runBatch(db, [...transition(db, cur, "REFUND_PENDING", { type: "SUPPLIER", id: b.supplier_id }, null, { supplier_status: "CANCELLED" }), ...ledger]);
  cur = await mustGet(env, b.id);
  await startRefund(env, cur, refundMinor, "고객 요청 취소 환불");
  return serializeBooking(env, await mustGet(env, b.id), user);
}

// ---------------------------------------------------------------------------
// 7. Expiry & reconciliation (cron)
// ---------------------------------------------------------------------------
export async function expireBooking(env: Env, b: BookingRow, reason: string): Promise<void> {
  if (b.status !== "AWAITING_PAYMENT") return;
  try {
    await runBatch(env.DB, [
      ...transition(env.DB, b, "EXPIRED", { type: "SYSTEM", id: null }, reason),
      env.DB.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ? AND status = 'HELD'").bind(b.id),
      ...coinRestoreStmts(env.DB, b),
    ]);
  } catch (e) {
    if (!(e instanceof HttpError && e.code === "CONCURRENT_MODIFICATION")) throw e;
  }
}

/**
 * Resolve one UNKNOWN payment by asking the PG for the truth, then apply the
 * same capture/fail transitions the confirm flow would have used. Shared by the
 * maintenance cron and the PG webhook: both are just triggers for a lookup.
 * Only UNKNOWN payments on MANUAL_REVIEW_REQUIRED bookings move; everything
 * else is left for its owning flow (single-writer invariant for money state).
 */
export async function reconcilePaymentByLookup(env: Env, paymentId: string): Promise<"RECONCILED" | "SKIPPED"> {
  const provider = getPaymentProvider(env);
  if (!provider) return "SKIPPED";
  const p = await env.DB.prepare("SELECT * FROM payments WHERE id = ?").bind(paymentId).first<any>();
  if (!p || p.status !== "UNKNOWN" || p.provider !== provider.name) return "SKIPPED";
  const r = await provider.lookup({ orderId: p.booking_id, paymentKey: p.provider_payment_key, amountMinor: p.amount_minor });
  const b = await mustGet(env, p.booking_id);
  if (b.status !== "MANUAL_REVIEW_REQUIRED") return "SKIPPED";
  if (r.outcome === "CAPTURED" && r.amountMinor === p.amount_minor) {
    const hook = await loadPartnerHook(env.DB, b.partner_id);
    await runBatch(env.DB, [
      ...transition(env.DB, b, "PAYMENT_AUTHORIZED", { type: "PAYMENT_PROVIDER", id: provider.name }, "RECONCILED_CAPTURED", { payment_status: "CAPTURED", paid_minor: r.amountMinor }),
      env.DB.prepare("UPDATE payments SET status = 'CAPTURED', provider_payment_key = ?, method = ?, approved_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(r.paymentKey, r.method, r.approvedAt, p.id),
      env.DB.prepare("UPDATE inventory_holds SET status = 'COMMITTED' WHERE booking_id = ? AND status = 'HELD'").bind(b.id),
      ...journalStmts(env.DB, L.paymentCaptured(p.id, r.amountMinor), b),
      ...hookEnqueueStmts(env.DB, hook, "booking.created", hookSnapshot(b, "PAYMENT_AUTHORIZED", { paid_minor: r.amountMinor, payment_id: p.id })),
    ]);
    await fulfil(env, await mustGet(env, b.id));
    return "RECONCILED";
  }
  if (r.outcome === "NOT_CAPTURED") {
    await runBatch(env.DB, [
      ...transition(env.DB, b, "FAILED", { type: "PAYMENT_PROVIDER", id: provider.name }, "RECONCILED_NOT_CAPTURED", { payment_status: "FAILED" }),
      env.DB.prepare("UPDATE payments SET status = 'FAILED', failure_code = 'NOT_CAPTURED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(p.id),
      env.DB.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ?").bind(b.id),
    ]);
    return "RECONCILED";
  }
  return "SKIPPED";
}

/**
 * Fire one-shot price alerts whose tracked product hit the target price.
 * Alerts pointing at missing/unsellable products are left for the next run.
 * Generic ("general") alerts with no product carry no price signal and are skipped.
 */
export async function firePriceAlerts(env: Env): Promise<number> {
  const alerts = await env.DB.prepare(
    "SELECT id, email, domain_type, item_id, route_or_hotel, target_price FROM price_alerts WHERE is_active = 1 AND item_id IS NOT NULL AND item_id != 'general' LIMIT 100",
  ).all<any>();
  let fired = 0;
  for (const a of alerts.results || []) {
    let current: number | null = null;
    try {
      const dom = String(a.domain_type);
      if (!isDomain(dom)) continue;
      current = Number((await loadProduct(env, dom, String(a.item_id), null)).unitPriceMajor);
    } catch {
      continue;
    }
    if (!Number.isFinite(current) || current > Number(a.target_price)) continue;
    const done = await env.DB.batch([
      env.DB.prepare("UPDATE price_alerts SET is_active = 0 WHERE id = ? AND is_active = 1").bind(a.id),
      outboxInsert(env.DB, "EMAIL", String(a.email), "PRICE_ALERT", {
        routeOrHotel: String(a.route_or_hotel), targetPrice: Number(a.target_price), currentPrice: current,
      }),
    ]);
    if (done[0].meta.changes) fired++;
  }
  return fired;
}

/**
 * Complete fulfilled bookings whose service window has fully passed.
 * COMPLETED is otherwise a dead terminal state (nothing ever writes it);
 * the cron walks TICKETED/VOUCHER_ISSUED rows past service_end through the
 * state machine with full history (2026-11-09 audit [m]).
 */
export async function completePastBookings(env: Env): Promise<number> {
  const rows = await env.DB.prepare(
    "SELECT id FROM bookings WHERE status IN ('TICKETED', 'VOUCHER_ISSUED') AND service_end < date('now') ORDER BY service_end LIMIT 50",
  ).all<{ id: string }>();
  let done = 0;
  for (const r of rows.results || []) {
    const b = await getBooking(env, r.id);
    if (!b || (b.status !== "TICKETED" && b.status !== "VOUCHER_ISSUED")) continue;
    try {
      await runBatch(env.DB, [...transition(env.DB, b, "COMPLETED", { type: "SYSTEM", id: null }, "SERVICE_WINDOW_ELAPSED")]);
      done++;
    } catch {
      // Raced with a customer cancel/refund: leave it for the next run.
    }
  }
  return done;
}

export async function runMaintenance(env: Env): Promise<Record<string, number>> {
  const stats = { expired: 0, paymentsReconciled: 0, refundsRetried: 0, quotesExpired: 0, emailsSent: 0, emailsPending: 0, webhooksSent: 0, webhooksPending: 0, rowsPruned: 0, alertsFired: 0, completed: 0 };
  const now = nowIso();
  const stale = await env.DB.prepare("SELECT * FROM bookings WHERE status = 'AWAITING_PAYMENT' AND inventory_lock_expires_at <= ? LIMIT 100").bind(now).all<BookingRow>();
  for (const b of stale.results || []) {
    await expireBooking(env, b, "PAYMENT_WINDOW_ELAPSED");
    stats.expired++;
  }
  const q = await env.DB.prepare("UPDATE quotes SET status = 'EXPIRED' WHERE status = 'ACTIVE' AND expires_at <= ?").bind(now).run();
  stats.quotesExpired = q.meta.changes || 0;

  // Payments whose outcome was unknown: ask the PG what really happened.
  const unknown = await env.DB.prepare("SELECT p.id FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE p.status = 'UNKNOWN' LIMIT 50").all<{ id: string }>();
  for (const p of unknown.results || []) {
    if ((await reconcilePaymentByLookup(env, p.id)) === "RECONCILED") stats.paymentsReconciled++;
  }
  const pending = await env.DB.prepare("SELECT id FROM refunds WHERE status = 'PENDING' AND attempts < ? LIMIT 50").bind(MAX_REFUND_ATTEMPTS).all<{ id: string }>();
  for (const r of pending.results || []) {
    await processRefund(env, r.id);
    stats.refundsRetried++;
  }
  const mail = await flushOutbox(env);
  stats.emailsSent = mail.sent;
  stats.emailsPending = mail.pending;
  const hooks = await flushPartnerWebhooks(env);
  stats.webhooksSent = hooks.sent;
  stats.webhooksPending = hooks.pending;
  stats.alertsFired = await firePriceAlerts(env);
  stats.completed = await completePastBookings(env);
  // Ephemeral rows must not grow forever: rate-limit buckets older than any window,
  // spent txn-guard rows, and dead password-reset tokens.
  const epoch = Math.floor(Date.now() / 1000);
  const pruned = await env.DB.batch([
    env.DB.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").bind(epoch - 86400),
    env.DB.prepare("DELETE FROM txn_guards WHERE id < (SELECT COALESCE(MAX(id), 0) - 5000 FROM txn_guards)"),
    env.DB.prepare("DELETE FROM password_reset_tokens WHERE used = 1 OR expires_at < ?").bind(epoch),
    env.DB.prepare("DELETE FROM idempotency_keys WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')"),
    env.DB.prepare("DELETE FROM revoked_tokens WHERE expires_at < ?").bind(epoch),
    env.DB.prepare("DELETE FROM quotes WHERE status = 'EXPIRED' AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')"),
    env.DB.prepare("DELETE FROM inventory_holds WHERE status = 'RELEASED' AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')"),
    env.DB.prepare("DELETE FROM notification_outbox WHERE status = 'SENT' AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')"),
    env.DB.prepare("DELETE FROM affiliate_clicks WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days') AND status != 'CONVERTED'"),
  ]);
  stats.rowsPruned = pruned.reduce((n, r) => n + (r.meta.changes || 0), 0);
  return stats;
}

// ---------------------------------------------------------------------------
// 8. Operator actions (admin OMS)
// ---------------------------------------------------------------------------
export async function adminSupplierDecision(env: Env, decider: AuthUser, bookingId: string, body: any) {
  const b = await mustGet(env, bookingId);
  const decision = str(body.decision, 20).toUpperCase();
  // Operators act as ADMIN; partners deciding their own orders act as the SUPPLIER of record.
  const actor: Actor = decider.role === "PARTNER" ? { type: "SUPPLIER", id: decider.id } : { type: "ADMIN", id: decider.id };
  const note = str(body.note, 300) || null;
  const db = env.DB;
  if (decision === "CONFIRM") {
    const reference = str(body.supplierReference, 80);
    if (!reference) throw new HttpError(400, "SUPPLIER_REFERENCE_REQUIRED", "공급사 확정번호를 입력해야 확정할 수 있습니다.");
    if (b.payment_status !== "CAPTURED") throw new HttpError(409, "NOT_PAID", "결제가 확인되지 않은 예약은 확정할 수 없습니다.");
    await runBatch(db, [
      ...transition(db, b, "SUPPLIER_CONFIRMED", actor, note || "OPERATOR_CONFIRMED", { supplier_status: "CONFIRMED", supplier_reference: reference }),
      db.prepare("UPDATE booking_items SET supplier_status = 'CONFIRMED', supplier_reference = ?, pnr = COALESCE(?, pnr), updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?")
        .bind(reference, body.pnr ? str(body.pnr, 10) : null, b.id),
    ]);
    return issue(env, await mustGet(env, b.id));
  }
  if (decision === "REJECT") {
    if (b.payment_status !== "CAPTURED") {
      await runBatch(db, transition(db, b, "FAILED", actor, note || "OPERATOR_REJECTED_UNPAID"));
      return mustGet(env, b.id);
    }
    await runBatch(db, [
      ...transition(db, b, "REFUND_PENDING", actor, note || "OPERATOR_REJECTED", { supplier_status: "FAILED" }),
      db.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ?").bind(b.id),
    ]);
    const cur = await mustGet(env, b.id);
    await startRefund(env, cur, cur.paid_minor - cur.refunded_minor, "운영자 확정 거절 전액 환불");
    return mustGet(env, b.id);
  }
  if (decision === "RETRY_REFUND") {
    const pending = await db.prepare("SELECT id FROM refunds WHERE booking_id = ? AND status = 'PENDING'").bind(b.id).all<{ id: string }>();
    if (b.status === "MANUAL_REVIEW_REQUIRED" && (pending.results || []).length) {
      await runBatch(db, transition(db, b, "REFUND_PENDING", actor, note || "OPERATOR_RETRY_REFUND"));
      await db.prepare("UPDATE refunds SET attempts = 0 WHERE booking_id = ? AND status = 'PENDING'").bind(b.id).run();
    }
    for (const r of pending.results || []) await processRefund(env, r.id);
    return mustGet(env, b.id);
  }
  throw new HttpError(400, "INVALID_DECISION", "decision은 CONFIRM | REJECT | RETRY_REFUND 중 하나여야 합니다.");
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------
export async function serializeBooking(env: Env, b: BookingRow, viewer: AuthUser | null) {
  const db = env.DB;
  const [items, travelers, payments, refunds, history] = await Promise.all([
    db.prepare("SELECT domain_type, item_id, unit_id, title, service_start, service_end, quantity, total_minor, supplier_status, supplier_reference, pnr, ticket_numbers_json, voucher_code FROM booking_items WHERE booking_id = ?").bind(b.id).all<any>(),
    db.prepare("SELECT traveler_type, last_name_en, first_name_en, birth_date, nationality, passport_enc, passport_expiry, is_lead FROM booking_travelers WHERE booking_id = ? ORDER BY is_lead DESC").bind(b.id).all<any>(),
    db.prepare("SELECT id, provider, mode, amount_minor, refunded_minor, status, method, approved_at, failure_message, created_at FROM payments WHERE booking_id = ? ORDER BY created_at").bind(b.id).all<any>(),
    db.prepare("SELECT id, amount_minor, status, reason, attempts, created_at, updated_at FROM refunds WHERE booking_id = ? ORDER BY created_at").bind(b.id).all<any>(),
    db.prepare("SELECT from_status, to_status, actor_type, reason, created_at FROM booking_status_history WHERE booking_id = ? ORDER BY created_at, rowid").bind(b.id).all<any>(),
  ]);
  const fulfilled = ["VOUCHER_ISSUED", "TICKETED", "COMPLETED"].includes(b.status);
  let preview = null;
  if (["SUPPLIER_CONFIRMED", "VOUCHER_ISSUED", "TICKETED"].includes(b.status)) preview = cancellationPreview(b);
  let details: any = {};
  try {
    details = JSON.parse(b.details_json || "{}");
  } catch {}
  return {
    id: b.id,
    bookingNumber: b.booking_number,
    domain: b.domain_type,
    itemId: b.item_id,
    title: b.title,
    status: b.status,
    statusLabel: STATUS_LABEL_KO[b.status] || b.status,
    statusReason: b.status_reason,
    isConfirmed: fulfilled,
    paymentStatus: b.payment_status,
    supplierStatus: b.supplier_status,
    paymentMode: b.payment_mode,
    currency: b.currency,
    totalMinor: b.total_minor,
    paidMinor: b.paid_minor,
    refundedMinor: b.refunded_minor,
    coinsUsedMinor: Number(b.trip_coins_used || 0),
    cancellationFeeMinor: b.cancellation_fee_minor,
    serviceStart: b.service_start,
    serviceEnd: b.service_end,
    paymentDeadline: b.status === "AWAITING_PAYMENT" ? b.inventory_lock_expires_at : null,
    cancellationPolicy: JSON.parse(b.cancellation_policy_json || "null"),
    cancellationPreview: preview ? { feeMinor: preview.feeMinor, refundMinor: preview.refundMinor } : null,
    canCancel: CUSTOMER_CANCELLABLE.includes(b.status),
    contact: { name: b.customer_name, email: b.customer_email, phone: b.customer_phone },
    travelersRequested: details.travelers || null,
    items: (items.results || []).map((i: any) => ({
      ...i,
      // Voucher / ticket numbers are only exposed once actually issued.
      voucher_code: fulfilled ? i.voucher_code : null,
      ticket_numbers: fulfilled && i.ticket_numbers_json ? JSON.parse(i.ticket_numbers_json) : [],
      ticket_numbers_json: undefined,
    })),
    travelers: (travelers.results || []).map((t: any) => ({
      type: t.traveler_type, lastNameEn: t.last_name_en, firstNameEn: t.first_name_en, birthDate: t.birth_date, nationality: t.nationality,
      passport: t.passport_enc ? "등록됨 (암호화 저장)" : null, passportExpiry: t.passport_expiry, isLead: t.is_lead === 1,
    })),
    payments: payments.results || [],
    refunds: refunds.results || [],
    history: history.results || [],
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}


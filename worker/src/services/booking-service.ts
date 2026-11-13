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
import { computeQuote, computeRoundTripQuote, computeCancellation, isDomain, QuoteError, type CancellationPolicy, type Domain, type CatalogProduct, type LegResult, type NightlyRateFn, type Promotion, type QuoteParams, type QuoteResult, type SlotPrice } from "../domain/pricing.ts";
import { assertTransition, CUSTOMER_CANCELLABLE, STATUS_LABEL_KO, type BookingStatus } from "../domain/state-machine.ts";
import * as L from "../domain/ledger.ts";
import { convertMinor } from "../domain/money.ts";
import { HttpError, clientIp, str } from "../lib/http.ts";
import { consentStmts, currentVersions, validateTxConsents } from "../lib/consents.ts";
import { newBookingNumber, newId, encryptField, decryptField, randomToken } from "../lib/crypto.ts";
import type { AuthUser } from "../lib/auth.ts";
import { loadProduct, loadStructuredPolicy, loadSupplier, bookabilityOf, assertTicketable, assertQuotableDomain, assertInventoryConfigured, type SupplierRow } from "./catalog.ts";
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

/**
 * #119: structured money-event log (one JSON line per outcome). Sentry already
 * captures money-path EXCEPTIONS via the global catch; these lines cover the
 * business outcomes (captures, declines, refunds, payouts) that never throw.
 */
export function moneyLog(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: nowIso(), svc: "money", event, ...fields }));
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------
function guard(db: D1Database, b: Pick<BookingRow, "id" | "version" | "status">, label: string): Stmt {
  return db.prepare("INSERT INTO txn_guards (ok, label) SELECT COUNT(*), ? FROM bookings WHERE id = ? AND version = ? AND status = ?").bind(label, b.id, b.version, b.status);
}

/** #80: the product row's owning partner, or null when it names no real partners row. */
const PARTNER_OWNER_TABLES: Record<string, string> = {
  HOTEL: "hotels",
  FLIGHT: "flights",
  CAR: "cars",
  ACTIVITY: "activities",
  TRANSFER: "transfers",
  TRAIN: "trains",
  PACKAGE: "packages",
};

async function resolveBookingPartnerId(db: D1Database, domain: string, itemId: string): Promise<string | null> {
  const table = PARTNER_OWNER_TABLES[domain];
  if (!table) return null;
  const row = await db.prepare(`SELECT partner_id AS pid FROM ${table} WHERE id = ?`).bind(itemId).first<{ pid: string | null }>();
  if (!row?.pid) return null;
  const real = await db.prepare("SELECT id FROM partners WHERE id = ?").bind(row.pid).first();
  return real ? row.pid : null;
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

/**
 * Idempotent restore for the refund flow: customer-cancel paths already
 * restore coins up front (cancelByCustomer), so platform-failure refunds
 * must skip when a COIN_REFUNDED row exists. Without the guard the same
 * booking would pay twice (P0 2026-11-10: coins vanished on every
 * platform-side failure because processRefund never restored them).
 */
async function coinRestoreStmtsOnce(db: D1Database, b: Pick<BookingRow, "id" | "user_id" | "trip_coins_used">): Promise<Stmt[]> {
  const used = Number(b.trip_coins_used || 0);
  if (!Number.isSafeInteger(used) || used <= 0) return [];
  const done = await db.prepare("SELECT 1 AS x FROM coin_ledger WHERE reference_id = ? AND reason = 'COIN_REFUNDED' LIMIT 1").bind(b.id).first();
  return done ? [] : coinRestoreStmts(db, b);
}

/**
 * #14: give the booking's coupon back on cancel/fail/expire. The promo-cap
 * decrement runs FIRST so it still observes the consumed claim (is_used = 1);
 * the claim restore runs after. Second runs are no-ops (claim already 0, and
 * the decrement requires a consumed claim), so every cancel path lands
 * exactly-once without a separate idempotency ledger.
 */
function couponRestoreStmts(db: D1Database, userId: string, quoteId: string | null): Stmt[] {
  if (!userId || !quoteId) return [];
  return [
    db.prepare(`UPDATE promotions SET used_count = used_count - 1
       WHERE code = (SELECT promotion_code FROM quotes WHERE id = ?) AND used_count > 0
         AND EXISTS (SELECT 1 FROM user_coupons WHERE user_id = ? AND coupon_code = (SELECT promotion_code FROM quotes WHERE id = ?) AND is_used = 1)`)
      .bind(quoteId, userId, quoteId),
    db.prepare("UPDATE user_coupons SET is_used = 0 WHERE user_id = ? AND coupon_code = (SELECT promotion_code FROM quotes WHERE id = ?) AND is_used = 1")
      .bind(userId, quoteId),
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

/**
 * Recognition reversal owed before a refund's REFUND_PAID journal. Ledger-state
 * driven (recognized minus already-reversed), so every refund path — customer,
 * admin, offline, external — lands exactly-once idempotent journals: the
 * customer path pre-posts at request time and no-ops here, the others post.
 */
async function recognitionReversalStmts(env: Env, db: D1Database, b: Pick<BookingRow, "id" | "entity_id" | "supplier_id" | "currency" | "paid_minor" | "discount_amount_krw">, takeMinor: number, referenceId?: string): Promise<Stmt[]> {
  const paid = Number(b.paid_minor || 0);
  if (!Number.isSafeInteger(takeMinor) || takeMinor <= 0 || !Number.isSafeInteger(paid) || paid <= 0) return [];
  const row = await db.prepare(
    `SELECT COALESCE((SELECT SUM(amount_minor) FROM ledger_entries WHERE booking_id = ? AND event_type = 'FULFILMENT_RECOGNIZED' AND account = 'CUSTOMER_DEPOSITS' AND direction = 'DEBIT'), 0) AS rec,
            COALESCE((SELECT SUM(amount_minor) FROM ledger_entries WHERE booking_id = ? AND event_type = 'FULFILMENT_REVERSED' AND account = 'CUSTOMER_DEPOSITS' AND direction = 'CREDIT'), 0) AS rev`
  ).bind(b.id, b.id).first<any>();
  const remaining = Math.min(Number(row?.rec || 0), paid) - Number(row?.rev || 0);
  const take = Math.min(takeMinor, Math.max(remaining, 0));
  if (take <= 0) return [];
  const supplier = await loadSupplier(env, b.supplier_id).catch(() => null);
  const split = L.recognitionSplit(paid, Math.round(Number(b.discount_amount_krw || 0)), (supplier as any)?.settlement_rate_bps ?? 9000);
  // The reference is per-refund (not per-booking): repeated partial reversals
  // on a live order must not collide on idx_ledger_event_once.
  return journalStmts(db, L.fulfilmentReversedPartial(b.id, take, split, paid, referenceId || b.id), b);
}

/** Retained remainder not yet journaled as cancellation-fee revenue (B7 partials). */
async function unrecordedFeeMinor(db: D1Database, bookingId: string, paidMinor: number, totalRefundedAfterMinor: number): Promise<number> {
  const fee = Number(paidMinor || 0) - Number(totalRefundedAfterMinor || 0);
  if (!Number.isSafeInteger(fee) || fee <= 0) return 0;
  const row = await db.prepare(
    "SELECT COALESCE(SUM(amount_minor), 0) AS f FROM ledger_entries WHERE booking_id = ? AND event_type = 'CANCELLATION_FEE' AND account = 'CANCELLATION_FEE_REVENUE' AND direction = 'CREDIT'"
  ).bind(bookingId).first<any>();
  return Math.max(fee - Number(row?.f || 0), 0);
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

/** #73: the single-flight PENDING index (0039) turns a racing second refund into a 409, never a 500. */
export function throwOnRefundConflict(e: unknown): never {
  const m = String((e as any)?.message || e);
  if (m.includes("idx_refunds_one_pending") || m.includes("UNIQUE constraint failed: refunds")) {
    throw new HttpError(409, "REFUND_IN_PROGRESS", "이미 진행 중인 환불이 있습니다. 완료 후 다시 시도해주세요.");
  }
  throw e;
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

function priceOrder(product: CatalogProduct, inbound: CatalogProduct | null, params: QuoteParams, promo: Promotion | null, nightly?: NightlyRateFn | null, slot?: SlotPrice | null): QuoteResult & { legs?: [LegResult, LegResult] } {
  try {
    return inbound ? computeRoundTripQuote(product, inbound, params, promo, new Date(), nightly) : computeQuote(product, params, promo, new Date(), nightly, slot);
  } catch (e) {
    quoteErr(e);
  }
}

/**
 * Partner calendar price overrides for the quoted products/dates. Exact unit
 * wins, then the "default" row — the same precedence availableUnits uses for
 * allotments (P0 2026-11-10: price_override_minor was written but never read,
 * so calendar prices were silently ignored).
 */
async function loadNightlyOverrides(env: Env, itemIds: string[], unitKey: string, fromDate: string, toDate: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!itemIds.length) return map;
  const rows = await env.DB.prepare(
    `SELECT item_id, service_date, price_override_minor FROM partner_inventory
     WHERE item_id IN (${itemIds.map(() => "?").join(",")}) AND service_date BETWEEN ? AND ?
     AND price_override_minor IS NOT NULL AND (unit_id = ? OR unit_id = 'default')
     ORDER BY service_date, CASE WHEN unit_id = ? THEN 0 ELSE 1 END`,
  ).bind(...itemIds, fromDate, toDate, unitKey, unitKey).all<{ item_id: string; service_date: string; price_override_minor: number }>();
  for (const r of rows.results || []) {
    const k = `${r.item_id}|${r.service_date}`;
    if (!map.has(k) && Number.isSafeInteger(Number(r.price_override_minor))) map.set(k, Number(r.price_override_minor));
  }
  return map;
}

function nightlyResolver(map: Map<string, number>): NightlyRateFn {
  return (itemId: string, date: string) => map.get(`${itemId}|${date}`) ?? null;
}

const ACTIVE_HOLD_SUM = "SELECT COALESCE(SUM(quantity), 0) FROM inventory_holds WHERE item_id = ? AND unit_key = ? AND service_date = ? AND (status = 'COMMITTED' OR (status = 'HELD' AND expires_at > ?))";
// #38: partner-calendar allotment for one (item, unit, date): exact unit
// first, then the "default" row — the same precedence availableUnits() uses.
// Closed dates yield 0; no row yields NULL so callers COALESCE to catalog capacity.
const CALENDAR_CAP_SUM = "SELECT CASE WHEN is_closed = 1 THEN 0 ELSE allocated_units END FROM partner_inventory WHERE item_id = ? AND service_date = ? AND (unit_id = ? OR unit_id = 'default') ORDER BY CASE WHEN unit_id = ? THEN 0 ELSE 1 END LIMIT 1";

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
    // Closed dates read as fully consumed: negative while holds exist, so a
    // revalidation that adds back its own holds still fails (#38). Quote and
    // booking checks (`avail < qty`, qty >= 1) behave exactly as before.
    if (Number(ov.is_closed) === 1) return -used;
    return Number(ov.allocated_units) - used;
  }
  return capacity - used;
}

/**
 * #104: resolve an activity time slot for pricing and claiming. Returns the
 * slot row plus pricing, or throws when the slot is missing/closed/sold-out
 * for the requested quantity. The QUOTE-TIME check is informational (another
 * booking may take the last seat first); the BOOKING-TIME claim below is the
 * atomic authority.
 */
async function resolveSlotPricing(env: Env, domain: string, itemId: string, date: string, slotStart: string | null | undefined, qty: number): Promise<{ slotId: string; slot: SlotPrice } | null> {
  if (!slotStart) return null;
  if (domain !== "ACTIVITY") throw new HttpError(400, "SLOT_UNSUPPORTED_DOMAIN", "시간대 지정은 투어·티켓 상품에만 적용됩니다.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(slotStart)) throw new HttpError(400, "INVALID_SLOT_TIME", "slotStart는 HH:MM 형식이어야 합니다.");
  const row = await env.DB.prepare("SELECT id, end_time, max_capacity, booked_count, price_adult_minor, price_child_minor, is_closed FROM activity_time_slots WHERE activity_id = ? AND slot_date = ? AND start_time = ?").bind(itemId, date, slotStart).first<any>();
  if (!row) throw new HttpError(404, "SLOT_NOT_FOUND", "해당 날짜·시간대 슬롯이 없습니다.");
  if (Number(row.is_closed) === 1) throw new HttpError(409, "SLOT_CLOSED", "해당 시간대는 마감되었습니다.");
  if (Number(row.max_capacity) - Number(row.booked_count) < qty) throw new HttpError(409, "SLOT_SOLD_OUT", "해당 시간대의 잔여석이 부족합니다.");
  return { slotId: row.id, slot: { start: slotStart, end: row.end_time || null, adultMinor: Number(row.price_adult_minor), childMinor: Number(row.price_child_minor) } };
}

/** #104: atomic seat claim — exactly one concurrent booking wins each seat. */
async function claimSlotSeats(db: D1Database, slotId: string, qty: number): Promise<void> {
  const r = await db.prepare("UPDATE activity_time_slots SET booked_count = booked_count + ?, booked_count_updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_closed = 0 AND booked_count + ? <= max_capacity").bind(qty, slotId, qty).run();
  if (!r.meta.changes) throw new HttpError(409, "SLOT_SOLD_OUT", "해당 시간대의 잔여석이 부족합니다. 다른 시간대를 선택해주세요.");
}

async function releaseSlotSeats(db: D1Database, slotId: string, qty: number): Promise<void> {
  await db.prepare("UPDATE activity_time_slots SET booked_count = CASE WHEN booked_count - ? < 0 THEN 0 ELSE booked_count - ? END, booked_count_updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(qty, qty, slotId).run();
}

/**
 * #104: release a booking's slot claim exactly once (marker-guarded, so every
 * terminal path calls it safely). Async (reads first) like its callers.
 */
async function releaseSlotStmts(db: D1Database, bookingId: string): Promise<Stmt[]> {
  const rows = await db.prepare("SELECT slot_id, COALESCE(SUM(quantity), 0) AS qty FROM booking_items WHERE booking_id = ? AND slot_id IS NOT NULL AND slot_released_at IS NULL GROUP BY slot_id").bind(bookingId).all<any>();
  if (!(rows.results || []).length) return [];
  return [
    ...(rows.results || []).map((r: any) =>
      db.prepare("UPDATE activity_time_slots SET booked_count = CASE WHEN booked_count - ? < 0 THEN 0 ELSE booked_count - ? END, booked_count_updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(Number(r.qty) || 0, Number(r.qty) || 0, r.slot_id)),
    db.prepare("UPDATE booking_items SET slot_released_at = CURRENT_TIMESTAMP WHERE booking_id = ? AND slot_id IS NOT NULL AND slot_released_at IS NULL").bind(bookingId),
  ];
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

async function loadPromotion(env: Env, code: string | null, userId?: string | null): Promise<Promotion | null> {
  if (!code) return null;
  const p = await env.DB.prepare("SELECT * FROM promotions WHERE code = ?").bind(code.toUpperCase()).first<any>();
  if (!p) throw new HttpError(400, "PROMO_NOT_FOUND", "존재하지 않는 쿠폰 코드입니다.");
  // #14: a code alone is not a discount — the caller must hold an unused claim.
  if (userId) {
    const claim = await env.DB.prepare("SELECT is_used FROM user_coupons WHERE user_id = ? AND coupon_code = ?").bind(userId, p.code).first<any>();
    if (!claim) throw new HttpError(409, "COUPON_NOT_CLAIMED", "먼저 쿠폰을 받아주세요. (마이페이지 쿠폰함에서 받기)");
    if (Number(claim.is_used) !== 0) throw new HttpError(409, "COUPON_ALREADY_USED", "이미 사용한 쿠폰입니다.");
  }
  if (p.usage_limit !== null && p.usage_limit !== undefined && Number(p.used_count || 0) >= Number(p.usage_limit)) {
    throw new HttpError(409, "PROMO_EXHAUSTED", "쿠폰이 모두 소진되었습니다.");
  }
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
    slotStart: body.slotStart ? str(body.slotStart, 5) : null,
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
  assertQuotableDomain(domain);
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
  assertInventoryConfigured(domain, product);
  const entity = await activeEntity(env);
  if (!entity) throw new HttpError(503, "SALES_NOT_ENABLED", "판매 주체(사업자) 정보가 활성화되지 않아 결제를 받을 수 없습니다.");
  if (!getPaymentProvider(env)) throw new HttpError(503, "PAYMENTS_DISABLED", "현재 온라인 결제가 활성화되어 있지 않습니다. (PG 계약/설정 대기)");

  const inbound = await loadInbound(env, domain, params);
  // C6: snapshot the structured policy (if any) so refunds use the displayed tiers.
  product.structuredPolicy = await loadStructuredPolicy(env, domain, itemId);
  if (inbound) inbound.structuredPolicy = await loadStructuredPolicy(env, domain, inbound.itemId);
  const promo = await loadPromotion(env, body.promotionCode ? str(body.promotionCode, 40) : null, user.id);
  const ovDates = [params.startDate, params.endDate, params.returnDate].filter((d): d is string => !!d).sort();
  const nightly = nightlyResolver(ovDates.length
    ? await loadNightlyOverrides(env, inbound ? [product.itemId, inbound.itemId] : [product.itemId], product.unitId || "default", ovDates[0], ovDates[ovDates.length - 1])
    : new Map());
  // #104: a requested slot prices the quote (adult/child slot prices); the
  // seats themselves are claimed atomically at booking, not here.
  const slotQty = Number(params.travelers?.adults || 0) + Number(params.travelers?.children || 0);
  const slot = await resolveSlotPricing(env, domain, itemId, params.startDate, params.slotStart, slotQty);
  const q = priceOrder(product, inbound, params, promo, nightly, slot?.slot || null);
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
  // #13: a zero cash total has no PG path and would die on the quotes CHECK
  // with a 500 — refuse honestly instead (full-coin checkout is unsupported).
  if (!Number.isSafeInteger(cashDueMinor) || cashDueMinor <= 0) {
    throw new HttpError(400, "ZERO_TOTAL_UNSUPPORTED", "쿠폰·코인 적용 후 결제 금액이 0원이면 예약할 수 없습니다. 코인 전액 결제는 준비 중이며, 최소 1원은 카드로 결제해주세요.");
  }
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
    slot: slot ? { start: slot.slot.start, end: slot.slot.end } : null,
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

export async function createBooking(env: Env, user: AuthUser, body: any, idemKey: string | null, request?: Request) {
  if (!idemKey || !/^[A-Za-z0-9_-]{16,80}$/.test(idemKey)) {
    throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key 헤더가 필요합니다.");
  }
  // #14: replay before consuming anything — a retried booking must return the
  // winner, not burn a second coupon deduction (the catch below stays as the
  // race backstop for truly concurrent duplicates).
  const prior = await env.DB.prepare("SELECT id FROM bookings WHERE user_id = ? AND idempotency_key = ?").bind(user.id, idemKey).first<{ id: string }>();
  if (prior) return { replayed: true, booking: await serializeBooking(env, (await getBooking(env, prior.id))!, user) };
  const existing = await env.DB.prepare("SELECT id FROM bookings WHERE user_id = ? AND idempotency_key = ?").bind(user.id, idemKey).first<{ id: string }>();
  if (existing) return { replayed: true, booking: await serializeBooking(env, (await getBooking(env, existing.id))!, user) };

  const quote = await env.DB.prepare("SELECT * FROM quotes WHERE id = ?").bind(str(body.quoteId, 64)).first<any>();
  if (!quote || quote.user_id !== user.id) throw new HttpError(404, "QUOTE_NOT_FOUND", "견적을 찾을 수 없습니다. 다시 조회해주세요.");
  // Mandatory transaction consents (A3): refund policy, privacy, and the
  // supplier disclosure — each pinned to the current legal version.
  const txConsents = validateTxConsents(body, await currentVersions(env.DB));

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
  assertQuotableDomain(quote.domain_type);

  // Price revalidation against the live catalog before taking money.
  const params: QuoteParams = JSON.parse(quote.params_json);
  const product = await loadProduct(env, quote.domain_type, quote.item_id, quote.unit_id, params.ratePlanId ?? null);
  const inbound = await loadInbound(env, quote.domain_type, params);
  const supplier = (await loadSupplier(env, product.supplierId)) as SupplierRow;
  const bk = bookabilityOf(env, supplier);
  if (!bk.bookable) throw new HttpError(409, "NOT_DIRECTLY_BOOKABLE", "이 상품은 현재 직접 예약할 수 없습니다.", { reason: bk.reason });
  assertTicketable(quote.domain_type, supplier);
  assertInventoryConfigured(quote.domain_type, product);
  const freshDates = [params.startDate, params.endDate, params.returnDate].filter((d): d is string => !!d).sort();
  const freshNightly = nightlyResolver(freshDates.length
    ? await loadNightlyOverrides(env, inbound ? [product.itemId, inbound.itemId] : [product.itemId], product.unitId || "default", freshDates[0], freshDates[freshDates.length - 1])
    : new Map());
  // #104: re-resolve the quoted slot (a reprice/edit since quoting surfaces
  // as PRICE_CHANGED below, exactly like catalog drift).
  const slotQty = Number(params.travelers?.adults || 0) + Number(params.travelers?.children || 0);
  const freshSlot = await resolveSlotPricing(env, quote.domain_type, quote.item_id, quote.service_start, params.slotStart, slotQty);
  const fresh = priceOrder(product, inbound, params, await loadPromotion(env, quote.promotion_code, user.id), freshNightly, freshSlot?.slot || null);
  const coinsMinor = Number(quote.coins_minor || 0);
  const freshCashDue = fresh.totalMinor - coinsMinor;
  await assertAboveFloor(env, quote.domain_type, quote.item_id, freshCashDue);
  if (freshCashDue !== quote.total_minor) {
    await env.DB.prepare("UPDATE quotes SET status = 'EXPIRED' WHERE id = ?").bind(quote.id).run();
    throw new HttpError(409, "PRICE_CHANGED", "가격이 변경되었습니다. 변경된 금액을 확인해주세요.", { previousTotalMinor: quote.total_minor, newTotalMinor: freshCashDue });
  }
  // #38: the quote-time availability check is stale by now — the partner may
  // have closed the date or cut the allotment since. Re-check against the
  // live calendar BEFORE consuming coins/coupons; the guarded hold INSERT
  // below stays as the race backstop for concurrent bookings.
  const recheckQty = holdQuantity(quote.domain_type, params);
  for (const t of holdTargets(quote.domain_type, product, inbound, { serviceStart: quote.service_start, serviceEnd: quote.service_end, legs: fresh.legs })) {
    if ((await availableUnits(env, t.itemId, t.unitKey, t.date, t.capacity)) < recheckQty) {
      throw new HttpError(409, "SOLD_OUT", `${t.date} 일정의 잔여 재고가 부족합니다.`);
    }
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
  // #14: consume the coupon claim + promo cap atomically (conditional UPDATEs:
  // concurrent bookings cannot double-spend one claim or overshoot the cap).
  // Compensated below if the batch itself fails, like coins.
  let couponConsumed: string | null = null;
  let promoCounted: string | null = null;
  if (quote.promotion_code) {
    const c = await db.prepare("UPDATE user_coupons SET is_used = 1 WHERE user_id = ? AND coupon_code = ? AND is_used = 0").bind(user.id, quote.promotion_code).run();
    if (!c.meta.changes) {
      const w = await db.prepare("SELECT id FROM bookings WHERE user_id = ? AND idempotency_key = ?").bind(user.id, idemKey).first<{ id: string }>();
      if (w) return { replayed: true, booking: await serializeBooking(env, (await getBooking(env, w.id))!, user) };
      throw new HttpError(409, "COUPON_UNAVAILABLE", "쿠폰이 이미 사용되었거나 회수되었습니다. 쿠폰함에서 확인해주세요.");
    }
    couponConsumed = quote.promotion_code;
    const pc = await db.prepare("UPDATE promotions SET used_count = used_count + 1 WHERE code = ? AND (usage_limit IS NULL OR used_count < usage_limit)").bind(quote.promotion_code).run();
    if (!pc.meta.changes) {
      await db.prepare("UPDATE user_coupons SET is_used = 0 WHERE user_id = ? AND coupon_code = ?").bind(user.id, quote.promotion_code).run();
      couponConsumed = null;
      throw new HttpError(409, "PROMO_EXHAUSTED", "쿠폰이 모두 소진되었습니다.");
    }
    promoCounted = quote.promotion_code;
  }
  const compensatePromo = async () => {
    if (couponConsumed) await db.prepare("UPDATE user_coupons SET is_used = 0 WHERE user_id = ? AND coupon_code = ?").bind(user.id, couponConsumed).run();
    if (promoCounted) await db.prepare("UPDATE promotions SET used_count = used_count - 1 WHERE code = ? AND used_count > 0").bind(promoCounted).run();
    couponConsumed = null;
    promoCounted = null;
  };
  const lockExpires = new Date(Date.now() + PAYMENT_WINDOW_MS).toISOString();
  // #80: explicit partner attribution — the booking carries the product's
  // owning partner only when it names a real partners row. Supplier codes,
  // the unassigned_* markers, and platform/direct sales stay NULL instead of
  // colliding into the extranet by id equality.
  const bookingPartnerId = await resolveBookingPartnerId(db, quote.domain_type, quote.item_id);
  // #104: claim the slot seats atomically (conditional UPDATE — exactly one
  // concurrent booking wins each seat). Compensated below if the batch fails,
  // like coins and promos.
  let slotClaim: { slotId: string; qty: number } | null = null;
  if (freshSlot) {
    await claimSlotSeats(db, freshSlot.slotId, slotQty);
    slotClaim = { slotId: freshSlot.slotId, qty: slotQty };
  }
  const stmts: Stmt[] = [
    db.prepare(
      `INSERT INTO bookings (id, user_id, partner_id, booking_number, domain_type, item_id, title, discount_amount_krw,
        total_price, currency, status, customer_name, customer_email, customer_phone, details_json, inventory_lock_expires_at,
        quote_id, entity_id, supplier_id, total_minor, payment_status, supplier_status, idempotency_key, version, service_start, service_end,
        cancellation_policy_json, payment_mode, transaction_model, trip_coins_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'KRW', 'AWAITING_PAYMENT', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNPAID', 'NOT_REQUESTED', ?, 0, ?, ?, ?, ?, ?, ?)`
    ).bind(
      // #151: the base/tax/fee REAL twins go unwritten (no reader ever ran).
      // total_price stays: NOT NULL legacy column (removal needs a rebuild).
      // discount_amount_krw stays: the single functional discount store.
      id, user.id, bookingPartnerId, number, quote.domain_type, quote.item_id, quote.title, quote.discount_minor,
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
    ...(slotClaim ? [db.prepare("UPDATE booking_items SET slot_id = ? WHERE booking_id = ?").bind(slotClaim.slotId, id)] : []),
    db.prepare("UPDATE quotes SET status = 'CONSUMED' WHERE id = ?").bind(quote.id),
    db.prepare("INSERT INTO booking_status_history (id, booking_id, from_status, to_status, actor_type, actor_id, reason) VALUES (?, ?, NULL, 'AWAITING_PAYMENT', 'CUSTOMER', ?, 'BOOKING_CREATED')")
      .bind(newId("bsh"), id, user.id),
    ...(coinsMinor > 0
      ? [db.prepare("INSERT INTO coin_ledger (id, user_id, delta, reason, reference_id) VALUES (?, ?, ?, 'COIN_SPENT', ?)")
          .bind(newId("coin"), user.id, -coinsMinor, id)]
      : []),
    // #14: the coupon claim + promo cap were consumed atomically before the
    // batch (with compensation on failure) — nothing blind is written here.
    ...consentStmts(db, user.id, [
      { type: "REFUND_POLICY", version: txConsents.refundPolicy, agreed: true },
      { type: "PRIVACY", version: txConsents.privacy, agreed: true },
      { type: "THIRD_PARTY_SUPPLIER", version: txConsents.thirdParty, agreed: true, target: supplier.id },
    ], request ? clientIp(request) : null, request?.headers.get("User-Agent") ?? null),
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
  const targets = holdTargets(quote.domain_type, product, inbound, { serviceStart: quote.service_start, serviceEnd: quote.service_end, legs: fresh.legs });
  for (const t of targets) {
    stmts.push(
      db.prepare(
        `INSERT INTO inventory_holds (id, booking_id, domain_type, item_id, unit_key, service_date, quantity, status, expires_at)
         SELECT ?, ?, ?, ?, ?, ?, CASE WHEN COALESCE((${CALENDAR_CAP_SUM}), ?) - (${ACTIVE_HOLD_SUM}) >= ? THEN ? ELSE 0 END, 'HELD', ?`,
      ).bind(newId("hld"), id, quote.domain_type, t.itemId, t.unitKey, t.date, t.itemId, t.date, t.unitKey, t.unitKey, t.capacity, t.itemId, t.unitKey, t.date, nowIso(), qty, qty, lockExpires),
    );
  }
  try {
    await runBatch(db, stmts);
  } catch (e) {
    // A concurrent request with the same Idempotency-Key may have won the race.
    const winner = await env.DB.prepare("SELECT id FROM bookings WHERE user_id = ? AND idempotency_key = ?").bind(user.id, idemKey).first<{ id: string }>();
    if (slotClaim) await releaseSlotSeats(db, slotClaim.slotId, slotClaim.qty);
    if (winner) {
      if (coinsMinor > 0) {
        // The winner already spent its own coins: return this attempt's deduct.
        await db.prepare("UPDATE users SET trip_coins = trip_coins + ? WHERE id = ?").bind(coinsMinor, user.id).run();
        await db.prepare("INSERT INTO coin_ledger (id, user_id, delta, reason, reference_id) VALUES (?, ?, ?, 'COIN_SPENT_COMPENSATED', ?)")
          .bind(newId("coin"), user.id, coinsMinor, winner.id).run();
      }
      await compensatePromo();
      return { replayed: true, booking: await serializeBooking(env, (await getBooking(env, winner.id))!, user) };
    }
    if (coinsMinor > 0) {
      // No booking was created: return the pre-deducted coins.
      await db.prepare("UPDATE users SET trip_coins = trip_coins + ? WHERE id = ?").bind(coinsMinor, user.id).run();
      await db.prepare("INSERT INTO coin_ledger (id, user_id, delta, reason, reference_id) VALUES (?, ?, ?, 'COIN_SPENT_COMPENSATED', ?)")
        .bind(newId("coin"), user.id, coinsMinor, id).run();
    }
    await compensatePromo();
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
  // #38: the partner may have closed the date or cut the allotment after the
  // booking was made — never capture money for inventory that no longer
  // exists. Own HELD rows count as used inside availableUnits, so a revoked
  // calendar reads strictly negative here.
  const heldRows = await env.DB.prepare("SELECT item_id, unit_key, service_date, quantity FROM inventory_holds WHERE booking_id = ? AND status = 'HELD'").bind(b.id).all<{ item_id: string; unit_key: string; service_date: string; quantity: number }>();
  for (const h of heldRows.results || []) {
    const heldProduct = await loadProduct(env, b.domain_type, h.item_id, h.unit_key === "default" ? null : h.unit_key).catch(() => null);
    if (!heldProduct || heldProduct.capacity === null) continue;
    const own = Number(h.quantity) || 0;
    if ((await availableUnits(env, h.item_id, h.unit_key, h.service_date, heldProduct.capacity)) + own < own) {
      await expireBooking(env, b, "INVENTORY_REVOKED");
      throw new HttpError(409, "SOLD_OUT", "선택하신 일정의 재고가 판매자에 의해 마감되어 결제를 진행할 수 없습니다.");
    }
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

  // #70: the PG idempotency key must be per attempt, not per booking — a
  // retry with a fresh paymentKey under `confirm_${b.id}` is rejected by the
  // PG as a duplicate. paymentId is minted per attempt above (same convention
  // as the mismatch_* refund key below).
  const r = await provider.confirm({ orderId: b.id, paymentKey, amountMinor: b.total_minor, currency: b.currency, idempotencyKey: `confirm_${paymentId}` });

  if (r.outcome === "CAPTURED" && r.amountMinor !== b.total_minor) {
    // Provider captured a different amount: never accept; refund immediately.
    await provider.refund({ paymentKey: r.paymentKey, amountMinor: r.amountMinor, reason: "AMOUNT_MISMATCH", idempotencyKey: `mismatch_${paymentId}` });
    await runBatch(db, [
      ...transition(db, cur, "FAILED", { type: "PAYMENT_PROVIDER", id: provider.name }, "PG_AMOUNT_MISMATCH_REFUNDED", { payment_status: "FAILED" }),
      db.prepare("UPDATE payments SET status = 'FAILED', failure_code = 'AMOUNT_MISMATCH', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(paymentId),
      db.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ? AND status = 'HELD'").bind(b.id),
      ...(await releaseSlotStmts(db, b.id)),
      ...coinRestoreStmts(db, cur),
      ...couponRestoreStmts(db, cur.user_id, cur.quote_id),
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
      outboxInsert(db, "EMAIL", b.customer_email, "PAYMENT_COMPLETED", { bookingId: b.id, bookingNumber: b.booking_number, amountMinor: r.amountMinor }),
    ]);
    cur = await fulfil(env, await mustGet(env, b.id));
    moneyLog("payment.captured", { bookingId: b.id, paymentId, amountMinor: r.amountMinor, provider: provider.name });
    return { alreadyProcessed: false, booking: await serializeBooking(env, cur, user) };
  }

  if (r.outcome === "FAILED") {
    await runBatch(db, [
      ...transition(db, cur, "AWAITING_PAYMENT", { type: "PAYMENT_PROVIDER", id: provider.name }, `PAYMENT_FAILED:${r.code}`),
      db.prepare("UPDATE payments SET status = 'FAILED', failure_code = ?, failure_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(r.code, r.message.slice(0, 300), paymentId),
    ]);
    moneyLog("payment.failed", { bookingId: b.id, paymentId, providerCode: r.code, provider: provider.name });
    throw new HttpError(402, "PAYMENT_FAILED", r.message, { providerCode: r.code });
  }

  // UNKNOWN: we do not know whether money moved. Never assume either way.
  await runBatch(db, [
    ...transition(db, cur, "MANUAL_REVIEW_REQUIRED", { type: "PAYMENT_PROVIDER", id: provider.name }, "PAYMENT_STATUS_UNKNOWN"),
    db.prepare("UPDATE payments SET status = 'UNKNOWN', failure_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(r.message, paymentId),
  ]);
  moneyLog("payment.unknown", { bookingId: b.id, paymentId, provider: provider.name });
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
    // #106: the reference rides the version guard — a concurrent fulfil that
    // already advanced the booking aborts instead of clobbering it, and we
    // return that fresher state.
    if (r.reference) {
      try {
        await runBatch(db, [
          guard(db, cur, "fulfil-pending-ref"),
          db.prepare("UPDATE bookings SET supplier_reference = ? WHERE id = ?").bind(r.reference, b.id),
        ]);
      } catch (e) {
        if (e instanceof HttpError && (e as any).code === "CONCURRENT_MODIFICATION") return mustGet(env, b.id);
        throw e;
      }
    }
    return mustGet(env, b.id); // awaits operator/partner confirmation
  }
  if (r.outcome === "FAILED") {
    await runBatch(db, [
      ...transition(db, cur, "REFUND_PENDING", { type: "SUPPLIER", id: b.supplier_id }, `SUPPLIER_FAILED:${r.code}`, { supplier_status: "FAILED" }),
      db.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ?").bind(b.id),
      ...(await releaseSlotStmts(db, b.id)),
      outboxInsert(db, "EMAIL", b.customer_email, "SUPPLIER_REJECTED", { bookingId: b.id, bookingNumber: b.booking_number }),
    ]);
    cur = await mustGet(env, b.id);
    await startRefund(env, cur, cur.paid_minor, `공급사 예약 실패 전액 환불 (${r.code})`);
    return mustGet(env, b.id);
  }
  await runBatch(db, transition(db, cur, "MANUAL_REVIEW_REQUIRED", { type: "SUPPLIER", id: b.supplier_id }, "SUPPLIER_RESPONSE_UNKNOWN", { supplier_status: "UNKNOWN" }));
  return mustGet(env, b.id);
}

export function voucherCode(): string {
  // #105: 16 hex chars (64 bits) — collisions are not expected in practice,
  // and issue() retries on the unique index instead of 500ing a paid booking.
  return `GFV-${randomToken(8).toUpperCase()}`;
}

/** Ticket (flights) or voucher (others) issuance after supplier confirmation. */
export async function issue(env: Env, b: BookingRow): Promise<BookingRow> {
  const db = env.DB;
  const supplier = await loadSupplier(env, b.supplier_id);
  const split = L.recognitionSplit(b.paid_minor, Math.round(Number(b.discount_amount_krw || 0)), supplier?.settlement_rate_bps ?? 9000);
  // #71: the ledger recognizes on gross (paid + platform-borne discount, with
  // a PROMOTION_EXPENSE leg), so the settlement basis must be gross too —
  // paying the seller on net-paid shorted every discounted order.
  const grossMinor = Number(b.paid_minor || 0) + Math.round(Number(b.discount_amount_krw || 0));
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
      const settlement = await planOrderSettlement(env, b.id, b.domain_type, b.item_id, grossMinor);
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
        ...(await releaseSlotStmts(db, b.id)),
      ]);
      cur = await mustGet(env, b.id);
      await startRefund(env, cur, cur.paid_minor, "발권 실패로 인한 전액 환불");
      return mustGet(env, b.id);
    }
    await runBatch(db, transition(db, cur, "MANUAL_REVIEW_REQUIRED", { type: "SYSTEM", id: null }, "TICKETING_FAILED_PNR_NOT_VOIDED"));
    return mustGet(env, b.id);
  }

  // #105: on a voucher collision (unique index), mint a fresh code and retry
  // instead of failing a paid booking. Re-planned per attempt so a retried
  // batch never reuses spent journal/settlement ids.
  for (let attempt = 0; ; attempt++) {
    const settlement = await planOrderSettlement(env, b.id, b.domain_type, b.item_id, grossMinor);
    try {
      await runBatch(db, [
        ...transition(db, b, "VOUCHER_ISSUED", { type: "SYSTEM", id: null }, null, { voucher_code: voucherCode() }),
        db.prepare("UPDATE booking_items SET voucher_code = (SELECT voucher_code FROM bookings WHERE id = ?), updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?").bind(b.id, b.id),
        ...journalStmts(db, L.fulfilmentRecognized(b.id, b.paid_minor, split), b),
        notify("BOOKING_CONFIRMED"),
        settlement.stmt(db),
      ]);
      break;
    } catch (e) {
      const m = String((e as any)?.message || e);
      if (attempt < 2 && (m.includes("idx_booking_items_voucher") || m.includes("booking_items.voucher_code"))) continue;
      throw e;
    }
  }
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
  // B3: an auto-refund against a SETTLED order never executes on its own —
  // it parks for admin approval (B7), otherwise the platform pays twice.
  const settled = await env.DB.prepare("SELECT id FROM marketplace_order_settlements WHERE booking_id = ? AND settlement_status = 'SETTLED' LIMIT 1").bind(b.id).first<{ id: string }>();
  if (settled) {
    await runBatch(env.DB, transition(env.DB, b, "MANUAL_REVIEW_REQUIRED", { type: "SYSTEM", id: null }, "SETTLED_REFUND_NEEDS_APPROVAL"));
    return;
  }
  const rid = newId("rfd");
  try {
    await env.DB.prepare("INSERT INTO refunds (id, booking_id, payment_id, amount_minor, currency, reason, status) VALUES (?, ?, ?, ?, ?, ?, 'PENDING')")
      .bind(rid, b.id, pay.id, amt, b.currency, reason.slice(0, 300)).run();
  } catch (e) { throwOnRefundConflict(e); }
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
    await applyRefundSucceeded(env, b, pay, rf, { type: "PAYMENT_PROVIDER", id: provider.name }, r.refundId);
    moneyLog("refund.succeeded", { bookingId: b.id, refundId: rf.id, amountMinor: rf.amount_minor, provider: provider.name });
    return;
  }
  if (r.outcome === "UNKNOWN") {
    // #74: never blind-retry a lost refund response — ask the PG what
    // actually happened. A confirmed cancel covering our amount completes
    // the refund; anything else is recorded on the row for the ops queue.
    const lk = await provider.lookup({ orderId: b.id, paymentKey: pay.provider_payment_key, amountMinor: pay.amount_minor });
    const canceled = (lk.outcome === "CANCELED" || lk.outcome === "PARTIAL_CANCELED") ? lk : null;
    if (canceled && canceled.canceledMinor - pay.refunded_minor >= rf.amount_minor) {
      await applyRefundSucceeded(env, b, pay, rf, { type: "PAYMENT_PROVIDER", id: provider.name }, canceled.transactionKey);
      return;
    }
    const note = canceled
      ? `PG_LOOKUP:${canceled.outcome}(ext=${canceled.canceledMinor},need=${rf.amount_minor})`
      : `PG_LOOKUP:${lk.outcome}`;
    const attempts = rf.attempts + 1;
    await db.prepare("UPDATE refunds SET attempts = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(attempts, `${r.message} | ${note}`.slice(0, 300), rf.id).run();
    if (attempts >= MAX_REFUND_ATTEMPTS && b.status === "REFUND_PENDING") {
      await runBatch(db, transition(db, b, "MANUAL_REVIEW_REQUIRED", { type: "SYSTEM", id: null }, `REFUND_FAILED_AFTER_${attempts}_ATTEMPTS`));
    }
    moneyLog("refund.unknown", { bookingId: b.id, refundId: rf.id, attempts, note });
    return;
  }
  const attempts = rf.attempts + 1;
  await db.prepare("UPDATE refunds SET attempts = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(attempts, r.message.slice(0, 300), rf.id).run();
  if (attempts >= MAX_REFUND_ATTEMPTS && b.status === "REFUND_PENDING") {
    await runBatch(db, transition(db, b, "MANUAL_REVIEW_REQUIRED", { type: "SYSTEM", id: null }, `REFUND_FAILED_AFTER_${attempts}_ATTEMPTS`));
  }
  moneyLog("refund.failed", { bookingId: b.id, refundId: rf.id, attempts, providerCode: (r as any).code || null });
}

/**
 * Shared money-application for a succeeded refund (PG, offline, or admin).
 * One function owns the booking/payment/refund/settlement/coin/journal writes
 * so the three refund paths cannot drift apart (B7).
 */
export async function applyRefundSucceeded(env: Env, b: BookingRow, pay: any, rf: any, actor: Actor, providerRefundId: string | null): Promise<void> {
  const db = env.DB;
  const newRefunded = pay.refunded_minor + rf.amount_minor;
  const fullyRefunded = newRefunded >= pay.amount_minor;
  const hook = await loadPartnerHook(db, b.partner_id);
  // A cancelled/failed supplier delivered nothing: void its payout on ANY
  // refund, not just full ones. Before this, a fee-cancel left the full
  // PENDING payout payable (P0 2026-11-10). Partial refunds on live orders
  // keep PENDING until the remainder settles.
  const supplierGone = b.supplier_status === "CANCELLED" || b.supplier_status === "FAILED";
  // The order always ends REFUNDED here: unwind the full remaining recognition
  // and journal any retained remainder as fee revenue, so deposits net to zero.
  // Ledger-state guards make customer pre-posted journals no-op (exactly-once).
  // #17: on a SETTLED order the payout already relieved the payable — a
  // reversal would push it negative. The seller claim funds the refund instead
  // (including any retained remainder: nothing phantom stays on relieved books).
  const settledRow = await db.prepare("SELECT id FROM marketplace_order_settlements WHERE booking_id = ? AND settlement_status = 'SETTLED' LIMIT 1").bind(b.id).first();
  const reversal = settledRow ? [] : await recognitionReversalStmts(env, db, b, Number(b.paid_minor || 0), rf.id);
  const feeDue = await unrecordedFeeMinor(db, b.id, Number(b.paid_minor || 0), Number(b.refunded_minor || 0) + Number(rf.amount_minor || 0));
  await runBatch(db, [
    // #73: our own row must still be PENDING (an external sync may have
    // superseded it after our PG call) — the guard aborts the batch first.
    db.prepare("INSERT INTO txn_guards (ok, label) SELECT COUNT(*), ? FROM refunds WHERE id = ? AND status = 'PENDING'").bind(`refund-apply:${rf.id}`, rf.id),
    ...transition(db, b, "REFUNDED", actor, rf.source && rf.source !== "INTERNAL" ? `REFUND_${rf.source}` : null, {
      payment_status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
    }),
    // #73: relative, like payments below — a concurrent external sync adds
    // its own slice instead of clobbering ours (or vice versa).
    db.prepare("UPDATE bookings SET refunded_minor = refunded_minor + ? WHERE id = ?")
      .bind(rf.amount_minor, b.id),
    db.prepare("UPDATE refunds SET status = 'SUCCEEDED', provider_refund_id = COALESCE(?, provider_refund_id), attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'").bind(providerRefundId, rf.id),
    // #73: relative increment, never a stale-read absolute — concurrent
    // applies cannot lose-update each other's slice.
    db.prepare(`UPDATE payments SET refunded_minor = refunded_minor + ?,
      status = CASE WHEN refunded_minor + ? >= amount_minor THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(rf.amount_minor, rf.amount_minor, pay.id),
    ...reversal,
    ...journalStmts(db, L.cancellationFeeRetained(b.id, feeDue), b),
    ...journalStmts(db, L.refundPaid(rf.id, rf.amount_minor), b),
    ...hookEnqueueStmts(db, hook, "booking.cancelled", hookSnapshot(b, "REFUNDED", { refunded_minor: newRefunded, refund_id: rf.id })),
    outboxInsert(db, "EMAIL", b.customer_email, "BOOKING_CANCELLED", { bookingId: b.id, bookingNumber: b.booking_number }),
    outboxInsert(db, "EMAIL", b.customer_email, "REFUND_COMPLETED", { bookingId: b.id, bookingNumber: b.booking_number, amountMinor: rf.amount_minor }),
    // A fully refunded order must never stay payable (2026-11-09 audit [M]).
    ...((fullyRefunded || supplierGone) ? [db.prepare("UPDATE marketplace_order_settlements SET settlement_status = 'REFUNDED', fulfillment_status = 'FAILED' WHERE booking_id = ? AND settlement_status IN ('PENDING', 'HELD')").bind(b.id)] : []),
    ...(await coinRestoreStmtsOnce(db, b)),
    ...couponRestoreStmts(db, b.user_id, b.quote_id),
  ]);
  if (fullyRefunded || supplierGone) {
    // #73: post-batch void re-check — a payout row armed after our batch's
    // void (or missed by it) must still never stay payable on a dead order.
    await db.prepare("UPDATE marketplace_order_settlements SET settlement_status = 'REFUNDED', fulfillment_status = 'FAILED' WHERE booking_id = ? AND settlement_status IN ('PENDING', 'HELD')").bind(b.id).run();
  }
  // B3: a payout already made becomes a recovery claim against the seller.
  await recordRecoveryIfSettled(db, b, Number(rf.amount_minor || 0) + (settledRow ? feeDue : 0), `지급 후 환불 환수 (refund ${rf.id})`);
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
      ...(await releaseSlotStmts(db, b.id)),
      ...coinRestoreStmts(db, b),
      ...couponRestoreStmts(db, b.user_id, b.quote_id),
      ...hookEnqueueStmts(db, hook, "booking.cancelled", hookSnapshot(b, "CANCELLED")),
      outboxInsert(db, "EMAIL", b.customer_email, "BOOKING_CANCELLED", { bookingId: b.id, bookingNumber: b.booking_number }),
    ]);
    return serializeBooking(env, await mustGet(env, b.id), user);
  }

  const { feeMinor, refundMinor } = cancellationPreview(b);
  await runBatch(db, transition(db, b, "CANCELLATION_REQUESTED", actor, null, { cancellation_fee_minor: feeMinor }));
  let cur = await mustGet(env, b.id);
  const supplier = await loadSupplier(env, b.supplier_id);
  const adapter = adapterFor(supplier?.adapter || "none");
  const t0 = Date.now();
  const cx = await adapter.cancel(supplierCtx(cur, 1));
  await logSupplierCall(env, b.supplier_id, b.id, "CANCEL", cx.outcome, Date.now() - t0, JSON.stringify(cx));

  if (cx.outcome === "REJECTED") {
    await runBatch(db, transition(db, cur, b.status as BookingStatus, { type: "SUPPLIER", id: b.supplier_id }, `SUPPLIER_REJECTED_CANCEL`, { cancellation_fee_minor: 0 }));
    throw new HttpError(409, "SUPPLIER_REJECTED_CANCELLATION", `공급사가 취소를 거절했습니다: ${cx.message}`);
  }
  if (cx.outcome === "UNKNOWN") {
    await runBatch(db, transition(db, cur, "MANUAL_REVIEW_REQUIRED", { type: "SUPPLIER", id: b.supplier_id }, "SUPPLIER_CANCEL_UNKNOWN"));
    return serializeBooking(env, await mustGet(env, b.id), user);
  }

  // B3/#17: money already moved (SETTLED) — park for approval BEFORE posting
  // anything. Phantom reversals/fees on relieved accounts would strand; the
  // operator replays via the admin refund path, which claims from the seller.
  const cxSettled = await db.prepare("SELECT id FROM marketplace_order_settlements WHERE booking_id = ? AND settlement_status = 'SETTLED' LIMIT 1").bind(b.id).first();
  if (cxSettled) {
    await runBatch(db, transition(db, cur, "MANUAL_REVIEW_REQUIRED", { type: "SYSTEM", id: null }, "SETTLED_REFUND_NEEDS_APPROVAL"));
    return serializeBooking(env, await mustGet(env, b.id), user);
  }
  // Supplier cancelled: reverse revenue recognition, retain fee, refund the rest.
  const reversal = await recognitionReversalStmts(env, db, b, Number(b.paid_minor || 0));
  const ledger = [
    ...reversal,
    ...journalStmts(db, L.cancellationFeeRetained(b.id, feeMinor), cur),
    db.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ?").bind(b.id),
    ...(await releaseSlotStmts(db, b.id)),
    db.prepare("UPDATE booking_items SET supplier_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?").bind(b.id),
    // The coin portion is always restored in full on cancel; any fee comes from cash.
    ...coinRestoreStmts(db, b),
    ...couponRestoreStmts(db, b.user_id, b.quote_id),
  ];
  if (refundMinor <= 0) {
    const hook = await loadPartnerHook(db, b.partner_id);
    await runBatch(db, [...transition(db, cur, "CANCELLED", { type: "SUPPLIER", id: b.supplier_id }, "CANCELLED_NO_REFUND_DUE", { supplier_status: "CANCELLED" }), ...ledger,
      ...hookEnqueueStmts(db, hook, "booking.cancelled", hookSnapshot(b, "CANCELLED")),
      outboxInsert(db, "EMAIL", b.customer_email, "BOOKING_CANCELLED", { bookingId: b.id, bookingNumber: b.booking_number })]);
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
      ...(await releaseSlotStmts(env.DB, b.id)),
      ...coinRestoreStmts(env.DB, b),
      ...couponRestoreStmts(env.DB, b.user_id, b.quote_id),
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
      ...(await releaseSlotStmts(env.DB, b.id)),
      ...coinRestoreStmts(env.DB, b),
      ...couponRestoreStmts(env.DB, b.user_id, b.quote_id),
    ]);
    return "RECONCILED";
  }
  return "SKIPPED";
}

/** B3: a refund against an already-SETTLED order becomes an OPEN seller claim. */
export async function recordRecoveryIfSettled(db: D1Database, b: Pick<BookingRow, "id" | "currency" | "entity_id" | "supplier_id">, deltaMinor: number, reason: string): Promise<string | null> {
  if (!Number.isSafeInteger(deltaMinor) || deltaMinor <= 0) return null;
  const s = await db.prepare("SELECT id, seller_id FROM marketplace_order_settlements WHERE booking_id = ? AND settlement_status = 'SETTLED'").bind(b.id).first<{ id: string; seller_id: string }>();
  if (!s) return null;
  const id = newId("rcv");
  // #17: the claim is a booked receivable (against the PG pool that funded the
  // customer refund), extinguished when a later payout offsets it. The claim
  // row and its journal land in one batch — never one without the other.
  await db.batch([
    db.prepare("INSERT INTO settlement_recoveries (id, seller_id, booking_id, settlement_id, amount_minor, currency, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN')")
      .bind(id, s.seller_id, b.id, s.id, deltaMinor, (b as BookingRow).currency || "KRW", reason.slice(0, 300)),
    ...journalStmts(db, L.recoveryClaimRaised(id, deltaMinor), b as Pick<BookingRow, "id" | "entity_id" | "supplier_id" | "currency">),
  ]);
  return id;
}

/**
 * #17: settlement payout journal lines for marketplace.ts. The conditional
 * SETTLED update is the single writer; these lines post right after its
 * changes-check so a payout is journaled exactly once.
 */
export function settlementPayoutStmts(
  db: D1Database,
  b: Pick<BookingRow, "id" | "entity_id" | "supplier_id" | "currency">,
  settlementId: string,
  grossMinor: number,
  cashMinor: number,
): Stmt[] {
  return journalStmts(db, L.settlementPaidOut(settlementId, grossMinor, cashMinor), b);
}

/** Legal walk from any live status to REFUNDED. Dead terminals → null (money-only). */
function refundPathToRefunded(from: string): BookingStatus[] | null {
  switch (from) {
    case "COMPLETED": return ["MANUAL_REVIEW_REQUIRED", "REFUND_PENDING", "REFUNDED"];
    case "AWAITING_PAYMENT": return ["CANCELLED"];
    case "PAYMENT_PROCESSING": return ["MANUAL_REVIEW_REQUIRED", "REFUND_PENDING", "REFUNDED"];
    case "PAYMENT_AUTHORIZED":
    case "SUPPLIER_BOOKING_PENDING":
    case "TICKETING_PENDING":
    case "MANUAL_REVIEW_REQUIRED": return ["REFUND_PENDING", "REFUNDED"];
    case "SUPPLIER_CONFIRMED":
    case "VOUCHER_ISSUED":
    case "TICKETED": return ["CANCELLATION_REQUESTED", "REFUND_PENDING", "REFUNDED"];
    case "CANCELLATION_REQUESTED": return ["REFUND_PENDING", "REFUNDED"];
    case "REFUND_PENDING": return ["REFUNDED"];
    default: return null;
  }
}

export interface ExternalCancel {
  paymentId: string;
  canceledMinor: number;
  cancelReason: string;
  transactionKey: string | null;
}

/**
 * B1: sync a PG-side cancel/chargeback the provider lookup confirmed. Money
 * already moved at the PG, so nothing is executed — the refund is RECORDED
 * (source EXTERNAL), holds released, coins restored, PENDING payouts voided,
 * and SETTLED payouts converted to recovery claims (B3). Our own in-flight
 * PENDING refunds for the payment are superseded so they can never double-pay.
 */
export async function applyExternalCancel(env: Env, bookingId: string, ext: ExternalCancel): Promise<"APPLIED" | "ALREADY_APPLIED" | "SKIPPED"> {
  const db = env.DB;
  const b = await mustGet(env, bookingId);
  const pay = await db.prepare("SELECT * FROM payments WHERE id = ?").bind(ext.paymentId).first<any>();
  if (!pay || pay.booking_id !== b.id || !["CAPTURED", "PARTIALLY_REFUNDED"].includes(pay.status)) return "SKIPPED";
  const delta = Math.min(ext.canceledMinor - pay.refunded_minor, pay.amount_minor - pay.refunded_minor);
  if (!Number.isSafeInteger(delta) || delta <= 0) return "ALREADY_APPLIED";
  const newRefunded = pay.refunded_minor + delta;
  const fullyRefunded = newRefunded >= pay.amount_minor;
  const actor: Actor = { type: "PAYMENT_PROVIDER", id: pay.provider };
  const hook = await loadPartnerHook(db, b.partner_id);
  const rfId = newId("rfd");
  const reason = `PG 외부 취소 동기화: ${(ext.cancelReason || "").slice(0, 200)}`;

  // Full external cancel on a live order: release the supplier leg best-effort.
  // The sync never fails on the supplier outcome — the money is already back.
  let supplierCancelled = false;
  if (fullyRefunded && refundPathToRefunded(b.status)) {
    try {
      const supplier = await loadSupplier(env, b.supplier_id);
      const t0 = Date.now();
      const cx = await adapterFor(supplier?.adapter || "none").cancel(supplierCtx(b, 1));
      await logSupplierCall(env, b.supplier_id, b.id, "CANCEL", cx.outcome, Date.now() - t0, JSON.stringify(cx).slice(0, 2000));
      supplierCancelled = cx.outcome !== "REJECTED";
    } catch {
      supplierCancelled = false;
    }
  }

  const minors = {
    refunded_minor: b.refunded_minor + delta,
    payment_status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
    ...(supplierCancelled ? { supplier_status: "CANCELLED" } : {}),
  };
  // #17: same settled rule as applyRefundSucceeded — the claim (raised below)
  // funds the refund; a reversal would double-relieve the paid-out payable.
  const extSettled = await db.prepare("SELECT id FROM marketplace_order_settlements WHERE booking_id = ? AND settlement_status = 'SETTLED' LIMIT 1").bind(b.id).first();
  const money: Stmt[] = [
    db.prepare("INSERT INTO refunds (id, booking_id, payment_id, amount_minor, currency, reason, status, source, provider_refund_id, attempts) VALUES (?, ?, ?, ?, ?, ?, 'SUCCEEDED', 'EXTERNAL', ?, 1)")
      .bind(rfId, b.id, pay.id, delta, b.currency, reason.slice(0, 300), ext.transactionKey),
    // #73: relative increment, never the stale-read absolute — concurrent
    // applies cannot lose-update each other's slice.
    db.prepare(`UPDATE payments SET refunded_minor = refunded_minor + ?,
      status = CASE WHEN refunded_minor + ? >= amount_minor THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(delta, delta, pay.id),
    // Our own in-flight refunds are superseded: the PG already returned the money.
    db.prepare("UPDATE refunds SET status = 'FAILED', last_error = 'EXTERNAL_CANCEL_SUPERSEDED', updated_at = CURRENT_TIMESTAMP WHERE payment_id = ? AND status = 'PENDING'").bind(pay.id),
    // Full external cancel unwinds the whole recognition; a partial one unwinds
    // only its slice so the live remainder stays recognized (never negative).
    ...(extSettled ? [] : await recognitionReversalStmts(env, db, b, fullyRefunded ? Number(b.paid_minor || 0) : delta, rfId)),
    ...journalStmts(db, L.refundPaid(rfId, delta), b),
    outboxInsert(db, "EMAIL", b.customer_email, "REFUND_COMPLETED", { bookingId: b.id, bookingNumber: b.booking_number, amountMinor: delta }),
  ];
  if (fullyRefunded) {
    money.push(
      db.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ?").bind(b.id),
      ...(await releaseSlotStmts(db, b.id)),
      db.prepare("UPDATE marketplace_order_settlements SET settlement_status = 'REFUNDED', fulfillment_status = 'FAILED' WHERE booking_id = ? AND settlement_status IN ('PENDING', 'HELD')").bind(b.id),
      ...hookEnqueueStmts(db, hook, "booking.cancelled", hookSnapshot(b, "REFUNDED", { refunded_minor: newRefunded, refund_id: rfId, external: true })),
      ...(await coinRestoreStmtsOnce(db, b)),
      ...couponRestoreStmts(db, b.user_id, b.quote_id),
      outboxInsert(db, "EMAIL", b.customer_email, "BOOKING_CANCELLED", { bookingId: b.id, bookingNumber: b.booking_number }),
    );
    if (supplierCancelled) money.push(db.prepare("UPDATE booking_items SET supplier_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?").bind(b.id));
  }

  // #73: optimistic lock on the payment we read up front — a concurrent
  // apply moves refunded_minor first, so our delta is exact at commit or the
  // batch aborts (409 CONCURRENT_MODIFICATION, converted below when covered).
  const payGuard = (label: string) => db.prepare("INSERT INTO txn_guards (ok, label) SELECT COUNT(*), ? FROM payments WHERE id = ? AND refunded_minor = ?")
    .bind(label, pay.id, pay.refunded_minor);
  const bookingMinors = db.prepare("UPDATE bookings SET refunded_minor = refunded_minor + ? WHERE id = ?")
    .bind(delta, b.id);
  const statusMinors: Record<string, string | number | null> = { payment_status: minors.payment_status as string };
  if (supplierCancelled) statusMinors.supplier_status = "CANCELLED";
  const path = fullyRefunded ? refundPathToRefunded(b.status) : null;
  try {
    if (!path) {
      // Partial cancel, or a full one on a terminal/COMPLETED order: money only.
      await runBatch(db, [
        payGuard(`ext-cancel:${pay.id}`),
        db.prepare("UPDATE bookings SET payment_status = ?, status_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(minors.payment_status as string, "EXTERNAL_CANCEL_SYNCED", b.id),
        bookingMinors,
        ...money,
      ]);
    } else {
      for (const [i, next] of path.entries()) {
        const cur = await mustGet(env, b.id);
        const last = i === path.length - 1;
        await runBatch(db, [
          ...transition(db, cur, next, actor, "EXTERNAL_CANCEL_SYNCED", last ? statusMinors : {}),
          ...(last ? [payGuard(`ext-cancel:${pay.id}`), bookingMinors, ...money] : []),
        ]);
      }
    }
  } catch (e) {
    if (e instanceof HttpError && (e as any).code === "CONCURRENT_MODIFICATION") {
      const fresh = await db.prepare("SELECT refunded_minor FROM payments WHERE id = ?").bind(pay.id).first<any>();
      if (ext.canceledMinor - Number(fresh?.refunded_minor ?? 0) <= 0) return "ALREADY_APPLIED";
    }
    throw e;
  }
  await recordRecoveryIfSettled(db, b, delta, `외부 취소 환수: ${reason}`.slice(0, 300));
  return "APPLIED";
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
      // B2: the payout row tracks fulfilment truth, so the settle gate reads it.
      await runBatch(env.DB, [
        ...transition(env.DB, b, "COMPLETED", { type: "SYSTEM", id: null }, "SERVICE_WINDOW_ELAPSED"),
        env.DB.prepare("UPDATE marketplace_order_settlements SET fulfillment_status = 'COMPLETED' WHERE booking_id = ? AND fulfillment_status IN ('PENDING', 'CONFIRMED')").bind(b.id),
      ]);
      done++;
    } catch {
      // Raced with a customer cancel/refund: leave it for the next run.
    }
  }
  return done;
}

// #45: SLA for supplier confirmation. A paid booking the operator/partner
// never confirms must not wait forever — past the SLA the platform
// auto-refunds in full through the same path as an explicit supplier
// failure. Surfaced in the maintenance stats (audited by the admin trigger),
// so ops sees every timeout as an escalation trail.
const SUPPLIER_CONFIRM_SLA_MS = 24 * 60 * 60 * 1000;

export async function sweepSupplierTimeouts(env: Env): Promise<number> {
  const cutoff = new Date(Date.now() - SUPPLIER_CONFIRM_SLA_MS).toISOString();
  const rows = await env.DB.prepare(
    "SELECT * FROM bookings WHERE status = 'SUPPLIER_BOOKING_PENDING' AND updated_at <= ? ORDER BY updated_at LIMIT 50",
  ).bind(cutoff).all<BookingRow>();
  let done = 0;
  for (const r of rows.results || []) {
    const b = await getBooking(env, r.id);
    if (!b || b.status !== "SUPPLIER_BOOKING_PENDING") continue;
    try {
      await runBatch(env.DB, [
        ...transition(env.DB, b, "REFUND_PENDING", { type: "SYSTEM", id: null }, "SUPPLIER_CONFIRM_TIMEOUT", { supplier_status: "TIMEOUT" }),
        env.DB.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ?").bind(b.id),
        ...(await releaseSlotStmts(env.DB, b.id)),
        outboxInsert(env.DB, "EMAIL", b.customer_email, "SUPPLIER_REJECTED", { bookingId: b.id, bookingNumber: b.booking_number }),
      ]);
      const cur = await mustGet(env, b.id);
      await startRefund(env, cur, cur.paid_minor, "공급사 확정 기한(24시간) 초과 전액 환불");
      done++;
    } catch {
      // Raced with an operator decision: leave it for the next run.
    }
  }
  return done;
}

export async function runMaintenance(env: Env): Promise<Record<string, number>> {
  const stats = { expired: 0, paymentsReconciled: 0, refundsRetried: 0, quotesExpired: 0, emailsSent: 0, emailsPending: 0, webhooksSent: 0, webhooksPending: 0, rowsPruned: 0, alertsFired: 0, completed: 0, supplierTimeouts: 0 };
  const now = nowIso();
  const stale = await env.DB.prepare("SELECT * FROM bookings WHERE status = 'AWAITING_PAYMENT' AND inventory_lock_expires_at <= ? LIMIT 100").bind(now).all<BookingRow>();
  for (const b of stale.results || []) {
    await expireBooking(env, b, "PAYMENT_WINDOW_ELAPSED");
    stats.expired++;
  }
  // #45 runs before the refund retry below so a timeout-created PENDING
  // refund is picked up in the same maintenance pass.
  stats.supplierTimeouts = await sweepSupplierTimeouts(env);
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
    // #99: webhook dedupe rows older than any redelivery window.
    env.DB.prepare("DELETE FROM payment_events WHERE received_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')"),
    // #104: reconcile drifted slot counts back to live claims (crash ghosts).
    // Only slots untouched for 10+ minutes, so an in-flight claim is never rewound.
    env.DB.prepare(`UPDATE activity_time_slots SET booked_count = (SELECT COALESCE(SUM(bi.quantity), 0) FROM booking_items bi WHERE bi.slot_id = activity_time_slots.id AND bi.slot_released_at IS NULL), booked_count_updated_at = CURRENT_TIMESTAMP
      WHERE (booked_count_updated_at IS NULL OR booked_count_updated_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes'))
      AND booked_count != (SELECT COALESCE(SUM(bi.quantity), 0) FROM booking_items bi WHERE bi.slot_id = activity_time_slots.id AND bi.slot_released_at IS NULL)`),
  ]);
  stats.rowsPruned = pruned.reduce((n, r) => n + (r.meta.changes || 0), 0);
  return stats;
}

/**
 * #56: one row per job recording the last maintenance run. Never throws —
 * observability must not break the run it observes, and databases that
 * predate 0038 simply have no table yet.
 */
export async function recordHeartbeat(env: Env, job: string, ok: boolean, stats: Record<string, number>, error?: string): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO cron_heartbeats (job, ran_at, ok, stats_json, error, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (job) DO UPDATE SET ran_at = excluded.ran_at, ok = excluded.ok,
         stats_json = excluded.stats_json, error = excluded.error, updated_at = excluded.updated_at`
    ).bind(job, new Date().toISOString(), ok ? 1 : 0, JSON.stringify(stats).slice(0, 4000), (error || '').slice(0, 500) || null, new Date().toISOString()).run();
  } catch {
    // No heartbeat table (pre-0038 DB) or a transient write failure: the run
    // itself already succeeded, so stay silent rather than fail serving.
  }
}

/** #56: runMaintenance with a heartbeat on both outcomes; rethrows failures. */
export async function runMaintenanceWithHeartbeat(env: Env, job = 'maintenance'): Promise<Record<string, number>> {
  try {
    const stats = await runMaintenance(env);
    await recordHeartbeat(env, job, true, stats);
    return stats;
  } catch (e: any) {
    await recordHeartbeat(env, job, false, {}, e?.message ? String(e.message) : String(e));
    throw e;
  }
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
      await runBatch(db, [
        ...transition(db, b, "FAILED", actor, note || "OPERATOR_REJECTED_UNPAID"),
        db.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ?").bind(b.id),
        ...(await releaseSlotStmts(db, b.id)),
        ...coinRestoreStmts(db, b),
        ...couponRestoreStmts(db, b.user_id, b.quote_id),
        outboxInsert(db, "EMAIL", b.customer_email, "SUPPLIER_REJECTED", { bookingId: b.id, bookingNumber: b.booking_number }),
      ]);
      return mustGet(env, b.id);
    }
    await runBatch(db, [
      ...transition(db, b, "REFUND_PENDING", actor, note || "OPERATOR_REJECTED", { supplier_status: "FAILED" }),
      db.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ?").bind(b.id),
      ...(await releaseSlotStmts(db, b.id)),
      outboxInsert(db, "EMAIL", b.customer_email, "SUPPLIER_REJECTED", { bookingId: b.id, bookingNumber: b.booking_number }),
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

/** B7: walk any refundable live booking to REFUND_PENDING, releasing holds. */
async function walkToRefundPending(env: Env, b: BookingRow, actor: Actor, note: string): Promise<BookingRow> {
  const db = env.DB;
  if (["REFUNDED", "CANCELLED", "EXPIRED", "FAILED"].includes(b.status) || b.status === "AWAITING_PAYMENT") {
    throw new HttpError(409, "NOT_REFUNDABLE", `현재 상태(${STATUS_LABEL_KO[b.status] || b.status})에서는 환불할 수 없습니다.`);
  }
  let cur = b;
  if (cur.status === "COMPLETED") {
    await runBatch(db, transition(db, cur, "MANUAL_REVIEW_REQUIRED", actor, note));
    cur = await mustGet(env, b.id);
  }
  if (["VOUCHER_ISSUED", "TICKETED", "SUPPLIER_CONFIRMED"].includes(cur.status)) {
    await runBatch(db, transition(db, cur, "CANCELLATION_REQUESTED", actor, note));
    cur = await mustGet(env, b.id);
  }
  if (cur.status === "PAYMENT_PROCESSING") {
    await runBatch(db, transition(db, cur, "MANUAL_REVIEW_REQUIRED", actor, note));
    cur = await mustGet(env, b.id);
  }
  if (cur.status !== "REFUND_PENDING") {
    await runBatch(db, [
      ...transition(db, cur, "REFUND_PENDING", actor, note),
      db.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ?").bind(b.id),
      ...(await releaseSlotStmts(db, b.id)),
    ]);
    cur = await mustGet(env, b.id);
  }
  return cur;
}

async function adminRefundable(env: Env, b: BookingRow, amountMinor: number): Promise<{ pay: any; amt: number }> {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new HttpError(400, "INVALID_REFUND_AMOUNT", "환불 금액은 1원 이상의 정수여야 합니다.");
  const pay = await capturedPayment(env, b.id);
  if (!pay) throw new HttpError(409, "NO_CAPTURED_PAYMENT", "승인된 결제 내역이 없어 환불할 수 없습니다.");
  const amt = Math.min(amountMinor, pay.amount_minor - pay.refunded_minor);
  if (amt <= 0) throw new HttpError(409, "NOTHING_TO_REFUND", "이미 전액 환불된 결제입니다.");
  return { pay, amt };
}

/** B7: admin force-cancel — ends the order and refunds the full remainder via PG. */
export async function adminForceCancel(env: Env, admin: AuthUser, bookingId: string, reason: string): Promise<BookingRow> {
  const db = env.DB;
  const b = await mustGet(env, bookingId);
  const why = str(reason, 300) || "관리자 직권 취소";
  const actor: Actor = { type: "ADMIN", id: admin.id };
  if (["REFUNDED", "CANCELLED", "EXPIRED", "FAILED"].includes(b.status)) {
    throw new HttpError(409, "NOT_CANCELLABLE", `이미 종료된 예약입니다. (${STATUS_LABEL_KO[b.status] || b.status})`);
  }
  if (b.status === "AWAITING_PAYMENT") {
    const hook = await loadPartnerHook(db, b.partner_id);
    await runBatch(db, [
      ...transition(db, b, "CANCELLED", actor, "ADMIN_FORCE_CANCEL_UNPAID"),
      db.prepare("UPDATE inventory_holds SET status = 'RELEASED' WHERE booking_id = ?").bind(b.id),
      ...(await releaseSlotStmts(db, b.id)),
      ...coinRestoreStmts(db, b),
      ...couponRestoreStmts(db, b.user_id, b.quote_id),
      ...hookEnqueueStmts(db, hook, "booking.cancelled", hookSnapshot(b, "CANCELLED")),
      outboxInsert(db, "EMAIL", b.customer_email, "BOOKING_CANCELLED", { bookingId: b.id, bookingNumber: b.booking_number }),
    ]);
    return mustGet(env, b.id);
  }
  // Best-effort supplier release; a rejection is recorded but never blocks the force-cancel.
  let supplierCancelled = false;
  try {
    const supplier = await loadSupplier(env, b.supplier_id);
    const t0 = Date.now();
    const cx = await adapterFor(supplier?.adapter || "none").cancel(supplierCtx(b, 1));
    await logSupplierCall(env, b.supplier_id, b.id, "CANCEL", cx.outcome, Date.now() - t0, JSON.stringify(cx).slice(0, 2000));
    supplierCancelled = cx.outcome !== "REJECTED";
  } catch { supplierCancelled = false; }
  const cur = await walkToRefundPending(env, b, actor, "ADMIN_FORCE_CANCEL");
  if (supplierCancelled) {
    await db.prepare("UPDATE booking_items SET supplier_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?").bind(b.id).run();
    await db.prepare("UPDATE bookings SET supplier_status = 'CANCELLED' WHERE id = ?").bind(b.id).run();
  }
  const { amt } = await adminRefundable(env, cur, cur.paid_minor - cur.refunded_minor);
  const rid = newId("rfd");
  try {
    await db.prepare("INSERT INTO refunds (id, booking_id, payment_id, amount_minor, currency, reason, status, source) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'ADMIN_MANUAL')")
      .bind(rid, b.id, (await capturedPayment(env, b.id)).id, amt, b.currency, `직권 취소: ${why}`.slice(0, 300)).run();
  } catch (e) { throwOnRefundConflict(e); }
  await processRefund(env, rid);
  return mustGet(env, b.id);
}

/** B7: admin partial/adhoc PG refund — ends the order, remainder retained as fee. */
export async function adminRefund(env: Env, admin: AuthUser, bookingId: string, amountMinor: number, reason: string): Promise<BookingRow> {
  const b = await mustGet(env, bookingId);
  const why = str(reason, 300);
  if (!why) throw new HttpError(400, "REASON_REQUIRED", "환불 사유를 입력해주세요.");
  const actor: Actor = { type: "ADMIN", id: admin.id };
  const cur = await walkToRefundPending(env, b, actor, "ADMIN_REFUND");
  const { amt } = await adminRefundable(env, cur, amountMinor);
  const rid = newId("rfd");
  try {
    await env.DB.prepare("INSERT INTO refunds (id, booking_id, payment_id, amount_minor, currency, reason, status, source) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'ADMIN_MANUAL')")
      .bind(rid, b.id, (await capturedPayment(env, b.id)).id, amt, b.currency, `관리자 환불: ${why}`.slice(0, 300)).run();
  } catch (e) { throwOnRefundConflict(e); }
  await processRefund(env, rid);
  // The retained remainder is the effective cancellation fee — record it honestly.
  const after = await mustGet(env, b.id);
  const fee = after.paid_minor - after.refunded_minor;
  if (after.status === "REFUNDED" && fee > 0) {
    await env.DB.prepare("UPDATE bookings SET cancellation_fee_minor = ? WHERE id = ?").bind(fee, b.id).run();
  }
  return mustGet(env, b.id);
}

/** B7: record a manual bank-transfer refund performed outside the PG. */
export async function adminOfflineRefund(env: Env, admin: AuthUser, bookingId: string, body: any): Promise<BookingRow> {
  const db = env.DB;
  const b = await mustGet(env, bookingId);
  const bank = str(body.bank, 40);
  const account = str(body.account, 40);
  const why = str(body.reason, 300);
  if (!bank || !account) throw new HttpError(400, "OFFLINE_DETAIL_REQUIRED", "환불 은행과 계좌번호를 입력해주세요.");
  if (!why) throw new HttpError(400, "REASON_REQUIRED", "환불 사유를 입력해주세요.");
  const actor: Actor = { type: "ADMIN", id: admin.id };
  const cur = await walkToRefundPending(env, b, actor, "ADMIN_OFFLINE_REFUND");
  const { pay, amt } = await adminRefundable(env, cur, Number(body.amountMinor));
  const rid = newId("rfd");
  const detail = JSON.stringify({ bank, account, adminId: admin.id, at: new Date().toISOString() });
  try {
    await db.prepare("INSERT INTO refunds (id, booking_id, payment_id, amount_minor, currency, reason, status, source, offline_detail_json, attempts) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'OFFLINE', ?, 1)")
      .bind(rid, b.id, pay.id, amt, b.currency, `수기 환불(${bank}): ${why}`.slice(0, 300), detail).run();
  } catch (e) { throwOnRefundConflict(e); }
  const rf = await db.prepare("SELECT * FROM refunds WHERE id = ?").bind(rid).first<any>();
  await applyRefundSucceeded(env, cur, pay, rf, actor, null);
  return mustGet(env, b.id);
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
    db.prepare("SELECT id, amount_minor, status, reason, source, provider_refund_id, offline_detail_json, attempts, created_at, updated_at FROM refunds WHERE booking_id = ? ORDER BY created_at").bind(b.id).all<any>(),
    db.prepare("SELECT from_status, to_status, actor_type, reason, created_at FROM booking_status_history WHERE booking_id = ? ORDER BY created_at, rowid").bind(b.id).all<any>(),
  ]);
  const fulfilled = ["VOUCHER_ISSUED", "TICKETED", "COMPLETED"].includes(b.status);
  let preview = null;
  if (["SUPPLIER_CONFIRMED", "VOUCHER_ISSUED", "TICKETED"].includes(b.status)) preview = cancellationPreview(b);
  let details: any = {};
  try {
    details = JSON.parse(b.details_json || "{}");
  } catch {}
  // A7: per-order sales type so the UI can disclose the actual seller (1P vs 3P).
  const sup = await loadSupplier(env, b.supplier_id).catch(() => null);
  const salesType = sup?.transaction_model === "MERCHANT_OF_RECORD" ? "DIRECT_1P" : "AGENCY_3P";
  return {
    id: b.id,
    bookingNumber: b.booking_number,
    salesType,
    salesTypeLabel: salesType === "DIRECT_1P" ? "회사 직판" : "공급사 판매(회사 중개)",
    supplierName: sup?.name || null,
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
    refunds: (refunds.results || []).map((r: any) => {
      // Offline bank details: full record for admins, masked for the customer.
      let offline: any = null;
      if (r.offline_detail_json) {
        try {
          const d = JSON.parse(r.offline_detail_json);
          const acc = String(d.account || "");
          offline = viewer?.role === "ADMIN"
            ? { bank: d.bank, account: acc, adminId: d.adminId, at: d.at }
            : { bank: d.bank, account: acc.length > 4 ? `${acc.slice(0, 2)}****${acc.slice(-2)}` : "****", at: d.at };
        } catch { offline = null; }
      }
      const { offline_detail_json: _drop, ...rest } = r;
      return { ...rest, source: r.source || "INTERNAL", offline };
    }),
    history: history.results || [],
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}


import type { Db } from "../db/database.ts";
import { db as portableDb } from "../db/database.ts";
import { loadProduct } from "./catalog.ts";
import type { Env } from "../env.ts";
import { isFeatureEnabled } from "./feature-flag-service.ts";
import { assignVariant } from "./reco-service.ts";

/**
 * TG-21: interpretable demand forecast + dynamic markup (v1).
 *
 * No black boxes: every number below is a closed-form combination of
 * trailing bookings, and every quote-time adjustment lands in
 * pricing_decisions with its inputs. Model:
 *   forecast(item, date) = smooth28(domain) × dow(date) × season(date)
 *                          × share(item)
 *   markupBps = (forecast/trailing − 1) × 1000 + (occupancy − 0.7) × 2000
 *   clamped to ±1500bps (±15%), then clamped to the product floor.
 *
 * Data first comes from the TG-19 mart (fact_daily); when the mart is
 * thin (< 7 days, e.g. fresh installs) the same aggregates read live
 * bookings. Occupancy blends holds across units (documented v1
 * approximation); unknown capacity reads neutral.
 */

export const MARKUP_CAP_BPS = 1500;
const ALPHA = 0.3;

export interface ForecastResult {
  forecast: number;
  base: number;
  dowFactor: number;
  seasonFactor: number;
  share: number;
  occupancy: number | null;
  source: "mart" | "live";
  sampleDays: number;
}

export interface MarkupResult {
  bps: number;
  amountMinor: number;
  forecast: ForecastResult;
  trailingItemAvg: number;
  clampedToFloor: boolean;
}

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

interface DayRow {
  day: string;
  c: number;
}

async function trailingDaily(db: Db, domain: string, endDay: string, days: number): Promise<{ rows: DayRow[]; source: "mart" | "live" }> {
  const startDay = dayKey(Date.parse(`${endDay}T00:00:00Z`) - (days - 1) * 86400000);
  const mart = await db.prepare(
    "SELECT date AS day, bookings AS c FROM fact_daily WHERE domain = ? AND date BETWEEN ? AND ? ORDER BY date ASC",
  ).bind(domain, startDay, endDay).all<DayRow>();
  const martRows = (mart.results || []).map((r) => ({ day: r.day, c: Number(r.c || 0) }));
  if (martRows.length >= 7) return { rows: martRows, source: "mart" };
  const live = await db.prepare(
    "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS c FROM bookings WHERE domain_type = ? AND substr(created_at, 1, 10) BETWEEN ? AND ? GROUP BY day ORDER BY day ASC",
  ).bind(domain, startDay, endDay).all<DayRow>();
  return { rows: (live.results || []).map((r) => ({ day: r.day, c: Number(r.c || 0) })), source: "live" };
}

function smooth(rows: DayRow[]): number {
  if (!rows.length) return 0;
  let s = rows[0].c;
  for (let i = 1; i < rows.length; i++) s += ALPHA * (rows[i].c - s);
  return s;
}

function dowFactor(rows: DayRow[], targetDow: number): number {
  if (rows.length < 7) return 1;
  const same = rows.filter((r) => new Date(`${r.day}T00:00:00Z`).getUTCDay() === targetDow);
  if (same.length < 2) return 1;
  const avg = rows.reduce((n, r) => n + r.c, 0) / rows.length;
  if (avg <= 0) return 1;
  return clamp(same.reduce((n, r) => n + r.c, 0) / same.length / avg, 0.5, 2.0);
}

function seasonFactor(rows: DayRow[], targetMonth: number): number {
  if (rows.length < 14) return 1;
  const same = rows.filter((r) => Number(r.day.slice(5, 7)) === targetMonth);
  if (same.length < 3) return 1;
  const avg = rows.reduce((n, r) => n + r.c, 0) / rows.length;
  if (avg <= 0) return 1;
  return clamp(same.reduce((n, r) => n + r.c, 0) / same.length / avg, 0.7, 1.5);
}

export async function forecastDemand(
  db: Db,
  input: { domain: string; itemId: string; date: string },
  today = dayKey(Date.now()),
  capacity: number | null = null,
): Promise<ForecastResult> {
  const domain = input.domain.toUpperCase();
  const endDay = dayKey(Date.parse(`${today}T00:00:00Z`) - 86400000);
  const trailing = await trailingDaily(db, domain, endDay, 28);
  const base = smooth(trailing.rows);
  const target = new Date(`${input.date}T00:00:00Z`);
  const dow = Number.isFinite(target.getTime()) ? dowFactor(trailing.rows, target.getUTCDay()) : 1;
  const season = Number.isFinite(target.getTime()) ? seasonFactor(trailing.rows, target.getUTCMonth() + 1) : 1;
  const start30 = dayKey(Date.parse(`${endDay}T00:00:00Z`) - 29 * 86400000);
  const itemBooks = Number((await db.prepare(
    "SELECT COUNT(*) AS c FROM bookings WHERE domain_type = ? AND item_id = ? AND substr(created_at, 1, 10) BETWEEN ? AND ?",
  ).bind(domain, input.itemId, start30, endDay).first<{ c: number }>())?.c || 0);
  const domainBooks = trailing.rows.reduce((n, r) => n + r.c, 0);
  // Laplace share: an unseen item still gets a sliver of domain demand.
  const share = (itemBooks + 1) / (domainBooks + 20);
  const occupancy = await occupancyFor(db, input.itemId, [input.date], capacity);
  return { forecast: base * dow * season * share, base, dowFactor: dow, seasonFactor: season, share, occupancy, source: trailing.source, sampleDays: trailing.rows.length };
}

export async function capacityFor(env: Env, domain: string, itemId: string): Promise<number | null> {
  try {
    if (domain === "HOTEL") {
      const h = await env.DB.prepare("SELECT rooms_json FROM hotels WHERE id = ?").bind(itemId).first<{ rooms_json: string }>();
      if (!h?.rooms_json) return null;
      const rooms = JSON.parse(h.rooms_json) as Array<{ available_inventory?: unknown }>;
      let sum = 0;
      let any = false;
      for (const r of rooms || []) {
        if (Number.isInteger(r?.available_inventory)) {
          sum += Number(r.available_inventory);
          any = true;
        }
      }
      return any && sum > 0 ? sum : null;
    }
    const p = await loadProduct(env, domain as any, itemId, null);
    return typeof p.capacity === "number" && p.capacity > 0 ? p.capacity : null;
  } catch {
    return null;
  }
}

/** Held + committed quantity over capacity for (item, dates). Null = unknown. */
export async function occupancyFor(db: Db, itemId: string, dates: string[], capacity: number | null): Promise<number | null> {
  if (!dates.length) return null;
  if (capacity === null || capacity <= 0) return null;
  const held = Number((await db.prepare(
    `SELECT COALESCE(SUM(quantity), 0) AS c FROM inventory_holds WHERE item_id = ? AND status IN ('HELD','COMMITTED') AND service_date IN (${dates.map(() => "?").join(",")})`,
  ).bind(itemId, ...dates).first<{ c: number }>())?.c || 0);
  return clamp(held / (capacity * dates.length), 0, 1);
}

export const MARKUP_EXPERIMENT = "markup-v1";
export const MARKUP_FLAG = "DYNAMIC_MARKUP";

/** Pure bps mapping (unit-pinned): hot + scarce → +, cold + empty → −. */
export function markupBps(ratio: number, occupancy: number | null): number {
  const bps = Math.round((ratio - 1) * 1000 + (occupancy === null ? 0 : (occupancy - 0.7) * 2000));
  return clamp(bps, -MARKUP_CAP_BPS, MARKUP_CAP_BPS);
}

export interface QuoteMarkup {
  enabled: boolean;
  variant: "control" | "treatment" | null;
  bps: number;
  amountMinor: number;
  clampedToFloor: boolean;
  forecast: ForecastResult | null;
  trailingItemAvg: number;
  label: string;
}

/**
 * Quote-time markup decision. Flag off → zero shape (pure old path, no
 * rows). Control → zeros with a logged decision (A/B denominator).
 * Treatment → forecast markup, floor-clamped (our own discount never
 * rejects a quote — coins chosen later still can, via the existing 409).
 */
export async function quoteMarkup(
  env: Env,
  input: { userId: string; domain: string; itemId: string; startDate: string; baseMinor: number },
): Promise<QuoteMarkup> {
  const off = (variant: QuoteMarkup["variant"] = null): QuoteMarkup => ({
    enabled: false, variant, bps: 0, amountMinor: 0, clampedToFloor: false, forecast: null, trailingItemAvg: 0, label: "",
  });
  if (!await isFeatureEnabled(env, MARKUP_FLAG)) return off();
  const variant = await assignVariant(portableDb(env), input.userId, MARKUP_EXPERIMENT);
  if (variant === "control") return { ...off("control"), enabled: true };
  const m = await markupForQuote(env, input);
  let { bps, amountMinor } = m;
  let clampedToFloor = false;
  const floor = await floorPriceMinor(portableDb(env), input.domain.toUpperCase(), input.itemId);
  if (floor !== null && input.baseMinor + amountMinor < floor) {
    amountMinor += floor - (input.baseMinor + amountMinor);
    bps = Math.round((amountMinor / Math.max(input.baseMinor, 1)) * 10000);
    clampedToFloor = true;
  }
  const pct = `${bps >= 0 ? "+" : ""}${(bps / 100).toFixed(1)}%`;
  return {
    enabled: true, variant, bps, amountMinor, clampedToFloor,
    forecast: m.forecast, trailingItemAvg: m.trailingItemAvg,
    label: bps >= 0 ? `수요 반영 조정 (${pct})` : `수요 반영 할인 (${pct})`,
  };
}

type FirstOnlyDb = {
  prepare(sql: string): { bind(...args: unknown[]): { first<T>(): Promise<T | null> } };
};

/** Stored markup for a quote (0 when the quote predates the flag). */
export async function loadMarkupForQuote(db: FirstOnlyDb, quoteId: string): Promise<{ amount: number; found: boolean }> {
  const row = await db.prepare("SELECT markup_minor FROM pricing_decisions WHERE quote_id = ?").bind(quoteId).first<{ markup_minor: number }>();
  return row ? { amount: Number(row.markup_minor || 0), found: true } : { amount: 0, found: false };
}

export interface MarkupMetrics {
  variant: "control" | "treatment";
  quotes: number;
  booked: number;
  converted: number;
  revenueMinor: number;
  avgMarkupBps: number;
}

/** A/B readout: quotes → bookings → paid revenue per arm. */
export async function markupMetrics(db: Db): Promise<MarkupMetrics[]> {
  const rows = await db.prepare(
    `SELECT d.variant AS variant, COUNT(*) AS quotes,
       COUNT(DISTINCT b.id) AS booked,
       COUNT(DISTINCT CASE WHEN b.paid_minor > 0 THEN b.id END) AS converted,
       COALESCE(SUM(CASE WHEN b.paid_minor > 0 THEN b.paid_minor END), 0) AS revenue,
       COALESCE(AVG(d.markup_bps), 0) AS bps
     FROM pricing_decisions d LEFT JOIN bookings b ON b.quote_id = d.quote_id
     WHERE d.variant IN ('control', 'treatment')
     GROUP BY d.variant`,
  ).bind().all<{ variant: string; quotes: number; booked: number; converted: number; revenue: number; bps: number }>();
  return (["control", "treatment"] as const).map((variant) => {
    const r = (rows.results || []).find((x) => x.variant === variant);
    return {
      variant,
      quotes: Number(r?.quotes || 0),
      booked: Number(r?.booked || 0),
      converted: Number(r?.converted || 0),
      revenueMinor: Number(r?.revenue || 0),
      avgMarkupBps: Math.round(Number(r?.bps || 0) * 10) / 10,
    };
  });
}

/** Stored markup for a booking (joins through its quote). */
export async function loadMarkupForBooking(db: FirstOnlyDb, bookingId: string): Promise<number> {
  const b = await db.prepare("SELECT quote_id, details_json FROM bookings WHERE id = ?").bind(bookingId).first<{ quote_id: string; details_json: string }>();
  if (!b) return 0;
  // GAP-07: carts sum every leg's stored decision; single bookings read one row (unchanged).
  let quoteIds = [b.quote_id];
  try {
    const cart = JSON.parse(b.details_json || "{}").cartQuoteIds;
    if (Array.isArray(cart) && cart.length > 1) quoteIds = cart;
  } catch { /* legacy shape: single quote */ }
  let total = 0;
  for (const qid of quoteIds) {
    const row = await db.prepare("SELECT markup_minor AS m FROM pricing_decisions WHERE quote_id = ?").bind(qid).first<{ m: number }>();
    total += row ? Number(row.m || 0) : 0;
  }
  return total;
}

/** Floor minor or null (mirrors assertAboveFloor's lookup without throwing). */
export async function floorPriceMinor(db: Db, domain: string, itemId: string): Promise<number | null> {
  const row = await db.prepare("SELECT floor_price_minor FROM product_policies WHERE domain_type = ? AND item_id = ?")
    .bind(domain, itemId).first<{ floor_price_minor: number | null }>();
  const floor = row ? Number(row.floor_price_minor) : NaN;
  return Number.isSafeInteger(floor) && floor > 0 ? floor : null;
}

export async function markupForQuote(
  env: Env,
  input: { domain: string; itemId: string; startDate: string; baseMinor: number },
  today = dayKey(Date.now()),
): Promise<MarkupResult> {
  const db = portableDb(env);
  const domain = input.domain.toUpperCase();
  // Occupancy with resolved capacity (HOTEL sums rooms; unknown reads neutral).
  const cap = await capacityFor(env, domain, input.itemId);
  const forecast = await forecastDemand(db, { domain, itemId: input.itemId, date: input.startDate }, today, cap);
  const endDay = dayKey(Date.parse(`${today}T00:00:00Z`) - 86400000);
  const start30 = dayKey(Date.parse(`${endDay}T00:00:00Z`) - 29 * 86400000);
  const itemBooks = Number((await db.prepare(
    "SELECT COUNT(*) AS c FROM bookings WHERE domain_type = ? AND item_id = ? AND substr(created_at, 1, 10) BETWEEN ? AND ?",
  ).bind(domain, input.itemId, start30, endDay).first<{ c: number }>())?.c || 0);
  const trailingItemAvg = itemBooks / 30;
  const ratio = forecast.forecast / Math.max(trailingItemAvg, 0.05);
  const bps = markupBps(ratio, forecast.occupancy);
  const amountMinor = Math.round((input.baseMinor * bps) / 10000);
  return { bps, amountMinor, forecast, trailingItemAvg, clampedToFloor: false };
}

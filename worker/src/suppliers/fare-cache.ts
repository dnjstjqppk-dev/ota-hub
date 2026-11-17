import type { FlightOffer } from "./adapter.ts";

/**
 * TG-18: two-layer fare cache (TTL 15 min).
 *
 * Hot layer: per-isolate LRU (same precedent as the TG-16 search hot cache).
 * Shared layer: D1 `fare_cache` (survives isolate churn; every isolate reads
 * the same rows). Writes go to both; reads try hot, then D1, then live.
 * A shared Redis tier waits on a generic cache API in EphemeralStore.
 */

export const FARE_TTL_SEC = 15 * 60;
const HOT_MAX = 200;

interface HotEntry {
  expMs: number;
  offers: FlightOffer[];
  cachedAtMs: number;
}

const hot = new Map<string, HotEntry>();

function hotGet(key: string, nowMs: number): HotEntry | null {
  const e = hot.get(key);
  if (!e) return null;
  if (e.expMs <= nowMs) {
    hot.delete(key);
    return null;
  }
  // LRU refresh.
  hot.delete(key);
  hot.set(key, e);
  return e;
}

function hotSet(key: string, e: HotEntry): void {
  hot.delete(key);
  hot.set(key, e);
  while (hot.size > HOT_MAX) {
    const oldest = hot.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    hot.delete(oldest);
  }
}

/** Test-only reset (units + suite isolation). */
export function resetFareHotCache(): void {
  hot.clear();
}

type DbLike = {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
      run(): Promise<unknown>;
    };
  };
};

export function fareCacheKey(adapter: string, origin: string, destination: string, date: string, adults: number, airline: string | null): string {
  return `fare:${adapter}:${origin}:${destination}:${date}:${adults}:${airline || "*"}`;
}

export interface CachedFares {
  offers: FlightOffer[];
  /** hot = isolate memory, d1 = shared row, live = just fetched. */
  source: "hot" | "d1" | "live";
  cachedAtMs: number;
}

function parseOffers(json: string): FlightOffer[] | null {
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return null;
    return v as FlightOffer[];
  } catch {
    return null;
  }
}

export async function fareCacheGet(db: DbLike, key: string, nowMs = Date.now()): Promise<CachedFares | null> {
  const h = hotGet(key, nowMs);
  if (h) return { offers: h.offers, source: "hot", cachedAtMs: h.cachedAtMs };
  const row = await db.prepare("SELECT response_json, created_at FROM fare_cache WHERE cache_key = ? AND expires_at > ?").bind(key, Math.floor(nowMs / 1000)).first<{ response_json: string; created_at: number }>();
  if (!row) return null;
  const offers = parseOffers(row.response_json);
  if (!offers) return null;
  const entry: HotEntry = { expMs: nowMs + FARE_TTL_SEC * 1000, offers, cachedAtMs: row.created_at * 1000 };
  hotSet(key, entry);
  return { offers, source: "d1", cachedAtMs: entry.cachedAtMs };
}

export async function fareCacheSet(db: DbLike, key: string, offers: FlightOffer[], nowMs = Date.now()): Promise<void> {
  const nowSec = Math.floor(nowMs / 1000);
  hotSet(key, { expMs: nowMs + FARE_TTL_SEC * 1000, offers, cachedAtMs: nowMs });
  await db.prepare("INSERT INTO fare_cache (cache_key, response_json, expires_at, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET response_json = excluded.response_json, expires_at = excluded.expires_at, created_at = excluded.created_at")
    .bind(key, JSON.stringify(offers), nowSec + FARE_TTL_SEC, nowSec).run();
}

/**
 * Stale fallback: the freshest row for the key regardless of expiry. Served
 * with stale:true when the live supplier call fails — a visibly old price
 * beats a 502, and the flag keeps it honest.
 */
export async function fareCacheStale(db: DbLike, key: string): Promise<CachedFares | null> {
  const row = await db.prepare("SELECT response_json, created_at FROM fare_cache WHERE cache_key = ?").bind(key).first<{ response_json: string; created_at: number }>();
  if (!row) return null;
  const offers = parseOffers(row.response_json);
  if (!offers) return null;
  return { offers, source: "d1", cachedAtMs: row.created_at * 1000 };
}

/** Freshest cached offers for a route (breaker-503 alternates), newest first. */
export async function recentCachedOffers(
  db: DbLike,
  adapter: string,
  from: string,
  to: string,
  limit = 3,
  nowMs = Date.now(),
): Promise<Array<FlightOffer & { cached: true }>> {
  const rows = await db.prepare("SELECT response_json FROM fare_cache WHERE cache_key LIKE ? AND expires_at > ? ORDER BY created_at DESC LIMIT ?")
    .bind(`fare:${adapter}:${from}:${to}:%`, Math.floor(nowMs / 1000), limit).all<{ response_json: string }>();
  const out: Array<FlightOffer & { cached: true }> = [];
  for (const r of rows.results) {
    const offers = parseOffers(r.response_json);
    if (!offers) continue;
    for (const o of offers) {
      if (out.length >= limit) break;
      out.push({ ...o, cached: true });
    }
    if (out.length >= limit) break;
  }
  return out;
}

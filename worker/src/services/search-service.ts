import type { Env } from "../env.ts";
import type { Db } from "../db/database.ts";
import { db } from "../db/database.ts";
import { supplierBookabilityMap, type Bookability } from "./catalog.ts";
import { trackEvent } from "../lib/analytics.ts";

/**
 * TG-16: unified product search. FTS5 core (migration 0049) behind a
 * SearchBackend seam — a managed engine (Typesense/ES) plugs in later
 * without touching callers. LIKE fallback covers CJK precision gaps and
 * FTS outages (the index table missing = full LIKE service, flagged).
 *
 * Boundaries (honest, see TG16_PLAN.md):
 * - geo bbox filters HOTEL rows only (only hotels carry coords); other
 *   domains are excluded while a bbox is set (meta.geoScope).
 * - "availability" = bookable annotation (active + supplier + inventory
 *   configured). Date-level sellout projection is a follow-up.
 * - the hot cache is per-isolate (like TG-13 metrics); a shared Redis tier
 *   waits on a generic cache API in EphemeralStore.
 */

export const SEARCH_DOMAINS = ["HOTEL", "FLIGHT", "TRAIN", "CAR", "TRANSFER", "ACTIVITY", "PACKAGE"] as const;
export type SearchDomain = (typeof SEARCH_DOMAINS)[number];

const DEFAULT_SUPPLIER: Record<string, string> = {
  HOTEL: "ptn_htl_01",
  FLIGHT: "ptn_flt_01",
  TRAIN: "unassigned_train",
  CAR: "ptn_car_01",
  TRANSFER: "unassigned_transfer",
  ACTIVITY: "ptn_tour_01",
  PACKAGE: "unassigned_package",
};

export interface SearchQuery {
  q: string;
  domain?: SearchDomain;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  bbox?: [number, number, number, number]; // minLat, minLng, maxLat, maxLng
  sort?: "rank" | "price_asc" | "price_desc" | "rating";
  limit?: number;
  offset?: number;
}

export interface SearchHit {
  domain: string;
  itemId: string;
  title: string;
  city: string;
  priceKrw: number | null;
  rating: number | null;
  supplierId: string | null;
  bookable: boolean;
  bookableReason: string | null;
  fulfilmentMode: string | null;
  rank: number | null;
}

export interface SearchResult {
  hits: SearchHit[];
  count: number;
  hasMore: boolean;
  facets: { cities: Array<{ city: string; count: number }>; domains: Array<{ domain: string; count: number }> };
  meta: { tookMs: number; fallback: boolean; cached: boolean; geoScope: string | null };
}

export interface BuiltQuery {
  match: string | null;
  domain: string | null;
  cityMatch: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  minRating: number | null;
  bbox: [number, number, number, number] | null;
  sort: "rank" | "price_asc" | "price_desc" | "rating";
  limit: number;
  offset: number;
}

export interface RawHit {
  domain: string;
  itemId: string;
  title: string;
  city: string;
  priceKrw: number | null;
  rating: number | null;
  supplierId: string | null;
  rank: number | null;
}

/** Managed-engine seam: the only query path the service uses. */
export interface SearchBackend {
  name: string;
  search(d: Db, qb: BuiltQuery): Promise<{ hits: RawHit[]; cities: Array<{ city: string; count: number }>; domains: Array<{ domain: string; count: number }> }>;
}

const CJK_RE = /[㐀-䶿一-鿿぀-ヿ가-힯]/;
const FTS_JUNK_RE = /["*:()^]/g;
const BOOL_WORDS = new Set(["AND", "OR", "NOT", "NEAR"]);

/** User text → safe FTS5 expression (quoted terms, implicit AND). Null when empty. */
export function buildMatchExpression(q: string): string | null {
  const terms = String(q || "")
    .replace(FTS_JUNK_RE, " ")
    .split(/\s+/)
    .map((t) => t.trim().slice(0, 40))
    .filter((t) => t && !BOOL_WORDS.has(t.toUpperCase()))
    .slice(0, 20);
  if (!terms.length) return null;
  return terms.map((t) => `"${t.replace(/"/g, "")}"`).join(" ");
}

export function hasCjk(s: string): boolean {
  return CJK_RE.test(s);
}

function escLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function normalizeQuery(q: SearchQuery): BuiltQuery {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(q.limit) || 20)));
  const offset = Math.max(0, Math.min(500, Math.floor(Number(q.offset) || 0)));
  const sort = q.sort === "price_asc" || q.sort === "price_desc" || q.sort === "rating" ? q.sort : "rank";
  const domain = q.domain && (SEARCH_DOMAINS as readonly string[]).includes(q.domain) ? q.domain : null;
  const minPrice = Number.isFinite(q.minPrice) && (q.minPrice as number) >= 0 ? Math.floor(q.minPrice as number) : null;
  const maxPrice = Number.isFinite(q.maxPrice) && (q.maxPrice as number) >= 0 ? Math.floor(q.maxPrice as number) : null;
  const minRating = Number.isFinite(q.minRating) && (q.minRating as number) >= 0 && (q.minRating as number) <= 5 ? Number(q.minRating) : null;
  return {
    match: buildMatchExpression(q.q),
    domain,
    cityMatch: buildMatchExpression(q.city || ""),
    minPrice: minPrice !== null && maxPrice !== null && minPrice > maxPrice ? maxPrice : minPrice,
    maxPrice,
    minRating,
    bbox: q.bbox || null,
    sort,
    limit,
    offset,
  };
}

function orderBy(sort: BuiltQuery["sort"]): string {
  if (sort === "price_asc") return "ORDER BY price_krw ASC";
  if (sort === "price_desc") return "ORDER BY price_krw DESC";
  if (sort === "rating") return "ORDER BY rating IS NULL, rating DESC";
  return "ORDER BY rank";
}

class FtsBackend implements SearchBackend {
  name = "fts5";

  // NOTE: FTS5 MATCH takes the table NAME, never an alias (this SQLite
  // build rejects `f MATCH ?` — observed 2026-11-16, TG-16 E2E red round).
  private where(qb: BuiltQuery, binds: any[]): string {
    const conds: string[] = ["catalog_fts.active = 1"];
    if (qb.domain) { conds.push("catalog_fts.domain = ?"); binds.push(qb.domain); }
    if (qb.minPrice !== null) { conds.push("catalog_fts.price_krw >= ?"); binds.push(qb.minPrice); }
    if (qb.maxPrice !== null) { conds.push("catalog_fts.price_krw <= ?"); binds.push(qb.maxPrice); }
    if (qb.minRating !== null) { conds.push("catalog_fts.rating >= ?"); binds.push(qb.minRating); }
    return conds.join(" AND ");
  }

  private matchExpr(qb: BuiltQuery): string | null {
    const parts: string[] = [];
    if (qb.match) parts.push(qb.match);
    if (qb.cityMatch) parts.push(`{city} : (${qb.cityMatch})`);
    return parts.length ? parts.join(" ") : null;
  }

  async search(d: Db, qb: BuiltQuery) {
    const match = this.matchExpr(qb);
    if (!match) throw new Error("FtsBackend needs a MATCH expression");
    // Geo: hotels carry coords — join for the bbox, other domains excluded.
    if (qb.bbox) {
      const binds: any[] = [];
      const where = this.where({ ...qb, domain: "HOTEL" }, binds);
      const [minLat, minLng, maxLat, maxLng] = qb.bbox;
      const rows = await d.prepare(
        `SELECT catalog_fts.domain, catalog_fts.item_id AS itemId, catalog_fts.title, catalog_fts.city,
          catalog_fts.price_krw AS priceKrw, catalog_fts.rating, catalog_fts.supplier_id AS supplierId,
          bm25(catalog_fts) AS rank FROM catalog_fts JOIN hotels h ON h.id = catalog_fts.item_id
         WHERE catalog_fts MATCH ? AND ${where} AND h.latitude BETWEEN ? AND ? AND h.longitude BETWEEN ? AND ?
         ${orderBy(qb.sort)} LIMIT ? OFFSET ?`,
      ).bind(match, ...binds, minLat, maxLat, minLng, maxLng, qb.limit + 1, qb.offset).all<any>();
      return { hits: (rows.results || []) as RawHit[], cities: [], domains: [{ domain: "HOTEL", count: (rows.results || []).length }] };
    }
    const binds: any[] = [];
    const where = this.where(qb, binds);
    const rows = await d.prepare(
      `SELECT catalog_fts.domain, catalog_fts.item_id AS itemId, catalog_fts.title, catalog_fts.city,
        catalog_fts.price_krw AS priceKrw, catalog_fts.rating, catalog_fts.supplier_id AS supplierId,
        bm25(catalog_fts) AS rank FROM catalog_fts WHERE catalog_fts MATCH ? AND ${where} ${orderBy(qb.sort)} LIMIT ? OFFSET ?`,
    ).bind(match, ...binds, qb.limit + 1, qb.offset).all<any>();
    const cities = await d.prepare(
      `SELECT city, COUNT(*) AS count FROM catalog_fts WHERE catalog_fts MATCH ? AND ${where} GROUP BY city ORDER BY count DESC LIMIT 10`,
    ).bind(match, ...binds).all<any>();
    const domains = await d.prepare(
      `SELECT domain, COUNT(*) AS count FROM catalog_fts WHERE catalog_fts MATCH ? AND ${where} GROUP BY domain ORDER BY count DESC`,
    ).bind(match, ...binds).all<any>();
    return {
      hits: (rows.results || []) as RawHit[],
      cities: (cities.results || []).map((r: any) => ({ city: r.city, count: Number(r.count) })),
      domains: (domains.results || []).map((r: any) => ({ domain: r.domain, count: Number(r.count) })),
    };
  }
}

// Per-domain LIKE legs for the fallback (title/city/body equivalents).
const LIKE_LEGS: ReadonlyArray<{ domain: string; table: string; title: string; city: string; body: string; price: string; rating: string; supplier: string }> = [
  { domain: "HOTEL", table: "hotels", title: "name_ko || ' ' || name_en", city: "city", body: "COALESCE(neighborhood,'') || ' ' || COALESCE(address,'')", price: "base_price_krw", rating: "review_score", supplier: "partner_id" },
  { domain: "FLIGHT", table: "flights", title: "airline_name || ' ' || flight_number", city: "departure_city || ' ' || arrival_city", body: "airline_code || ' ' || departure_airport || ' ' || arrival_airport", price: "base_price_krw", rating: "NULL", supplier: "partner_id" },
  { domain: "TRAIN", table: "trains", title: "train_type || ' ' || train_number", city: "departure_station || ' ' || arrival_station", body: "COALESCE(seat_class,'')", price: "price_krw", rating: "NULL", supplier: "NULL" },
  { domain: "CAR", table: "cars", title: "company_name || ' ' || vehicle_model", city: "pickup_location", body: "COALESCE(vehicle_type,'')", price: "daily_price_krw", rating: "NULL", supplier: "partner_id" },
  { domain: "TRANSFER", table: "transfers", title: "service_title", city: "destination_area", body: "airport_code", price: "price_krw", rating: "NULL", supplier: "partner_id" },
  { domain: "ACTIVITY", table: "activities", title: "title", city: "city", body: "COALESCE(category,'') || ' ' || COALESCE(description,'')", price: "price_krw", rating: "review_score", supplier: "partner_id" },
  { domain: "PACKAGE", table: "packages", title: "title", city: "destination_city", body: "''", price: "total_package_krw", rating: "NULL", supplier: "NULL" },
];

async function likeFallback(d: Db, qb: BuiltQuery, terms: string[]): Promise<RawHit[]> {
  const legs = LIKE_LEGS.filter((l) => !qb.domain || l.domain === qb.domain)
    .filter((l) => !qb.bbox || l.domain === "HOTEL");
  const out: RawHit[] = [];
  for (const leg of legs) {
    const conds = ["b.is_active = 1"];
    const binds: any[] = [];
    for (const t of terms) {
      conds.push(`(${leg.title} LIKE ? ESCAPE '\\' OR ${leg.city} LIKE ? ESCAPE '\\' OR ${leg.body} LIKE ? ESCAPE '\\')`);
      const p = `%${escLike(t)}%`;
      binds.push(p, p, p);
    }
    if (qb.minPrice !== null) { conds.push(`${leg.price} >= ?`); binds.push(qb.minPrice); }
    if (qb.maxPrice !== null) { conds.push(`${leg.price} <= ?`); binds.push(qb.maxPrice); }
    if (qb.minRating !== null) { conds.push(`${leg.rating} >= ?`); binds.push(qb.minRating); }
    // Bbox legs run for HOTEL only (pre-filtered above); coords sit on the row.
    if (qb.bbox) {
      const [minLat, minLng, maxLat, maxLng] = qb.bbox;
      conds.push("b.latitude BETWEEN ? AND ?", "b.longitude BETWEEN ? AND ?");
      binds.push(minLat, maxLat, minLng, maxLng);
    }
    const rows = await d.prepare(
      `SELECT '${leg.domain}' AS domain, b.id AS itemId, ${leg.title} AS title, ${leg.city} AS city,
        ${leg.price} AS priceKrw, ${leg.rating} AS rating, ${leg.supplier} AS supplierId
       FROM ${leg.table} b WHERE ${conds.join(" AND ")} LIMIT 50`,
    ).bind(...binds).all<any>();
    for (const r of rows.results || []) out.push({ ...r, rank: null } as RawHit);
    if (out.length >= 200) break;
  }
  return out.slice(0, 50);
}

let backendOverride: SearchBackend | null = null;
/** Tests only: pin the managed-engine seam. */
export function setSearchBackend(b: SearchBackend | null): void {
  backendOverride = b;
}

const ftsBackend = new FtsBackend();

/**
 * PG branch: the harness cannot run FTS5 MATCH/bm25, so Postgres serves the
 * portable LIKE legs (same contract, facets approximated from the page).
 * A tsquery backend lands when the PG harness is green again — tracked in
 * the TG-16 backlog residue, not shipped unverified here.
 */
class PgLikeBackend implements SearchBackend {
  name = "pg-like";
  async search(d: Db, qb: BuiltQuery) {
    const terms = qb.match ? qb.match.replace(/"/g, "").split(/\s+/).filter(Boolean) : [];
    const hits = await likeFallback(d, qb, terms);
    const cities = new Map<string, number>();
    const domains = new Map<string, number>();
    for (const h of hits) {
      cities.set(h.city, (cities.get(h.city) || 0) + 1);
      domains.set(h.domain, (domains.get(h.domain) || 0) + 1);
    }
    const top = (m: Map<string, number>) => [...m.entries()].map(([k, count]) => ({ city: k, count } as any)).sort((a, b) => b.count - a.count).slice(0, 10);
    return { hits, cities: top(cities), domains: top(domains).map((x) => ({ domain: (x as any).city, count: x.count })) };
  }
}

const pgLikeBackend = new PgLikeBackend();

// Hot cache: normalized query → finished payload (per-isolate, 60s TTL).
const HOT_MAX = 200;
const HOT_TTL_MS = 60_000;
const hot = new Map<string, { exp: number; body: Omit<SearchResult, "meta"> & { meta: Omit<SearchResult["meta"], "cached" | "tookMs"> } }>();
/** Tests only. */
export function clearSearchCache(): void {
  hot.clear();
}

/**
 * Drop the hot cache after catalog writes (admin CRUD/bulk/supplier flips).
 * Writes are rare, reads are hot — a full clear is cheaper than key surgery.
 */
export function invalidateSearchCache(): void {
  hot.clear();
}

function cacheKey(qb: BuiltQuery): string {
  return JSON.stringify([qb.match, qb.domain, qb.cityMatch, qb.minPrice, qb.maxPrice, qb.minRating, qb.bbox, qb.sort, qb.limit, qb.offset]);
}

export function bookableFor(map: Map<string, Bookability>, domain: string, supplierId: string | null): { bookable: boolean; reason: string | null; mode: "LIVE" | "SIMULATED" | null } {
  const b = map.get(supplierId || DEFAULT_SUPPLIER[domain] || "") || { bookable: false, reason: "SUPPLIER_NOT_REGISTERED", mode: null, adapter: null };
  // Mirror of catalog.ts annotate(): direct-contract flights never advertise.
  if (domain === "FLIGHT" && (b as any).adapter === "direct_contract") return { bookable: false, reason: "FLIGHT_TICKETING_UNSUPPORTED", mode: null };
  return { bookable: b.bookable, reason: b.reason, mode: b.mode };
}

export async function unifiedSearch(env: Env, q: SearchQuery, viewerId?: string): Promise<SearchResult> {
  const t0 = Date.now();
  const qb = normalizeQuery(q);
  const key = cacheKey(qb);
  const now = Date.now();
  const cached = hot.get(key);
  if (cached && cached.exp > now) {
    const tookMs = Date.now() - t0;
    await trackEvent(db(env), {
      type: "search", domain: qb.domain || undefined, userId: viewerId,
      meta: { q: q.q.slice(0, 60), resultCount: cached.body.count, tookMs, fallback: false, cached: true },
    });
    return { ...cached.body, meta: { ...cached.body.meta, tookMs, cached: true } };
  }
  const d = db(env);
  const pg = !backendOverride && env.DB_DIALECT === "pg";
  const backend = backendOverride || (pg ? pgLikeBackend : ftsBackend);
  let raw: RawHit[] = [];
  let cities: SearchResult["facets"]["cities"] = [];
  let domains: SearchResult["facets"]["domains"] = [];
  let fallback = false;
  const terms = String(q.q || "").split(/\s+/).map((t) => t.trim()).filter(Boolean).slice(0, 20);
  try {
    if (!qb.match) {
      // Browse mode (no text): newest actives per domain filter.
      fallback = true;
      raw = await likeFallback(d, qb, []);
    } else {
      const r = await backend.search(d, qb);
      raw = r.hits;
      cities = r.cities;
      domains = r.domains;
      if (pg) fallback = true;
      if (!raw.length && (hasCjk(q.q) || qb.match)) {
        const like = await likeFallback(d, qb, terms.length ? terms : [q.q.trim()]);
        if (like.length) { raw = like; fallback = true; }
      }
    }
  } catch {
    // FTS table missing/corrupt (pre-0049 database): full LIKE service, flagged.
    raw = await likeFallback(d, qb, terms.length ? terms : []).catch(() => []);
    fallback = true;
  }
  const hasMore = raw.length > qb.limit;
  const page = raw.slice(qb.offset, qb.offset + qb.limit);
  const map = await supplierBookabilityMap(env).catch(() => new Map<string, Bookability>());
  const hits: SearchHit[] = page.map((h) => {
    const bb = bookableFor(map, h.domain, h.supplierId);
    return {
      domain: h.domain, itemId: h.itemId, title: h.title, city: h.city,
      priceKrw: h.priceKrw === null || h.priceKrw === undefined ? null : Number(h.priceKrw),
      rating: h.rating === null || h.rating === undefined ? null : Number(h.rating),
      supplierId: h.supplierId, bookable: bb.bookable, bookableReason: bb.reason, fulfilmentMode: bb.mode, rank: h.rank,
    };
  });
  const tookMs = Date.now() - t0;
  const body = {
    hits, count: hits.length, hasMore,
    facets: { cities, domains },
    meta: { fallback, geoScope: qb.bbox ? "HOTEL" : null },
  };
  hot.set(key, { exp: now + HOT_TTL_MS, body });
  while (hot.size > HOT_MAX) {
    const oldest = hot.keys().next().value;
    if (oldest === undefined) break;
    hot.delete(oldest);
  }
  await trackEvent(db(env), {
    type: "search", domain: qb.domain || undefined, userId: viewerId,
    meta: { q: q.q.slice(0, 60), resultCount: hits.length, tookMs, fallback, cached: false },
  });
  return { ...body, meta: { ...body.meta, tookMs, cached: false } };
}

/** Popular search terms from recent search events (JS aggregation: D1/PG portable). */
export async function popularTerms(env: Env, days: number, limit: number): Promise<Array<{ q: string; count: number }>> {
  const startDay = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db(env).prepare(
    "SELECT meta_json FROM analytics_events WHERE event_type = 'search' AND substr(created_at, 1, 10) >= ? ORDER BY created_at DESC LIMIT 2000",
  ).bind(startDay).all<any>().catch(() => ({ results: [] as any[] }));
  const counts = new Map<string, number>();
  for (const r of rows.results || []) {
    try {
      const m = JSON.parse(r.meta_json || "{}");
      const query = String(m.q || "").trim().slice(0, 60);
      if (query) counts.set(query, (counts.get(query) || 0) + 1);
    } catch { /* skip malformed */ }
  }
  return [...counts.entries()].map(([q, count]) => ({ q, count }))
    .sort((a, b) => b.count - a.count || a.q.localeCompare(b.q))
    .slice(0, limit);
}

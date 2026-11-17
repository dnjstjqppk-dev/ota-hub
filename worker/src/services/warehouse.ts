import type { Env } from "../env.ts";
import { HttpError } from "../lib/http.ts";
import type { Db } from "../db/database.ts";
import { db as portableDb } from "../db/database.ts";

/**
 * TG-19: D1 warehouse marts + the daily batch that feeds them.
 *
 * No external warehouse: at this volume a rollup mart (per-day per-domain
 * facts) plus batch-computed recommendation tables is the whole v1. The
 * batch recomputes wholesale (idempotent), so any day can be rebuilt from
 * the 90-day event retention, and reruns are always safe.
 *
 * Sources mirror /admin/insights exactly (same GMV statuses, same
 * substr(created_at,1,10) day bucketing), so the mart and the live
 * dashboard can never disagree on definitions.
 *
 * Boundaries (honest):
 * - searches/views without a domain (unscoped unified search) have no
 *   per-domain home and stay out of fact_daily; the global funnel lives
 *   on in /admin/insights.
 * - co-view pairs are same-domain only; the global top 5000 by co-count.
 * - popularity blends trailing-30d views + bookings (books x10).
 */

export const WAREHOUSE_DOMAINS = ["HOTEL", "FLIGHT", "TRAIN", "CAR", "TRANSFER", "ACTIVITY", "PACKAGE"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertRollupDate(date: string): void {
  if (!DATE_RE.test(date)) throw new HttpError(400, "INVALID_ROLLUP_DATE", "date는 YYYY-MM-DD 형식이어야 합니다.");
}

export interface RollupStats {
  rows: number;
  bookings: number;
  gmvMinor: number;
  searches: number;
  views: number;
  pairs: number;
  popular: number;
  skipped: number;
  [extra: string]: number;
}

interface CountRow {
  domain_type: string | null;
  c: number;
}

/** Recompute one day's facts + recommendation tables. Idempotent. */
export async function rollupDaily(db: Db, date: string, nowIso = new Date().toISOString()): Promise<RollupStats> {
  assertRollupDate(date);
  const byDomain = new Map<string, { bookings: number; gmvMinor: number; searches: number; views: number }>();
  for (const d of WAREHOUSE_DOMAINS) byDomain.set(d, { bookings: 0, gmvMinor: 0, searches: 0, views: 0 });

  const bookings = await db.prepare(
    "SELECT domain_type, COUNT(*) AS c FROM bookings WHERE substr(created_at, 1, 10) = ? GROUP BY domain_type",
  ).bind(date).all<CountRow>();
  for (const r of bookings.results || []) {
    const slot = byDomain.get(String(r.domain_type || "").toUpperCase());
    if (slot) slot.bookings = Number(r.c || 0);
  }

  const gmv = await db.prepare(
    `SELECT b.domain_type AS domain_type, COALESCE(SUM(p.amount_minor), 0) AS c FROM payments p
     JOIN bookings b ON b.id = p.booking_id
     WHERE p.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')
       AND substr(COALESCE(p.approved_at, p.created_at), 1, 10) = ?
     GROUP BY b.domain_type`,
  ).bind(date).all<CountRow>();
  for (const r of gmv.results || []) {
    const slot = byDomain.get(String(r.domain_type || "").toUpperCase());
    if (slot) slot.gmvMinor = Number(r.c || 0);
  }

  const funnel = await db.prepare(
    "SELECT domain AS domain_type, event_type, COUNT(*) AS c FROM analytics_events WHERE substr(created_at, 1, 10) = ? AND domain IS NOT NULL GROUP BY domain, event_type",
  ).bind(date).all<{ domain_type: string; event_type: string; c: number }>();
  for (const r of funnel.results || []) {
    const slot = byDomain.get(String(r.domain_type || "").toUpperCase());
    if (!slot) continue;
    if (r.event_type === "search") slot.searches = Number(r.c || 0);
    if (r.event_type === "view") slot.views = Number(r.c || 0);
  }

  const stmts = [];
  for (const d of WAREHOUSE_DOMAINS) {
    const s = byDomain.get(d)!;
    stmts.push(
      db.prepare(
        `INSERT INTO fact_daily (date, domain, bookings, gmv_minor, searches, views, computed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (date, domain) DO UPDATE SET bookings = excluded.bookings, gmv_minor = excluded.gmv_minor,
           searches = excluded.searches, views = excluded.views, computed_at = excluded.computed_at`,
      ).bind(date, d, s.bookings, s.gmvMinor, s.searches, s.views, nowIso),
    );
  }
  await db.batch(stmts);

  // Serving tables are always current: facts are point-in-time per `date`,
  // but pairs/popular feed live traffic, so their trailing windows end
  // today even when backfilling an old day (a yesterday cron run must
  // never wipe today's recommendations).
  const pairs = await rebuildPairs(db, nowIso);
  const popular = await rebuildPopular(db, nowIso.slice(0, 10), nowIso);

  let bookingsTotal = 0;
  let gmvTotal = 0;
  let searchesTotal = 0;
  let viewsTotal = 0;
  for (const s of byDomain.values()) {
    bookingsTotal += s.bookings;
    gmvTotal += s.gmvMinor;
    searchesTotal += s.searches;
    viewsTotal += s.views;
  }
  return { rows: WAREHOUSE_DOMAINS.length, bookings: bookingsTotal, gmvMinor: gmvTotal, searches: searchesTotal, views: viewsTotal, pairs, popular, skipped: 0 };
}

/** Same-domain co-view pairs, canonical (a<b) ordering, global top 5000. */
async function rebuildPairs(db: Db, nowIso: string): Promise<number> {
  await db.prepare("DELETE FROM reco_pairs").bind().run();
  await db.prepare(
    `INSERT INTO reco_pairs (item_a, item_b, domain, score, computed_at)
     SELECT a.entity_id, b.entity_id, a.domain, COUNT(*) AS score, ?
     FROM analytics_events a JOIN analytics_events b
       ON a.user_id = b.user_id AND a.entity_id < b.entity_id AND a.domain = b.domain
     WHERE a.event_type = 'view' AND b.event_type = 'view'
       AND a.user_id IS NOT NULL AND a.entity_id IS NOT NULL AND b.entity_id IS NOT NULL
       AND a.domain IS NOT NULL
     GROUP BY a.entity_id, b.entity_id, a.domain
     ORDER BY score DESC LIMIT 5000`,
  ).bind(nowIso).run();
  return Number((await db.prepare("SELECT COUNT(*) AS c FROM reco_pairs").bind().first<{ c: number }>())?.c || 0);
}

/** Cron entry: roll up yesterday unless it already ran fresh (< 20h). */
export async function rollupDailyJob(env: Env, date: string | null, nowMs = Date.now()): Promise<RollupStats> {
  const db = portableDb(env);
  if (date !== null) return rollupDaily(db, date);
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const yesterday = shiftDay(today, -1);
  const freshSince = new Date(nowMs - 20 * 3600_000).toISOString();
  const done = await db.prepare("SELECT COUNT(*) AS c FROM fact_daily WHERE date = ? AND computed_at >= ?")
    .bind(yesterday, freshSince).first<{ c: number }>();
  if (Number(done?.c || 0) >= WAREHOUSE_DOMAINS.length) {
    return { rows: 0, bookings: 0, gmvMinor: 0, searches: 0, views: 0, pairs: 0, popular: 0, skipped: 1 };
  }
  return rollupDaily(db, yesterday);
}

/** Day arithmetic stays in JS: date() modifiers are SQLite-only (TG-09). */
export function shiftDay(date: string, deltaDays: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms)) throw new HttpError(400, "INVALID_ROLLUP_DATE", "date는 YYYY-MM-DD 형식이어야 합니다.");
  return new Date(ms + deltaDays * 86400000).toISOString().slice(0, 10);
}

/** Top 20 items per domain over the trailing 30 days ending `asOf` (always today). Score = books*10+views. */
async function rebuildPopular(db: Db, asOf: string, nowIso: string): Promise<number> {
  const startDay = shiftDay(asOf, -29);
  await db.prepare("DELETE FROM reco_popular").bind().run();
  await db.prepare(
    `INSERT INTO reco_popular (domain, item_id, score, rank, computed_at)
     SELECT domain, item_id, score, ROW_NUMBER() OVER (PARTITION BY domain ORDER BY score DESC, item_id ASC), ?
     FROM (
       SELECT domain, item_id, SUM(score) AS score FROM (
         SELECT domain, entity_id AS item_id, COUNT(*) AS score FROM analytics_events
         WHERE event_type = 'view' AND domain IS NOT NULL AND entity_id IS NOT NULL
           AND substr(created_at, 1, 10) BETWEEN ? AND ?
         GROUP BY domain, entity_id
         UNION ALL
         SELECT domain_type AS domain, item_id, COUNT(*) * 10 AS score FROM bookings
         WHERE substr(created_at, 1, 10) BETWEEN ? AND ?
         GROUP BY domain_type, item_id
       ) GROUP BY domain, item_id
     )`,
  ).bind(nowIso, startDay, asOf, startDay, asOf).run();
  // Trim beyond rank 20 per domain (the window numbers every row).
  await db.prepare("DELETE FROM reco_popular WHERE rank > 20").bind().run();
  return Number((await db.prepare("SELECT COUNT(*) AS c FROM reco_popular").bind().first<{ c: number }>())?.c || 0);
}

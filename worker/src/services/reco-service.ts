import { newId } from "../lib/crypto.ts";
import { HttpError } from "../lib/http.ts";
import type { Db } from "../db/database.ts";
import { db as portableDb } from "../db/database.ts";
import { loadProduct } from "./catalog.ts";
import type { Env } from "../env.ts";
import { shiftDay } from "./warehouse.ts";

/**
 * TG-19: rule-based recommendations (v1) + the reco-v1 A/B experiment.
 *
 * Slots: together (batch co-views for the current item), popular (batch
 * top items, trailing 30d), recent (live: the viewer's latest distinct
 * views). Treatment sees all three; control and anonymous see popular
 * only — control keeps a measurable CTR denominator, and anonymous
 * exposures (variant 'none') stay out of the A/B metrics.
 *
 * Bucketing is a sticky FNV-1a hash (mod 100 < 50 → treatment), persisted
 * on first sight so later hash changes never re-bucket a subject.
 * Attribution is strict and documented: a clicked exposure attributes when
 * the same user books the same item within [exp_day, attr_until] (7 days).
 */

export const RECO_EXPERIMENT = "reco-v1";
export const RECO_FLAG = "RECO_V1";
export type RecoVariant = "control" | "treatment" | "none";
export type RecoSlot = "together" | "popular" | "recent";

export const RECO_SLOT_LIMIT = 4;

/** FNV-1a 32-bit (deterministic across isolates; no crypto needed). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function bucketFor(subjectId: string, experiment: string = RECO_EXPERIMENT): "control" | "treatment" {
  return fnv1a(`${experiment}:${subjectId}`) % 100 < 50 ? "treatment" : "control";
}

export async function assignVariant(db: Db, subjectId: string, experiment: string = RECO_EXPERIMENT): Promise<"control" | "treatment"> {
  const row = await db.prepare("SELECT variant FROM experiment_assignments WHERE experiment = ? AND subject_id = ?")
    .bind(experiment, subjectId).first<{ variant: string }>();
  if (row && (row.variant === "control" || row.variant === "treatment")) return row.variant;
  const variant = bucketFor(subjectId, experiment);
  await db.prepare("INSERT OR IGNORE INTO experiment_assignments (experiment, subject_id, variant) VALUES (?, ?, ?)")
    .bind(experiment, subjectId, variant).run();
  const reread = await db.prepare("SELECT variant FROM experiment_assignments WHERE experiment = ? AND subject_id = ?")
    .bind(experiment, subjectId).first<{ variant: string }>();
  return reread?.variant === "control" || reread?.variant === "treatment" ? reread.variant : variant;
}

export interface RecoCard {
  itemId: string;
  domain: string;
  title: string;
  priceKrw: number | null;
  score: number;
  exposureId: string;
}

export interface RecoResult {
  variant: RecoVariant;
  slots: Record<RecoSlot, RecoCard[]>;
}

export type ProductResolver = (domain: string, itemId: string) => Promise<{ title: string; priceKrw: number | null } | null>;

async function togetherIds(db: Db, domain: string, itemId: string, limit: number): Promise<Array<{ id: string; score: number }>> {
  const rows = await db.prepare(
    `SELECT CASE WHEN item_a = ? THEN item_b ELSE item_a END AS id, score FROM reco_pairs
     WHERE domain = ? AND (item_a = ? OR item_b = ?) ORDER BY score DESC, id ASC LIMIT ?`,
  ).bind(itemId, domain, itemId, itemId, limit).all<{ id: string; score: number }>();
  return (rows.results || []).map((r) => ({ id: r.id, score: Number(r.score || 0) }));
}

async function popularIds(db: Db, domain: string, exclude: Set<string>, limit: number): Promise<Array<{ id: string; score: number }>> {
  const rows = await db.prepare(
    "SELECT item_id AS id, score FROM reco_popular WHERE domain = ? ORDER BY rank ASC LIMIT ?",
  ).bind(domain, limit + exclude.size).all<{ id: string; score: number }>();
  return (rows.results || []).filter((r) => !exclude.has(r.id)).slice(0, limit)
    .map((r) => ({ id: r.id, score: Number(r.score || 0) }));
}

async function recentIds(db: Db, userId: string, domain: string, exclude: Set<string>, limit: number): Promise<Array<{ id: string; score: number }>> {
  const rows = await db.prepare(
    `SELECT entity_id AS id, MAX(id) AS m FROM analytics_events
     WHERE user_id = ? AND event_type = 'view' AND domain = ? AND entity_id IS NOT NULL
     GROUP BY entity_id ORDER BY m DESC LIMIT ?`,
  ).bind(userId, domain, limit + exclude.size).all<{ id: string; m: number }>();
  return (rows.results || []).filter((r) => !exclude.has(r.id)).slice(0, limit)
    .map((r) => ({ id: r.id, score: Number(r.m || 0) }));
}

export async function recommend(
  env: Env,
  input: { domain: string; itemId: string; userId: string | null },
  resolveProduct?: ProductResolver,
): Promise<RecoResult> {
  const db = portableDb(env);
  const domain = input.domain.toUpperCase();
  const variant: RecoVariant = input.userId ? await assignVariant(db, input.userId) : "none";
  const full = variant === "treatment";

  const resolve: ProductResolver = resolveProduct || (async (d, id) => {
    try {
      // HOTEL pricing needs a room (loadProduct throws without one), but a
      // recommendation card only names the property: read it directly.
      if (d === "HOTEL") {
        const h = await db.prepare("SELECT name_ko, base_price_krw FROM hotels WHERE id = ? AND is_active = 1").bind(id).first<{ name_ko: string; base_price_krw: number }>();
        if (!h) return null;
        return { title: h.name_ko, priceKrw: Number.isFinite(Number(h.base_price_krw)) ? Math.round(Number(h.base_price_krw)) : null };
      }
      const p = await loadProduct(env, d as any, id, null);
      return { title: p.title, priceKrw: Number.isFinite(p.unitPriceMajor) ? Math.round(p.unitPriceMajor) : null };
    } catch {
      return null; // dead catalog rows never surface as recommendations
    }
  });

  const seen = new Set<string>([input.itemId]);
  const build = async (slot: RecoSlot, ids: Array<{ id: string; score: number }>): Promise<RecoCard[]> => {
    const cards: RecoCard[] = [];
    for (const { id, score } of ids) {
      if (seen.has(id)) continue;
      const card = await resolve(domain, id);
      if (!card) continue;
      seen.add(id);
      cards.push({ itemId: id, domain, title: card.title, priceKrw: card.priceKrw, score, exposureId: "" });
      if (cards.length >= RECO_SLOT_LIMIT) break;
    }
    return cards;
  };

  const together = full ? await build("together", await togetherIds(db, domain, input.itemId, RECO_SLOT_LIMIT)) : [];
  const popular = await build("popular", await popularIds(db, domain, seen, RECO_SLOT_LIMIT));
  const recent = full && input.userId ? await build("recent", await recentIds(db, input.userId, domain, seen, RECO_SLOT_LIMIT)) : [];

  // Exposure log: one row per shown item (the CTR denominator). Window days
  // are stamped in JS (per-row day math is not portable SQL).
  const today = new Date().toISOString().slice(0, 10);
  const until = shiftDay(today, 6);
  const slots: Record<RecoSlot, RecoCard[]> = { together, popular, recent };
  for (const slot of ["together", "popular", "recent"] as const) {
    for (const card of slots[slot]) {
      card.exposureId = newId("rcx");
      await db.prepare(
        "INSERT INTO reco_exposures (id, variant, user_id, item_id, slot, exp_day, attr_until) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(card.exposureId, variant, input.userId, card.itemId, slot, today, until).run();
    }
  }
  return { variant, slots };
}

export async function recordRecoClick(db: Db, exposureId: string, nowIso = new Date().toISOString()): Promise<{ recorded: boolean; duplicate: boolean }> {
  const row = await db.prepare("SELECT clicked FROM reco_exposures WHERE id = ?").bind(exposureId).first<{ clicked: number }>();
  if (!row) throw new HttpError(404, "EXPOSURE_NOT_FOUND", "노출 기록을 찾을 수 없습니다.");
  if (Number(row.clicked) === 1) return { recorded: false, duplicate: true };
  await db.prepare("UPDATE reco_exposures SET clicked = 1, clicked_at = ? WHERE id = ?").bind(nowIso, exposureId).run();
  return { recorded: true, duplicate: false };
}

export interface VariantMetrics {
  variant: "control" | "treatment";
  exposures: number;
  clicks: number;
  ctr: number;
  attributedBookings: number;
}

export async function recoMetrics(db: Db): Promise<VariantMetrics[]> {
  const base = await db.prepare(
    `SELECT variant, COUNT(*) AS exposures, COALESCE(SUM(clicked), 0) AS clicks FROM reco_exposures
     WHERE variant IN ('control', 'treatment') GROUP BY variant`,
  ).bind().all<{ variant: string; exposures: number; clicks: number }>();
  const attr = await db.prepare(
    `SELECT e.variant AS variant, COUNT(DISTINCT b.id) AS bookings FROM reco_exposures e
     JOIN bookings b ON b.user_id = e.user_id AND b.item_id = e.item_id
       AND substr(b.created_at, 1, 10) BETWEEN e.exp_day AND e.attr_until
     WHERE e.variant IN ('control', 'treatment') AND e.clicked = 1 AND e.user_id IS NOT NULL
     GROUP BY e.variant`,
  ).bind().all<{ variant: string; bookings: number }>();
  const attrMap = new Map((attr.results || []).map((r) => [r.variant, Number(r.bookings || 0)]));
  return (["control", "treatment"] as const).map((variant) => {
    const row = (base.results || []).find((r) => r.variant === variant);
    const exposures = Number(row?.exposures || 0);
    const clicks = Number(row?.clicks || 0);
    return {
      variant,
      exposures,
      clicks,
      ctr: exposures > 0 ? Math.round((clicks / exposures) * 10000) / 10000 : 0,
      attributedBookings: attrMap.get(variant) || 0,
    };
  });
}

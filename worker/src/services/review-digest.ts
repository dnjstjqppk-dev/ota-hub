import type { Env } from "../env.ts";
import type { Db } from "../db/database.ts";
import { db as portableDb } from "../db/database.ts";
import { generateText, scrubOutput, type AiTextRunner } from "./ai-service.ts";

/**
 * TG-21: per-product review digests (weekly batch + on-demand admin run).
 *
 * With Workers AI bound, the newest 10 visible reviews compress to 3 lines;
 * without it (local dev, tests, unconfigured production) the digest quotes
 * the top 2 reviews under the average. Either way the output passes the
 * PII/blocklist filter — reviewers paste phone numbers into comments.
 */

export interface ReviewDigest {
  domain: string;
  itemId: string;
  summary: string;
  source: "ai" | "fallback";
  reviewCount: number;
  avgRating: number | null;
}

interface ReviewRow {
  rating: number;
  comment: string;
  created_at: string;
}

const DIGEST_SYSTEM = [
  "너는 여행 상품 리뷰를 3줄 이내, 300자 이내 한국어로 요약한다.",
  "장점과 단점을 균형 있게 담고, 평점 분포를 한마디로 언급한다.",
  "개인정보(이메일·전화·여권)를 절대 포함하지 않고, 욕설은 쓰지 않는다.",
  "리뷰에 없는 사실을 지어내지 않는다.",
].join(" ");

export function fallbackDigest(rows: ReviewRow[]): { summary: string; avgRating: number | null } {
  if (!rows.length) return { summary: "", avgRating: null };
  const avg = rows.reduce((n, r) => n + Number(r.rating || 0), 0) / rows.length;
  const quotes = [...rows]
    .sort((a, b) => Number(b.rating) - Number(a.rating) || String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 2)
    .map((r) => `"${String(r.comment || "").trim().slice(0, 80)}"`);
  return {
    summary: scrubOutput(`평점 ${avg.toFixed(1)} (${rows.length}개 리뷰). 대표 리뷰: ${quotes.join(" · ")}`),
    avgRating: Math.round(avg * 10) / 10,
  };
}

export async function loadVisibleReviews(db: Db, domain: string, itemId: string, limit = 50): Promise<ReviewRow[]> {
  const rows = await db.prepare(
    "SELECT rating, comment, created_at FROM reviews WHERE domain_type = ? AND target_id = ? AND (is_blinded IS NULL OR is_blinded = 0) ORDER BY created_at DESC, id DESC LIMIT ?",
  ).bind(domain, itemId, limit).all<ReviewRow>();
  return rows.results || [];
}

export async function computeDigestFor(
  env: Env,
  domain: string,
  itemId: string,
  runner?: AiTextRunner,
): Promise<ReviewDigest | null> {
  const db = portableDb(env);
  const rows = await loadVisibleReviews(db, domain.toUpperCase(), itemId);
  if (!rows.length) {
    await db.prepare("DELETE FROM review_digests WHERE domain = ? AND item_id = ?").bind(domain.toUpperCase(), itemId).run();
    return null;
  }
  const avg = rows.reduce((n, r) => n + Number(r.rating || 0), 0) / rows.length;
  const recent = rows.slice(0, 10);
  const ai = await generateText(env, {
    system: DIGEST_SYSTEM,
    user: recent.map((r, i) => `[${i + 1}] ★${r.rating}: ${String(r.comment || "").slice(0, 400)}`).join("\n"),
    maxTokens: 300,
  }, runner);
  const fb = fallbackDigest(rows);
  const summary = ai.text || fb.summary;
  const source = ai.text ? "ai" : "fallback";
  const nowIso = new Date().toISOString();
  await db.prepare(
    `INSERT INTO review_digests (domain, item_id, summary, source, review_count, avg_rating, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (domain, item_id) DO UPDATE SET summary = excluded.summary, source = excluded.source,
       review_count = excluded.review_count, avg_rating = excluded.avg_rating, computed_at = excluded.computed_at`,
  ).bind(domain.toUpperCase(), itemId, summary, source, rows.length, Math.round(avg * 10) / 10, nowIso).run();
  return { domain: domain.toUpperCase(), itemId, summary, source, reviewCount: rows.length, avgRating: Math.round(avg * 10) / 10 };
}

/** Cron entry: weekly recompute unless it already ran fresh (< 6d). */
export async function reviewDigestJob(env: Env, nowMs = Date.now()): Promise<{ computed: number; cleared: number; skipped: number }> {
  const db = portableDb(env);
  try {
    const beat = await db.prepare("SELECT ran_at FROM cron_heartbeats WHERE job = 'review_digest'").bind().first<{ ran_at: string }>();
    if (beat && nowMs - Date.parse(beat.ran_at) < 6 * 86400000) return { computed: 0, cleared: 0, skipped: 1 };
  } catch {
    /* pre-0038 databases simply have no table yet — run anyway */
  }
  const stats = await digestBatch(env);
  return { ...stats, skipped: 0 };
}

/** Recompute digests for every reviewed product (optionally scoped). */
export async function digestBatch(env: Env, scope?: { domain?: string; itemId?: string }, runner?: AiTextRunner): Promise<{ computed: number; cleared: number }> {
  const db = portableDb(env);
  let computed = 0;
  let cleared = 0;
  if (scope?.itemId && scope?.domain) {
    const r = await computeDigestFor(env, scope.domain, scope.itemId, runner);
    if (r) computed += 1;
    else cleared += 1;
    return { computed, cleared };
  }
  const where = scope?.domain ? "AND domain_type = ?" : "";
  const binds: string[] = scope?.domain ? [scope.domain.toUpperCase()] : [];
  const products = await db.prepare(
    `SELECT DISTINCT domain_type AS domain, target_id AS item_id FROM reviews WHERE (is_blinded IS NULL OR is_blinded = 0) ${where}`,
  ).bind(...binds).all<{ domain: string; item_id: string }>();
  for (const p of products.results || []) {
    const r = await computeDigestFor(env, p.domain, p.item_id, runner);
    if (r) computed += 1;
    else cleared += 1;
  }
  return { computed, cleared };
}

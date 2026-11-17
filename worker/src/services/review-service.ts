/**
 * CR-01 review helpers shared by the public review API, the partner inbox and
 * operator moderation. Scores are always recomputed from visible verified
 * reviews — a blinded review stops counting the moment it is blinded.
 */
import { HttpError } from "../lib/http.ts";

export const MAX_REVIEW_PHOTOS = 5;
const UPLOAD_URL_RE = /^\/api\/v1\/uploads\/([A-Za-z0-9_-]+)\/file$/;

type Db = D1Database;

/** Parse stored photos_json defensively: anything malformed reads as "no photos". */
export function parsePhotos(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((p) => typeof p === "string" && UPLOAD_URL_RE.test(p)).slice(0, MAX_REVIEW_PHOTOS) : [];
  } catch {
    return [];
  }
}

/** Upload ids out of the submitted photo URLs; shape errors are 400s. */
export function photoUploadIds(input: unknown): string[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new HttpError(400, "INVALID_PHOTOS", "사진은 업로드한 파일 주소 목록이어야 합니다.");
  if (input.length > MAX_REVIEW_PHOTOS) throw new HttpError(400, "TOO_MANY_PHOTOS", `사진은 최대 ${MAX_REVIEW_PHOTOS}장까지 첨부할 수 있습니다.`);
  const ids = input.map((p) => {
    const m = typeof p === "string" ? p.match(UPLOAD_URL_RE) : null;
    if (!m) throw new HttpError(400, "INVALID_PHOTOS", "사진은 이 사이트에 업로드한 파일만 첨부할 수 있습니다.");
    return m[1];
  });
  if (new Set(ids).size !== ids.length) throw new HttpError(400, "INVALID_PHOTOS", "같은 사진을 두 번 첨부할 수 없습니다.");
  return ids;
}

/** Every photo must be the reviewer's own REVIEW_PHOTO upload. */
export async function assertOwnReviewPhotos(db: Db, userId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await db.prepare(
    `SELECT id FROM uploads WHERE purpose = 'REVIEW_PHOTO' AND owner_type = 'USER' AND owner_id = ? AND id IN (${ids.map(() => "?").join(",")})`,
  ).bind(userId, ...ids).all<{ id: string }>();
  const found = new Set((rows.results || []).map((r) => r.id));
  if (ids.some((id) => !found.has(id))) throw new HttpError(400, "PHOTO_NOT_OWNED", "본인이 업로드한 후기 사진만 첨부할 수 있습니다.");
  return ids.map((id) => `/api/v1/uploads/${id}/file`);
}

/** 1..5 histogram from rows of { rating, c }. Half ratings round down into a bucket. */
export function ratingDistribution(rows: Array<{ rating: number; c: number }>): Record<"1" | "2" | "3" | "4" | "5", number> {
  const d = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const r of rows) {
    const k = String(Math.min(5, Math.max(1, Math.floor(Number(r.rating))))) as keyof typeof d;
    d[k] += Number(r.c || 0);
  }
  return d;
}

const SCORE_TABLES: Record<string, string> = { HOTEL: "hotels", ACTIVITY: "activities" };

/** Recompute a product's stored score from visible reviews only. */
export function rescoreStatement(db: Db, domain: string, targetId: string): D1PreparedStatement | null {
  const table = SCORE_TABLES[domain];
  if (!table) return null;
  return db.prepare(
    `UPDATE ${table} SET
       review_count = (SELECT COUNT(*) FROM reviews WHERE domain_type = ? AND target_id = ? AND is_blinded = 0),
       review_score = (SELECT ROUND(AVG(rating) * 10) / 10 FROM reviews WHERE domain_type = ? AND target_id = ? AND is_blinded = 0)
     WHERE id = ?`,
  ).bind(domain, targetId, domain, targetId, targetId);
}

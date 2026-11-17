/**
 * TG-19: rule-based recommendations (v1).
 *
 * GET /api/v1/recommendations?domain=HOTEL&itemId=htl_x
 *   → { variant, slots: { together, popular, recent } }. Treatment sees
 *   all three; control and anonymous see popular only. Kill-switched by
 *   the RECO_V1 flag (OFF → 503, and the UI hides the slot).
 * POST /api/v1/recommendations/click { exposureId }
 *   → marks the exposure clicked (CTR numerator). Idempotent.
 */
import type { Env } from "../env.ts";
import { HttpError, json, str } from "../lib/http.ts";
import { optionalUser, rateLimit } from "../lib/auth.ts";
import { isDomain } from "../domain/pricing.ts";
import { isFeatureEnabled } from "../services/feature-flag-service.ts";
import { RECO_FLAG, recommend, recordRecoClick } from "../services/reco-service.ts";
import { db as portableDb } from "../db/database.ts";

export async function handleRecommendations(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (path !== "/api/v1/recommendations" && path !== "/api/v1/recommendations/click") return null;

  if (path === "/api/v1/recommendations/click" && request.method === "POST") {
    await rateLimit(request, env, "reco_click", 120, 60);
    if (!await isFeatureEnabled(env, RECO_FLAG)) {
      throw new HttpError(503, "RECO_DISABLED", "추천 기능이 일시 중단되었습니다.");
    }
    const body = await request.json().catch(() => ({}));
    const exposureId = str((body as any)?.exposureId, 64);
    if (!exposureId) throw new HttpError(400, "EXPOSURE_REQUIRED", "exposureId가 필요합니다.");
    return json({ success: true, ...(await recordRecoClick(portableDb(env), exposureId)) });
  }

  if (path === "/api/v1/recommendations" && request.method === "GET") {
    await rateLimit(request, env, "reco_read", 120, 60);
    if (!await isFeatureEnabled(env, RECO_FLAG)) {
      throw new HttpError(503, "RECO_DISABLED", "추천 기능이 일시 중단되었습니다.");
    }
    const domain = str(url.searchParams.get("domain"), 20).toUpperCase();
    if (!isDomain(domain)) throw new HttpError(400, "INVALID_DOMAIN", "상품 유형이 올바르지 않습니다.");
    const itemId = str(url.searchParams.get("itemId") || url.searchParams.get("item_id"), 100);
    if (!itemId) throw new HttpError(400, "ITEM_REQUIRED", "상품을 선택해주세요.");
    const viewer = await optionalUser(request, env);
    const result = await recommend(env, { domain, itemId, userId: viewer?.id ?? null });
    return json({ success: true, ...result });
  }

  return json({ error: "지원하지 않는 메서드입니다.", code: "METHOD_NOT_ALLOWED" }, 405);
}

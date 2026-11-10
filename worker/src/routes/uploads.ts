/**
 * File uploads (C1): partner onboarding docs and product images on R2.
 *
 * POST /api/v1/uploads (multipart: file, purpose, ownerId? for admins)
 *   BUSINESS_CERT / BANK_CERT -> partner only, auto-linked to their profile.
 *   PRODUCT_IMAGE             -> partner (own products) or admin.
 *   REVIEW_PHOTO / MOMENT_PHOTO -> signed-in users.
 * GET /api/v1/uploads/:id/file
 *   Product/review/moment images are public (they render on product pages);
 *   onboarding docs are readable only by the owning partner or an admin.
 */
import type { Env } from "../env.ts";
import { HttpError, json, str } from "../lib/http.ts";
import { audit, getAuthUser, rateLimit } from "../lib/auth.ts";
import { newId } from "../lib/crypto.ts";

const PURPOSES = ["BUSINESS_CERT", "BANK_CERT", "PRODUCT_IMAGE", "REVIEW_PHOTO", "MOMENT_PHOTO"] as const;
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const DOC_TYPES: Record<string, string> = { ...IMAGE_TYPES, "application/pdf": "pdf" };
const MAX_BYTES = 8 * 1024 * 1024;

function extFor(purpose: string, contentType: string): string | null {
  const table = purpose === "BUSINESS_CERT" || purpose === "BANK_CERT" ? DOC_TYPES : IMAGE_TYPES;
  return table[contentType] || null;
}

export async function handleUploads(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/v1/uploads" && method === "POST") {
    const user = await getAuthUser(request, env);
    if (!user) throw new HttpError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
    if (!env.UPLOADS) throw new HttpError(503, "UPLOADS_UNAVAILABLE", "파일 저장소가 설정되지 않았습니다.");
    await rateLimit(request, env, "uploads", 30, 3600);
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    const purpose = str(form?.get("purpose"), 20).toUpperCase();
    if (!(PURPOSES as readonly string[]).includes(purpose)) {
      throw new HttpError(400, "INVALID_PURPOSE", `purpose는 ${PURPOSES.join(" | ")} 중 하나여야 합니다.`);
    }
    if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
      throw new HttpError(400, "FILE_REQUIRED", "업로드할 파일을 보내주세요.");
    }
    const f = file as unknown as File;
    const ext = extFor(purpose, f.type);
    if (!ext) throw new HttpError(400, "UNSUPPORTED_FILE_TYPE", "이미지(JPEG/PNG/WebP) 또는 PDF(PDF는 서류만) 파일만 업로드할 수 있습니다.");
    if (f.size <= 0 || f.size > MAX_BYTES) throw new HttpError(400, "FILE_TOO_LARGE", "파일은 8MB 이하여야 합니다.");

    // Ownership: docs belong to the calling partner; images to the product
    // owner; user photos to the user. Admins may upload for any owner.
    let ownerType = "PARTNER";
    let ownerId = "";
    if (user.role === "ADMIN") {
      ownerType = purpose === "REVIEW_PHOTO" || purpose === "MOMENT_PHOTO" ? "USER" : "PARTNER";
      ownerId = str(form?.get("ownerId"), 64) || (ownerType === "PARTNER" ? "getfortrip" : user.id);
    } else if (user.role === "PARTNER") {
      if (purpose === "REVIEW_PHOTO" || purpose === "MOMENT_PHOTO") throw new HttpError(403, "FORBIDDEN", "이 용도의 파일은 회원만 업로드할 수 있습니다.");
      ownerId = (user as any).partnerId || user.id;
    } else {
      if (purpose !== "REVIEW_PHOTO" && purpose !== "MOMENT_PHOTO") throw new HttpError(403, "FORBIDDEN", "이 용도의 파일은 파트너만 업로드할 수 있습니다.");
      ownerType = "USER";
      ownerId = user.id;
    }

    const id = newId("upl");
    const key = `${purpose}/${ownerType}/${ownerId}/${id}.${ext}`;
    await env.UPLOADS.put(key, await f.arrayBuffer(), { httpMetadata: { contentType: f.type } });
    const fileUrl = `/api/v1/uploads/${id}/file`;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO uploads (id, owner_type, owner_id, purpose, object_key, content_type, size_bytes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, ownerType, ownerId, purpose, key, f.type, f.size, user.id),
      // Onboarding docs link straight onto the partner profile (C1 gate reads them).
      ...(ownerType === "PARTNER" && (purpose === "BUSINESS_CERT" || purpose === "BANK_CERT")
        ? [env.DB.prepare(`UPDATE partner_profiles SET ${purpose === "BUSINESS_CERT" ? "business_cert_url" : "bank_cert_url"} = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE partner_id = ?`).bind(fileUrl, ownerId)]
        : []),
    ]);
    await audit(env, user.id, "FILE_UPLOADED", "UPLOAD", id, { purpose, ownerType, ownerId, size: f.size });
    return json({ success: true, id, url: fileUrl, purpose }, 201);
  }

  const m = path.match(/^\/api\/v1\/uploads\/([A-Za-z0-9_-]+)\/file$/);
  if (m && method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM uploads WHERE id = ?").bind(m[1]).first<any>();
    if (!row) throw new HttpError(404, "UPLOAD_NOT_FOUND", "파일을 찾을 수 없습니다.");
    if (row.purpose === "BUSINESS_CERT" || row.purpose === "BANK_CERT") {
      const user = await getAuthUser(request, env);
      const ownerId = (user as any)?.partnerId || user?.id;
      if (!user || (user.role !== "ADMIN" && ownerId !== row.owner_id)) {
        throw new HttpError(403, "FORBIDDEN", "이 서류를 볼 권한이 없습니다.");
      }
    }
    if (!env.UPLOADS) throw new HttpError(503, "UPLOADS_UNAVAILABLE", "파일 저장소가 설정되지 않았습니다.");
    const obj = await env.UPLOADS.get(row.object_key);
    if (!obj) throw new HttpError(404, "UPLOAD_NOT_FOUND", "파일을 찾을 수 없습니다.");
    return new Response(obj.body, { status: 200, headers: { "Content-Type": row.content_type, "Cache-Control": "public, max-age=31536000, immutable" } });
  }

  return null;
}

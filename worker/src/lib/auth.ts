import type { Env } from "../env.ts";
import { sha256Hex, verifyJwt } from "./crypto.ts";
import { HttpError, clientIp } from "./http.ts";

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
  role: "USER" | "ADMIN" | "PARTNER";
  tier?: string;
}

export function jwtSecret(env: Env): string {
  const s = (env.JWT_SECRET || "").trim();
  if (s.length < 32) throw new HttpError(503, "CONFIG_ERROR", "인증 서버 설정이 완료되지 않았습니다.");
  return s;
}

export async function getAuthUser(request: Request, env: Env): Promise<AuthUser | null> {
  let secret: string;
  try {
    secret = jwtSecret(env);
  } catch {
    return null;
  }
  let token = "";
  const h = request.headers.get("Authorization");
  if (h?.startsWith("Bearer ")) token = h.slice(7).trim();
  if (!token) {
    const cookies = request.headers.get("Cookie") || "";
    const mPartner = cookies.match(/(?:^|;\s*)getfortrip_partner_jwt=([^;]+)/);
    const mAdmin = cookies.match(/(?:^|;\s*)getfortrip_admin_jwt=([^;]+)/);
    const mUser = cookies.match(/(?:^|;\s*)getfortrip_jwt=([^;]+)/);
    token = mPartner?.[1] || mAdmin?.[1] || mUser?.[1] || "";
  }
  if (!token) return null;
  const p = await verifyJwt(token, secret);
  if (!p || typeof p.id !== "string") return null;
  return { id: p.id, email: p.email, fullName: p.fullName, role: p.role, tier: p.tier };
}

export async function requireUser(request: Request, env: Env): Promise<AuthUser> {
  const u = await getAuthUser(request, env);
  if (!u || (u.role !== "USER" && u.role !== "ADMIN")) throw new HttpError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  return u;
}

/**
 * Admin check re-reads the role from the database so a demoted admin's
 * still-valid JWT stops working immediately.
 */
export async function requireAdmin(request: Request, env: Env): Promise<AuthUser> {
  const u = await getAuthUser(request, env);
  if (!u) throw new HttpError(401, "UNAUTHORIZED", "관리자 인증이 필요합니다.");
  const row = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(u.id).first<{ role: string }>();
  if (!row || row.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "관리자 권한이 없습니다.");
  return { ...u, role: "ADMIN" };
}

/**
 * Server-to-server authentication for partner PMS/ERP integrations.
 * A `Bearer gft_live_...` token is resolved to its owning partner; JWTs are
 * untouched. Returns null when the request carries no API key.
 */
export async function getPartnerByApiKey(request: Request, env: Env): Promise<{ id: string; email: string; companyName: string } | null> {
  const h = request.headers.get("Authorization");
  if (!h?.startsWith("Bearer gft_")) return null;
  const key = h.slice(7).trim();
  if (!/^gft_(live|test)_[0-9a-f]{32}$/.test(key)) return null;
  const row = await env.DB.prepare(
    `SELECT k.partner_id AS id, p.email, p.company_name
     FROM partner_api_keys k JOIN partners p ON p.id = k.partner_id
     WHERE k.key_hash = ? AND k.is_active = 1 AND k.revoked_at IS NULL`,
  ).bind(await sha256Hex(key)).first<{ id: string; email: string; company_name: string }>();
  if (!row) return null;
  await env.DB.prepare("UPDATE partner_api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key_hash = ?")
    .bind(await sha256Hex(key)).run();
  return { id: row.id, email: row.email, companyName: row.company_name };
}

export async function requirePartner(request: Request, env: Env): Promise<AuthUser & { partnerId: string; companyName: string }> {
  const u = await getAuthUser(request, env);
  if (!u) {
    // Fall back to API-key auth before rejecting: integrations carry no JWT.
    const k = await getPartnerByApiKey(request, env).catch(() => null);
    if (!k) throw new HttpError(401, "UNAUTHORIZED", "파트너 로그인이 필요합니다.");
    const p = await env.DB.prepare(
      "SELECT p.id, p.company_name, p.is_active, COALESCE(pr.status, 'ACTIVE') AS profile_status FROM partners p LEFT JOIN partner_profiles pr ON pr.partner_id = p.id WHERE p.id = ?",
    ).bind(k.id).first<any>();
    if (!p || p.is_active !== 1 || p.profile_status !== "ACTIVE") {
      throw new HttpError(403, "PARTNER_SUSPENDED", "승인 대기 중이거나 비활성화된 파트너 계정입니다.");
    }
    return { id: k.id, email: k.email, role: "PARTNER", partnerId: k.id, companyName: p.company_name || k.companyName };
  }
  if (u.role !== "PARTNER" && u.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "파트너 권한이 없습니다.");
  const p = await env.DB.prepare(
    "SELECT p.id, p.company_name, p.is_active, COALESCE(pr.status, 'ACTIVE') AS profile_status FROM partners p LEFT JOIN partner_profiles pr ON pr.partner_id = p.id WHERE p.id = ?"
  ).bind(u.id).first<any>();
  if (!p || p.is_active !== 1 || (p.profile_status !== "ACTIVE" && u.role !== "ADMIN")) {
    throw new HttpError(403, "PARTNER_SUSPENDED", "승인 대기 중이거나 비활성화된 파트너 계정입니다.");
  }
  return { ...u, partnerId: u.id, companyName: p?.company_name || 'GetForTrip 입점 파트너' };
}

/**
 * Sliding-window rate limit backed by D1. Fails CLOSED: if the limiter itself
 * errors, the request is rejected rather than allowed.
 */
export async function rateLimit(request: Request, env: Env, bucket: string, limit: number, windowSec: number): Promise<void> {
  const ip = clientIp(request);
  const now = Math.floor(Date.now() / 1000);
  const key = `${bucket}:${ip}`;
  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM login_attempts WHERE ip_address = ? AND attempted_at > ?")
      .bind(key, now - windowSec)
      .first<{ c: number }>();
    if (Number(row?.c || 0) >= limit) {
      throw new HttpError(429, "TOO_MANY_REQUESTS", "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
    }
    await env.DB.prepare("INSERT INTO login_attempts (ip_address, email, attempted_at) VALUES (?, ?, ?)").bind(key, bucket, now).run();
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(503, "RATE_LIMIT_UNAVAILABLE", "일시적으로 요청을 처리할 수 없습니다.");
  }
}

export function authCookie(token: string, env: Env): string {
  const secure = env.APP_ENV === "development" || env.APP_ENV === "test" ? "" : " Secure;";
  return `getfortrip_jwt=${token}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=604800`;
}

export async function audit(env: Env, adminId: string, action: string, targetType: string, targetId: string, details: unknown): Promise<void> {
  await env.DB.prepare("INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(`aud_${crypto.randomUUID().replace(/-/g, "")}`, adminId, action, targetType, targetId, typeof details === "string" ? details : JSON.stringify(details))
    .run();
}

import type { Env } from "../env.ts";
import { verifyJwt } from "./crypto.ts";
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
    const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)getfortrip_jwt=([^;]+)/);
    if (m) token = m[1];
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

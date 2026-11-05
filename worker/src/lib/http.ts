import type { Env } from "../env.ts";

export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SECURITY_HEADERS, ...headers },
  });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return json({ error: e.message, code: e.code, details: e.details ?? undefined }, e.status);
  }
  console.error("UNHANDLED", e instanceof Error ? e.stack || e.message : e);
  // Never leak internal error messages / SQL to clients.
  return json({ error: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", code: "INTERNAL_ERROR" }, 500);
}

export async function readJson<T = any>(request: Request, maxBytes = 64 * 1024): Promise<T> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "요청 본문이 너무 큽니다.");
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "MALFORMED_JSON", "요청 본문이 올바른 JSON이 아닙니다.");
  }
}

export function allowedOrigin(origin: string | null, env: Env): string | null {
  if (!origin) return null;
  const list = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const o = origin.toLowerCase();
  if (list.includes(o)) return origin;
  if (/^https:\/\/(ota-hub|ota-admin|ota-partner)\.dnjstjqppk\.workers\.dev$/.test(o)) return origin;
  if (/^https:\/\/([a-z0-9-]+\.)?getfortrip\.com$/.test(o)) return origin;
  if ((env.APP_ENV === "development" || env.APP_ENV === "test") && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return origin;
  return null;
}

/** Apply CORS for an allow-listed origin only (credentials permitted). */
export function withCors(resp: Response, request: Request, env: Env): Response {
  const origin = allowedOrigin(request.headers.get("Origin"), env);
  if (!origin) return resp;
  const h = new Headers(resp.headers);
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Access-Control-Allow-Credentials", "true");
  h.set("Vary", "Origin");
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
}

export function preflight(request: Request, env: Env): Response {
  const origin = allowedOrigin(request.headers.get("Origin"), env);
  const headers: Record<string, string> = { ...SECURITY_HEADERS };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Idempotency-Key";
    headers["Access-Control-Max-Age"] = "86400";
    headers["Vary"] = "Origin";
  }
  return new Response(null, { status: 204, headers });
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || "0.0.0.0";
}

export function str(v: unknown, max = 500): string {
  return String(v ?? "").trim().slice(0, max);
}

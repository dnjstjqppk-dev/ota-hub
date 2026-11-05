/**
 * GetForTrip edge API (Cloudflare Worker + D1).
 *
 * Routing only — business logic lives in worker/src:
 *   src/domain     pure, unit-tested rules (money, pricing, state machine, ledger)
 *   src/services   booking orchestration, catalog loading
 *   src/payments   PG adapters (Toss, sandbox simulator)
 *   src/suppliers  supplier adapters (simulator, direct contract)
 *   src/routes     HTTP handlers (auth, bookings, catalog, admin, partner, affiliate, user)
 */
import type { Env } from "./src/env.ts";
import { SECURITY_HEADERS, errorResponse, json, preflight, withCors } from "./src/lib/http.ts";
import { getPaymentProvider } from "./src/payments/provider.ts";
import { handleAuth } from "./src/routes/auth.ts";
import { handleBookings } from "./src/routes/bookings.ts";
import { handleCatalog } from "./src/routes/catalog.ts";
import { handleUser } from "./src/routes/user.ts";
import { handleAdmin } from "./src/routes/admin.ts";
import { handlePartner } from "./src/routes/partner.ts";
import { handleAffiliate } from "./src/routes/affiliate.ts";
import { handleFeatureFlags } from "./src/routes/feature-flags.ts";
import { handleUrlIngest } from "./src/routes/url-ingest.ts";
import { runMaintenance } from "./src/services/booking-service.ts";
import { sitemap } from "./src/routes/seo.ts";

export type { Env };

async function health(env: Env): Promise<Response> {
  let db = false;
  try {
    db = (await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>())?.ok === 1;
  } catch {}
  const jwt = (env.JWT_SECRET || "").trim().length >= 32;
  const entity = db ? await env.DB.prepare("SELECT status FROM business_entities WHERE status = 'ACTIVE' LIMIT 1").first().catch(() => null) : null;
  const pay = getPaymentProvider(env);
  return json({
    status: db && jwt ? "ok" : "degraded",
    env: env.APP_ENV || "production",
    checks: {
      database: db,
      jwtSecret: jwt,
      piiEncryptionKey: Boolean(env.PII_ENC_KEY),
      paymentProvider: pay ? `${pay.name}:${pay.mode}` : "DISABLED",
      sellerEntityActive: Boolean(entity),
      emailProvider: "NOT_CONFIGURED",
    },
    time: new Date().toISOString(),
  }, db && jwt ? 200 : 503);
}

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  if (path === "/api/v1/health") return health(env);
  for (const h of [handleAuth, handleBookings, handleAdmin, handlePartner, handleUser, handleAffiliate, handleFeatureFlags, handleUrlIngest, handleCatalog]) {
    const r = await h(request, env, url);
    if (r) return r;
  }
  return json({ error: "요청하신 API를 찾을 수 없습니다.", code: "NOT_FOUND" }, 404);
}

async function spaShell(env: Env, url: URL, request: Request): Promise<Response | null> {
  let r = await env.ASSETS.fetch(new Request(`${url.origin}/200.html`, { method: "GET", headers: request.headers }));
  if (r.status === 307 || r.status === 308) {
    const loc = r.headers.get("Location");
    if (loc) r = await env.ASSETS.fetch(new Request(new URL(loc, url.origin).toString(), { method: "GET", headers: request.headers }));
  }
  if (r.status !== 200) return null;
  const h = new Headers(r.headers);
  h.set("Cache-Control", "no-cache");
  return new Response(request.method === "HEAD" ? null : r.body, { status: 200, headers: h });
}

async function serveAssets(request: Request, env: Env, url: URL): Promise<Response> {
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  const isAdminHost = host.startsWith("admin.") || host.startsWith("ota-admin.");
  const isPartnerHost = host.startsWith("partner.") || host.startsWith("ota-partner.");

  // 1. Admin Host Dispatching (e.g. ota-admin.dnjstjqppk.workers.dev or admin.getfortrip.com)
  if (isAdminHost) {
    if (path.startsWith("/admin/")) {
      return Response.redirect(`${url.origin}${path.replace(/^\/admin/, "") || "/"}`, 301);
    }
    const a = await env.ASSETS.fetch(new Request(`${url.origin}/admin${path}`, request));
    if (a.status === 200) return a;
    const idx = await env.ASSETS.fetch(new Request(`${url.origin}/admin/index.html`, request));
    if (idx.status === 200) return idx;
  }

  // 2. Partner Host Dispatching (e.g. ota-partner.dnjstjqppk.workers.dev or partner.getfortrip.com)
  if (isPartnerHost) {
    if (path.startsWith("/partner/")) {
      return Response.redirect(`${url.origin}${path.replace(/^\/partner/, "") || "/"}`, 301);
    }
    const a = await env.ASSETS.fetch(new Request(`${url.origin}/partner${path}`, request));
    if (a.status === 200) return a;
    const idx = await env.ASSETS.fetch(new Request(`${url.origin}/partner/index.html`, request));
    if (idx.status === 200) return idx;
  }

  // 3. Backwards-compatible path routing on default host (ota-hub)
  if (path === "/admin") return Response.redirect(`${url.origin}/admin/`, 301);
  if (path.startsWith("/admin/")) {
    const a = await env.ASSETS.fetch(request);
    if (a.status === 200) return a;
    const idx = await env.ASSETS.fetch(new Request(`${url.origin}/admin/index.html`, request));
    if (idx.status === 200) return idx;
  }

  if (path === "/partner") return Response.redirect(`${url.origin}/partner/`, 301);
  if (path.startsWith("/partner/")) {
    const a = await env.ASSETS.fetch(request);
    if (a.status === 200) return a;
    const idx = await env.ASSETS.fetch(new Request(`${url.origin}/partner/index.html`, request));
    if (idx.status === 200) return idx;
  }

  // 4. User Portal Routing (Default)
  let res = await env.ASSETS.fetch(request);
  if (res.status === 404 && (request.method === "GET" || request.method === "HEAD") && !/\.[A-Za-z0-9]{1,8}$/.test(path)) {
    const shell = await spaShell(env, url, request);
    if (shell) res = shell;
  }
  if (res.status === 307) return new Response(null, { status: 301, headers: { Location: res.headers.get("Location") || "/", ...SECURITY_HEADERS } });
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!h.has(k)) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith("/api/") || url.pathname.startsWith("/out/");
    if (!isApi) {
      if (url.pathname === "/sitemap.xml") return sitemap(env);
      return serveAssets(request, env, url);
    }
    if (request.method === "OPTIONS") return preflight(request, env);
    let res: Response;
    try {
      res = await route(request, env, url);
    } catch (e) {
      res = errorResponse(e);
    }
    return withCors(res, request, env);
  },

  /** Cron: expire abandoned bookings, reconcile unknown payments, retry refunds. */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runMaintenance(env).then((s) => console.log("maintenance", JSON.stringify(s))));
  },
};

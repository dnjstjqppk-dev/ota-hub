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
import { optionalUser, requireAdmin } from "./src/lib/auth.ts";
import { trackEvent } from "./src/lib/analytics.ts";
import { db } from "./src/db/database.ts";
import {
  REPLICA_LAG_HEADER,
  REPLICA_ROUTE_HEADER,
  isReplicaPath,
  observedRegion,
  proxyToReplica,
  replicaLastFallback,
  replicaMirrorDomain,
  replicaNeedsMirror,
  resolveReplicaConfig,
} from "./src/lib/replica.ts";
import { captureException } from "./src/lib/sentry.ts";
import { bindRequest, exportTrace, finishRequest, formatTraceParent } from "./src/lib/tracing.ts";
import { recordRequest, templateRoute } from "./src/lib/metrics.ts";
import { logSlowRequest } from "./src/lib/log.ts";
import { getPaymentProvider } from "./src/payments/provider.ts";
import { handleAuth } from "./src/routes/auth.ts";
import { handleBookings } from "./src/routes/bookings.ts";
import { handleWebhooks } from "./src/routes/webhooks.ts";
import { handleCatalog } from "./src/routes/catalog.ts";
import { handleUser } from "./src/routes/user.ts";
import { handleAdmin } from "./src/routes/admin.ts";
import { handlePartner } from "./src/routes/partner.ts";
import { handleAffiliate } from "./src/routes/affiliate.ts";
import { handleFeatureFlags } from "./src/routes/feature-flags.ts";
import { handleUrlIngest } from "./src/routes/url-ingest.ts";
import { handleMarketplace } from "./src/routes/marketplace.ts";
import { handleUploads } from "./src/routes/uploads.ts";
import { handleSupport } from "./src/routes/support.ts";
import { handleEngagement } from "./src/routes/engagement.ts";
import { handleMarketing } from "./src/routes/marketing.ts";
import { handleObservability } from "./src/routes/observability.ts";
import { handleOAuth } from "./src/routes/oauth.ts";
import { handleFlights } from "./src/routes/flights.ts";
import { handleRecommendations } from "./src/routes/recommendations.ts";
import { runMaintenanceWithHeartbeat } from "./src/services/booking-service.ts";
import { rollupDailyJob } from "./src/services/warehouse.ts";
import { reviewDigestJob } from "./src/services/review-digest.ts";
import { sitemap } from "./src/routes/seo.ts";

export type { Env };

async function health(request: Request, env: Env, url: URL): Promise<Response> {
  let db = false;
  try {
    db = (await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>())?.ok === 1;
  } catch {}
  const jwt = (env.JWT_SECRET || "").trim().length >= 32;
  // #162: monitors and smoke tests get liveness only (status/database/jwt —
  // the smoke contract). Provider wiring, entity state, and cron errors are
  // operator intel: verbose=1 plus an admin token, nothing less.
  if (url.searchParams.get("verbose") !== "1") {
    return json({ status: db && jwt ? "ok" : "degraded", checks: { database: db, jwtSecret: jwt }, time: new Date().toISOString() }, db && jwt ? 200 : 503);
  }
  await requireAdmin(request, env);
  const entity = db ? await env.DB.prepare("SELECT status FROM business_entities WHERE status = 'ACTIVE' LIMIT 1").first().catch(() => null) : null;
  const pay = getPaymentProvider(env);
  // #56: last cron run. Observability only — never affects the status code.
  // "UNKNOWN" on pre-0038 databases (no table yet), "NEVER_RAN" when the cron
  // never fired. stale flips after 3 missed */5 runs for ops alerting.
  let cron: unknown = "UNKNOWN";
  if (db) {
    try {
      const beat = await env.DB.prepare("SELECT ran_at, ok, error FROM cron_heartbeats WHERE job = 'maintenance'").first<{ ran_at: string; ok: number; error: string | null }>();
      if (beat) {
        const ageSec = Math.max(0, Math.round((Date.now() - Date.parse(beat.ran_at)) / 1000));
        cron = { lastRun: beat.ran_at, ok: Number(beat.ok) === 1, ageSec, stale: ageSec > 900, ...(beat.error ? { error: beat.error } : {}) };
      } else {
        cron = "NEVER_RAN";
      }
    } catch {
      cron = "UNKNOWN";
    }
  }
  return json({
    status: db && jwt ? "ok" : "degraded",
    env: env.APP_ENV || "production",
    checks: {
      database: db,
      jwtSecret: jwt,
      piiEncryptionKey: Boolean(env.PII_ENC_KEY),
      paymentProvider: pay ? `${pay.name}:${pay.mode}` : "DISABLED",
      sellerEntityActive: Boolean(entity),
      emailProvider: (env.RESEND_API_KEY || "").trim() ? "RESEND" : "NOT_CONFIGURED",
      errorReporting: (env.SENTRY_DSN || "").trim() ? "SENTRY" : "NOT_CONFIGURED",
      cron,
    },
    time: new Date().toISOString(),
  }, db && jwt ? 200 : 503);
}

// #181: one explicit router table instead of an anonymous call order. Every
// router returns null outside its own paths; order below decides only two
// genuine overlaps — /api/v1/admin/login+logout live in auth but under the
// admin prefix, and /api/v1/partner/marketplace/* matches both the
// marketplace router and the partner prefix (partner would 404 it, so
// marketplace runs first). Catalog stays last: its detail prefixes are the
// broadest matchers in the table.
type ApiRouter = (request: Request, env: Env, url: URL) => Promise<Response | null>;
const API_ROUTES: ReadonlyArray<{ name: string; handle: ApiRouter }> = [
  // CR-06: social login lives under /api/v1/auth/oauth/* and runs before the auth router.
  { name: "oauth", handle: handleOAuth },
  { name: "auth", handle: handleAuth },
  { name: "bookings", handle: handleBookings },
  { name: "flights", handle: handleFlights },
  { name: "recommendations", handle: handleRecommendations },
  { name: "webhooks", handle: handleWebhooks },
  { name: "feature-flags", handle: handleFeatureFlags },
  { name: "url-ingest", handle: handleUrlIngest },
  { name: "marketplace", handle: handleMarketplace },
  { name: "support", handle: handleSupport },
  // CR-01..CR-05: must precede admin/partner, whose prefixes 404 unknown subpaths.
  { name: "engagement", handle: handleEngagement },
  { name: "marketing", handle: handleMarketing },
  // TG-13/15: owns /api/v1/admin/{traces,metrics,incidents,slo/*,cache/*} — ahead of admin for the same reason.
  { name: "observability", handle: handleObservability },
  { name: "admin", handle: handleAdmin },
  { name: "partner", handle: handlePartner },
  { name: "user", handle: handleUser },
  { name: "affiliate", handle: handleAffiliate },
  { name: "uploads", handle: handleUploads },
  { name: "catalog", handle: handleCatalog },
];

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  if (path === "/api/v1/health") return health(request, env, url);
  // TG-20: read-replica proxy runs before every router (proxy-first). Writes
  // and non-allowlisted reads never reach it; re-proxied requests (marked
  // with the route header) always serve locally.
  const replica = !request.headers.get(REPLICA_ROUTE_HEADER) && isReplicaPath(request.method, path)
    ? resolveReplicaConfig(env)
    : null;
  if (replica) {
    const outcome = await proxyToReplica(replica, request, url);
    if (outcome.kind === "response") {
      if (outcome.response.status === 200 && replicaNeedsMirror(path)) {
        await mirrorReplicaSearch(request, env, url, path, outcome.response.clone());
      }
      return outcome.response;
    }
    const served = await routeLocal(request, env, url);
    const h = new Headers(served.headers);
    h.set("x-replica-fallback", outcome.info.reason);
    if (outcome.info.lagMs !== null) h.set(REPLICA_LAG_HEADER, String(outcome.info.lagMs));
    return new Response(served.body, { status: served.status, statusText: served.statusText, headers: h });
  }
  return routeLocal(request, env, url);
}

/** The replica mirrors the funnel event the local handler would have logged. */
async function mirrorReplicaSearch(request: Request, env: Env, url: URL, path: string, res: Response): Promise<void> {
  try {
    const body = await res.json().catch(() => null) as any;
    const count = Number(body?.count);
    const viewer = await optionalUser(request, env).catch(() => null);
    await trackEvent(db(env), {
      type: "search",
      domain: replicaMirrorDomain(path, url),
      userId: viewer?.id,
      meta: { resultCount: Number.isFinite(count) ? count : 0, replica: true },
    });
  } catch {
    /* best-effort: analytics never breaks serving */
  }
}

async function routeLocal(request: Request, env: Env, url: URL): Promise<Response> {
  for (const { handle } of API_ROUTES) {
    const r = await handle(request, env, url);
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

/** Fetch a portal shell, following the directory-index redirect ASSETS answers with. */
async function fetchIndex(env: Env, url: URL, request: Request, indexPath: string): Promise<Response | null> {
  const init = { method: "GET", headers: request.headers };
  let r = await env.ASSETS.fetch(new Request(`${url.origin}${indexPath}`, init));
  if (r.status === 307 || r.status === 308) {
    const loc = r.headers.get("Location");
    if (loc) r = await env.ASSETS.fetch(new Request(new URL(loc, url.origin).toString(), init));
  }
  return r.status === 200 ? r : null;
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
    const idx = await fetchIndex(env, url, request, "/admin/index.html");
    if (idx) return idx;
  }

  // 2. Partner Host Dispatching (e.g. ota-partner.dnjstjqppk.workers.dev or partner.getfortrip.com)
  if (isPartnerHost) {
    if (path.startsWith("/partner/")) {
      return Response.redirect(`${url.origin}${path.replace(/^\/partner/, "") || "/"}`, 301);
    }
    const a = await env.ASSETS.fetch(new Request(`${url.origin}/partner${path}`, request));
    if (a.status === 200) return a;
    const idx = await fetchIndex(env, url, request, "/partner/index.html");
    if (idx) return idx;
  }

  // 3. Backwards-compatible path routing on default host (ota-hub)
  if (path === "/admin") return Response.redirect(`${url.origin}/admin/`, 301);
  if (path.startsWith("/admin/")) {
    const a = await env.ASSETS.fetch(request);
    if (a.status === 200) return a;
    const idx = await fetchIndex(env, url, request, "/admin/index.html");
    if (idx) return idx;
  }

  if (path === "/partner") return Response.redirect(`${url.origin}/partner/`, 301);
  if (path.startsWith("/partner/")) {
    const a = await env.ASSETS.fetch(request);
    if (a.status === 200) return a;
    const idx = await fetchIndex(env, url, request, "/partner/index.html");
    if (idx) return idx;
  }

  // 4. User Portal Routing (Default)
  let res = await env.ASSETS.fetch(request);
  // Admin/Partner SPAs use absolute asset URLs (base '/'), so their hub subpath
  // mounts (/admin/*, /partner/*) request /assets/* at the hub root. Filenames are
  // content-hashed, so a miss at root unambiguously falls through to each portal copy.
  if (res.status === 404 && (request.method === "GET" || request.method === "HEAD") && path.startsWith("/assets/")) {
    for (const prefix of ["/admin", "/partner"]) {
      const alt = await env.ASSETS.fetch(new Request(`${url.origin}${prefix}${path}${url.search}`, request));
      if (alt.status === 200) { res = alt; break; }
    }
  }
  if (res.status === 404 && (request.method === "GET" || request.method === "HEAD") && !/\.[A-Za-z0-9]{1,8}$/.test(path)) {
    const shell = await spaShell(env, url, request);
    if (shell) res = shell;
  }
  if (res.status === 307) return new Response(null, { status: 301, headers: { Location: res.headers.get("Location") || "/", ...SECURITY_HEADERS } });
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!h.has(k)) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

/**
 * TG-13 public status: liveness + components + active incidents only. No
 * counts, no provider wiring, no entity state — that intel stays behind the
 * verbose /health admin gate.
 */
async function status(request: Request, env: Env): Promise<Response> {
  let db = false;
  try {
    db = (await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>())?.ok === 1;
  } catch {}
  let open: any[] = [];
  if (db) {
    try {
      const rows = await env.DB.prepare(
        "SELECT id, title, severity, latest_update, started_at FROM incidents WHERE status = 'OPEN' ORDER BY started_at DESC LIMIT 20",
      ).all<any>();
      open = rows.results || [];
    } catch {
      open = [];
    }
  }
  const worst = open.some((o) => o.severity === "OUTAGE") ? "outage" : open.length || !db ? "degraded" : "ok";
  // TG-20: region + replica posture. Observed region is the serving colo
  // ("local" outside the edge); replica.enabled mirrors READ_REPLICA_URL.
  const replicaCfg = resolveReplicaConfig(env);
  return json({
    status: worst,
    components: { api: true, database: db },
    region: {
      configured: (env.PRIMARY_REGION || "").trim() || null,
      observed: observedRegion(request),
    },
    replica: {
      enabled: replicaCfg !== null,
      maxLagMs: replicaCfg?.maxLagMs ?? null,
      lastFallback: replicaLastFallback(),
    },
    activeIncidents: open.map((o) => ({
      id: o.id, title: o.title, severity: o.severity,
      latestUpdate: o.latest_update || "", startedAt: o.started_at,
    })),
    time: new Date().toISOString(),
  }, 200, { "Cache-Control": "public, max-age=30" });
}

/**
 * TG-13 request observability: one trace per API request (upstream
 * traceparent honored), per-isolate metrics, OTLP export off the hot path.
 * Static assets skip tracing — shells are not debugged through traces.
 */
async function observeApi(request: Request, env: Env, ctx: ExecutionContext, run: () => Promise<Response>): Promise<Response> {
  const tctx = bindRequest(request);
  const start = Date.now();
  let res: Response;
  try {
    res = await run();
  } catch (e) {
    captureException(env, ctx, e, { url: request.url, method: request.method });
    res = errorResponse(e);
  }
  const ms = Date.now() - start;
  const routeName = templateRoute(new URL(request.url).pathname);
  const finished = finishRequest(request, request.method, routeName, res.status);
  recordRequest(routeName, res.status, ms);
  if (finished) exportTrace(env, ctx, finished);
  logSlowRequest(routeName, res.status, ms, tctx);
  const h = new Headers(res.headers);
  h.set("traceparent", formatTraceParent(tctx.traceId, tctx.rootSpanId, tctx.sampled));
  h.set("x-region", observedRegion(request));
  const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  return withCors(out, request, env);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith("/api/") || url.pathname.startsWith("/out/");
    if (!isApi) {
      if (url.pathname === "/sitemap.xml") return sitemap(env);
      if (url.pathname === "/status") return observeApi(request, env, ctx, () => status(request, env));
      return serveAssets(request, env, url);
    }
    if (request.method === "OPTIONS") return preflight(request, env);
    return observeApi(request, env, ctx, () => route(request, env, url));
  },

  /** Cron: expire abandoned bookings, reconcile unknown payments, retry refunds. */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // TG-19: the warehouse rollup runs after maintenance (separate heartbeat
    // job 'rollup_daily'; skips when yesterday already ran fresh).
    // TG-21: review digests recompute weekly after the rollup ('review_digest').
    const run = runMaintenanceWithHeartbeat(env)
      .then((s) => {
        console.log("maintenance", JSON.stringify(s));
        return runMaintenanceWithHeartbeat(env, "rollup_daily", () => rollupDailyJob(env, null));
      })
      .then((s) => {
        console.log("rollup_daily", JSON.stringify(s));
        return runMaintenanceWithHeartbeat(env, "review_digest", () => reviewDigestJob(env));
      })
      .then(
        (s) => console.log("review_digest", JSON.stringify(s)),
        (e) => { captureException(env, ctx, e, { url: "cron:runMaintenance" }); throw e; },
      );
    ctx.waitUntil(run);
  },
};

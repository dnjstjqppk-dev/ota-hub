/**
 * TG-13 observability console (admin-gated; the public twin is GET /status
 * in worker/index.ts):
 *   GET   /api/v1/admin/traces/:traceId  finished spans for one trace id
 *   GET   /api/v1/admin/metrics           Prometheus exposition (this isolate)
 *   GET   /api/v1/admin/incidents         incident list (?status=OPEN|RESOLVED)
 *   POST  /api/v1/admin/incidents         open an incident (flips /status)
 *   PATCH /api/v1/admin/incidents/:id     update / resolve (no reopening —
 *                                         a recurrence is a new incident)
 *   GET   /api/v1/admin/slo/summary       uptime + per-isolate sample + cron
 * TG-15:
 *   POST  /api/v1/admin/cache/purge         exact-URL edge purge (1..50)
 * TG-17:
 *   GET   /api/v1/admin/fraud/reviews       fraud queue (?status=)
 *   PATCH /api/v1/admin/fraud/reviews/:id   APPROVED | REJECTED
 */
import type { Env } from "../env.ts";
import { HttpError, json, readJson, str } from "../lib/http.ts";
import { audit, requireAdmin } from "../lib/auth.ts";
import { newId } from "../lib/crypto.ts";
import { getBufferedTrace } from "../lib/tracing.ts";
import { isolateP95, renderPrometheus, snapshot } from "../lib/metrics.ts";
import { purgeUrls } from "../lib/cache-purge.ts";
import { popularTerms } from "../services/search-service.ts";

const SEVERITIES = ["INFO", "DEGRADED", "OUTAGE"] as const;
const STATUSES = ["OPEN", "RESOLVED"] as const;
const now = () => new Date().toISOString();

function incidentRow(r: any) {
  return {
    id: r.id, title: r.title, severity: r.severity, status: r.status,
    latestUpdate: r.latest_update || "", startedAt: r.started_at,
    resolvedAt: r.resolved_at || null, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function sloSummary(env: Env) {
  const nowMs = Date.now();
  const windowStart = new Date(nowMs - 30 * 86400 * 1000).toISOString();
  const rows = await env.DB.prepare(
    "SELECT severity, started_at, resolved_at FROM incidents WHERE started_at >= ?",
  ).bind(windowStart).all<any>();
  let outageSec = 0;
  let degradedSec = 0;
  for (const r of rows.results || []) {
    const start = Date.parse(r.started_at);
    if (Number.isNaN(start)) continue;
    const end = r.resolved_at ? Date.parse(r.resolved_at) : nowMs;
    const secs = Math.max(0, Math.round((Math.min(end, nowMs) - start) / 1000));
    if (r.severity === "OUTAGE") outageSec += secs;
    else if (r.severity === "DEGRADED") degradedSec += secs;
  }
  const windowSec = 30 * 86400;
  const uptimePct = Math.max(0, Math.min(100, ((windowSec - outageSec) / windowSec) * 100));
  const m = snapshot();
  let cron: unknown = "UNKNOWN";
  try {
    const beat = await env.DB.prepare("SELECT ran_at, ok FROM cron_heartbeats WHERE job = 'maintenance'").first<{ ran_at: string; ok: number }>();
    if (beat) {
      const ageSec = Math.max(0, Math.round((nowMs - Date.parse(beat.ran_at)) / 1000));
      cron = { lastRun: beat.ran_at, ok: Number(beat.ok) === 1, ageSec, stale: ageSec > 900 };
    } else {
      cron = "NEVER_RAN";
    }
  } catch {
    cron = "UNKNOWN";
  }
  return {
    windowDays: 30,
    uptimePct: Math.round(uptimePct * 1000) / 1000,
    outageSeconds: outageSec,
    degradedSeconds: degradedSec,
    isolate: {
      requests: m.totals.requests,
      errors5xx: m.totals.errors5xx,
      avgMs: m.totals.avgMs,
      p95Ms: isolateP95(),
      note: "single-isolate sample, not fleet-wide",
    },
    cron,
    objectives: { availabilityPct: 99.9, p95Ms: 1500 },
  };
}

export async function handleObservability(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/v1/admin/metrics" && method === "GET") {
    await requireAdmin(request, env);
    return new Response(renderPrometheus(), { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }

  const traceMatch = path.match(/^\/api\/v1\/admin\/traces\/([A-Za-z0-9_-]{1,64})$/);
  if (traceMatch && method === "GET") {
    await requireAdmin(request, env);
    const traces = getBufferedTrace(traceMatch[1].toLowerCase());
    if (!traces.length) throw new HttpError(404, "TRACE_NOT_FOUND", "해당 트레이스를 찾을 수 없습니다. (단일 isolate 버퍼 — 분산 추적은 OTLP 수집기로 확인하세요.)");
    return json({ success: true, traceId: traceMatch[1].toLowerCase(), traces });
  }

  if (path === "/api/v1/admin/slo/summary" && method === "GET") {
    await requireAdmin(request, env);
    return json({ success: true, slo: await sloSummary(env) });
  }

  if (path === "/api/v1/admin/cache/purge" && method === "POST") {
    const admin = await requireAdmin(request, env);
    const body = await readJson(request);
    const urls = Array.isArray(body?.urls) ? body.urls : null;
    if (!urls || !urls.length) throw new HttpError(400, "URLS_REQUIRED", "purge할 URL 배열(1~50개)이 필요합니다.");
    if (urls.length > 50) throw new HttpError(400, "TOO_MANY_URLS", "한 번에 50개까지 purge할 수 있습니다.");
    const r = await purgeUrls(env, urls);
    if (r.error === "INVALID_URL" || r.error === "URL_TOO_LONG") throw new HttpError(400, r.error, "http(s) URL(500자 이내)만 purge할 수 있습니다.");
    if (r.error) throw new HttpError(502, "PURGE_FAILED", "엣지 purge에 실패했습니다. 잠시 후 다시 시도해주세요.");
    await audit(env, admin.id, "CACHE_PURGE", "EDGE_CACHE", "*", { urls: urls.length, purged: r.purged, skipped: r.skipped });
    return json({ success: true, purged: r.purged, skipped: r.skipped });
  }

  if (path === "/api/v1/admin/search/terms" && method === "GET") {
    await requireAdmin(request, env);
    const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get("days") || "7", 10) || 7));
    const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get("limit") || "20", 10) || 20));
    return json({ success: true, terms: await popularTerms(env, days, limit) });
  }

  if (path === "/api/v1/admin/fraud/reviews" && method === "GET") {
    await requireAdmin(request, env);
    const status = str(url.searchParams.get("status"), 16).toUpperCase();
    const rows = status === "PENDING" || status === "APPROVED" || status === "REJECTED"
      ? await env.DB.prepare(
        "SELECT f.*, b.booking_number, b.total_minor FROM fraud_reviews f LEFT JOIN bookings b ON b.id = f.booking_id WHERE f.status = ? ORDER BY f.created_at DESC LIMIT 100",
      ).bind(status).all<any>()
      : await env.DB.prepare(
        "SELECT f.*, b.booking_number, b.total_minor FROM fraud_reviews f LEFT JOIN bookings b ON b.id = f.booking_id ORDER BY f.created_at DESC LIMIT 100",
      ).all<any>();
    return json({
      success: true,
      reviews: (rows.results || []).map((r: any) => ({
        id: r.id, bookingId: r.booking_id, bookingNumber: r.booking_number || null, totalMinor: r.total_minor ?? null,
        userId: r.user_id, score: r.score, reasons: JSON.parse(r.reasons_json || "[]"), status: r.status,
        decidedBy: r.decided_by || null, decidedAt: r.decided_at || null, createdAt: r.created_at,
      })),
    });
  }

  const fraudMatch = path.match(/^\/api\/v1\/admin\/fraud\/reviews\/([A-Za-z0-9_-]{4,64})$/);
  if (fraudMatch && method === "PATCH") {
    const admin = await requireAdmin(request, env);
    const row = await env.DB.prepare("SELECT * FROM fraud_reviews WHERE id = ?").bind(fraudMatch[1]).first<any>();
    if (!row) throw new HttpError(404, "REVIEW_NOT_FOUND", "심사 건을 찾을 수 없습니다.");
    if (row.status !== "PENDING") throw new HttpError(409, "REVIEW_DECIDED", "이미 결정된 심사 건입니다.");
    const body = await readJson(request);
    const status = str(body?.status, 16).toUpperCase();
    if (status !== "APPROVED" && status !== "REJECTED") throw new HttpError(400, "INVALID_STATUS", "상태는 APPROVED·REJECTED 중 하나여야 합니다.");
    const ts = new Date().toISOString();
    await env.DB.prepare("UPDATE fraud_reviews SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?").bind(status, admin.id, ts, fraudMatch[1]).run();
    await audit(env, admin.id, status === "APPROVED" ? "FRAUD_APPROVE" : "FRAUD_REJECT", "FRAUD_REVIEW", fraudMatch[1], { bookingId: row.booking_id, score: row.score });
    return json({ success: true, id: fraudMatch[1], status });
  }

  if (path === "/api/v1/admin/incidents" && method === "GET") {
    await requireAdmin(request, env);
    const status = str(url.searchParams.get("status"), 16).toUpperCase();
    const rows = status === "OPEN" || status === "RESOLVED"
      ? await env.DB.prepare("SELECT * FROM incidents WHERE status = ? ORDER BY started_at DESC LIMIT 100").bind(status).all<any>()
      : await env.DB.prepare("SELECT * FROM incidents ORDER BY started_at DESC LIMIT 100").all<any>();
    return json({ success: true, incidents: (rows.results || []).map(incidentRow) });
  }

  if (path === "/api/v1/admin/incidents" && method === "POST") {
    const admin = await requireAdmin(request, env);
    const body = await readJson(request);
    const title = str(body?.title, 121);
    const severity = str(body?.severity, 16).toUpperCase();
    if (!title) throw new HttpError(400, "TITLE_REQUIRED", "장애 제목을 입력해주세요.");
    if (title.length > 120) throw new HttpError(400, "TITLE_TOO_LONG", "제목은 120자 이내로 입력해주세요.");
    if (!(SEVERITIES as readonly string[]).includes(severity)) throw new HttpError(400, "INVALID_SEVERITY", "심각도는 INFO·DEGRADED·OUTAGE 중 하나여야 합니다.");
    const update = str(body?.latestUpdate, 2001);
    if (update.length > 2000) throw new HttpError(400, "UPDATE_TOO_LONG", "상황 설명은 2000자 이내로 입력해주세요.");
    const id = newId("inc");
    const ts = now();
    await env.DB.prepare(
      "INSERT INTO incidents (id, title, severity, status, latest_update, started_at, created_at, updated_at) VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?)",
    ).bind(id, title, severity, update, ts, ts, ts).run();
    await audit(env, admin.id, "INCIDENT_OPEN", "INCIDENT", id, { severity, title });
    const row = await env.DB.prepare("SELECT * FROM incidents WHERE id = ?").bind(id).first<any>();
    return json({ success: true, incident: incidentRow(row) }, 201);
  }

  const patchMatch = path.match(/^\/api\/v1\/admin\/incidents\/([A-Za-z0-9_-]{4,64})$/);
  if (patchMatch && method === "PATCH") {
    const admin = await requireAdmin(request, env);
    const row = await env.DB.prepare("SELECT * FROM incidents WHERE id = ?").bind(patchMatch[1]).first<any>();
    if (!row) throw new HttpError(404, "INCIDENT_NOT_FOUND", "장애를 찾을 수 없습니다.");
    const body = await readJson(request);
    const patch: string[] = [];
    const binds: unknown[] = [];
    if (body?.severity !== undefined) {
      const severity = str(body.severity, 16).toUpperCase();
      if (!(SEVERITIES as readonly string[]).includes(severity)) throw new HttpError(400, "INVALID_SEVERITY", "심각도는 INFO·DEGRADED·OUTAGE 중 하나여야 합니다.");
      patch.push("severity = ?");
      binds.push(severity);
    }
    if (body?.latestUpdate !== undefined) {
      const update = str(body.latestUpdate, 2001);
      if (update.length > 2000) throw new HttpError(400, "UPDATE_TOO_LONG", "상황 설명은 2000자 이내로 입력해주세요.");
      patch.push("latest_update = ?");
      binds.push(update);
    }
    if (body?.status !== undefined) {
      const status = str(body.status, 16).toUpperCase();
      if (status === "OPEN" && row.status === "RESOLVED") throw new HttpError(409, "INCIDENT_REOPEN_FORBIDDEN", "해소된 장애는 다시 열 수 없습니다. 재발이면 새 장애로 등록해주세요.");
      if (!(STATUSES as readonly string[]).includes(status)) throw new HttpError(400, "INVALID_STATUS", "상태는 OPEN·RESOLVED 중 하나여야 합니다.");
      if (status !== row.status) {
        patch.push("status = ?", "resolved_at = ?");
        binds.push(status, status === "RESOLVED" ? now() : null);
      }
    }
    if (!patch.length) throw new HttpError(400, "NOTHING_TO_UPDATE", "변경할 항목이 없습니다.");
    patch.push("updated_at = ?");
    binds.push(now(), patchMatch[1]);
    await env.DB.prepare(`UPDATE incidents SET ${patch.join(", ")} WHERE id = ?`).bind(...binds).run();
    await audit(env, admin.id, "INCIDENT_UPDATE", "INCIDENT", patchMatch[1], { fields: patch });
    const next = await env.DB.prepare("SELECT * FROM incidents WHERE id = ?").bind(patchMatch[1]).first<any>();
    return json({ success: true, incident: incidentRow(next) });
  }

  return null;
}

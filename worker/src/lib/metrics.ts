/**
 * TG-13: per-isolate request metrics with Prometheus exposition.
 *
 * Workers isolates do not share memory, so these counters describe ONE
 * isolate — a best-effort edge sample, honestly labeled as such in
 * docs/SLO.md. Fleet-wide aggregation is the OTLP collector's job (TG-13
 * non-goal: the receiver is a user-side managed step).
 */

export const HISTOGRAM_BUCKETS = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
const MAX_ROUTES = 500;

interface RouteStats {
  counts: Record<string, number>; // "2xx" | "4xx" | "5xx" | "other"
  buckets: number[]; // cumulative per HISTOGRAM_BUCKETS, plus +Inf tracked as total
  total: number;
  sumMs: number;
}

const routes = new Map<string, RouteStats>();
let overflowed = 0;

function statsFor(route: string): RouteStats {
  let s = routes.get(route);
  if (!s) {
    if (routes.size >= MAX_ROUTES) {
      overflowed++;
      s = routes.get("OTHER");
      if (!s) {
        s = { counts: {}, buckets: HISTOGRAM_BUCKETS.map(() => 0), total: 0, sumMs: 0 };
        routes.set("OTHER", s);
      }
      return s;
    }
    s = { counts: {}, buckets: HISTOGRAM_BUCKETS.map(() => 0), total: 0, sumMs: 0 };
    routes.set(route, s);
  }
  return s;
}

/**
 * Collapse id-like segments so /bookings/bkg_... and /bookings/usr_... share
 * one series. A segment templates when it carries an id signal (a digit, a
 * long token, or a known id prefix); static words like "trip-best" stay.
 */
export function templateRoute(pathname: string): string {
  const clean = String(pathname || "/").split("?")[0] || "/";
  const out = clean.split("/").map((seg) => {
    if (!seg) return seg;
    if (/^(bkg|pay|rfd|usr|q_|quo|ntf|aud|stl|psb|ect|ptn|sup|mkt|job|inc|ord|sub|evt|msg|tkt|bmsg)_/i.test(seg)) return ":id";
    if (seg.length >= 6 && /[0-9]/.test(seg)) return ":id";
    if (seg.length >= 24) return ":id";
    return seg;
  }).join("/") || "/";
  return out.startsWith("/") ? out : `/${out}`;
}

export function recordRequest(route: string, status: number, ms: number): void {
  const cls = status >= 200 && status < 300 ? "2xx" : status >= 400 && status < 500 ? "4xx" : status >= 500 ? "5xx" : "other";
  const s = statsFor(route);
  s.counts[cls] = (s.counts[cls] || 0) + 1;
  s.total++;
  s.sumMs += ms;
  for (let i = 0; i < HISTOGRAM_BUCKETS.length; i++) {
    if (ms <= HISTOGRAM_BUCKETS[i]) s.buckets[i]++;
  }
}

export interface MetricsSnapshot {
  routes: Record<string, { counts: Record<string, number>; total: number; avgMs: number; buckets: number[] }>;
  totals: { requests: number; errors5xx: number; avgMs: number };
  overflowed: number;
}

export function snapshot(): MetricsSnapshot {
  const out: MetricsSnapshot = { routes: {}, totals: { requests: 0, errors5xx: 0, avgMs: 0 }, overflowed };
  let sum = 0;
  for (const [route, s] of routes) {
    out.routes[route] = { counts: { ...s.counts }, total: s.total, avgMs: s.total ? Math.round((s.sumMs / s.total) * 10) / 10 : 0, buckets: s.buckets.slice() };
    out.totals.requests += s.total;
    out.totals.errors5xx += s.counts["5xx"] || 0;
    sum += s.sumMs;
  }
  out.totals.avgMs = out.totals.requests ? Math.round((sum / out.totals.requests) * 10) / 10 : 0;
  return out;
}

/** Approximate p95 from this isolate's histogram (upper-bucket edge). */
export function isolateP95(): number | null {
  let total = 0;
  const merged = HISTOGRAM_BUCKETS.map(() => 0);
  for (const s of routes.values()) {
    total += s.total;
    for (let i = 0; i < merged.length; i++) merged[i] += s.buckets[i];
  }
  if (!total) return null;
  const rank = Math.ceil(total * 0.95);
  let cum = 0;
  for (let i = 0; i < merged.length; i++) {
    cum = merged[i];
    if (cum >= rank) return HISTOGRAM_BUCKETS[i];
  }
  return null; // p95 sits above the top bucket
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function renderPrometheus(): string {
  const lines = [
    "# HELP http_requests_total API requests served by this isolate.",
    "# TYPE http_requests_total counter",
  ];
  for (const [route, s] of routes) {
    for (const [cls, n] of Object.entries(s.counts)) {
      lines.push(`http_requests_total{route="${esc(route)}",class="${cls}"} ${n}`);
    }
  }
  lines.push("# HELP http_request_duration_ms Request latency histogram (this isolate).");
  lines.push("# TYPE http_request_duration_ms histogram");
  for (const [route, s] of routes) {
    for (let i = 0; i < HISTOGRAM_BUCKETS.length; i++) {
      lines.push(`http_request_duration_ms_bucket{route="${esc(route)}",le="${HISTOGRAM_BUCKETS[i]}"} ${s.buckets[i]}`);
    }
    lines.push(`http_request_duration_ms_bucket{route="${esc(route)}",le="+Inf"} ${s.total}`);
    lines.push(`http_request_duration_ms_sum{route="${esc(route)}"} ${Math.round(s.sumMs * 10) / 10}`);
    lines.push(`http_request_duration_ms_count{route="${esc(route)}"} ${s.total}`);
  }
  return lines.join("\n") + "\n";
}

/** Tests only: drop all counters. */
export function resetMetrics(): void {
  routes.clear();
  overflowed = 0;
}

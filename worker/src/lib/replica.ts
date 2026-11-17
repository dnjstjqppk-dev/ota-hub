import type { Env } from "../env.ts";
import { isNonProduction } from "../env.ts";
import { logEvent } from "./log.ts";

/**
 * TG-20: read-replica routing (R/W split).
 *
 * D1 has no read replicas, so the replica is an HTTP worker (the same code
 * deployed with its own data — or a stub in tests). The router proxies a
 * fixed allowlist of non-personalized GET reads; everything else, writes
 * included, always serves locally.
 *
 * Lag is the replica's self-reported apply lag (`x-replica-lag-ms`). Above
 * REPLICA_MAX_LAG_MS (default 5000) reads fall back to primary, as they do
 * on 5xx/timeout/unreachable — with `x-replica-fallback` naming the reason
 * and a warn log line. A replica 429 passes through untouched (its
 * backpressure is respected, not routed around). Missing lag headers read
 * as 0: replicas without lag wiring still serve (documented boundary —
 * requiring lag reports is a follow-up).
 *
 * Loop guard: proxied requests carry `X-Replica-Route: 1` and are never
 * re-proxied, so a replica that is itself misconfigured to point back can
 * only add one hop. Client credentials are never forwarded: every
 * allowlisted response is identical for all viewers (bookability and search
 * rank from supplier/catalog state, never identity).
 *
 * Side effects stay honest: list/search handlers log funnel events, so the
 * primary mirrors the event after a proxied 200 (resultCount from the
 * replica body). Each database ends up with exactly one event — no double
 * count, no loss. See mirrorSearchEvent() in the router wiring.
 */

export const REPLICA_ROUTE_HEADER = "X-Replica-Route";
export const REPLICA_LAG_HEADER = "x-replica-lag-ms";
export const REPLICA_TIMEOUT_MS = 8000;
export const REPLICA_DEFAULT_MAX_LAG_MS = 5000;

/** Exact-path GET allowlist: high-volume reads without per-viewer variance. */
const REPLICA_PATHS: ReadonlyMap<string, string | null> = new Map([
  ["/api/v1/hotels", "HOTEL"],
  ["/api/v1/flights", "FLIGHT"],
  ["/api/v1/trains", "TRAIN"],
  ["/api/v1/cars", "CAR"],
  ["/api/v1/transfers", "TRANSFER"],
  ["/api/v1/activities", "ACTIVITY"],
  ["/api/v1/packages", "PACKAGE"],
  ["/api/v1/search", null], // domain rides the query string
  ["/api/v1/search/suggest", null],
  ["/api/v1/legal", null],
  ["/api/v1/policies", null],
  ["/api/v1/seo/snapshot", null],
  ["/api/v1/feature-flags", null],
]);

// Suggest emits no funnel event when served directly, so it stays
// unmirrored: mirroring would log what direct serving never does.
const REPLICA_MIRROR = new Set([
  "/api/v1/hotels", "/api/v1/flights", "/api/v1/trains", "/api/v1/cars",
  "/api/v1/transfers", "/api/v1/activities", "/api/v1/packages",
  "/api/v1/search",
]);

/** True when the primary must mirror the funnel event after a proxied 200. */
export function replicaNeedsMirror(path: string): boolean {
  return REPLICA_MIRROR.has(path);
}

/** Funnel domain for a mirrored path (undefined = unscoped search). */
export function replicaMirrorDomain(path: string, url: URL): string | undefined {
  if (path === "/api/v1/search") {
    const d = (url.searchParams.get("domain") || "").toUpperCase();
    return /^[A-Z_]{3,20}$/.test(d) ? d : undefined;
  }
  return REPLICA_PATHS.get(path) ?? undefined;
}

export function isReplicaPath(method: string, path: string): boolean {
  return method === "GET" && REPLICA_PATHS.has(path);
}

export interface ReplicaConfig {
  base: string;
  maxLagMs: number;
}

const LOOPBACK_HTTP = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/;

/** Resolve replica config, or null when reads must serve locally. */
export function resolveReplicaConfig(env: Env): ReplicaConfig | null {
  const raw = (env.READ_REPLICA_URL || "").trim();
  if (!raw) return null;
  const base = raw.replace(/\/+$/, "");
  const loopback = LOOPBACK_HTTP.test(base + "/");
  if (loopback && !isNonProduction(env)) return null;
  if (!loopback && !base.startsWith("https://")) return null;
  const n = Number(env.REPLICA_MAX_LAG_MS);
  const maxLagMs = Number.isFinite(n) ? Math.min(60_000, Math.max(100, Math.floor(n))) : REPLICA_DEFAULT_MAX_LAG_MS;
  return { base, maxLagMs };
}

/** Parse a replica lag header (missing/garbage reads as 0 — see note above). */
export function parseLagMs(value: string | null): number {
  if (value === null) return 0;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export type FallbackReason = "lag" | "error";

export interface FallbackInfo {
  reason: FallbackReason;
  lagMs: number | null;
}

let lastFallback: { reason: FallbackReason; at: string } | null = null;

/** Last fallback (isolate memory, for /status; null = none observed here). */
export function replicaLastFallback(): { reason: FallbackReason; at: string } | null {
  return lastFallback;
}

/** Test-only reset. */
export function resetReplicaState(): void {
  lastFallback = null;
}

function noteFallback(reason: FallbackReason, fields: Record<string, unknown>): void {
  lastFallback = { reason, at: new Date().toISOString() };
  logEvent("warn", "replica.fallback", { reason, ...fields });
}

export type ProxyOutcome =
  | { kind: "response"; response: Response }
  | { kind: "fallback"; info: FallbackInfo };

/**
 * Fetch an allowlisted read from the replica. Returns the replica response
 * (with x-replica headers), or a fallback verdict — the caller then serves
 * locally and stamps x-replica-fallback.
 */
export async function proxyToReplica(replica: ReplicaConfig, request: Request, url: URL): Promise<ProxyOutcome> {
  let res: Response;
  try {
    res = await fetch(replica.base + url.pathname + url.search, {
      method: "GET",
      headers: { [REPLICA_ROUTE_HEADER]: "1" },
      signal: AbortSignal.timeout(REPLICA_TIMEOUT_MS),
    });
  } catch {
    noteFallback("error", { stage: "fetch" });
    return { kind: "fallback", info: { reason: "error", lagMs: null } };
  }
  if (res.status >= 500) {
    noteFallback("error", { stage: "status", status: res.status });
    return { kind: "fallback", info: { reason: "error", lagMs: null } };
  }
  const lagMs = parseLagMs(res.headers.get(REPLICA_LAG_HEADER));
  if (lagMs > replica.maxLagMs) {
    noteFallback("lag", { lagMs, maxLagMs: replica.maxLagMs });
    return { kind: "fallback", info: { reason: "lag", lagMs } };
  }
  const headers = new Headers(res.headers);
  headers.set("x-replica", "hit");
  headers.set(REPLICA_LAG_HEADER, String(lagMs));
  return { kind: "response", response: new Response(res.body, { status: res.status, statusText: res.statusText, headers }) };
}

/** Observed region: Cloudflare colo, or "local" outside the edge. */
export function observedRegion(request: Request): string {
  const cf = (request as unknown as { cf?: { colo?: unknown } }).cf;
  const colo = typeof cf?.colo === "string" ? cf.colo.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(colo) ? colo : "local";
}

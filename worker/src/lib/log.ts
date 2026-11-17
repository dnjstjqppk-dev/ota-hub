import type { TraceContext } from "./tracing.ts";

/**
 * TG-13: structured JSON log lines with trace linkage. One line per event,
 * never multi-line, PII-free by construction (callers pass ids, never bodies).
 * Quiet by design: only slow requests and exporter faults log here — the
 * money pipeline keeps its own moneyLog shape untouched.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
  tctx: TraceContext | null = null,
): void {
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    svc: "api",
    event,
    ...(tctx ? { trace_id: tctx.traceId, span_id: tctx.rootSpanId } : {}),
    ...fields,
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

/** Fetch-level observability: warn only when a request is notably slow. */
export const SLOW_REQUEST_MS = 2000;

export function logSlowRequest(route: string, status: number, ms: number, tctx: TraceContext | null): void {
  if (ms < SLOW_REQUEST_MS) return;
  logEvent("warn", "http.slow", { route, status, duration_ms: Math.round(ms) }, tctx);
}

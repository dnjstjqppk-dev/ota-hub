import type { Env } from "../env.ts";

/**
 * TG-13: zero-dependency W3C-trace observability (the TG-05 Sentry philosophy:
 * no SDK, no-op when unconfigured, never throws).
 *
 * One TraceContext lives per request, bound to the Request object in a
 * WeakMap by fetch() — services read it via traceOf() without signature
 * churn, and route handlers pass it explicitly (tctx) where the request is
 * out of reach (confirmPayment -> fulfil -> issue). Finished traces land in
 * a bounded ring buffer (admin lookup + the trace-order demo) and export to
 * an OTLP/HTTP collector via waitUntil when OTEL_EXPORTER_OTLP_ENDPOINT is
 * set. Metrics are per-isolate best-effort; see metrics.ts.
 */

export interface Span {
  traceId: string;
  spanId: string;
  parentId: string | null;
  name: string;
  startMs: number;
  endMs: number | null;
  status: "ok" | "error";
  attrs: Record<string, string>;
}

export interface TraceContext {
  traceId: string;
  rootSpanId: string;
  sampled: boolean;
  spans: Span[];
}

export interface FinishedTrace {
  traceId: string;
  rootSpanId: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
  spans: Span[];
}

const HEX16 = /^[0-9a-f]{16}$/;
const HEX32 = /^[0-9a-f]{32}$/;
const ZERO16 = "0000000000000000";
const ZERO32 = "00000000000000000000000000000000";

function hexBytes(n: number): string {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function makeTraceId(): string {
  const id = hexBytes(16);
  return id === ZERO32 ? makeTraceId() : id;
}

export function makeSpanId(): string {
  const id = hexBytes(8);
  return id === ZERO16 ? makeSpanId() : id;
}

/**
 * Strict W3C traceparent parse: "version-traceid-spanid-flags". Anything
 * malformed (or an all-zero id) is rejected so a forged header mints a fresh
 * trace instead of poisoning ours (red drill §5-2).
 */
export function parseTraceParent(header: string | null | undefined): { traceId: string; parentSpanId: string; sampled: boolean } | null {
  if (!header) return null;
  const parts = String(header).trim().split("-");
  if (parts.length < 4) return null;
  const [version, traceId, spanId, flags] = parts;
  if (!/^[0-9a-f]{2}$/.test(version) || version === "ff") return null;
  if (!HEX32.test(traceId) || traceId === ZERO32) return null;
  if (!HEX16.test(spanId) || spanId === ZERO16) return null;
  if (!/^[0-9a-f]{2}$/.test(flags)) return null;
  return { traceId, parentSpanId: spanId, sampled: (parseInt(flags, 16) & 1) === 1 };
}

export function formatTraceParent(traceId: string, spanId: string, sampled = true): string {
  return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}

const bound = new WeakMap<Request, TraceContext>();

/** Bind a fresh request trace. Called once per request by fetch(). */
export function bindRequest(request: Request): TraceContext {
  const upstream = parseTraceParent(request.headers.get("traceparent"));
  const traceId = upstream ? upstream.traceId : makeTraceId();
  const rootSpanId = makeSpanId();
  const tctx: TraceContext = {
    traceId,
    rootSpanId,
    sampled: upstream ? upstream.sampled : true,
    spans: [{
      traceId, spanId: rootSpanId, parentId: upstream ? upstream.parentSpanId : null,
      name: `HTTP ${request.method}`, startMs: Date.now(), endMs: null, status: "ok", attrs: {},
    }],
  };
  bound.set(request, tctx);
  return tctx;
}

export function traceOf(request: Request | null | undefined): TraceContext | null {
  if (!request) return null;
  return bound.get(request) || null;
}

export interface ActiveSpan {
  spanId: string;
  end(status?: "ok" | "error", attrs?: Record<string, string>): void;
}

const NULL_SPAN: ActiveSpan = { spanId: "", end() {} };

/** Open a child span. A null context runs spanless (cron paths, unit tests). */
export function startSpan(tctx: TraceContext | null, name: string, parentId?: string): ActiveSpan {
  if (!tctx) return NULL_SPAN;
  const span: Span = {
    traceId: tctx.traceId, spanId: makeSpanId(), parentId: parentId || tctx.rootSpanId,
    name, startMs: Date.now(), endMs: null, status: "ok", attrs: {},
  };
  tctx.spans.push(span);
  let ended = false;
  return {
    spanId: span.spanId,
    end(status = "ok", attrs = {}) {
      if (ended) return;
      ended = true;
      span.endMs = Date.now();
      span.status = status;
      Object.assign(span.attrs, attrs);
    },
  };
}

/** Run fn under a child span; the span errors when fn throws (and rethrows). */
export async function withSpan<T>(
  tctx: TraceContext | null, name: string, fn: () => Promise<T>, attrs: Record<string, string> = {}, parentId?: string,
): Promise<T> {
  if (!tctx) return fn();
  const span = startSpan(tctx, name, parentId);
  try {
    const out = await fn();
    span.end("ok", attrs);
    return out;
  } catch (e) {
    span.end("error", { ...attrs, "error.message": e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Request finish + ring buffer (single-isolate; the demo and admin lookup run
// against the same dev isolate, production fans out to OTLP).
// ---------------------------------------------------------------------------

const TRACE_BUFFER_MAX = 200;
const traceBuffer: FinishedTrace[] = [];

export function finishRequest(request: Request, method: string, route: string, status: number): FinishedTrace | null {
  const tctx = bound.get(request);
  if (!tctx) return null;
  bound.delete(request);
  const root = tctx.spans[0];
  const endMs = Date.now();
  if (root) {
    root.endMs = endMs;
    root.status = status >= 500 ? "error" : "ok";
    root.name = `HTTP ${method}`;
    root.attrs["http.route"] = route;
    root.attrs["http.status_code"] = String(status);
  }
  for (const s of tctx.spans) {
    if (s.endMs === null) { s.endMs = endMs; s.status = "error"; s.attrs["otel.status_note"] = "span never closed"; }
  }
  const finished: FinishedTrace = {
    traceId: tctx.traceId, rootSpanId: tctx.rootSpanId, method, route, status,
    durationMs: root ? Math.max(0, endMs - root.startMs) : 0,
    spans: tctx.spans.slice().sort((a, b) => a.startMs - b.startMs),
  };
  traceBuffer.push(finished);
  while (traceBuffer.length > TRACE_BUFFER_MAX) traceBuffer.shift();
  return finished;
}

/** All buffered root spans for one trace id (multi-request demo flows). */
export function getBufferedTrace(traceId: string): FinishedTrace[] {
  if (!HEX32.test(traceId)) return [];
  return traceBuffer.filter((t) => t.traceId === traceId);
}

export function traceBufferSize(): number {
  return traceBuffer.length;
}

/** Tests only: drop the buffer. */
export function clearTraceBuffer(): void {
  traceBuffer.length = 0;
}

// ---------------------------------------------------------------------------
// OTLP/HTTP export (Sentry-style: configured endpoint or nothing, never throws).
// ---------------------------------------------------------------------------

const toNano = (ms: number) => String(Math.round(ms) * 1000000);

function otlpAttrs(attrs: Record<string, string>): Array<{ key: string; value: { stringValue: string } }> {
  return Object.entries(attrs).map(([key, stringValue]) => ({ key, value: { stringValue } }));
}

export function buildOtlpPayload(trace: FinishedTrace, serviceName: string): Record<string, unknown> {
  return {
    resourceSpans: [{
      resource: { attributes: otlpAttrs({ "service.name": serviceName }) },
      scopeSpans: [{
        scope: { name: "getfortrip-tracing/1.0" },
        spans: trace.spans.map((s) => ({
          traceId: s.traceId,
          spanId: s.spanId,
          ...(s.parentId ? { parentSpanId: s.parentId } : {}),
          name: s.name,
          kind: 1,
          startTimeUnixNano: toNano(s.startMs),
          endTimeUnixNano: toNano(s.endMs ?? s.startMs),
          status: s.status === "ok" ? {} : { code: 2 },
          attributes: otlpAttrs(s.attrs),
        })),
      }],
    }],
  };
}

type WaitUntil = { waitUntil(p: Promise<unknown>): void } | null | undefined;
type FetchFn = (url: string, init: Record<string, unknown>) => Promise<unknown>;

/**
 * Ship one finished trace to the OTLP collector. Returns false (no network)
 * when no endpoint is configured or the send fails — serving never depends
 * on it.
 */
export function exportTrace(
  env: Env,
  execCtx: WaitUntil,
  trace: FinishedTrace,
  transport?: FetchFn,
): boolean {
  try {
    const endpoint = (env.OTEL_EXPORTER_OTLP_ENDPOINT || "").trim().replace(/\/+$/, "");
    if (!endpoint) return false;
    const service = (env.OTEL_SERVICE_NAME || "").trim() || "ota-hub";
    const send = (transport || fetch)(`${endpoint}/v1/traces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildOtlpPayload(trace, service)),
    }).then(() => undefined, () => undefined);
    if (execCtx && typeof execCtx.waitUntil === "function") execCtx.waitUntil(send);
    else void send;
    return true;
  } catch {
    return false;
  }
}

/** TG-13 OTel observability: W3C trace lifecycle, OTLP export, metrics, logs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bindRequest, buildOtlpPayload, clearTraceBuffer, exportTrace, finishRequest,
  formatTraceParent, getBufferedTrace, makeSpanId, makeTraceId, parseTraceParent,
  startSpan, traceBufferSize, traceOf, withSpan,
} from "../../src/lib/tracing.ts";
import { isolateP95, recordRequest, renderPrometheus, resetMetrics, snapshot, templateRoute } from "../../src/lib/metrics.ts";
import { logEvent, logSlowRequest } from "../../src/lib/log.ts";

const req = (traceparent?: string) => new Request("http://127.0.0.1/api/v1/bookings", {
  method: "POST",
  headers: traceparent ? { traceparent } : {},
});

// ---------------------------------------------------------------- tracing

test("traceparent: valid headers parse, forged ones are rejected", () => {
  const good = parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
  assert.deepEqual(good, { traceId: "4bf92f3577b34da6a3ce929d0e0e4736", parentSpanId: "00f067aa0ba902b7", sampled: true });
  assert.equal(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00")?.sampled, false);
  for (const bad of [null, "", "xx", "00-short-00f067aa0ba902b7-01", "ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    "00-00000000000000000000000000000000-00f067aa0ba902b7-01", "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01",
    "00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-zz"]) {
    assert.equal(parseTraceParent(bad), null, String(bad));
  }
  assert.match(makeTraceId(), /^[0-9a-f]{32}$/);
  assert.match(makeSpanId(), /^[0-9a-f]{16}$/);
  assert.equal(formatTraceParent("4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7"), "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
});

test("request trace: upstream id honored, finish records a root span", () => {
  clearTraceBuffer();
  const r = req("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
  const tctx = bindRequest(r);
  assert.equal(tctx.traceId, "4bf92f3577b34da6a3ce929d0e0e4736");
  assert.equal(traceOf(r), tctx);
  assert.equal(traceOf(new Request("http://127.0.0.1/x")), null);
  const done = finishRequest(r, "POST", "/api/v1/bookings", 201)!;
  assert.equal(done.traceId, tctx.traceId);
  assert.equal(done.spans[0].parentId, "00f067aa0ba902b7");
  assert.equal(done.spans[0].attrs["http.status_code"], "201");
  assert.equal(done.spans[0].status, "ok");
  assert.equal(traceOf(r), null); // unbound after finish
  assert.equal(getBufferedTrace(tctx.traceId).length, 1);
  assert.deepEqual(getBufferedTrace("not-a-trace-id"), []);
});

test("request trace: 5xx marks the root span error; forged header mints fresh", () => {
  clearTraceBuffer();
  const r = req("00-zzz-00f067aa0ba902b7-01");
  const tctx = bindRequest(r);
  assert.notEqual(tctx.traceId, "00-zzz");
  assert.match(tctx.traceId, /^[0-9a-f]{32}$/);
  const done = finishRequest(r, "GET", "/status", 500)!;
  assert.equal(done.spans[0].status, "error");
});

test("spans: children parent to root, errors propagate, null context is spanless", async () => {
  clearTraceBuffer();
  const r = req();
  const tctx = bindRequest(r);
  const s = startSpan(tctx, "booking.create");
  s.end("ok", { "booking.id": "bkg_1" });
  await assert.rejects(() => withSpan(tctx, "payment.confirm", async () => { throw new Error("pg down"); }), /pg down/);
  assert.equal(await withSpan(null, "nothing", async () => 42), 42);
  const done = finishRequest(r, "POST", "/api/v1/bookings", 200)!;
  const names = done.spans.map((x) => x.name);
  assert.deepEqual(names, ["HTTP POST", "booking.create", "payment.confirm"]);
  assert.equal(done.spans[1].parentId, tctx.rootSpanId);
  assert.equal(done.spans[2].status, "error");
  assert.match(done.spans[2].attrs["error.message"], /pg down/);
  await withSpan(tctx, "nested", async () => 1, {}, done.spans[1].spanId);
  assert.equal(tctx.spans[tctx.spans.length - 1].parentId, done.spans[1].spanId);
  assert.match(tctx.spans[tctx.spans.length - 1].spanId, /^[0-9a-f]{16}$/);
});

test("trace buffer: bounded at 200, oldest evicted", () => {
  clearTraceBuffer();
  for (let i = 0; i < 205; i++) {
    const r = req();
    bindRequest(r);
    finishRequest(r, "GET", "/status", 200);
  }
  assert.equal(traceBufferSize(), 200);
  clearTraceBuffer();
});

test("otlp: payload follows the OTLP/HTTP JSON shape", () => {
  clearTraceBuffer();
  const r = req();
  const tctx = bindRequest(r);
  startSpan(tctx, "supplier.book").end("ok");
  const done = finishRequest(r, "POST", "/api/v1/bookings", 200)!;
  const p: any = buildOtlpPayload(done, "ota-hub");
  assert.equal(p.resourceSpans[0].resource.attributes[0].value.stringValue, "ota-hub");
  const spans = p.resourceSpans[0].scopeSpans[0].spans;
  assert.equal(spans.length, 2);
  assert.match(spans[0].startTimeUnixNano, /^\d{13,}$/);
  assert.ok(BigInt(spans[0].endTimeUnixNano) >= BigInt(spans[0].startTimeUnixNano));
  assert.equal(spans[1].parentSpanId, tctx.rootSpanId);
});

test("otlp export: unset endpoint sends nothing; failures are silent (red drill 1)", async () => {
  clearTraceBuffer();
  const r = req();
  bindRequest(r);
  const done = finishRequest(r, "GET", "/status", 200)!;
  assert.equal(exportTrace({} as any, null, done), false);
  assert.equal(exportTrace({ OTEL_EXPORTER_OTLP_ENDPOINT: "  " } as any, null, done), false);
  let seenUrl = "";
  const flaky = async (url: string) => { seenUrl = url; throw new Error("collector down"); };
  assert.equal(exportTrace({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318/" } as any, null, done, flaky as any), true);
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(seenUrl, "http://127.0.0.1:4318/v1/traces");
  const syncThrow = () => { throw new Error("no fetch"); };
  assert.equal(exportTrace({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://x/" } as any, null, done, syncThrow as any), false);
});

// ---------------------------------------------------------------- metrics

test("metrics: static routes stay, id-like segments template", () => {
  assert.equal(templateRoute("/api/v1/marketplace/catalog"), "/api/v1/marketplace/catalog");
  assert.equal(templateRoute("/trip-best"), "/trip-best");
  assert.equal(templateRoute("/api/v1/bookings/bkg_abc123/details"), "/api/v1/bookings/:id/details");
  assert.equal(templateRoute("/api/v1/bookings/usr_36ccbb72822f42d28dfc6fdcf9c7f20c"), "/api/v1/bookings/:id");
  assert.equal(templateRoute("/api/v1/admin/marketplace/batches/psb_x_2026-11/statement"), "/api/v1/admin/marketplace/batches/:id/statement");
  assert.equal(templateRoute("/api/v1/auth/oauth/kakao/start?x=1"), "/api/v1/auth/oauth/kakao/start");
  assert.equal(templateRoute(""), "/");
});

test("metrics: counters, cumulative buckets, prometheus shape, route cap", () => {
  resetMetrics();
  recordRequest("/api/v1/bookings", 201, 120);
  recordRequest("/api/v1/bookings", 500, 30);
  recordRequest("/api/v1/bookings", 404, 5);
  const s = snapshot();
  assert.deepEqual(s.routes["/api/v1/bookings"].counts, { "2xx": 1, "5xx": 1, "4xx": 1 });
  assert.equal(s.totals.requests, 3);
  assert.equal(s.totals.errors5xx, 1);
  assert.equal(s.routes["/api/v1/bookings"].buckets[0], 2); // <=50 (30ms + 5ms)
  assert.equal(s.routes["/api/v1/bookings"].buckets[2], 3); // <=250 cumulative
  const text = renderPrometheus();
  assert.match(text, /http_requests_total\{route="\/api\/v1\/bookings",class="2xx"\} 1/);
  assert.match(text, /http_request_duration_ms_bucket\{route="\/api\/v1\/bookings",le="\+Inf"\} 3/);
  for (let i = 0; i < 600; i++) recordRequest(`/overflow-${i}-x1`, 200, 1);
  const capped = snapshot();
  assert.ok(capped.overflowed > 0);
  assert.ok(capped.routes["OTHER"].total > 0);
  resetMetrics();
});

test("metrics: isolate p95 is the upper-bucket edge", () => {
  resetMetrics();
  assert.equal(isolateP95(), null);
  for (let i = 0; i < 19; i++) recordRequest("/a", 200, 10);
  recordRequest("/a", 200, 600);
  assert.equal(isolateP95(), 50); // 19/20 requests sit in the <=50ms bucket
  recordRequest("/a", 200, 600);
  assert.equal(isolateP95(), 1000); // rank 20 now falls in the <=1000ms bucket
  resetMetrics();
});

// ---------------------------------------------------------------- logs

test("logs: one JSON line with trace linkage; slow requests warn only", () => {
  const lines: string[] = [];
  const orig = console.log;
  const origWarn = console.warn;
  console.log = ((s: string) => { lines.push(s); }) as any;
  console.warn = ((s: string) => { lines.push(s); }) as any;
  try {
    const r = req();
    const tctx = bindRequest(r);
    logEvent("info", "demo.event", { route: "/x" }, tctx);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.event, "demo.event");
    assert.equal(parsed.trace_id, tctx.traceId);
    logSlowRequest("/x", 200, 100, tctx);
    assert.equal(lines.length, 1);
    logSlowRequest("/x", 200, 2500, tctx);
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[1]).event, "http.slow");
  } finally {
    console.log = orig;
    console.warn = origWarn;
  }
});

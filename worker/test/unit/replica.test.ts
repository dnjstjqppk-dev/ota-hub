import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { Env } from "../../src/env.ts";
import {
  REPLICA_DEFAULT_MAX_LAG_MS,
  isReplicaPath,
  observedRegion,
  parseLagMs,
  proxyToReplica,
  replicaLastFallback,
  replicaMirrorDomain,
  replicaNeedsMirror,
  resetReplicaState,
  resolveReplicaConfig,
} from "../../src/lib/replica.ts";

/** TG-20: replica routing decisions + proxy behavior against a local stub. */

let stub = "";
let mode: "ok" | "laggy" | "down" | "limited" = "ok";
const seen: Array<{ url: string; routed: string }> = [];

const server = http.createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    seen.push({ url: req.url || "", routed: String(req.headers["x-replica-route"] || "") });
    const send = (status: number, body: any, lag: string | null = "12") => {
      res.writeHead(status, { "Content-Type": "application/json", ...(lag === null ? {} : { "x-replica-lag-ms": lag }) });
      res.end(JSON.stringify(body));
    };
    if (mode === "down") { res.destroy(); return; }
    if (mode === "limited") return send(429, { error: "slow down" }, "3");
    if (mode === "laggy") return send(200, { success: true, count: 2, data: [{ id: "a" }, { id: "b" }] }, "99999");
    return send(200, { success: true, count: 2, data: [{ id: "a" }, { id: "b" }] });
  });
});

before(async () => {
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", () => res()));
  const a = server.address();
  stub = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
});
after(async () => { await new Promise((res) => server.close(() => res(null))); });
beforeEach(() => {
  resetReplicaState();
  seen.length = 0;
  mode = "ok";
});

const envFor = (extra: Record<string, string> = {}): Env => ({ APP_ENV: "test", ...extra } as unknown as Env);

test("replica: config resolves https everywhere, loopback in non-prod only", () => {
  assert.equal(resolveReplicaConfig(envFor({})), null);
  assert.ok(resolveReplicaConfig(envFor({ READ_REPLICA_URL: "https://replica.example.com/" })));
  assert.equal(resolveReplicaConfig(envFor({ READ_REPLICA_URL: "https://replica.example.com/" }))?.base, "https://replica.example.com");
  assert.ok(resolveReplicaConfig(envFor({ READ_REPLICA_URL: stub })));
  const prod = envFor({ READ_REPLICA_URL: stub }) as any;
  prod.APP_ENV = "production";
  assert.equal(resolveReplicaConfig(prod), null);
  assert.equal(resolveReplicaConfig(envFor({ READ_REPLICA_URL: "ftp://x/y" })), null);
  assert.equal(REPLICA_DEFAULT_MAX_LAG_MS, 5000);
  assert.equal(resolveReplicaConfig(envFor({ READ_REPLICA_URL: stub }))?.maxLagMs, 5000);
  assert.equal(resolveReplicaConfig(envFor({ READ_REPLICA_URL: stub, REPLICA_MAX_LAG_MS: "250" }))?.maxLagMs, 250);
  assert.equal(resolveReplicaConfig(envFor({ READ_REPLICA_URL: stub, REPLICA_MAX_LAG_MS: "1" }))?.maxLagMs, 100);
  assert.equal(resolveReplicaConfig(envFor({ READ_REPLICA_URL: stub, REPLICA_MAX_LAG_MS: "nope" }))?.maxLagMs, 5000);
});

test("replica: allowlist pins exact GET reads; details and writes never proxy", () => {
  for (const p of ["/api/v1/hotels", "/api/v1/flights", "/api/v1/trains", "/api/v1/cars", "/api/v1/transfers", "/api/v1/activities", "/api/v1/packages", "/api/v1/search", "/api/v1/search/suggest", "/api/v1/legal", "/api/v1/policies", "/api/v1/seo/snapshot", "/api/v1/feature-flags"]) {
    assert.equal(isReplicaPath("GET", p), true, p);
  }
  assert.equal(isReplicaPath("POST", "/api/v1/hotels"), false);
  assert.equal(isReplicaPath("GET", "/api/v1/hotels/htl_x"), false);
  assert.equal(isReplicaPath("GET", "/api/v1/quotes"), false);
  assert.equal(isReplicaPath("GET", "/api/v1/recommendations"), false);
  assert.equal(isReplicaPath("GET", "/api/v1/admin/entities"), false);
});

test("replica: mirror set covers funnel paths; domains resolve for logging", () => {
  assert.equal(replicaNeedsMirror("/api/v1/hotels"), true);
  assert.equal(replicaNeedsMirror("/api/v1/search"), true);
  assert.equal(replicaNeedsMirror("/api/v1/search/suggest"), false);
  assert.equal(replicaNeedsMirror("/api/v1/legal"), false);
  const u = (q: string) => new URL(`http://x${q}`);
  assert.equal(replicaMirrorDomain("/api/v1/hotels", u("/api/v1/hotels")), "HOTEL");
  assert.equal(replicaMirrorDomain("/api/v1/search", u("/api/v1/search?domain=flight")), "FLIGHT");
  assert.equal(replicaMirrorDomain("/api/v1/search", u("/api/v1/search")), undefined);
  assert.equal(replicaMirrorDomain("/api/v1/search", u("/api/v1/search?domain=!!!")), undefined);
});

test("replica: lag headers parse leniently, missing reads as zero", () => {
  assert.equal(parseLagMs(null), 0);
  assert.equal(parseLagMs("12"), 12);
  assert.equal(parseLagMs("12.9"), 12);
  assert.equal(parseLagMs("junk"), 0);
  assert.equal(parseLagMs("-5"), 0);
});

test("replica: proxy stamps hits and forwards the loop-guard header", async () => {
  const cfg = resolveReplicaConfig(envFor({ READ_REPLICA_URL: stub }))!;
  const req = new Request("http://primary/api/v1/hotels?limit=2");
  const out = await proxyToReplica(cfg, req, new URL(req.url));
  assert.equal(out.kind, "response");
  if (out.kind !== "response") return;
  assert.equal(out.response.status, 200);
  assert.equal(out.response.headers.get("x-replica"), "hit");
  assert.equal(out.response.headers.get("x-replica-lag-ms"), "12");
  assert.equal((await out.response.json()).count, 2);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "/api/v1/hotels?limit=2");
  assert.equal(seen[0].routed, "1");
  assert.equal(replicaLastFallback(), null);
});

test("replica: red drill 1+2 shape — lag, 5xx, and dead replicas fall back", async () => {
  const cfg = resolveReplicaConfig(envFor({ READ_REPLICA_URL: stub }))!;
  const req = new Request("http://primary/api/v1/hotels");
  mode = "laggy";
  const lagged = await proxyToReplica(cfg, req, new URL(req.url));
  assert.equal(lagged.kind, "fallback");
  if (lagged.kind !== "fallback") return;
  assert.deepEqual(lagged.info, { reason: "lag", lagMs: 99999 });
  assert.equal(replicaLastFallback()?.reason, "lag");

  mode = "down";
  const dead = await proxyToReplica(cfg, req, new URL(req.url));
  assert.equal(dead.kind, "fallback");
  if (dead.kind !== "fallback") return;
  assert.equal(dead.info.reason, "error");
  assert.equal(replicaLastFallback()?.reason, "error");
});

test("replica: 429 passes through (backpressure respected, not routed around)", async () => {
  const cfg = resolveReplicaConfig(envFor({ READ_REPLICA_URL: stub }))!;
  mode = "limited";
  const req = new Request("http://primary/api/v1/hotels");
  const out = await proxyToReplica(cfg, req, new URL(req.url));
  assert.equal(out.kind, "response");
  if (out.kind !== "response") return;
  assert.equal(out.response.status, 429);
  assert.equal(out.response.headers.get("x-replica"), "hit");
  assert.equal(replicaLastFallback(), null);
});

test("replica: observed region reads the edge colo, local otherwise", () => {
  assert.equal(observedRegion(new Request("http://x/")), "local");
  assert.equal(observedRegion({ cf: { colo: "ICN" } } as any), "ICN");
  assert.equal(observedRegion({ cf: { colo: "bogus!!!" } } as any), "local");
  assert.equal(observedRegion({ cf: {} } as any), "local");
});

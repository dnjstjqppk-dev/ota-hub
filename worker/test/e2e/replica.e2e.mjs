/**
 * TG-20 read-replica E2E (separate isolated run — the server needs
 * READ_REPLICA_URL pointing at the in-file stub).
 *
 *   1. npx wrangler d1 migrations apply ota_local --local -c wrangler.local.jsonc --persist-to C:\tmp\e2e_rep
 *   2. node scripts/seed-isolated.mjs C:\tmp\e2e_rep 'LocalAdmin2026!x'
 *   3. npx wrangler dev -c wrangler.local.jsonc --port 8798 --persist-to C:\tmp\e2e_rep
 *        --var READ_REPLICA_URL:http://127.0.0.1:18999 --var REPLICA_MAX_LAG_MS:1000 --var PRIMARY_REGION:ICN
 *   4. BASE=http://127.0.0.1:8798 E2E_PERSIST_TO=C:\tmp\e2e_rep ADMIN_PASSWORD=LocalAdmin2026!x npm run test:e2e:replica
 *
 * The replica stub boots inside before() on 127.0.0.1:18999
 * (REPLICA_E2E_STUB_PORT to move it). Localhost only. D1 only.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";

const BASE = process.env.BASE || "http://127.0.0.1:8798";
const STUB_PORT = Number(process.env.REPLICA_E2E_STUB_PORT || 18999);
if (!/127\.0\.0\.1|localhost/.test(BASE)) throw new Error("Replica E2E runs against localhost only");

const rnd = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

async function api(method, path, { token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  // Same transient-localhost retry as api.e2e.mjs (#81 flake hardening).
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data, headers: res.headers };
  }
  throw lastErr;
}

function sql(command) {
  const isWin = process.platform === "win32";
  const persist = process.env.E2E_PERSIST_TO ? ["--persist-to", process.env.E2E_PERSIST_TO] : [];
  const args = ["wrangler", "d1", "execute", "ota_local", "--local", "-c", "wrangler.local.jsonc", ...persist, "--json", "--command", command];
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = execFileSync(isWin ? "cmd.exe" : "npx", isWin ? ["/c", "npx", ...args] : args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return JSON.parse(out)[0].results;
    } catch (e) {
      lastErr = e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400 * (attempt + 1));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------- stub
const scen = { lagMs: 12, down: false, limited: false };
let hits = 0;
const seenRoutes = [];

function stubHandler(req, res) {
  req.resume();
  req.on("end", () => {
    const send = (status, json, headers = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify(json));
    };
    const m = req.method || "";
    const u = (req.url || "").split("?")[0];
    if (m === "GET" && u === "/__counts") return send(200, { hits });
    if (scen.down) { res.destroy(); return; }
    if (m !== "GET") return send(405, { error: "replica is read-only" });
    hits += 1;
    seenRoutes.push(String(req.headers["x-replica-route"] || ""));
    if (scen.limited) return send(429, { error: "slow down" }, { "x-replica-lag-ms": "3" });
    return send(200, {
      success: true, count: 1, marker: "replica",
      data: [{ id: "replica_marker", name_ko: "복제본 마커" }],
      meta: { tookMs: 1 },
    }, { "x-replica-lag-ms": String(scen.lagMs) });
  });
}

// Scenario control rides direct variable assignment (same process).
function setScenario(patch) {
  Object.assign(scen, patch);
}

let stubServer = null;

before(async () => {
  stubServer = createServer(stubHandler);
  await new Promise((res, rej) => {
    stubServer.on("error", rej);
    stubServer.listen(STUB_PORT, "127.0.0.1", () => res(null));
  });
  sql("DELETE FROM login_attempts");
});

after(async () => {
  if (stubServer) await new Promise((res) => stubServer.close(() => res(null)));
});

async function register(tag) {
  const email = `qa_rep_${tag}_${rnd()}@local.test`;
  const r = await api("POST", "/api/v1/auth/register", { body: { email, password: "Passw0rd-QA-1", fullName: `QA ${tag}`, agreeTerms: true, agreePrivacy: true } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { email, token: r.data.token, id: r.data.user.id };
}

test("TG-20a replica serves allowlisted reads; lag and outage fall back", async () => {
  const U = await register("a");
  const before = hits;
  const r = await api("GET", "/api/v1/hotels?limit=2", { token: U.token });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.headers.get("x-replica"), "hit");
  assert.equal(r.data.marker, "replica");
  assert.equal(hits, before + 1);
  assert.deepEqual(seenRoutes.slice(-1), ["1"]);
  // Primary mirrors the funnel event (its own DB gets exactly one row).
  const ev = sql(`SELECT meta_json AS m FROM analytics_events WHERE user_id = '${U.id}' ORDER BY id DESC LIMIT 1`)[0];
  assert.ok(ev && ev.m.includes("replica"), JSON.stringify(ev));

  // Red drill 1: lag over the ceiling falls back to primary.
  setScenario({ lagMs: 60000 });
  const lagged = await api("GET", "/api/v1/hotels?limit=2", { token: U.token });
  assert.equal(lagged.status, 200);
  assert.equal(lagged.headers.get("x-replica-fallback"), "lag");
  assert.equal(lagged.headers.get("x-replica-lag-ms"), "60000");
  assert.equal(lagged.data.marker, undefined, "primary data, not the stub marker");
  const st = await api("GET", "/status");
  assert.equal(st.data.replica.lastFallback.reason, "lag");
  setScenario({ lagMs: 12 });

  // Red drill 2: dead replica fails over silently to primary.
  setScenario({ down: true });
  const hb = hits;
  const over = await api("GET", "/api/v1/hotels?limit=2", { token: U.token });
  assert.equal(over.status, 200);
  assert.equal(over.headers.get("x-replica-fallback"), "error");
  assert.equal(over.data.marker, undefined);
  assert.equal(hits, hb, "no completed replica call");
  setScenario({ down: false });

  // 429 passes through (replica backpressure respected).
  setScenario({ limited: true });
  const lim = await api("GET", "/api/v1/hotels?limit=2", { token: U.token });
  assert.equal(lim.status, 429);
  assert.equal(lim.headers.get("x-replica"), "hit");
  setScenario({ limited: false });
});

test("TG-20a writes, details, and marked requests never proxy", async () => {
  const U = await register("b");
  const hb = hits;
  const q = await api("POST", "/api/v1/quotes", { token: U.token, body: { domain: "HOTEL", itemId: "htl_seoul_01", unitId: "rm_seoul_01_dlx", startDate: "2027-05-01", endDate: "2027-05-02", rooms: 1, travelers: { adults: 2 } } });
  assert.ok([201, 409].includes(q.status), JSON.stringify(q.data).slice(0, 200));
  assert.equal(q.headers.get("x-replica"), null);
  assert.equal(q.headers.get("x-replica-fallback"), null);
  const det = await api("GET", "/api/v1/hotels/htl_seoul_01", { token: U.token });
  assert.equal(det.status, 200);
  assert.equal(det.headers.get("x-replica"), null);
  const marked = await api("GET", "/api/v1/hotels?limit=1", { headers: { "X-Replica-Route": "1" } });
  assert.equal(marked.status, 200);
  assert.equal(marked.headers.get("x-replica"), null);
  assert.equal(marked.headers.get("x-replica-fallback"), null);
  assert.equal(marked.data.marker, undefined);
  assert.equal(hits, hb, "nothing proxied");
});

test("TG-20b status and headers expose region and replica posture", async () => {
  const st = await api("GET", "/status");
  assert.equal(st.status, 200);
  assert.equal(st.data.region.configured, "ICN");
  assert.match(st.data.region.observed, /^[A-Z]{3}$|^local$/);
  assert.equal(st.data.replica.enabled, true);
  assert.equal(st.data.replica.maxLagMs, 1000);
  const r = await api("GET", "/api/v1/feature-flags");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-replica"), "hit");
  assert.equal(r.headers.get("x-region"), st.data.region.observed);
});

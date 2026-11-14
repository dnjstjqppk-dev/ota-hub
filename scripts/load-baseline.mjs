#!/usr/bin/env node
// TG-04: zero-dependency load baseline probe (k6 deferred — no new binaries).
// Harness: local `wrangler dev` on a FRESH isolated DB (never the E2E server:
// same-IP rate-limit buckets would cross-talk into the suite).
// Usage: node scripts/load-baseline.mjs [BASE] [VUS] [SECONDS]
//   BASE default http://127.0.0.1:8798 ; VUS default 5 ; SECONDS default 30.
// Mix per VU iteration: hotel search -> hotel detail -> (every 10th) quote.
// Prints a human summary plus one JSON line (paste into LOAD_BASELINE_TG04.md).

const BASE = process.argv[2] || "http://127.0.0.1:8798";
const VUS = Math.max(1, parseInt(process.argv[3] || "5", 10));
const SECONDS = Math.max(5, parseInt(process.argv[4] || "30", 10));

const lat = [];
const statusCount = {};
let ok = 0;
let err = 0;
const startedAt = Date.now();

async function call(method, path, { token, body } = {}) {
  const t0 = performance.now();
  let status = 0;
  try {
    const r = await fetch(BASE + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    status = r.status;
    await r.text();
  } catch {
    status = -1;
  }
  const ms = performance.now() - t0;
  lat.push(ms);
  statusCount[status] = (statusCount[status] || 0) + 1;
  if (status >= 200 && status < 300) ok++;
  else err++;
  return status;
}

function pct(p) {
  if (!lat.length) return 0;
  const s = [...lat].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] * 10) / 10;
}

// Setup: one user, one live hotel id + unit id (no seed assumptions).
// Retries on 429: a previous run may have drained the per-IP buckets.
async function setupFetch(path, init, label) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(BASE + path, init);
    if (r.status !== 429 || attempt >= 5) {
      if (r.status === 429) throw new Error(`setup ${label} still 429 after retries`);
      return r;
    }
    await new Promise((r2) => setTimeout(r2, 15000));
  }
}
const email = `load_${Date.now().toString(36)}@local.test`;
const reg = await setupFetch("/api/v1/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Passw0rd-QA-1", fullName: "Load Probe", agreeTerms: true, agreePrivacy: true }),
}, "register");
if (reg.status !== 201) throw new Error(`setup register failed: ${reg.status} ${await reg.text()}`);
const { token } = await reg.json();
const seedSearch = await setupFetch("/api/v1/hotels?city=Seoul&limit=5", {}, "search");
if (seedSearch.status !== 200) throw new Error(`setup search failed: ${seedSearch.status}`);
const targetId = (await seedSearch.json()).data[0]?.id;
if (!targetId) throw new Error("setup: no hotel to target");
const detail = await setupFetch(`/api/v1/hotels/${targetId}`, {}, "detail");
const rooms = ((await detail.json()).data?.rooms || []).filter((r) => r && (r.id || r.room_id));
const unitId = rooms[0]?.id || rooms[0]?.room_id || undefined;
const quoteBody = {
  domain: "HOTEL", itemId: targetId, ...(unitId ? { unitId } : {}),
  startDate: new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 61 * 864e5).toISOString().slice(0, 10),
  rooms: 1, travelers: { adults: 1 },
};

lat.length = 0;
for (const k of Object.keys(statusCount)) delete statusCount[k];
ok = 0; err = 0;

async function vu(id) {
  let i = 0;
  while (Date.now() - startedAt < SECONDS * 1000) {
    i++;
    await call("GET", `/api/v1/hotels?city=Seoul&limit=20`);
    await call("GET", `/api/v1/hotels/${targetId}`);
    if (i % 10 === 0) await call("POST", "/api/v1/quotes", { token, body: quoteBody });
  }
}

await Promise.all(Array.from({ length: VUS }, (_, i) => vu(i)));
const secs = (Date.now() - startedAt) / 1000;
const summary = {
  base: BASE, vus: VUS, seconds: Math.round(secs),
  requests: lat.length, ok, err,
  rps: Math.round((lat.length / secs) * 10) / 10,
  p50_ms: pct(50), p95_ms: pct(95), p99_ms: pct(99),
  status: statusCount,
};
console.log(`requests=${summary.requests} ok=${ok} err=${err} rps=${summary.rps} p50=${summary.p50_ms}ms p95=${summary.p95_ms}ms p99=${summary.p99_ms}ms`);
console.log(`status=${JSON.stringify(statusCount)}`);
console.log("JSON " + JSON.stringify(summary));

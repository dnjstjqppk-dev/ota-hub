#!/usr/bin/env node
// TG-16: search-focused load probe (facets + geo + paging mix) on a big catalog.
// Usage: node scripts/load-search.mjs [BASE] [VUS] [SECONDS]
// Prints a human summary plus one JSON line.
const BASE = process.argv[2] || "http://127.0.0.1:8798";
const VUS = Math.max(1, parseInt(process.argv[3] || "5", 10));
const SECONDS = Math.max(5, parseInt(process.argv[4] || "30", 10));

const QUERIES = [
  "/api/v1/search?q=hotel&limit=20",
  "/api/v1/search?q=%EC%84%9C%EC%9A%B8&domain=HOTEL&limit=20",
  "/api/v1/search?q=tokyo&minPrice=100000&maxPrice=300000&sort=price_asc",
  "/api/v1/search?q=&domain=HOTEL&city=%EB%8F%84%EC%9E%90&limit=50",
  "/api/v1/search?bbox=37.0,126.0,38.0,128.0&limit=20",
  "/api/v1/search?q=flight&domain=FLIGHT&sort=price_desc&limit=10",
  "/api/v1/search?q=tour&minRating=4.5&limit=20",
  "/api/v1/search?q=resort&city=%EB%B0%A9%EC%BD%95&limit=20&offset=20",
];

const lat = [];
const statusCount = {};
let ok = 0;
let err = 0;
const stopAt = Date.now() + SECONDS * 1000;

async function call(path) {
  const t0 = performance.now();
  let status = 0;
  try {
    const r = await fetch(BASE + path);
    status = r.status;
    await r.text();
  } catch {
    status = -1;
  }
  lat.push(performance.now() - t0);
  statusCount[status] = (statusCount[status] || 0) + 1;
  if (status >= 200 && status < 300) ok++;
  else err++;
}

// Paced under the catalog_read backstop (600/60 per IP): total ~9 rps so the
// latency picture measures queries, not 429s. Flood behavior is covered by the
// unpaced TG-04 baseline (429s hold, no melt).
const INTERVAL_MS = Math.ceil((VUS * 1000) / 9);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function vu(seed) {
  let i = seed;
  while (Date.now() < stopAt) {
    await call(QUERIES[i++ % QUERIES.length]);
    await sleep(INTERVAL_MS);
  }
}

await Promise.all(Array.from({ length: VUS }, (_, i) => vu(i)));
const s = [...lat].sort((a, b) => a - b);
const pct = (p) => (s.length ? Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] * 10) / 10 : 0);
const rps = Math.round((lat.length / SECONDS) * 10) / 10;
console.log(`requests=${lat.length} ok=${ok} err=${err} rps=${rps} p50=${pct(50)}ms p95=${pct(95)}ms p99=${pct(99)}ms`);
console.log(`status=${JSON.stringify(statusCount)}`);
console.log(`JSON ${JSON.stringify({ base: BASE, vus: VUS, seconds: SECONDS, requests: lat.length, ok, err, rps, p50_ms: pct(50), p95_ms: pct(95), p99_ms: pct(99), status: statusCount })}`);

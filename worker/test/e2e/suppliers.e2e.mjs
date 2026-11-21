/**
 * TG-18 NDC/GDS E2E (separate isolated run — the server needs NDC/GDS stub
 * vars, like the Stripe suite needs PAYMENT_PROVIDER=stripe).
 *
 *   1. npx wrangler d1 migrations apply ota_local --local -c wrangler.local.jsonc --persist-to C:\tmp\e2e_sup
 *   2. node scripts/seed-isolated.mjs C:\tmp\e2e_sup 'LocalAdmin2026!x'
 *   3. npx wrangler dev -c wrangler.local.jsonc --port 8798 --persist-to C:\tmp\e2e_sup
 *        --var NDC_API_BASE:http://127.0.0.1:18899 --var NDC_API_KEY:ndc_e2e
 *        --var GDS_API_BASE:http://127.0.0.1:18899 --var GDS_API_KEY:gds_e2e
 *        --var SUPPLIER_BREAKER_COOLDOWN_MS:3000
 *   4. BASE=http://127.0.0.1:8798 E2E_PERSIST_TO=C:\tmp\e2e_sup ADMIN_PASSWORD=LocalAdmin2026!x npm run test:e2e:suppliers
 *
 * The supplier stub (both namespaces, key-separated scenario state) boots
 * inside before() on 127.0.0.1:18899 (SUPPLIERS_E2E_STUB_PORT to move it).
 * Localhost only. D1 only.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";

const BASE = process.env.BASE || "http://127.0.0.1:8798";
const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "LocalAdmin2026!x";
const STUB_PORT = Number(process.env.SUPPLIERS_E2E_STUB_PORT || 18899);
if (!/127\.0\.0\.1|localhost/.test(BASE)) throw new Error("Suppliers E2E runs against localhost only");

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const rnd = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const idem = () => `idem_${rnd()}${rnd()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, { token, body, headers = {} } = {}) {
  const h = { "Content-Type": "application/json", ...headers };
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
    return { status: res.status, data };
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
const PNR_A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const pnr6 = () => Array.from({ length: 6 }, () => PNR_A[Math.floor(Math.random() * PNR_A.length)]).join("");
const scen = { ndc_e2e: { failOrders: false, failOffers: false }, gds_e2e: { failOrders: false, failOffers: false } };
const counts = { offers: { ndc_e2e: 0, gds_e2e: 0 }, orders: { ndc_e2e: 0, gds_e2e: 0 } };
const orderByKey = new Map();
let orderSeq = 0;
let ticketSeq = 0;

function stubHandler(req, res) {
  let raw = "";
  req.on("data", (c) => void (raw += c));
  req.on("end", () => {
    const send = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const m = req.method || "";
    const u = (req.url || "").split("?")[0];
    if (m === "POST" && u === "/__scenario") {
      try {
        const b = JSON.parse(raw || "{}");
        if (b.key && scen[b.key]) {
          if (typeof b.failOrders === "boolean") scen[b.key].failOrders = b.failOrders;
          if (typeof b.failOffers === "boolean") scen[b.key].failOffers = b.failOffers;
        }
      } catch {}
      return send(200, { ok: true });
    }
    if (m === "GET" && u === "/__counts") return send(200, counts);
    const key = String(req.headers.authorization || "").replace(/^Bearer /, "");
    if (!scen[key]) return send(401, { code: "UNAUTHORIZED" });
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    if (m === "POST" && u === "/offers") {
      counts.offers[key] += 1;
      if (scen[key].failOffers) return send(500, { code: "GATEWAY_DOWN" });
      const mk = (i) => ({ offerId: `${key}_off_${i}`, airline: "KE", flightNo: "KE703", from: body.origin, to: body.destination, date: body.date, amountMinor: 605000 + i * 1000, currency: "KRW", expiresAt: "2027-01-10T00:00:00Z" });
      return send(200, { offers: [mk(1), mk(2)] });
    }
    if (m === "POST" && u === "/orders") {
      counts.orders[key] += 1;
      const idemKey = `${key}:${String(body.idempotencyKey || "")}`;
      const replay = orderByKey.get(idemKey);
      if (replay) return send(409, { code: "ORDER_DUPLICATE", ...replay });
      if (scen[key].failOrders) return send(400, { code: "NO_AVAILABILITY", message: "sold out (stub)" });
      orderSeq += 1;
      const row = { reference: `${key === "ndc_e2e" ? "NDC" : "GDS"}-E2E-${orderSeq}`, pnr: pnr6() };
      orderByKey.set(idemKey, row);
      return send(200, row);
    }
    const ticket = u.match(/^\/orders\/(.+)\/ticket$/);
    if (m === "POST" && ticket) {
      ticketSeq += 1;
      return send(200, { ticketNumbers: [`180-${String(Date.now()).slice(-7)}${ticketSeq}`] });
    }
    const cancel = u.match(/^\/orders\/(.+)\/cancel$/);
    if (m === "POST" && cancel) return send(200, { cancelled: true, reference: cancel[1] });
    return send(404, { code: "not_found" });
  });
}

let stubServer = null;
let ADMIN = null;
let TXC = null;

const contact = { name: "김민지", email: "qa@local.test", phone: "+82-10-1111-2222" };
const pax = (fn, ln) => ({ type: "ADULT", lastNameEn: ln, firstNameEn: fn, birthDate: "1990-01-01", gender: "F", nationality: "KOR", passportNumber: "M12345678", passportExpiry: day(900) });

async function register(tag) {
  const email = `qa_sup_${tag}_${rnd()}@local.test`;
  const r = await api("POST", "/api/v1/auth/register", { body: { email, password: "Passw0rd-QA-1", fullName: `QA ${tag}`, agreeTerms: true, agreePrivacy: true } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { email, token: r.data.token, id: r.data.user.id };
}

async function quote(token, itemId, startDate) {
  return api("POST", "/api/v1/quotes", { token, body: { domain: "FLIGHT", itemId, startDate, travelers: { adults: 1 } } });
}

async function book(token, q, tag) {
  return api("POST", "/api/v1/bookings", { token, headers: { "Idempotency-Key": idem() }, body: { quoteId: q.quoteId, contact, travelers: [pax(`FN${tag}`, `LN${tag}`)], consents: TXC } });
}

async function pay(token, b) {
  return api("POST", "/api/v1/payments/confirm", { token, body: { bookingId: b.id, orderId: b.id, amount: b.totalMinor, paymentKey: `sbx_ok_${rnd()}` } });
}

async function scenario(key, patch) {
  const r = await fetch(`http://127.0.0.1:${STUB_PORT}/__scenario`, { method: "POST", body: JSON.stringify({ key, ...patch }) });
  assert.equal(r.status, 200);
}

async function stubCounts() {
  return (await (await fetch(`http://127.0.0.1:${STUB_PORT}/__counts`)).json());
}

before(async () => {
  stubServer = createServer(stubHandler);
  await new Promise((res, rej) => {
    stubServer.on("error", rej);
    stubServer.listen(STUB_PORT, "127.0.0.1", () => res(null));
  });
  sql("DELETE FROM login_attempts");
  const r = await api("POST", "/api/v1/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  assert.equal(r.status, 200, "admin login");
  ADMIN = r.data.token;
  const docs = (await api("GET", "/api/v1/legal")).data.documents || [];
  const ver = Object.fromEntries(docs.map((d) => [d.slug, d.version]));
  TXC = { refundPolicy: ver["refund-policy"], privacy: ver.privacy, thirdParty: ver.privacy };
  // Fixture suppliers (LIVE contract rows would come from the admin flow;
  // the admin allowlist itself is asserted in tg18a0 below).
  sql("INSERT OR REPLACE INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps) VALUES ('sup_ndc_e2e', 'NDC E2E', 'FLIGHT', 'ndc', 'LIVE', 'MERCHANT_OF_RECORD', 9000), ('sup_gds_e2e', 'GDS E2E', 'FLIGHT', 'gds', 'LIVE', 'MERCHANT_OF_RECORD', 9000), ('sup_tmp_e2e', 'TMP E2E', 'FLIGHT', 'none', 'NOT_INTEGRATED', 'MERCHANT_OF_RECORD', 9000)");
  sql("UPDATE flights SET partner_id = 'sup_ndc_e2e' WHERE id = 'flt_ke703'");
  sql("UPDATE flights SET partner_id = 'sup_gds_e2e' WHERE id = 'flt_ke704_ret'");
});

after(async () => {
  if (stubServer) await new Promise((res) => stubServer.close(() => res(null)));
});

test("TG-18a0 admin adapter allowlist accepts ndc/gds; LIVE still needs a contract", async () => {
  const bad = await api("PATCH", "/api/v1/admin/suppliers/sup_tmp_e2e", { token: ADMIN, body: { adapter: "nope" } });
  assert.equal(bad.data.code, "INVALID_ADAPTER");
  for (const a of ["ndc", "gds"]) {
    const ok = await api("PATCH", "/api/v1/admin/suppliers/sup_tmp_e2e", { token: ADMIN, body: { adapter: a } });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
  }
  const live = await api("PATCH", "/api/v1/admin/suppliers/sup_tmp_e2e", { token: ADMIN, body: { integrationStatus: "LIVE" } });
  assert.equal(live.data.code, "CONTRACT_REQUIRED");
  const maps = await api("GET", "/api/v1/admin/suppliers/mappings", { token: ADMIN });
  assert.equal(maps.status, 200, JSON.stringify(maps.data));
  assert.ok(maps.data.airports.length >= 20 && maps.data.airlines.length >= 10);
  assert.ok(maps.data.airports.some((a) => a.code === "ICN"));
  assert.ok(maps.data.airlines.some((a) => a.code === "KE"));
  assert.equal((await api("GET", "/api/v1/admin/suppliers/mappings")).status, 401);
});

test("TG-18a NDC offers cache, PNR roundtrip, ticket, cancel", async () => {
  const U = await register("ndc");
  const ODATE = day(70);
  const q = (extra = "") => api("GET", `/api/v1/flights/offers?origin=ICN&destination=NRT&date=${ODATE}&adults=1${extra}`, { token: U.token });
  const first = await q();
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.offers.length, 2);
  assert.equal(first.data.meta.cached, false);
  assert.equal(first.data.meta.source, "live");
  const second = await q();
  assert.equal(second.data.meta.cached, true);
  assert.equal((await stubCounts()).offers.ndc_e2e, 1, "two reads, one supplier call");
  assert.equal((await q("&airline=KE")).data.offers.length, 2);
  assert.equal((await api("GET", `/api/v1/flights/offers?origin=AAA&destination=NRT&date=${ODATE}&adults=1`, { token: U.token })).data.code, "UNKNOWN_AIRPORT");
  assert.equal((await api("GET", `/api/v1/flights/offers?origin=ICN&destination=NRT&date=${ODATE}&adults=1&airline=ZZ`, { token: U.token })).data.code, "UNKNOWN_AIRLINE");
  assert.equal((await api("GET", `/api/v1/flights/offers?origin=ICN&destination=ICN&date=${ODATE}&adults=1`, { token: U.token })).data.code, "INVALID_ROUTE");

  const fq = (await quote(U.token, "flt_ke703", day(71))).data.quote;
  const b = (await book(U.token, fq, "ndc")).data.booking;
  const p = await pay(U.token, b);
  const bk = p.data.booking;
  assert.equal(bk.status, "TICKETED", JSON.stringify(bk).slice(0, 500));
  assert.match(bk.items[0].pnr, /^[A-Z0-9]{6}$/);
  assert.equal(bk.items[0].ticket_numbers.length, 1);
  const hist = bk.history.map((h) => h.to_status);
  assert.ok(hist.indexOf("SUPPLIER_CONFIRMED") < hist.indexOf("TICKETING_PENDING") && hist.indexOf("TICKETING_PENDING") < hist.indexOf("TICKETED"));
  const calls = sql(`SELECT operation, outcome FROM supplier_api_calls WHERE booking_id = '${b.id}' ORDER BY created_at`);
  assert.deepEqual(calls.map((c) => `${c.operation}:${c.outcome}`), ["BOOK:CONFIRMED", "TICKET:ISSUED"]);

  const c = await api("POST", `/api/v1/bookings/${b.id}/cancel`, { token: U.token });
  assert.equal(c.data.booking.status, "CANCELLED", JSON.stringify(c.data).slice(0, 400));
  assert.equal(c.data.booking.cancellationFeeMinor, b.totalMinor);
  const cxl = sql(`SELECT outcome FROM supplier_api_calls WHERE booking_id = '${b.id}' AND operation = 'CANCEL'`);
  assert.equal(cxl[0].outcome, "CANCELLED");
});

test("TG-18a GDS leg mirrors NDC (offers + PNR + ticket + cancel)", async () => {
  const U = await register("gds");
  const offers = await api("GET", `/api/v1/flights/offers?origin=ICN&destination=NRT&date=${day(70)}&adults=1&supplier=gds`, { token: U.token });
  assert.equal(offers.status, 200, JSON.stringify(offers.data));
  assert.equal(offers.data.meta.supplier, "gds");
  const fq = (await quote(U.token, "flt_ke704_ret", day(72))).data.quote;
  const b = (await book(U.token, fq, "gds")).data.booking;
  const bk = (await pay(U.token, b)).data.booking;
  assert.equal(bk.status, "TICKETED", JSON.stringify(bk).slice(0, 500));
  assert.match(bk.items[0].pnr, /^[A-Z0-9]{6}$/);
  const c = await api("POST", `/api/v1/bookings/${b.id}/cancel`, { token: U.token });
  assert.equal(c.data.booking.status, "CANCELLED");
});

test("TG-18b breaker: outage trips OPEN (503 + alternates), recovery closes", async () => {
  const U = await register("brk");
  const ODATE = day(70); // warmed by tg18a with identical params
  await scenario("ndc_e2e", { failOffers: true });
  const stale = await api("GET", `/api/v1/flights/offers?origin=ICN&destination=NRT&date=${ODATE}&adults=1`, { token: U.token });
  assert.equal(stale.status, 200, JSON.stringify(stale.data));
  // Hot-layer hit has no reason to call the dead supplier; a D1-layer hit
  // would surface stale:true. Either way the read survives the outage.
  assert.equal(stale.data.meta.cached, true);
  assert.equal(stale.data.offers.length, 2);
  await scenario("ndc_e2e", { failOffers: false });

  await scenario("ndc_e2e", { failOrders: true });
  // Four quotes up front: three burn into REFUNDED trips, the fourth stays
  // spare to prove the booking gate refuses while OPEN.
  const spares = [];
  for (let i = 0; i < 4; i++) {
    const fq = (await quote(U.token, "flt_ke703", day(73 + i))).data.quote;
    assert.ok(fq.quoteId, `quote ${i} while CLOSED`);
    spares.push(fq);
  }
  for (let i = 0; i < 3; i++) {
    const booked = await book(U.token, spares[i], `brk${"ABC"[i]}`);
    assert.ok(booked.data.booking, `trip ${i} book: ${JSON.stringify(booked.data).slice(0, 300)}`);
    const p = await pay(U.token, booked.data.booking);
    assert.equal(p.data.booking.status, "REFUNDED", `trip ${i}: ${JSON.stringify(p.data).slice(0, 300)}`);
  }
  const blocked = await quote(U.token, "flt_ke703", day(80));
  assert.equal(blocked.status, 503, JSON.stringify(blocked.data));
  assert.equal(blocked.data.code, "SUPPLIER_CIRCUIT_OPEN");
  assert.ok(blocked.data.details.retryAfterSec > 0);
  assert.ok(blocked.data.details.alternates.length > 0, "warmed cache alternates");
  assert.ok(blocked.data.details.alternates.every((o) => o.cached === true));
  const bblocked = await book(U.token, spares[3], "blk");
  assert.equal(bblocked.status, 503);
  assert.equal(bblocked.data.code, "SUPPLIER_CIRCUIT_OPEN");

  await scenario("ndc_e2e", { failOrders: false });
  await sleep(3600); // cooldown is 3000ms on this server
  const rq = (await quote(U.token, "flt_ke703", day(81))).data.quote;
  const rb = (await book(U.token, rq, "recA")).data.booking;
  assert.equal((await pay(U.token, rb)).data.booking.status, "TICKETED");
  const rq2 = (await quote(U.token, "flt_ke703", day(82))).data.quote;
  const rb2 = (await book(U.token, rq2, "recB")).data.booking;
  assert.equal((await pay(U.token, rb2)).data.booking.status, "TICKETED");
});

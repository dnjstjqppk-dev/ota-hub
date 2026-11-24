/**
 * GAP-06 multi-PG E2E (separate isolated run — needs PAYMENT_PROVIDER=toss,stripe
 * with BOTH PG stubs, which no other pass boots).
 *
 *   1. node scripts/seed-isolated.mjs C:\tmp\e2e_multi 'LocalAdmin2026!x'  (after migrations)
 *   2. npx wrangler dev -c wrangler.local.jsonc --port 8799 --persist-to C:\tmp\e2e_multi
 *        --var PAYMENT_PROVIDER:toss,stripe --var TOSS_SECRET_KEY:test_sk_e2e
 *        --var TOSS_API_BASE:http://127.0.0.1:18797 --var TOSS_WEBHOOK_SECRET:toss_e2e
 *        --var STRIPE_SECRET_KEY:sk_test_e2e --var STRIPE_API_BASE:http://127.0.0.1:18799
 *        --var STRIPE_WEBHOOK_SECRET:whsec_multi
 *   3. BASE=http://127.0.0.1:8799 E2E_PERSIST_TO=C:\tmp\e2e_multi ADMIN_PASSWORD=LocalAdmin2026!x npm run test:e2e:multi
 * (TOSS_E2E_WEBHOOK_SECRET / STRIPE_E2E_WEBHOOK_SECRET override the defaults —
 * each must equal its server --var, same single-source rule as the other passes.)
 *
 * Both stubs boot inside before() on 127.0.0.1 (18797 Toss, 18799 Stripe) and
 * fail loudly when taken. Localhost only.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";

const BASE = process.env.BASE || "http://127.0.0.1:8799";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "LocalAdmin2026!x";
const TOSS_PORT = Number(process.env.MULTI_E2E_TOSS_PORT || 18797);
const STRIPE_PORT = Number(process.env.MULTI_E2E_STRIPE_PORT || 18799);
const TOSS_HOOK = process.env.TOSS_E2E_WEBHOOK_SECRET || "toss_e2e";
const STRIPE_HOOK = process.env.STRIPE_E2E_WEBHOOK_SECRET || "whsec_multi";
if (!/127\.0\.0\.1|localhost/.test(BASE)) throw new Error("Multi-PG E2E runs against localhost only");

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const rnd = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const idem = () => `idem_${rnd()}${rnd()}`;

async function api(method, path, { token, body, headers = {} } = {}) {
  const h = { "Content-Type": "application/json", ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
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

// ---------------------------------------------------------------- stubs
function tossHandler(req, res) {
  let raw = "";
  req.on("data", (c) => void (raw += c));
  req.on("end", () => {
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    const send = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const m = req.method || "";
    const u = req.url || "";
    if (m === "POST" && u === "/payments/confirm") {
      return send(200, { status: "DONE", paymentKey: body.paymentKey, totalAmount: body.amount, method: "CARD", approvedAt: "2026-11-24T00:00:00Z" });
    }
    if (m === "GET" && u.startsWith("/payments/orders/")) {
      return send(200, { status: "DONE", paymentKey: "toss_e2e_1", totalAmount: 1, method: "CARD", approvedAt: "2026-11-24T00:00:00Z" });
    }
    if (m === "POST" && u.endsWith("/cancel")) {
      return send(200, { cancels: [{ transactionKey: `tx_e2e_${rnd()}`, cancelAmount: body.cancelAmount }] });
    }
    return send(404, { code: "NOT_FOUND", message: "x" });
  });
}

let piSeq = 0;
function stripeHandler(req, res) {
  let raw = "";
  req.on("data", (c) => void (raw += c));
  req.on("end", () => {
    const form = {};
    for (const [k, v] of new URLSearchParams(raw || "")) form[k] = v;
    const send = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const m = req.method || "";
    const u = (req.url || "").split("?")[0];
    if (m === "POST" && u === "/v1/payment_intents") {
      const id = `pi_multi_${++piSeq}_${rnd()}`;
      return send(200, { id, status: "succeeded", amount_received: Number(form.amount), currency: form.currency, created: 1790000000, charges: { data: [{ payment_method_details: { card: { brand: "visa" } } }] } });
    }
    if (m === "GET" && u.startsWith("/v1/payment_intents/")) {
      const id = u.split("/").pop() || "";
      return send(200, { id, status: "succeeded", amount_received: 1, currency: "krw", created: 1790000000, charges: { data: [{ payment_method_details: { card: { brand: "visa" } } }] } });
    }
    if (m === "POST" && u === "/v1/refunds") {
      return send(200, { id: "re_multi_1", object: "refund", status: "succeeded" });
    }
    return send(404, { error: { code: "not_found" } });
  });
}

let tossServer = null;
let stripeServer = null;
let TXC = null;
let stayOffset = 60;

const HOTEL = { domain: "HOTEL", itemId: "htl_seoul_01", unitId: "rm_seoul_01_dlx" };
const lead = [{ type: "ADULT", lastNameEn: "KIM", firstNameEn: "MINJI" }];
const contact = { name: "김민지", email: "qa@local.test", phone: "+82-10-1111-2222" };

async function register(tag) {
  const email = `qa_mpg_${tag}_${rnd()}@local.test`;
  const r = await api("POST", "/api/v1/auth/register", { body: { email, password: "Passw0rd-QA-1", fullName: `QA ${tag}`, agreeTerms: true, agreePrivacy: true } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { email, token: r.data.token, id: r.data.user.id };
}

async function quote(token, extra = {}) {
  stayOffset += 2;
  return api("POST", "/api/v1/quotes", { token, body: { ...HOTEL, startDate: day(stayOffset), endDate: day(stayOffset + 1), rooms: 1, travelers: { adults: 2 }, ...extra } });
}

async function book(token, q) {
  return api("POST", "/api/v1/bookings", { token, headers: { "Idempotency-Key": idem() }, body: { quoteId: q.quoteId, contact, travelers: lead, consents: TXC } });
}

async function pay(token, b, paymentKey, extra = {}) {
  return api("POST", "/api/v1/payments/confirm", { token, body: { bookingId: b.id, orderId: b.id, amount: b.totalMinor, paymentKey, ...extra } });
}

function stripeSign(raw) {
  const t = String(Math.floor(Date.now() / 1000));
  return `t=${t},v1=${createHmac("sha256", STRIPE_HOOK).update(`${t}.${raw}`).digest("hex")}`;
}

async function listen(server, port) {
  await new Promise((res, rej) => {
    server.on("error", rej);
    server.listen(port, "127.0.0.1", () => res(null));
  });
}

before(async () => {
  tossServer = createServer(tossHandler);
  stripeServer = createServer(stripeHandler);
  await listen(tossServer, TOSS_PORT);
  await listen(stripeServer, STRIPE_PORT);
  const cfg = await api("GET", "/api/v1/payments/config");
  assert.deepEqual((cfg.data.providers || []).map((p) => p.provider), ["toss", "stripe"], "boot with PAYMENT_PROVIDER=toss,stripe + both stubs");
  assert.equal(cfg.data.provider, "toss");
  sql("DELETE FROM login_attempts");
  const docs = (await api("GET", "/api/v1/legal")).data.documents || [];
  const ver = Object.fromEntries(docs.map((d) => [d.slug, d.version]));
  TXC = { refundPolicy: ver["refund-policy"], privacy: ver.privacy, thirdParty: ver.privacy };
});

after(async () => {
  if (tossServer) await new Promise((res) => tossServer.close(() => res(null)));
  if (stripeServer) await new Promise((res) => stripeServer.close(() => res(null)));
});

test("multipg: Toss + Stripe confirm side by side; default serves choiceless clients", async () => {
  const U = await register("both");
  const t = (await book(U.token, (await quote(U.token)).data.quote)).data.booking;
  const r1 = await pay(U.token, t, `toss_e2e_${rnd()}`, { provider: "toss" });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  assert.equal(r1.data.booking.status, "VOUCHER_ISSUED");
  const s = (await book(U.token, (await quote(U.token)).data.quote)).data.booking;
  const r2 = await pay(U.token, s, `pm_multi_${rnd()}`, { provider: "stripe" });
  assert.equal(r2.status, 200, JSON.stringify(r2.data));
  assert.equal(r2.data.booking.status, "VOUCHER_ISSUED");
  const d = (await book(U.token, (await quote(U.token)).data.quote)).data.booking;
  const r3 = await pay(U.token, d, `toss_e2e_${rnd()}`);
  assert.equal(r3.status, 200, JSON.stringify(r3.data));
  const rows = sql(`SELECT provider FROM payments WHERE booking_id IN ('${t.id}','${s.id}','${d.id}') ORDER BY created_at`);
  assert.deepEqual(rows.map((r) => r.provider).sort(), ["stripe", "toss", "toss"]);
});

test("multipg: unknown/unlisted providers are refused with distinct codes", async () => {
  const U = await register("codes");
  const b = (await book(U.token, (await quote(U.token)).data.quote)).data.booking;
  const bad = await pay(U.token, b, "x", { provider: "bogus" });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.code, "UNKNOWN_PROVIDER");
  const off = await pay(U.token, b, "x", { provider: "sandbox" });
  assert.equal(off.status, 503);
  assert.equal(off.data.code, "PROVIDER_UNAVAILABLE");
});

test("multipg: refunds resolve per payment row, not the global default", async () => {
  const U = await register("refund");
  const t = (await book(U.token, (await quote(U.token)).data.quote)).data.booking;
  assert.equal((await pay(U.token, t, `toss_e2e_${rnd()}`, { provider: "toss" })).status, 200);
  const s = (await book(U.token, (await quote(U.token)).data.quote)).data.booking;
  assert.equal((await pay(U.token, s, `pm_multi_${rnd()}`, { provider: "stripe" })).status, 200);
  assert.equal((await api("POST", `/api/v1/bookings/${s.id}/cancel`, { token: U.token })).status, 200);
  assert.equal((await api("POST", `/api/v1/bookings/${t.id}/cancel`, { token: U.token })).status, 200);
  const rows = sql(`SELECT status FROM refunds WHERE booking_id IN ('${s.id}','${t.id}')`);
  assert.equal(rows.length, 2);
  for (const r of rows) assert.equal(r.status, "SUCCEEDED");
});

test("multipg: both webhooks work when neither is the odd one out", async () => {
  const ghost = `bkg_no_such_${rnd()}`;
  const raw = JSON.stringify({ id: `evt_multi_${rnd()}`, type: "payment_intent.succeeded", data: { object: { id: "pi_nope" } } });
  const sw = await fetch(BASE + "/api/v1/webhooks/stripe", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": stripeSign(raw) },
    body: raw,
  });
  assert.equal(sw.status, 200);
  assert.equal((await sw.json()).action, "NO_UNKNOWN_PAYMENT");
  const tw = await api("POST", `/api/v1/webhooks/toss?key=${TOSS_HOOK}`, {
    body: { eventType: "PAYMENT_STATUS_CHANGED", data: { orderId: ghost, status: "DONE" } },
  });
  assert.equal(tw.status, 200, JSON.stringify(tw.data));
  assert.equal(tw.data.action, "NO_UNKNOWN_PAYMENT");
});

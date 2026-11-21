/**
 * TG-17 Stripe E2E (separate isolated run — the main suite pins the sandbox
 * provider and this file needs PAYMENT_PROVIDER=stripe).
 *
 *   1. node scripts/seed-isolated.mjs C:\tmp\e2e_stripe 'LocalAdmin2026!x'  (after migrations)
 *   2. npx wrangler dev -c wrangler.local.jsonc --port 8799 --persist-to C:\tmp\e2e_stripe
 *        --var PAYMENT_PROVIDER:stripe --var STRIPE_SECRET_KEY:sk_test_e2e
 *        --var STRIPE_API_BASE:http://127.0.0.1:18799 --var STRIPE_WEBHOOK_SECRET:whsec_e2e --var FRAUD_REVIEW:1
 *   3. BASE=http://127.0.0.1:8799 E2E_PERSIST_TO=C:\tmp\e2e_stripe ADMIN_PASSWORD=LocalAdmin2026!x npm run test:e2e:stripe
 *   (STRIPE_E2E_WEBHOOK_SECRET overrides the "whsec_e2e" default — it must
 *   equal the server's STRIPE_WEBHOOK_SECRET or tg17c 403s. CI sets both
 *   from the step env; observed 2026-11-18, run 44244951440.)
 *
 * The Stripe stub (contract shapes from unit tests) boots inside before() on
 * 127.0.0.1:18799 (STRIPE_E2E_STUB_PORT to move it) and fails loudly when the
 * port is taken. Localhost only. D1 only (the PG harness runs the main file).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";

const BASE = process.env.BASE || "http://127.0.0.1:8799";
const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "LocalAdmin2026!x";
const STUB_PORT = Number(process.env.STRIPE_E2E_STUB_PORT || 18799);
const WEBHOOK_SECRET = process.env.STRIPE_E2E_WEBHOOK_SECRET || "whsec_e2e";
if (!/127\.0\.0\.1|localhost/.test(BASE)) throw new Error("Stripe E2E runs against localhost only");

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const rnd = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const idem = () => `idem_${rnd()}${rnd()}`;

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
// PI state machine: 3ds PIs start requires_action, flip on /__complete.
const piState = new Map();
const chargePi = new Map();
let piSeq = 0;

function stubHandler(req, res) {
  let raw = "";
  req.on("data", (c) => void (raw += c));
  req.on("end", () => {
    const send = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const form = {};
    for (const [k, v] of new URLSearchParams(raw || "")) form[k] = v;
    const m = req.method || "";
    const u = (req.url || "").split("?")[0];
    if (m === "POST" && u === "/__complete") {
      try {
        const id = JSON.parse(raw || "{}").id;
        if (id) piState.set(id, "succeeded");
      } catch {}
      return send(200, { ok: true });
    }
    if (m === "POST" && u === "/__charge") {
      try {
        const b = JSON.parse(raw || "{}");
        if (b.charge && b.pi) chargePi.set(b.charge, b.pi);
      } catch {}
      return send(200, { ok: true });
    }
    if (m === "POST" && u === "/v1/payment_intents") {
      const pm = form.payment_method || "";
      if (pm.includes("decline")) return send(402, { error: { code: "card_declined", type: "card_error", message: "Your card was declined." } });
      const id = `pi_stub_${++piSeq}_${rnd()}`;
      if (pm.includes("3ds")) {
        piState.set(id, "requires_action");
        return send(200, { id, status: "requires_action", amount: Number(form.amount), currency: form.currency, next_action: { type: "redirect_to_url", redirect_to_url: { url: `http://127.0.0.1:${STUB_PORT}/3ds-test/${id}` } }, created: 1790000000 });
      }
      piState.set(id, "succeeded");
      return send(200, { id, status: "succeeded", amount_received: Number(form.amount), currency: form.currency, created: 1790000000, charges: { data: [{ payment_method_details: { card: { brand: "visa" } } }] } });
    }
    if (m === "GET" && u.startsWith("/v1/payment_intents/")) {
      const id = u.split("/").pop() || "";
      const st = piState.get(id);
      if (!st) return send(404, { error: { code: "resource_missing" } });
      return send(200, { id, status: st, amount_received: 605000, currency: "krw", created: 1790000000, charges: { data: [{ payment_method_details: { card: { brand: "visa" } } }] } });
    }
    if (m === "POST" && u === "/v1/refunds") {
      return send(200, { id: `re_stub_${rnd()}`, status: "succeeded" });
    }
    if (m === "GET" && u.startsWith("/v1/disputes/")) {
      return send(200, { id: "dp_e2e_1", amount: 605000, currency: "krw", reason: "fraudulent", status: "needs_response", charge: "ch_e2e_1" });
    }
    if (m === "GET" && u.startsWith("/v1/charges/")) {
      const pi = chargePi.get("ch_e2e_1") || null;
      return send(200, { id: "ch_e2e_1", payment_intent: pi });
    }
    return send(404, { error: { code: "not_found" } });
  });
}

let stubServer = null;
let ADMIN = null;
let TXC = null;
let stayOffset = 40;

const HOTEL = { domain: "HOTEL", itemId: "htl_seoul_01", unitId: "rm_seoul_01_dlx" };
const lead = [{ type: "ADULT", lastNameEn: "KIM", firstNameEn: "MINJI" }];
const contact = { name: "김민지", email: "qa@local.test", phone: "+82-10-1111-2222" };

async function register(tag) {
  const email = `qa_stg_${tag}_${rnd()}@local.test`;
  const r = await api("POST", "/api/v1/auth/register", { body: { email, password: "Passw0rd-QA-1", fullName: `QA ${tag}`, agreeTerms: true, agreePrivacy: true } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { email, token: r.data.token, id: r.data.user.id };
}

async function quote(token, extra = {}) {
  stayOffset += 2;
  return api("POST", "/api/v1/quotes", { token, body: { ...HOTEL, startDate: day(stayOffset), endDate: day(stayOffset + 1), rooms: 1, travelers: { adults: 2 }, ...extra } });
}

async function book(token, q, extra = {}) {
  return api("POST", "/api/v1/bookings", { token, headers: { "Idempotency-Key": idem() }, body: { quoteId: q.quoteId, contact, travelers: lead, consents: TXC, ...extra } });
}

async function pay(token, b, paymentKey) {
  return api("POST", "/api/v1/payments/confirm", { token, body: { bookingId: b.id, orderId: b.id, amount: b.totalMinor, paymentKey } });
}

function signWebhook(raw) {
  const t = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${raw}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

before(async () => {
  stubServer = createServer(stubHandler);
  await new Promise((res, rej) => {
    stubServer.on("error", rej);
    stubServer.listen(STUB_PORT, "127.0.0.1", () => res(null));
  });
  const cfg = await api("GET", "/api/v1/payments/config");
  assert.equal(cfg.data.provider, "stripe", `boot the server with PAYMENT_PROVIDER=stripe (got ${cfg.data.provider})`);
  sql("DELETE FROM login_attempts");
  const docs = (await api("GET", "/api/v1/legal")).data.documents || [];
  const ver = Object.fromEntries(docs.map((d) => [d.slug, d.version]));
  TXC = { refundPolicy: ver["refund-policy"], privacy: ver.privacy, thirdParty: ver.privacy };
  const r = await api("POST", "/api/v1/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  assert.equal(r.status, 200, "admin login");
  ADMIN = r.data.token;
});

after(async () => {
  if (stubServer) await new Promise((res) => stubServer.close(() => res(null)));
});

test("TG-17a stripe 3DS roundtrip, decline, instant capture + refund", async () => {
  const U = await register("a3ds");
  // 3DS: confirm parks UNKNOWN and hands the action URL out.
  const q = (await quote(U.token)).data.quote;
  const b = (await book(U.token, q)).data.booking;
  const p = await pay(U.token, b, `pm_stub_3ds_${rnd()}`);
  assert.equal(p.status, 200, JSON.stringify(p.data));
  assert.equal(p.data.actionRequired, true);
  assert.match(p.data.actionUrl || "", new RegExp(`^http://127\\.0\\.0\\.1:${STUB_PORT}/3ds-test/pi_`));
  const prow = sql(`SELECT provider_payment_key AS k, status FROM payments WHERE id = '${p.data.paymentId}'`)[0];
  assert.equal(prow.status, "UNKNOWN");
  // Customer completes 3DS at Stripe; the return landing finalizes via reconcile.
  await fetch(`http://127.0.0.1:${STUB_PORT}/__complete`, { method: "POST", body: JSON.stringify({ id: prow.k }) });
  const done = await api("GET", `/api/v1/payments/stripe/return?payment_intent=${prow.k}`);
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.reconciled, true);
  assert.equal(done.data.status, "VOUCHER_ISSUED");
  // Forged PI settles nothing.
  assert.equal((await api("GET", "/api/v1/payments/stripe/return?payment_intent=pi_nope")).status, 404);
  // Instant capture + decline paths.
  const b2 = (await book(U.token, (await quote(U.token)).data.quote)).data.booking;
  const ok = await pay(U.token, b2, `pm_stub_ok_${rnd()}`);
  assert.equal(ok.data.booking.status, "VOUCHER_ISSUED");
  const b3 = (await book(U.token, (await quote(U.token)).data.quote)).data.booking;
  const dec = await pay(U.token, b3, `pm_stub_decline_${rnd()}`);
  assert.equal(dec.status, 402, JSON.stringify(dec.data));
  assert.equal(dec.data.details?.providerCode, "card_declined");
  // Full refund through the Stripe stub.
  const c = await api("POST", `/api/v1/bookings/${b2.id}/cancel`, { token: U.token });
  assert.equal(c.status, 200, JSON.stringify(c.data));
});

test("TG-17b fraud hold, approve, retry succeeds", async () => {
  const U = await register("fds");
  const q2n = async () => (await quote(U.token, { rooms: 2 })).data.quote;
  // 5 declines on a fresh high-value account: 30 (velocity) + 25 (declines) + 20 (new) = 75.
  for (let i = 0; i < 5; i++) {
    const b = (await book(U.token, await q2n())).data.booking;
    assert.ok(b.totalMinor >= 1000000, `2-night total ${b.totalMinor} trips R4`);
    assert.equal((await pay(U.token, b, `pm_stub_decline_${rnd()}`)).status, 402);
  }
  const bh = (await book(U.token, await q2n())).data.booking;
  const held = await pay(U.token, bh, `pm_stub_ok_${rnd()}`);
  assert.equal(held.status, 200, JSON.stringify(held.data));
  assert.equal(held.data.heldForReview, true);
  assert.ok(held.data.reviewId);
  const list = await api("GET", "/api/v1/admin/fraud/reviews?status=PENDING", { token: ADMIN });
  assert.ok(list.data.reviews.some((r) => r.id === held.data.reviewId && r.score >= 60), JSON.stringify(list.data.reviews).slice(0, 400));
  assert.ok([401, 403].includes((await api("GET", "/api/v1/admin/fraud/reviews", { token: U.token })).status));
  const ap = await api("PATCH", `/api/v1/admin/fraud/reviews/${held.data.reviewId}`, { token: ADMIN, body: { status: "APPROVED" } });
  assert.equal(ap.status, 200, JSON.stringify(ap.data));
  const retry = await pay(U.token, bh, `pm_stub_ok_${rnd()}`);
  assert.equal(retry.status, 200, JSON.stringify(retry.data));
  assert.equal(retry.data.booking.status, "VOUCHER_ISSUED");
  // Double decision is refused.
  assert.equal((await api("PATCH", `/api/v1/admin/fraud/reviews/${held.data.reviewId}`, { token: ADMIN, body: { status: "REJECTED" } })).data.code, "REVIEW_DECIDED");
});

test("TG-17c chargeback syncs booking, ledger, refund (dedupe + signature)", async () => {
  const U = await register("cb");
  const b = (await book(U.token, (await quote(U.token)).data.quote)).data.booking;
  const ok = await pay(U.token, b, `pm_stub_ok_${rnd()}`);
  assert.equal(ok.data.booking.status, "VOUCHER_ISSUED");
  const pi = sql(`SELECT provider_payment_key AS k FROM payments WHERE booking_id = '${b.id}' AND status = 'CAPTURED'`)[0].k;
  await fetch(`http://127.0.0.1:${STUB_PORT}/__charge`, { method: "POST", body: JSON.stringify({ charge: "ch_e2e_1", pi }) });
  const evt = JSON.stringify({ id: `evt_${rnd()}`, type: "charge.dispute.created", data: { object: { id: "dp_e2e_1" } } });
  const post = (headers) => fetch(`${BASE}/api/v1/webhooks/stripe`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: evt });
  const forged = await post({ "Stripe-Signature": "t=1,v1=00" });
  assert.equal(forged.status, 403);
  const first = await post({ "Stripe-Signature": signWebhook(evt) });
  assert.equal(first.status, 200, await first.clone().text());
  const f1 = await first.json();
  assert.equal(f1.reconciled, true);
  assert.equal(f1.action, "RECONCILED_EXTERNAL_CANCEL");
  const second = await post({ "Stripe-Signature": signWebhook(evt) });
  assert.equal((await second.json()).duplicate, true);
  const fin = await api("GET", `/api/v1/bookings/${b.id}`, { token: U.token });
  assert.equal(fin.data.booking.status, "REFUNDED");
  const rf = sql(`SELECT source FROM refunds WHERE booking_id = '${b.id}' ORDER BY created_at DESC LIMIT 1`)[0];
  assert.equal(rf.source, "EXTERNAL");
});

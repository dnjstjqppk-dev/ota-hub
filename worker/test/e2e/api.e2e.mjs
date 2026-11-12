/**
 * End-to-end API scenarios against a running LOCAL worker.
 *   1. npx wrangler d1 migrations apply ota_local --local -c wrangler.local.jsonc
 *   2. node scripts/dev-seed.mjs LocalAdmin2026!x
 *   3. npx wrangler dev -c wrangler.local.jsonc --port 8799
 *   4. ADMIN_PASSWORD=LocalAdmin2026!x node --test worker/test/e2e/api.e2e.mjs
 * BASE defaults to http://127.0.0.1:8799 and ADMIN_PASSWORD to LocalAdmin2026!x;
 * pass the seed password explicitly when dev-seed used another one.
 * Uses the sandbox PG and the supplier simulator only. Never point this at production.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";

const BASE = process.env.BASE || "http://127.0.0.1:8799";
const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "LocalAdmin2026!x";
if (!/127\.0\.0\.1|localhost/.test(BASE)) throw new Error("E2E suite runs against localhost only");

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const rnd = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const idem = () => `idem_${rnd()}${rnd()}`;

async function api(method, path, { token, body, headers = {} } = {}) {
  const h = { "Content-Type": "application/json", ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

function sql(command) {
  const isWin = process.platform === "win32";
  // E2E_PERSIST_TO: run against an isolated local D1 (same value as `wrangler dev --persist-to`).
  const persist = process.env.E2E_PERSIST_TO ? ["--persist-to", process.env.E2E_PERSIST_TO] : [];
  const args = ["wrangler", "d1", "execute", "ota_local", "--local", "-c", "wrangler.local.jsonc", ...persist, "--json", "--command", command];
  // The CLI shares the dev server's sqlite file and flakes under concurrency
  // (intermittent exit 1). Retry the identical statement; assertions unchanged.
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

/**
 * Test isolation for IP rate-limit buckets: the whole suite runs from one IP,
 * so late registration-heavy tests reset their bucket instead of tripping the
 * production limit. Production limits themselves are never weakened.
 */
function resetLimiter(...buckets) {
  for (const bucket of buckets) sql(`DELETE FROM login_attempts WHERE ip_address LIKE '${bucket}:%'`);
}

async function register(tag) {
  const email = `qa_${tag}_${rnd()}@local.test`;
  const r = await api("POST", "/api/v1/auth/register", { body: { email, password: "Passw0rd-QA-1", fullName: `QA ${tag}`, agreeTerms: true, agreePrivacy: true } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { email, token: r.data.token, id: r.data.user.id };
}

const HOTEL = { domain: "HOTEL", itemId: "htl_seoul_01", unitId: "rm_seoul_01_dlx" };
const lead = [{ type: "ADULT", lastNameEn: "KIM", firstNameEn: "MINJI" }];
const contact = { name: "김민지", email: "qa@local.test", phone: "+82-10-1111-2222" };

// Each hotel quote uses its own stay dates so tests do not exhaust the room's
// capacity (5/night) — sold-out behaviour is covered by its own test.
let stayOffset = 30 + (Date.now() % 150);
// Flight seats are finite per date (9) and committed holds never release, so
// flight service dates shift by a per-run offset too: without this, repeated
// local runs SELL OUT day(50..64) and the suite rots run over run.
const flightShift = Date.now() % 120;
const fday = (n) => day(n + flightShift);
async function quote(token, extra = {}) {
  stayOffset += 2;
  return api("POST", "/api/v1/quotes", { token, body: { ...HOTEL, startDate: day(stayOffset), endDate: day(stayOffset + 1), rooms: 1, travelers: { adults: 2 }, ...extra } });
}

async function book(token, q, { simulation, travelers = lead, key = idem(), consents = TXC } = {}) {
  return api("POST", "/api/v1/bookings", { token, headers: { "Idempotency-Key": key }, body: { quoteId: q.quoteId, contact, travelers, simulation, ...(consents === false ? {} : { consents }) } });
}

async function pay(token, b, scenario = "ok") {
  return api("POST", "/api/v1/payments/confirm", { token, body: { bookingId: b.id, orderId: b.id, amount: b.totalMinor, paymentKey: `sbx_${scenario}_${rnd()}` } });
}

async function fullHotelBooking(token, simulation, scenario = "ok", qextra = {}) {
  const q = (await quote(token, qextra)).data.quote;
  const b = (await book(token, q, { simulation })).data.booking;
  const p = await pay(token, b, scenario);
  return { q, b, p };
}

let A, B, ADMIN, TXC;
before(async () => {
  sql("DELETE FROM login_attempts"); // local DB only: reset rate-limit window between runs
  // A3: transaction consents ride on every booking-create, pinned to /legal versions.
  const docs = (await api("GET", "/api/v1/legal")).data.documents || [];
  const ver = Object.fromEntries(docs.map((d) => [d.slug, d.version]));
  TXC = { refundPolicy: ver["refund-policy"], privacy: ver.privacy, thirdParty: ver.privacy };
  // Committed holds never release, so runs accumulate them until dates sell out
  // (suite rot: SOLD_OUT on helper dates after enough runs). Holds belong to
  // dead prior-run bookings; every test creates its own.
  sql("DELETE FROM inventory_holds");
  A = await register("a");
  B = await register("b");
  const r = await api("POST", "/api/v1/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  assert.equal(r.status, 200, "admin login");
  ADMIN = r.data.token;
});

test("auth: consent required, weak passwords rejected, wrong password 401", async () => {
  assert.equal((await api("POST", "/api/v1/auth/register", { body: { email: `x_${rnd()}@local.test`, password: "Passw0rd-QA-1", fullName: "X" } })).status, 400);
  assert.equal((await api("POST", "/api/v1/auth/register", { body: { email: `x_${rnd()}@local.test`, password: "short1", fullName: "X", agreeTerms: true, agreePrivacy: true } })).status, 400);
  assert.equal((await api("POST", "/api/v1/auth/login", { body: { email: A.email, password: "wrong-password-1" } })).status, 401);
  assert.equal((await api("GET", "/api/v1/auth/me", { token: "forged.token.value" })).status, 401);
});

test("auth: password reset never returns the token; token is single-use", async () => {
  const r = await api("POST", "/api/v1/auth/forgot-password", { body: { email: A.email } });
  assert.equal(r.status, 200);
  assert.equal(r.data.resetToken, undefined);
  assert.ok(!JSON.stringify(r.data).includes("rst_"));
  const outbox = await api("GET", "/api/v1/auth/dev-outbox");
  const mail = outbox.data.outbox.find((m) => m.recipient === A.email && m.template === "PASSWORD_RESET");
  const token = new URL(JSON.parse(mail.payload_json).link).searchParams.get("token");
  assert.equal((await api("POST", "/api/v1/auth/reset-password", { body: { token, newPassword: "NewPassw0rd-QA-2" } })).status, 200);
  assert.equal((await api("POST", "/api/v1/auth/reset-password", { body: { token, newPassword: "NewPassw0rd-QA-3" } })).status, 400);
  await new Promise((r) => setTimeout(r, 1200)); // revocation granularity is 1s; relogin must land after the cutoff
  const relogin = await api("POST", "/api/v1/auth/login", { body: { email: A.email, password: "NewPassw0rd-QA-2" } });
  assert.equal(relogin.status, 200);
  A.token = relogin.data.token; // reset revokes all sessions; later tests need the fresh token
  assert.equal((await api("GET", "/api/v1/auth/me", { token: A.token })).status, 200, "relogin token survives the cutoff");
});

test("quote: server computes price; client price fields ignored; invalid inputs rejected", async () => {
  const r = await quote(A.token, { totalPrice: 1, amount: 1, final_amount_krw: 1 });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.quote.totalMinor, 605000); // 1 night × 550,000 + 10% tax
  assert.equal((await quote(A.token, { startDate: day(-1), endDate: day(1) })).status, 400);
  assert.equal((await quote(A.token, { travelers: { adults: 3 } })).data.code, "OCCUPANCY_EXCEEDED");
  // #14: discount codes need a claim; window violations still surface as PROMO_*.
  assert.equal((await quote(A.token, { promotionCode: "TEST10" })).data.code, "COUPON_NOT_CLAIMED");
  assert.equal((await api("POST", "/api/v1/user/coupons/claim", { token: A.token, body: { code: "TEST10" } })).status, 200);
  sql(`INSERT OR IGNORE INTO user_coupons (id, user_id, coupon_code, title, discount_type, discount_value, valid_until, is_used) VALUES ('ucp_e2e_exp_${rnd()}', '${A.id}', 'EXPIRED', 'x', 'FIXED_AMOUNT', 1, '', 0)`);
  assert.equal((await quote(A.token, { promotionCode: "EXPIRED" })).data.code, "PROMO_EXPIRED");
  const promo = await quote(A.token, { promotionCode: "TEST10" });
  assert.equal(promo.data.quote.discountMinor, 30000);
  assert.equal((await api("POST", "/api/v1/quotes", { body: { ...HOTEL, startDate: day(40), endDate: day(42) } })).status, 401);
});

test("booking: idempotency key required, replay returns same booking, quote single-use", async () => {
  const q = (await quote(A.token)).data.quote;
  assert.equal((await api("POST", "/api/v1/bookings", { token: A.token, body: { quoteId: q.quoteId, contact, travelers: lead, consents: TXC } })).data.code, "IDEMPOTENCY_KEY_REQUIRED");
  const key = idem();
  const [r1, r2] = await Promise.all([book(A.token, q, { key }), book(A.token, q, { key })]);
  assert.ok([r1.status, r2.status].every((s) => s === 200 || s === 201), `${r1.status} ${r2.status}`);
  assert.equal(r1.data.booking.id, r2.data.booking.id);
  assert.equal(r1.data.booking.status, "AWAITING_PAYMENT");
  assert.equal(r1.data.booking.items[0].voucher_code, null);
  const again = await book(A.token, q);
  assert.equal(again.status, 409);
  assert.equal(again.data.code, "QUOTE_ALREADY_USED");
});

test("security: IDOR on booking read / cancel / pay is blocked", async () => {
  const q = (await quote(A.token)).data.quote;
  const b = (await book(A.token, q)).data.booking;
  assert.equal((await api("GET", `/api/v1/bookings/${b.id}`, { token: B.token })).status, 403);
  assert.equal((await api("POST", `/api/v1/bookings/${b.id}/cancel`, { token: B.token })).status, 403);
  assert.equal((await pay(B.token, b)).status, 403);
  assert.equal((await api("GET", "/api/v1/admin/dashboard", { token: A.token })).status, 403);
  assert.equal((await api("POST", `/api/v1/bookings/${b.id}/pay`, { token: A.token, headers: { "X-Payment-Proof": "fake" } })).status, 410);
});

test("payment: amount mismatch rejected before PG; decline returns to AWAITING_PAYMENT; success issues voucher (#70 retry uses a fresh PG key)", async () => {
  const q = (await quote(A.token)).data.quote;
  const b = (await book(A.token, q)).data.booking;
  const mm = await api("POST", "/api/v1/payments/confirm", { token: A.token, body: { bookingId: b.id, orderId: b.id, amount: b.totalMinor - 1, paymentKey: `sbx_ok_${rnd()}` } });
  assert.equal(mm.data.code, "AMOUNT_MISMATCH");
  const dec = await pay(A.token, b, "declined");
  assert.equal(dec.status, 402);
  assert.equal((await api("GET", `/api/v1/bookings/${b.id}`, { token: A.token })).data.booking.status, "AWAITING_PAYMENT");
  // #70: the retry carries a new paymentKey under a NEW PG idempotency key —
  // the sandbox rejects a reused key exactly like Toss, so a fixed
  // confirm_{booking} key would 402 here instead of issuing the voucher.
  const ok = await pay(A.token, b, "ok");
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const bk = ok.data.booking;
  assert.equal(bk.status, "VOUCHER_ISSUED");
  assert.equal(bk.isConfirmed, true);
  assert.match(bk.items[0].voucher_code, /^GFV-/);
  assert.equal(bk.paidMinor, b.totalMinor);
  const statuses = bk.history.map((h) => h.to_status);
  assert.deepEqual(statuses.slice(-5), ["PAYMENT_PROCESSING", "PAYMENT_AUTHORIZED", "SUPPLIER_BOOKING_PENDING", "SUPPLIER_CONFIRMED", "VOUCHER_ISSUED"]);
  const again = await pay(A.token, b, "ok");
  assert.equal(again.data.alreadyProcessed, true);
  assert.equal(sql(`SELECT COUNT(*) AS c FROM payments WHERE booking_id = '${b.id}' AND status = 'CAPTURED'`)[0].c, 1);
});

test("payment: concurrent double-click captures exactly once", async () => {
  const q = (await quote(A.token)).data.quote;
  const b = (await book(A.token, q)).data.booking;
  const rs = await Promise.all([pay(A.token, b), pay(A.token, b), pay(A.token, b)]);
  const codes = rs.map((r) => r.status);
  assert.ok(codes.includes(200), codes.join(","));
  assert.equal(sql(`SELECT COUNT(*) AS c FROM payments WHERE booking_id = '${b.id}' AND status IN ('CAPTURED','PROCESSING','UNKNOWN')`)[0].c, 1);
  assert.equal(sql(`SELECT COUNT(*) AS c FROM ledger_entries WHERE booking_id = '${b.id}' AND event_type = 'PAYMENT_CAPTURED'`)[0].c, 2);
});

test("supplier failure after payment: never shown as confirmed, full refund", async () => {
  const { b, p } = await fullHotelBooking(A.token, { supplier: "fail" });
  const bk = p.data.booking;
  assert.equal(bk.status, "REFUNDED");
  assert.equal(bk.isConfirmed, false);
  assert.equal(bk.items[0].voucher_code, null);
  assert.equal(bk.refundedMinor, b.totalMinor);
  assert.equal(bk.refunds[0].status, "SUCCEEDED");
});

test("supplier timeout: manual review (no voucher, no refund) then operator confirms", async () => {
  const { p } = await fullHotelBooking(A.token, { supplier: "timeout" });
  const bk = p.data.booking;
  assert.equal(bk.status, "MANUAL_REVIEW_REQUIRED");
  assert.equal(bk.items[0].voucher_code, null);
  assert.equal(bk.refundedMinor, 0);
  const noRef = await api("POST", `/api/v1/admin/bookings/${bk.id}/supplier-decision`, { token: ADMIN, body: { decision: "CONFIRM" } });
  assert.equal(noRef.data.code, "SUPPLIER_REFERENCE_REQUIRED");
  const ok = await api("POST", `/api/v1/admin/bookings/${bk.id}/supplier-decision`, { token: ADMIN, body: { decision: "CONFIRM", supplierReference: "HTL-CONF-778899" } });
  assert.equal(ok.data.booking.status, "VOUCHER_ISSUED");
  const logs = await api("GET", "/api/v1/admin/audit-logs", { token: ADMIN });
  assert.ok(logs.data.logs.some((l) => l.target_id === bk.id && l.action === "SUPPLIER_DECISION_CONFIRM"));
});

test("PG response lost: manual review, then reconciliation discovers capture and fulfils", async () => {
  const { p } = await fullHotelBooking(A.token, {}, "timeout");
  assert.equal(p.data.booking.status, "MANUAL_REVIEW_REQUIRED");
  assert.equal(p.data.booking.statusReason, "PAYMENT_STATUS_UNKNOWN");
  const m = await api("POST", "/api/v1/admin/maintenance/run", { token: ADMIN });
  assert.ok(m.data.stats.paymentsReconciled >= 1);
  const after = await api("GET", `/api/v1/bookings/${p.data.booking.id}`, { token: A.token });
  assert.equal(after.data.booking.status, "VOUCHER_ISSUED");
});

test("toss webhook: hint triggers PG lookup; duplicates acknowledged; unknown orders ignored", async () => {
  assert.equal((await api("POST", "/api/v1/webhooks/toss", { body: { eventType: "PAYMENT_STATUS_CHANGED" } })).status, 400);
  const ghost = await api("POST", "/api/v1/webhooks/toss", { body: { eventType: "PAYMENT_STATUS_CHANGED", data: { orderId: "bkg_no_such_booking", paymentKey: "xxx", status: "DONE" } } });
  // Unknown orders get the generic settled shape — the endpoint must not reveal order existence.
  assert.equal(ghost.data.action, "NO_UNKNOWN_PAYMENT");
  assert.equal(ghost.data.reconciled, false);
  assert.equal(ghost.data.bookingId, undefined);
  const ghost2 = await api("POST", "/api/v1/webhooks/toss", { body: { eventType: "PAYMENT_STATUS_CHANGED", data: { orderId: "bkg_no_such_booking", paymentKey: "xxx", status: "DONE" } } });
  assert.equal(ghost2.data.duplicate, true);
  assert.equal(ghost2.data.action, "NO_UNKNOWN_PAYMENT");
  const { p } = await fullHotelBooking(A.token, {}, "timeout");
  const id = p.data.booking.id;
  assert.equal(p.data.booking.status, "MANUAL_REVIEW_REQUIRED");
  const hook = { eventType: "PAYMENT_STATUS_CHANGED", data: { orderId: id, paymentKey: `sbx_timeout_probe`, status: "DONE" } };
  const r1 = await api("POST", "/api/v1/webhooks/toss", { body: hook });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  assert.equal(r1.data.reconciled, true);
  const after = await api("GET", `/api/v1/bookings/${id}`, { token: A.token });
  assert.equal(after.data.booking.status, "VOUCHER_ISSUED");
  const r2 = await api("POST", "/api/v1/webhooks/toss", { body: hook });
  assert.equal(r2.data.duplicate, true);
  assert.equal(sql(`SELECT COUNT(*) AS c FROM payments WHERE booking_id = '${id}' AND status = 'CAPTURED'`)[0].c, 1);
});

test("outbox email: without a provider key, rows stay queued and maintenance says so", async () => {
  const h = await api("GET", "/api/v1/health");
  assert.equal(h.data.checks.emailProvider, "NOT_CONFIGURED");
  const before = sql("SELECT COUNT(*) AS c FROM notification_outbox WHERE status IN ('PENDING','BLOCKED_NO_PROVIDER')")[0].c;
  assert.ok(before > 0, "earlier tests enqueued booking emails");
  const m = await api("POST", "/api/v1/admin/maintenance/run", { token: ADMIN });
  assert.equal(m.data.stats.emailsSent, 0);
  assert.equal(m.data.stats.emailsPending, Math.min(before, 20), JSON.stringify(m.data.stats));
  const after = sql("SELECT COUNT(*) AS c FROM notification_outbox WHERE status IN ('PENDING','BLOCKED_NO_PROVIDER')")[0].c;
  assert.equal(after, before, "nothing sent, nothing lost");
});

test("flight: passport required & encrypted; PNR and ticket are separate steps", async () => {
  const fq = (await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "FLIGHT", itemId: "flt_ke703", startDate: fday(50), travelers: { adults: 1, infants: 1 } } })).data.quote;
  assert.equal(fq.requiresPassport, true);
  const noPass = await book(A.token, fq, { travelers: [{ type: "ADULT", lastNameEn: "KIM", firstNameEn: "MINJI" }, { type: "INFANT", lastNameEn: "KIM", firstNameEn: "SEOA" }] });
  assert.equal(noPass.data.code, "BIRTH_DATE_REQUIRED");
  const t = (fn, ln, type, bd) => ({ type, lastNameEn: ln, firstNameEn: fn, birthDate: bd, gender: "F", nationality: "KOR", passportNumber: "M12345678", passportExpiry: day(900) });
  const b = (await book(A.token, fq, { travelers: [t("MINJI", "KIM", "ADULT", "1990-01-01"), t("SEOA", "KIM", "INFANT", day(-200))] })).data.booking;
  assert.equal(b.travelers[0].passport, "등록됨 (암호화 저장)");
  const stored = sql(`SELECT passport_enc FROM booking_travelers WHERE booking_id = '${b.id}' LIMIT 1`)[0].passport_enc;
  assert.match(stored, /^v1:/);
  assert.ok(!stored.includes("M12345678"));
  const p = await pay(A.token, b);
  const bk = p.data.booking;
  assert.equal(bk.status, "TICKETED");
  assert.match(bk.items[0].pnr, /^[A-Z0-9]{6}$/);
  assert.equal(bk.items[0].ticket_numbers.length, 2);
  const hist = bk.history.map((h) => h.to_status);
  assert.ok(hist.indexOf("SUPPLIER_CONFIRMED") < hist.indexOf("TICKETING_PENDING") && hist.indexOf("TICKETING_PENDING") < hist.indexOf("TICKETED"));
});

test("flight: ticketing failure after payment voids PNR and refunds in full", async () => {
  const fq = (await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "FLIGHT", itemId: "flt_ke703", startDate: fday(51), travelers: { adults: 1 } } })).data.quote;
  const b = (await book(A.token, fq, { simulation: { ticketing: "fail" }, travelers: [{ type: "ADULT", lastNameEn: "LEE", firstNameEn: "JUN", birthDate: "1988-02-02", passportNumber: "M7654321", passportExpiry: day(900) }] })).data.booking;
  const p = await pay(A.token, b);
  assert.equal(p.data.booking.status, "REFUNDED");
  assert.equal(p.data.booking.items[0].ticket_numbers.length, 0);
});

test("cancellation: free window refunds 100%; non-refundable keeps 100% as fee", async () => {
  const { p } = await fullHotelBooking(A.token, {});
  const c = await api("POST", `/api/v1/bookings/${p.data.booking.id}/cancel`, { token: A.token });
  assert.equal(c.data.booking.status, "REFUNDED");
  assert.equal(c.data.booking.refundedMinor, p.data.booking.totalMinor);
  assert.equal(c.data.booking.cancellationFeeMinor, 0);

  const fq = (await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "FLIGHT", itemId: "flt_ke703", startDate: fday(52), travelers: { adults: 1 } } })).data.quote;
  const fb = (await book(A.token, fq, { travelers: [{ type: "ADULT", lastNameEn: "PARK", firstNameEn: "SO", birthDate: "1991-03-03", passportNumber: "M1112223", passportExpiry: day(900) }] })).data.booking;
  const fp = await pay(A.token, fb);
  assert.equal(fp.data.booking.cancellationPreview.refundMinor, 0);
  const fc = await api("POST", `/api/v1/bookings/${fb.id}/cancel`, { token: A.token });
  assert.equal(fc.data.booking.status, "CANCELLED");
  assert.equal(fc.data.booking.cancellationFeeMinor, fb.totalMinor);
  assert.equal(fc.data.booking.refundedMinor, 0);
});

test("cancellation: supplier rejects -> booking stays valid; unpaid cancel releases hold", async () => {
  const { p } = await fullHotelBooking(A.token, { cancel: "reject" });
  const c = await api("POST", `/api/v1/bookings/${p.data.booking.id}/cancel`, { token: A.token });
  assert.equal(c.data.code, "SUPPLIER_REJECTED_CANCELLATION");
  assert.equal((await api("GET", `/api/v1/bookings/${p.data.booking.id}`, { token: A.token })).data.booking.status, "VOUCHER_ISSUED");
  const q = (await quote(A.token)).data.quote;
  const b = (await book(A.token, q)).data.booking;
  const u = await api("POST", `/api/v1/bookings/${b.id}/cancel`, { token: A.token });
  assert.equal(u.data.booking.status, "CANCELLED");
  assert.equal(sql(`SELECT COUNT(*) AS c FROM inventory_holds WHERE booking_id = '${b.id}' AND status != 'RELEASED'`)[0].c, 0);
});

test("refund failure at PG: stays REFUND_PENDING with retries, escalates to manual review", async () => {
  const { p } = await fullHotelBooking(A.token, { supplier: "fail" }, "refundfail");
  const id = p.data.booking.id;
  assert.equal(p.data.booking.status, "REFUND_PENDING");
  assert.equal(p.data.booking.refunds[0].status, "PENDING");
  for (let i = 0; i < 5; i++) await api("POST", "/api/v1/admin/maintenance/run", { token: ADMIN });
  const after = (await api("GET", `/api/v1/bookings/${id}`, { token: A.token })).data.booking;
  assert.equal(after.status, "MANUAL_REVIEW_REQUIRED");
  assert.equal(after.refundedMinor, 0);
  assert.ok(after.refunds[0].attempts >= 5);
});

test("inventory: holds prevent overselling, including concurrent requests", async () => {
  const off = 200 + Math.floor(Math.random() * 150);
  const start = day(off);
  const base = { domain: "HOTEL", itemId: "htl_seoul_01", unitId: "rm_seoul_01_ste", startDate: start, endDate: day(off + 1), travelers: { adults: 2 } };
  const q1 = (await api("POST", "/api/v1/quotes", { token: A.token, body: { ...base, rooms: 1 } })).data.quote;
  assert.equal((await book(A.token, q1)).status, 201);
  // One unit left (capacity 2). Two concurrent bookings race for it.
  const qa = (await api("POST", "/api/v1/quotes", { token: A.token, body: { ...base, rooms: 1, travelers: { adults: 1 } } })).data.quote;
  const qb = (await api("POST", "/api/v1/quotes", { token: B.token, body: { ...base, rooms: 1, travelers: { adults: 1 } } })).data.quote;
  const [ra, rb] = await Promise.all([book(A.token, qa), book(B.token, qb)]);
  const st = [ra.status, rb.status].sort();
  assert.deepEqual(st, [201, 409], JSON.stringify([ra.data, rb.data]));
  assert.equal([ra, rb].find((r) => r.status === 409).data.code, "SOLD_OUT");
  assert.equal((await api("POST", "/api/v1/quotes", { token: A.token, body: { ...base, rooms: 1 } })).data.code, "SOLD_OUT");
});

test("payment window expiry blocks late payment and releases inventory", async () => {
  const q = (await quote(A.token)).data.quote;
  const b = (await book(A.token, q)).data.booking;
  sql(`UPDATE bookings SET inventory_lock_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = '${b.id}'`);
  const r = await pay(A.token, b);
  assert.equal(r.data.code, "PAYMENT_WINDOW_EXPIRED");
  assert.equal((await api("GET", `/api/v1/bookings/${b.id}`, { token: A.token })).data.booking.status, "EXPIRED");
});

test("price change between quote and booking is detected", async () => {
  const q = (await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "ACTIVITY", itemId: "act_disney_tokyo", startDate: day(30), travelers: { adults: 2 } } })).data.quote;
  sql("UPDATE activities SET price_krw = price_krw + 1000 WHERE id = 'act_disney_tokyo'");
  try {
    const r = await book(A.token, q);
    assert.equal(r.data.code, "PRICE_CHANGED");
    assert.equal(r.data.details.newTotalMinor, q.totalMinor + 2000);
  } finally {
    sql("UPDATE activities SET price_krw = price_krw - 1000 WHERE id = 'act_disney_tokyo'");
  }
});

test("user data: price alerts / coupons / reviews are owner-scoped and verified", async () => {
  assert.equal((await api("GET", `/api/v1/price-alerts?email=${encodeURIComponent(A.email)}`)).status, 401);
  const al = await api("POST", "/api/v1/price-alerts", { token: A.token, body: { routeOrHotel: "ICN-NRT", targetPrice: 200000 } });
  await api("DELETE", `/api/v1/price-alerts/${al.data.id}`, { token: B.token });
  assert.equal((await api("GET", "/api/v1/price-alerts", { token: A.token })).data.alerts.length, 1);
  assert.equal((await api("POST", "/api/v1/user/coupons/claim", { token: B.token, body: { code: "TEST10" } })).status, 200);
  assert.equal((await api("POST", "/api/v1/user/coupons/claim", { token: B.token, body: { code: "TEST10" } })).data.code, "ALREADY_CLAIMED");
  const rv = await api("POST", "/api/v1/reviews", { token: B.token, body: { targetId: "htl_seoul_01", rating: 5, comment: "unverified" } });
  assert.equal(rv.status, 400);
  assert.equal(rv.data.code, "REVIEW_BOOKING_REQUIRED");
});

test("#18: every ACTIVE marketplace row resolves a real domain item (no ghosts)", async () => {
  const cat = await api("GET", "/api/v1/marketplace/catalog");
  assert.equal(cat.status, 200);
  const tables = { HOTEL: "hotels", FLIGHT: "flights", TRAIN: "trains", CAR: "cars", TRANSFER: "transfers", ACTIVITY: "activities", PACKAGE: "packages" };
  for (const row of cat.data.items || cat.data.catalog || []) {
    if (row.domain_type === "ESIM" || row.domain_type === "INSURANCE") continue; // #40 scope
    const t = tables[row.domain_type];
    assert.ok(t, `unknown domain ${row.domain_type}`);
    const hit = sql(`SELECT id FROM ${t} WHERE id = '${row.item_id}'`);
    assert.equal(hit.length, 1, `ghost marketplace row ${row.id} -> ${row.domain_type}/${row.item_id}`);
  }
  assert.equal(sql("SELECT id FROM marketplace_catalog_items WHERE id IN ('mkt_htl_shilla_01','mkt_ing_sample_01','mkt_ing_sample_02')").length, 0);
});

test("#21: duplicate affiliate postbacks (sequential + concurrent) book once", async () => {
  const secret = `e2e-secret-${rnd()}${rnd()}`;
  sql(`INSERT OR REPLACE INTO affiliate_partners_config (partner_id, name, deep_link_template, affiliate_id, secret_key, is_active) VALUES ('e2e-aff-test', 'e2e-aff', 'https://x.test/{item_id}?c={click_id}', 'E2E', '${secret}', 1)`);
  // #44: conversions must reference real clicks — mint them through /out/ first.
  const click = async () => {
    const r = await fetch(BASE + "/api/v1/out/e2e-aff-test/room1", { redirect: "manual" });
    assert.equal(r.status, 302);
    return new URL(r.headers.get("location")).searchParams.get("c");
  };
  const post = async (orderId, amount, clickId) => {
    const payload = JSON.stringify({ partner: "e2e-aff-test", click_id: clickId, order_id: orderId, amount, currency: "KRW" });
    const ts = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");
    const r = await fetch(BASE + "/api/v1/webhooks/postback", { method: "POST", headers: { "Content-Type": "application/json", "X-Signature": sig, "X-Timestamp": String(ts) }, body: payload });
    return { status: r.status, data: await r.json() };
  };
  const o1 = `ord_${rnd()}`;
  const r1 = await post(o1, 100000, await click());
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  assert.equal(r1.data.duplicate, false);
  const r2 = await post(o1, 100000, await click());
  assert.equal(r2.status, 200);
  assert.equal(r2.data.duplicate, true);
  const o2 = `ord_${rnd()}`;
  const [k1, k2] = [await click(), await click()];
  const [c1, c2] = await Promise.all([post(o2, 50000, k1), post(o2, 50000, k2)]);
  assert.equal(c1.status, 200);
  assert.equal(c2.status, 200);
  assert.equal([c1.data.duplicate, c2.data.duplicate].filter(Boolean).length, 1, "exactly one concurrent winner");
  assert.equal(sql(`SELECT COUNT(*) AS n FROM affiliate_conversions WHERE order_id IN ('${o1}','${o2}')`)[0].n, 2);
});

test("#24/#25: admin registry APIs — affiliate partners, entities, contracts", async () => {
  // Affiliate partners: validation, secret write-only, rotation.
  const pid = `e2ep${rnd().slice(0, 8)}`;
  assert.equal((await api("POST", "/api/v1/admin/affiliate/partners", { token: ADMIN, body: { partnerId: "BAD ID!", name: "x", affiliateId: "x", secretKey: "s".repeat(32) } })).data.code, "INVALID_PARTNER_ID");
  assert.equal((await api("POST", "/api/v1/admin/affiliate/partners", { token: ADMIN, body: { partnerId: pid, name: "E2E Reg", deepLinkTemplate: "https://x.test/{item_id}?c={click_id}", affiliateId: "E2E", secretKey: "short" } })).data.code, "WEAK_PARTNER_SECRET");
  const secret = `e2e-reg-${rnd()}${rnd()}`;
  const created = await api("POST", "/api/v1/admin/affiliate/partners", { token: ADMIN, body: { partnerId: pid, name: "E2E Reg", deepLinkTemplate: "https://x.test/{item_id}?c={click_id}", affiliateId: "E2E", secretKey: secret } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal((await api("POST", "/api/v1/admin/affiliate/partners", { token: ADMIN, body: { partnerId: pid, name: "dup", deepLinkTemplate: "https://x.test/{item_id}?c={click_id}", affiliateId: "E2E", secretKey: secret } })).data.code, "ID_EXISTS");
  const listed = (await api("GET", "/api/v1/admin/affiliate/partners", { token: ADMIN })).data.partners;
  const row = listed.find((p) => p.partner_id === pid);
  assert.ok(row && !("secret_key" in row), "secret is write-only");
  const rot = `e2e-rot-${rnd()}${rnd()}${rnd()}`;
  assert.equal((await api("PATCH", `/api/v1/admin/affiliate/partners/${pid}`, { token: ADMIN, body: { secretKey: rot, isActive: false } })).status, 200);
  const row2 = (await api("GET", "/api/v1/admin/affiliate/partners", { token: ADMIN })).data.partners.find((p) => p.partner_id === pid);
  assert.equal(row2.is_active, 0);
  // Entities: completion gate, then ACTIVE; contracts: draft then activate.
  const ents = (await api("GET", "/api/v1/admin/entities", { token: ADMIN })).data.entities;
  assert.ok(ents.length >= 1);
  const ent = ents.find((e) => e.status !== "ACTIVE") || ents[0];
  assert.equal((await api("PATCH", `/api/v1/admin/entities/${ent.id}`, { token: ADMIN, body: { status: "ACTIVE", business_registration_no: "", travel_agency_license_no: "", ecommerce_registration_no: "", representative_name: "", cs_phone: "" } })).data.code, "ENTITY_INCOMPLETE");
  const full = await api("PATCH", `/api/v1/admin/entities/${ent.id}`, { token: ADMIN, body: { status: "ACTIVE", legal_name: "E2E 법인", business_registration_no: "000-00-00000", travel_agency_license_no: "제2026-000호", ecommerce_registration_no: "제2026-서울-0000호", representative_name: "김대표", cs_phone: "02-0000-0000" } });
  assert.equal(full.status, 200, JSON.stringify(full.data));
  const cc = await api("POST", "/api/v1/admin/contracts", { token: ADMIN, body: { entityId: ent.id, contractType: "SUPPLIER", counterparty: "E2E 상대방" } });
  assert.equal(cc.status, 201, JSON.stringify(cc.data));
  assert.equal((await api("PATCH", `/api/v1/admin/contracts/${cc.data.id}`, { token: ADMIN, body: { status: "ACTIVE" } })).status, 200);
  const chg = await api("GET", `/api/v1/admin/entities/${ent.id}/changes`, { token: ADMIN });
  assert.ok(chg.data.changes.length >= 1, "entity changes are logged");
});

test("#27: affiliate outlink emitted only for mapped + active partners; click tracked", async () => {
  const pid = `e2eol${rnd().slice(0, 8)}`;
  const secret = `e2e-ol-${rnd()}${rnd()}`;
  const tpl = "https://clk.example.net/go?c={click_id}&i={item_id}";
  const pc = await api("POST", "/api/v1/admin/affiliate/partners", { token: ADMIN, body: { partnerId: pid, name: "E2E Outlink", deepLinkTemplate: tpl, affiliateId: "E2E", secretKey: secret } });
  assert.equal(pc.status, 201, JSON.stringify(pc.data));
  // Unknown partner mapping is rejected, not stored.
  assert.equal((await api("PATCH", "/api/v1/admin/suppliers/ptn_htl_01", { token: ADMIN, body: { outlinkPartnerId: "no_such_partner" } })).data.code, "UNKNOWN_PARTNER");
  const hotel = sql("SELECT id, partner_id FROM hotels WHERE is_active = 1 AND (partner_id IS NULL OR partner_id = 'ptn_htl_01') LIMIT 1")[0];
  assert.ok(hotel, "seeded hotel for outlink test");
  const before = sql("SELECT transaction_model, outlink_partner_id FROM suppliers WHERE id = 'ptn_htl_01'")[0];
  try {
    sql("UPDATE suppliers SET transaction_model = 'AFFILIATE' WHERE id = 'ptn_htl_01'");
    const mp = await api("PATCH", "/api/v1/admin/suppliers/ptn_htl_01", { token: ADMIN, body: { outlinkPartnerId: pid } });
    assert.equal(mp.status, 200, JSON.stringify(mp.data));
    const det = (await api("GET", `/api/v1/hotels/${hotel.id}`)).data.data;
    assert.equal(det.bookable, false);
    assert.equal(det.bookable_reason, "EXTERNAL_LINK_ONLY");
    assert.equal(det.outlink_path, `/out/${pid}/${hotel.id}`);
    // The link click-tracks (302 + REDIRECTED row) and lands on the template.
    const click = await fetch(BASE + "/api/v1" + det.outlink_path, { redirect: "manual" });
    assert.equal(click.status, 302);
    const loc = click.headers.get("location") || "";
    assert.ok(loc.startsWith("https://clk.example.net/go?c=clk_") && loc.includes(`i=${hotel.id}`), loc);
    const rows = sql(`SELECT click_id, partner_name, item_id, status FROM affiliate_clicks WHERE partner_name = '${pid}' ORDER BY created_at DESC LIMIT 1`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].item_id, hotel.id);
    assert.equal(rows[0].status, "REDIRECTED");
    // Deactivating the partner removes the link and parks the click path.
    assert.equal((await api("PATCH", `/api/v1/admin/affiliate/partners/${pid}`, { token: ADMIN, body: { isActive: false } })).status, 200);
    const det2 = (await api("GET", `/api/v1/hotels/${hotel.id}`)).data.data;
    assert.ok(!("outlink_path" in det2), "no outlink while partner inactive");
    assert.equal((await fetch(BASE + "/api/v1" + det.outlink_path, { redirect: "manual" })).status, 404);
  } finally {
    sql(`UPDATE suppliers SET transaction_model = '${before.transaction_model}', outlink_partner_id = ${before.outlink_partner_id ? `'${before.outlink_partner_id}'` : "NULL"} WHERE id = 'ptn_htl_01'`);
    await api("PATCH", "/api/v1/admin/suppliers/ptn_htl_01", { token: ADMIN, body: { notes: "e2e #27 restore" } }); // invalidate cache
  }
  const det3 = (await api("GET", `/api/v1/hotels/${hotel.id}`)).data.data;
  assert.ok(!("outlink_path" in det3), "outlink gone after restore");
});

test("#32/#33/#34: staff blocked from keys/webhook/bank; owner allowed", async () => {
  resetLimiter("partner_login");
  const P = await approvedPartner("sec32");
  const O = P.token;
  const staffEmail = `qa_stf_${rnd()}@local.test`;
  const staffPw = "Passw0rd-QA-1";
  const sc = await api("POST", "/api/v1/partner/staff", { token: O, body: { email: staffEmail, fullName: "QA Staff", role: "STAFF", password: staffPw } });
  assert.equal(sc.status, 201, JSON.stringify(sc.data));
  const S = (await api("POST", "/api/v1/partner/login", { body: { email: staffEmail, password: staffPw } })).data.token;
  assert.ok(S, "staff login");
  // #32: issuance + revocation are OWNER_ONLY.
  assert.equal((await api("POST", "/api/v1/partner/api-keys", { token: S, body: { name: "staff-key" } })).data.code, "OWNER_ONLY");
  const key = await api("POST", "/api/v1/partner/api-keys", { token: O, body: { name: "owner-key" } });
  assert.equal(key.status, 201, JSON.stringify(key.data));
  assert.equal((await api("DELETE", `/api/v1/partner/api-keys/${key.data.id}`, { token: S })).data.code, "OWNER_ONLY");
  assert.equal((await api("DELETE", `/api/v1/partner/api-keys/${key.data.id}`, { token: O })).status, 200);
  // #34: webhook read/write/rotate are OWNER_ONLY.
  assert.equal((await api("GET", "/api/v1/partner/webhook", { token: S })).data.code, "OWNER_ONLY");
  assert.equal((await api("PUT", "/api/v1/partner/webhook", { token: S, body: { webhookUrl: "https://evil.example.test/hook" } })).data.code, "OWNER_ONLY");
  assert.equal((await api("POST", "/api/v1/partner/webhook/rotate", { token: S })).data.code, "OWNER_ONLY");
  assert.equal((await api("GET", "/api/v1/partner/webhook", { token: O })).status, 200);
  const rot = await api("POST", "/api/v1/partner/webhook/rotate", { token: O });
  assert.equal(rot.status, 200, JSON.stringify(rot.data));
  assert.ok(String(rot.data.secret || "").startsWith("whsec_"));
  // #33: staff see ****+last4, owner sees the full account number.
  const acct = "987-65-4321";
  assert.equal((await api("PATCH", "/api/v1/partner/profile", { token: O, body: { bankName: "QA은행", bankAccountNumber: acct, bankAccountHolder: "QA" } })).status, 200);
  const staffView = (await api("GET", "/api/v1/partner/profile", { token: S })).data.partner.profile.bank_account_number;
  assert.ok(!staffView.includes("987-65"), `staff view masked: ${staffView}`);
  assert.ok(staffView.endsWith("4321"), `mask keeps last 4: ${staffView}`);
  assert.equal((await api("GET", "/api/v1/partner/profile", { token: O })).data.partner.profile.bank_account_number, acct);
  // #87: the profile form sends only changed fields, so staff can save contact
  // info (no bank keys, no owner gate); a bank key still forces OWNER_ONLY.
  assert.equal((await api("PATCH", "/api/v1/partner/profile", { token: S, body: { contactPhone: "02-9999-0000" } })).status, 200);
  assert.equal(sql(`SELECT contact_phone AS v FROM partners WHERE id = '${P.id}'`)[0].v, "02-9999-0000");
  assert.equal((await api("PATCH", "/api/v1/partner/profile", { token: S, body: { contactPhone: "02-9999-0001", bankName: "X" } })).data.code, "OWNER_ONLY");
});

test("#36: public marketplace catalog hides cost/margin/sourcing fields", async () => {
  // Fixture uses a scratch item id (never htl_seoul_01): settlement
  // attribution reads this table, so a real-item fixture would flip later
  // tests from SUPPLIER_FALLBACK to CATALOG. Removed in finally regardless.
  sql(`INSERT OR IGNORE INTO marketplace_catalog_items (id, domain_type, item_id, merchant_model, supplier_id, registered_by, seller_id, seller_name, fulfillment_provider, supply_cost_minor, retail_price_minor, commission_rate_bps, seller_payout_minor, platform_margin_minor, external_sku, source_url, status) VALUES ('mkt_e2e_36', 'HOTEL', 'htl_scratch_36', '3P', 'ptn_htl_01', 'PARTNER:ptn_htl_01', 'ptn_htl_01', 'E2E Seller', 'PARTNER', 50000, 99000, 1000, 89100, 9900, 'SKU-SECRET', 'https://internal.example.test/ingest', 'ACTIVE')`);
  try {
    const r = await api("GET", "/api/v1/marketplace/catalog?model=3P");
    assert.equal(r.status, 200);
    assert.ok(r.data.items.length >= 1, "fixture visible");
    assert.ok(r.data.items.some((it) => it.id === "mkt_e2e_36"), "fixture row returned");
    for (const it of r.data.items) {
      for (const f of ["supply_cost_minor", "commission_rate_bps", "seller_payout_minor", "platform_margin_minor", "external_sku", "source_url", "registered_by", "supplier_id"]) {
        assert.ok(!(f in it), `public field leaked: ${f}`);
      }
      assert.ok("retail_price_minor" in it && "seller_name" in it, "public pricing intact");
    }
  } finally {
    sql("DELETE FROM marketplace_catalog_items WHERE id = 'mkt_e2e_36'");
  }
});

test("#37: password change verifies current, kills sessions, forces re-login", async () => {
  resetLimiter("register", "login");
  const u = await register("pw37");
  const old = "Passw0rd-QA-1";
  const next = "NewPassw0rd-QA-2";
  assert.equal((await api("POST", "/api/v1/auth/me/password", { body: { currentPassword: old, newPassword: next } })).status, 401);
  assert.equal((await api("POST", "/api/v1/auth/me/password", { token: u.token, body: { currentPassword: "WrongPassw0rd-9", newPassword: next } })).data.code, "INVALID_CREDENTIALS");
  assert.equal((await api("POST", "/api/v1/auth/me/password", { token: u.token, body: { currentPassword: old, newPassword: "short" } })).data.code, "WEAK_PASSWORD");
  const ch = await api("POST", "/api/v1/auth/me/password", { token: u.token, body: { currentPassword: old, newPassword: next } });
  assert.equal(ch.status, 200, JSON.stringify(ch.data));
  assert.equal(ch.data.requireRelogin, true);
  assert.equal((await api("GET", "/api/v1/auth/me", { token: u.token })).status, 401, "old session dead");
  assert.equal((await api("POST", "/api/v1/auth/login", { body: { email: u.email, password: old } })).status, 401, "old password dead");
  // Session reset uses a +1s boundary (auth.ts), so a login landing in the
  // same second mints a stillborn token by design and must retry — the test
  // encodes that contract instead of racing the clock.
  let nl = null;
  for (let i = 0; i < 4; i++) {
    const attempt = await api("POST", "/api/v1/auth/login", { body: { email: u.email, password: next } });
    assert.equal(attempt.status, 200, JSON.stringify(attempt.data));
    if ((await api("GET", "/api/v1/auth/me", { token: attempt.data.token })).status === 200) { nl = attempt; break; }
    await new Promise((r) => setTimeout(r, 700));
  }
  assert.ok(nl, "new session works after the reset boundary clears");
});

test("#35: logins issue HttpOnly jars; cookie alone authenticates", async () => {
  resetLimiter("login", "partner_login");
  const u = await register("jar35");
  const fmt = (c) => (c || "").split(";")[0];
  const ul = await fetch(BASE + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: u.email, password: "Passw0rd-QA-1" }) });
  const uSet = ul.headers.get("set-cookie") || "";
  assert.ok(uSet.includes("getfortrip_jwt=") && /httponly/i.test(uSet) && /samesite=lax/i.test(uSet), uSet);
  const me = await fetch(BASE + "/api/v1/auth/me", { headers: { Cookie: fmt(uSet) } });
  assert.equal(me.status, 200, "user jar authenticates without Bearer");
  const al = await fetch(BASE + "/api/v1/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }) });
  const aSet = al.headers.get("set-cookie") || "";
  assert.ok(aSet.includes("getfortrip_admin_jwt=") && /httponly/i.test(aSet), aSet);
  const pe = `qa_ptn_jarc_${rnd()}@local.test`;
  await api("POST", "/api/v1/partner/register", { body: { email: pe, password: "Passw0rd-QA-1", companyName: "QA jar", businessNumber: "000-00-00000" } });
  const plog = await fetch(BASE + "/api/v1/partner/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: pe, password: "Passw0rd-QA-1" }) });
  const pSet = plog.headers.get("set-cookie") || "";
  assert.ok(pSet.includes("getfortrip_partner_jwt=") && /httponly/i.test(pSet), pSet);
  const pme = await fetch(BASE + "/api/v1/partner/profile", { headers: { Cookie: fmt(pSet) } });
  assert.equal(pme.status, 200, "partner jar authenticates without Bearer");
  const lo = await fetch(BASE + "/api/v1/partner/logout", { method: "POST", headers: { Cookie: fmt(pSet) } });
  assert.equal(lo.status, 200);
  assert.ok((lo.headers.get("set-cookie") || "").includes("Max-Age=0"), "logout clears the jar");
});

test("affiliate postback: unconfigured partner rejected, cannot touch bookings", async () => {
  const q = (await quote(A.token)).data.quote;
  const b = (await book(A.token, q)).data.booking;
  const ts = Math.floor(Date.now() / 1000);
  const r = await fetch(BASE + "/api/v1/webhooks/postback", { method: "POST", headers: { "Content-Type": "application/json", "X-Signature": "00", "X-Timestamp": String(ts) }, body: JSON.stringify({ partner: "trip", click_id: "c", order_id: b.id, amount: 1 }) });
  assert.equal(r.status, 404);
  assert.equal((await api("GET", `/api/v1/bookings/${b.id}`, { token: A.token })).data.booking.status, "AWAITING_PAYMENT");
});

test("catalog: products report bookability honestly; unknown ids 404", async () => {
  const r = await api("GET", "/api/v1/flights?limit=3");
  assert.ok(r.data.data.length > 0);
  assert.ok(r.data.data.every((f) => typeof f.bookable === "boolean" && f.price_notice));
  assert.equal((await api("GET", "/api/v1/hotels/does-not-exist")).status, 404);
  assert.equal((await api("GET", "/api/v1/trains/does-not-exist")).status, 404);
});

test("hotel rate plans: API exposes catalog plans; unknown plan rejected; plan stored on the quote", async () => {
  const h = (await api("GET", "/api/v1/hotels/htl_seoul_01")).data.data;
  const room = h.rooms.find((r) => r.id === HOTEL.unitId);
  assert.ok(Array.isArray(room.rate_plans) && room.rate_plans.length >= 1);
  const plan = room.rate_plans[0];
  assert.equal(plan.price_krw, room.base_price_krw);
  const ok = (await quote(A.token, { ratePlanId: plan.id })).data.quote;
  assert.equal(ok.ratePlanId, plan.id);
  assert.ok(ok.title.includes(plan.name_ko));
  const bad = await quote(A.token, { ratePlanId: "NOT_A_PLAN" });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.code, "RATE_PLAN_NOT_FOUND");
  // The plan survives into booking re-validation (same price, no PRICE_CHANGED).
  const b = await book(A.token, ok);
  assert.equal(b.status, 201, JSON.stringify(b.data));
  assert.equal(b.data.booking.totalMinor, ok.totalMinor);
});

test("round-trip flight: one booking, one PNR, two legs with holds on each date", async () => {
  const pax = (fn) => ({ type: "ADULT", lastNameEn: "CHOI", firstNameEn: fn, birthDate: "1990-04-04", passportNumber: "M5556667", passportExpiry: day(900) });
  const body = { domain: "FLIGHT", itemId: "flt_ke703", returnItemId: "flt_ke704_ret", startDate: fday(60), returnDate: fday(64), travelers: { adults: 1 } };
  const r = await api("POST", "/api/v1/quotes", { token: A.token, body });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const q = r.data.quote;
  assert.equal(q.roundTrip, true);
  assert.equal(q.serviceStart, fday(60));
  assert.equal(q.serviceEnd, fday(64));
  const one = (await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "FLIGHT", itemId: "flt_ke703", startDate: fday(60), travelers: { adults: 1 } } })).data.quote;
  const back = (await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "FLIGHT", itemId: "flt_ke704_ret", startDate: fday(64), travelers: { adults: 1 } } })).data.quote;
  assert.equal(q.totalMinor, one.totalMinor + back.totalMinor);

  const b = (await book(A.token, q, { travelers: [pax("YUNA")] })).data.booking;
  assert.equal(b.items.length, 2);
  assert.equal(b.items.reduce((s, i) => s + i.total_minor, 0), b.totalMinor);
  const holds = sql(`SELECT item_id, service_date FROM inventory_holds WHERE booking_id = '${b.id}' ORDER BY service_date`);
  assert.deepEqual(holds.map((h) => [h.item_id, h.service_date]), [["flt_ke703", fday(60)], ["flt_ke704_ret", fday(64)]]);

  const paid = (await pay(A.token, b)).data.booking;
  assert.equal(paid.status, "TICKETED");
  assert.equal(paid.items[0].pnr, paid.items[1].pnr);
  assert.match(paid.items[0].pnr, /^[A-Z0-9]{6}$/);
});

test("round-trip flight: wrong direction, return before departure, missing return date are rejected", async () => {
  const base = { domain: "FLIGHT", itemId: "flt_ke703", startDate: fday(61), travelers: { adults: 1 } };
  const wrong = await api("POST", "/api/v1/quotes", { token: A.token, body: { ...base, returnItemId: "flt_ke723", returnDate: fday(65) } });
  assert.equal(wrong.data.code, "ROUND_TRIP_ROUTE_MISMATCH");
  const early = await api("POST", "/api/v1/quotes", { token: A.token, body: { ...base, returnItemId: "flt_ke704_ret", returnDate: fday(59) } });
  assert.equal(early.data.code, "INVALID_RETURN_DATE");
  const none = await api("POST", "/api/v1/quotes", { token: A.token, body: { ...base, returnItemId: "flt_ke704_ret" } });
  assert.equal(none.data.code, "RETURN_DATE_REQUIRED");
});

test("reviews: verified only from own fulfilled booking, once per booking; names masked; summary", async () => {
  const { p } = await fullHotelBooking(A.token, {});
  const bk = p.data.booking;
  assert.equal(bk.status, "VOUCHER_ISSUED");
  const list = (await api("GET", "/api/v1/bookings", { token: A.token })).data.bookings;
  assert.equal(list.find((x) => x.id === bk.id).itemId, HOTEL.itemId);

  const other = await api("POST", "/api/v1/reviews", { token: B.token, body: { targetId: HOTEL.itemId, bookingId: bk.id, rating: 5, comment: "not my booking" } });
  assert.equal(other.data.code, "REVIEW_BOOKING_NOT_ELIGIBLE");
  const wrongItem = await api("POST", "/api/v1/reviews", { token: A.token, body: { targetId: "htl_seoul_02", bookingId: bk.id, rating: 5, comment: "wrong product" } });
  assert.equal(wrongItem.data.code, "REVIEW_BOOKING_NOT_ELIGIBLE");

  const ok = await api("POST", "/api/v1/reviews", { token: A.token, body: { targetId: HOTEL.itemId, bookingId: bk.id, rating: 4, comment: "깨끗하고 위치가 좋았습니다" } });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.verifiedStay, true);
  const dup = await api("POST", "/api/v1/reviews", { token: A.token, body: { targetId: HOTEL.itemId, bookingId: bk.id, rating: 5, comment: "second try" } });
  assert.equal(dup.data.code, "ALREADY_REVIEWED");

  const g = (await api("GET", `/api/v1/reviews?domain=HOTEL&targetId=${HOTEL.itemId}`)).data;
  const mine = g.reviews.find((r) => r.id === ok.data.reviewId);
  assert.equal(mine.verified_stay, true);
  assert.ok(mine.user_name.includes("*"), "reviewer name must be masked");
  assert.ok(!g.reviews.some((r) => "user_id" in r || "booking_id" in r));
  assert.ok(g.summary.count >= 1 && g.summary.verifiedCount >= 1 && g.summary.average >= 1);
});

test("sitemap: dynamic, includes catalog detail pages", async () => {
  const res = await fetch(BASE + "/sitemap.xml");
  assert.equal(res.status, 200);
  const xml = await res.text();
  assert.ok(xml.includes("/hotels/detail/htl_seoul_01</loc>"));
  assert.ok(xml.includes("/flights/detail/flt_ke703</loc>"));
});

async function approvedPartner(tag) {
  const email = `qa_ptn_${tag}_${rnd()}@local.test`;
  const reg = await api("POST", "/api/v1/partner/register", { body: { email, password: "Passw0rd-QA-1", companyName: `QA ${tag}`, businessNumber: "000-00-00000" } });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  sql(`UPDATE partner_profiles SET status = 'ACTIVE' WHERE partner_id = '${reg.data.partnerId}'`);
  const login = await api("POST", "/api/v1/partner/login", { body: { email, password: "Passw0rd-QA-1" } });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  return { id: reg.data.partnerId, token: login.data.token };
}

test("C1 onboarding: PENDING owners log in and complete profile; business endpoints stay ACTIVE-only", async () => {
  const email = `qa_ptn_onb_${rnd()}@local.test`;
  const reg = await api("POST", "/api/v1/partner/register", { body: { email, password: "Passw0rd-QA-1", companyName: "QA onboarding", businessNumber: "000-00-00000" } });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const login = await api("POST", "/api/v1/partner/login", { body: { email, password: "Passw0rd-QA-1" } });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.partner.profileStatus, "PENDING_APPROVAL");
  const T = login.data.token;
  const me = await api("GET", "/api/v1/partner/profile", { token: T });
  assert.equal(me.status, 200, JSON.stringify(me.data));
  const patched = await api("PATCH", "/api/v1/partner/profile", { token: T, body: { contactPhone: "02-1111-2222", bankName: "QA은행", bankAccountNumber: "123-45-6789", bankAccountHolder: "QA온보딩", taxInvoiceEmail: "tax-qa@local.test" } });
  assert.equal(patched.status, 200, JSON.stringify(patched.data));
  const me2 = await api("GET", "/api/v1/partner/profile", { token: T });
  assert.equal(me2.data.partner.contact_phone, "02-1111-2222");
  assert.equal(me2.data.partner.profile.bank_name, "QA은행");
  for (const [m, p] of [["GET", "/api/v1/partner/dashboard"], ["GET", "/api/v1/partner/orders"], ["POST", "/api/v1/partner/api-keys"]]) {
    const r = await api(m, p, m === "GET" ? { token: T } : { token: T, body: {} });
    assert.equal(r.status, 403, `${m} ${p}: ${JSON.stringify(r.data)}`);
  }
});

test("C1/C2 onboarding loop: real doc upload, business check, then approval unlocks the extranet", async () => {
  const email = `qa_ptn_loop_${rnd()}@local.test`;
  const reg = await api("POST", "/api/v1/partner/register", { body: { email, password: "Passw0rd-QA-1", companyName: "QA loop", businessNumber: "000-00-00000" } });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const id = reg.data.partnerId;
  const T = (await api("POST", "/api/v1/partner/login", { body: { email, password: "Passw0rd-QA-1" } })).data.token;
  // Approval is blocked until docs exist (C1) and the business check is recorded (C2).
  const noDocs = await api("PATCH", `/api/v1/admin/partners/${id}`, { token: ADMIN, body: { status: "ACTIVE" } });
  assert.equal(noDocs.status, 409);
  assert.equal(noDocs.data.code, "DOCS_REQUIRED");
  // Real upload path (multipart) for both onboarding documents.
  for (const purpose of ["BUSINESS_CERT", "BANK_CERT"]) {
    const form = new FormData();
    form.append("file", new Blob(["%PDF-1.4 fake-cert"], { type: "application/pdf" }), `${purpose.toLowerCase()}.pdf`);
    form.append("purpose", purpose);
    const up = await fetch(BASE + "/api/v1/uploads", { method: "POST", headers: { Authorization: `Bearer ${T}` }, body: form });
    assert.equal(up.status, 201, `${purpose}: ${await up.text()}`);
  }
  const noCheck = await api("PATCH", `/api/v1/admin/partners/${id}`, { token: ADMIN, body: { status: "ACTIVE" } });
  assert.equal(noCheck.status, 409);
  assert.equal(noCheck.data.code, "BUSINESS_NOT_VERIFIED");
  const vb = await api("POST", `/api/v1/admin/partners/${id}/verify-business`, { token: ADMIN, body: { method: "MANUAL", note: "E2E: 서류 대조 확인" } });
  assert.equal(vb.status, 200, JSON.stringify(vb.data));
  const ok = await api("PATCH", `/api/v1/admin/partners/${id}`, { token: ADMIN, body: { status: "ACTIVE" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const dash = await api("GET", "/api/v1/partner/dashboard", { token: T });
  assert.equal(dash.status, 200, JSON.stringify(dash.data));
});

test("#15: partner product registration wires a supplier row and reports honest sellability", async () => {
  const P = await approvedPartner("sup15");
  const reg = await api("POST", "/api/v1/partner/marketplace/products", { token: P.token, body: { title: "E2E 공급사행 투어", domain: "ACTIVITY", city: "서울", price: 50000, capacity: 10 } });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  assert.equal(reg.data.product.sellable, false);
  assert.equal(reg.data.product.sellable_reason, "SUPPLIER_NOT_INTEGRATED");
  const sup = sql(`SELECT adapter, integration_status, settlement_rate_bps FROM suppliers WHERE id = '${P.id}'`)[0];
  assert.equal(sup.adapter, "direct_contract");
  assert.equal(sup.integration_status, "NOT_INTEGRATED");
  assert.ok(Number(sup.settlement_rate_bps) > 0 && Number(sup.settlement_rate_bps) <= 10000);
  const itemId = reg.data.product.item_id;
  const q0 = await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "ACTIVITY", itemId, startDate: day(96), travelers: { adults: 1 } } });
  assert.equal(q0.data.code, "NOT_DIRECTLY_BOOKABLE", JSON.stringify(q0.data));
  // Operator contracts the supplier → the same product becomes quotable.
  sql(`UPDATE suppliers SET integration_status = 'LIVE' WHERE id = '${P.id}'`);
  const q1 = await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "ACTIVITY", itemId, startDate: day(96), travelers: { adults: 1 } } });
  assert.equal(q1.status, 201, JSON.stringify(q1.data));
});

test("#26: partner hotel registration carries rooms; roomless hotels stay unquotable", async () => {
  const P = await approvedPartner("rooms26");
  const bad = await api("POST", "/api/v1/partner/marketplace/products", { token: P.token, body: { title: "E2E 룸리스 호텔", domain: "HOTEL", city: "서울", price: 200000 } });
  assert.equal(bad.status, 400, JSON.stringify(bad.data));
  assert.equal(bad.data.code, "ROOMS_REQUIRED");
  const rooms = [{ name_ko: "디럭스 더블", base_price_krw: 200000, available_inventory: 5, max_occupancy: 2 }];
  const reg = await api("POST", "/api/v1/partner/products", { token: P.token, body: { title: "E2E 룸 호텔", domain: "HOTEL", city: "서울", price: 200000, rooms } });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const id = reg.data.id;
  const det = await api("GET", `/api/v1/partner/products/${id}`, { token: P.token });
  assert.equal(det.status, 200, JSON.stringify(det.data));
  assert.equal(det.data.product.rooms.length, 1);
  assert.equal(det.data.product.rooms[0].name_ko, "디럭스 더블");
  const pat = await api("PATCH", `/api/v1/partner/products/${id}`, { token: P.token, body: { rooms: [...rooms, { name_ko: "스위트", base_price_krw: 400000, available_inventory: 2, max_occupancy: 3 }] } });
  assert.equal(pat.status, 200, JSON.stringify(pat.data));
  const det2 = await api("GET", `/api/v1/partner/products/${id}`, { token: P.token });
  assert.equal(det2.data.product.rooms.length, 2);
  // Another partner cannot see or touch it.
  const Q = await approvedPartner("rooms26b");
  assert.equal((await api("GET", `/api/v1/partner/products/${id}`, { token: Q.token })).status, 404);
  // After operator LIVE, the roomed hotel quotes with a unit.
  sql(`INSERT OR IGNORE INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps) VALUES ('${P.id}', 'x', 'ALL', 'simulator', 'LIVE', 'AGENCY', 9000)`);
  sql(`UPDATE suppliers SET integration_status = 'LIVE', adapter = 'simulator' WHERE id = '${P.id}'`);
  const roomId = det2.data.product.rooms[0].id;
  const q = await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "HOTEL", itemId: id, unitId: roomId, startDate: day(60), endDate: day(61), rooms: 1, travelers: { adults: 1 } } });
  assert.equal(q.status, 201, JSON.stringify(q.data));
});

test("partner extranet: orders are scoped to the partner; other partners cannot see or act on them", async () => {
  const q = (await quote(A.token)).data.quote;
  const b = (await book(A.token, q)).data.booking;
  const [P, Q] = [await approvedPartner("p"), await approvedPartner("q")];

  // Booking belongs to the hotel's own supplier, not to P.
  let orders = await api("GET", "/api/v1/partner/orders", { token: P.token });
  assert.equal(orders.status, 200);
  assert.ok(!orders.data.orders.some((o) => o.id === b.id), "foreign booking leaked into partner orders");
  const dash = await api("GET", "/api/v1/partner/dashboard", { token: P.token });
  assert.ok(!dash.data.recentOrders.some((o) => o.id === b.id), "foreign booking leaked into partner dashboard");

  // Once the booking is P's, P sees it and Q still cannot touch it.
  sql(`UPDATE bookings SET partner_id = '${P.id}' WHERE id = '${b.id}'`);
  orders = await api("GET", "/api/v1/partner/orders", { token: P.token });
  assert.ok(orders.data.orders.some((o) => o.id === b.id));
  orders = await api("GET", "/api/v1/partner/orders", { token: Q.token });
  assert.ok(!orders.data.orders.some((o) => o.id === b.id));
  for (const action of ["confirm", "reject"]) {
    const r = await api("POST", `/api/v1/partner/orders/${b.id}/${action}`, { token: Q.token });
    assert.equal(r.status, 404, JSON.stringify(r.data));
  }
  assert.equal(sql(`SELECT status FROM bookings WHERE id = '${b.id}'`)[0].status, "AWAITING_PAYMENT");
});

test("partner api keys: issued once, prefix-only listing, server-to-server auth, revoke kills the key", async () => {
  const P = await approvedPartner("key");
  const issued = await api("POST", "/api/v1/partner/api-keys", { token: P.token, body: { name: "PMS" } });
  assert.equal(issued.status, 201, JSON.stringify(issued.data));
  const key = issued.data.apiKey;
  assert.match(key, /^gft_live_[0-9a-f]{32}$/);
  const list = await api("GET", "/api/v1/partner/api-keys", { token: P.token });
  assert.equal(list.status, 200);
  assert.equal(list.data.keys.length, 1);
  assert.equal(list.data.keys[0].apiKey, undefined, "plaintext is never readable again");
  assert.ok(list.data.keys[0].keyPrefix.includes("..."));
  const viaKey = await api("GET", "/api/v1/partner/orders", { token: key });
  assert.equal(viaKey.status, 200, JSON.stringify(viaKey.data));
  assert.ok(sql(`SELECT last_used_at FROM partner_api_keys WHERE id = '${issued.data.id}'`)[0].last_used_at, "usage is timestamped");
  const Q = await approvedPartner("keyq");
  const qKey = (await api("POST", "/api/v1/partner/api-keys", { token: Q.token, body: {} })).data.apiKey;
  assert.equal((await api("DELETE", `/api/v1/partner/api-keys/${issued.data.id}`, { token: Q.token })).status, 404);
  assert.equal((await api("DELETE", `/api/v1/partner/api-keys/${issued.data.id}`, { token: P.token })).status, 200);
  assert.equal((await api("GET", "/api/v1/partner/orders", { token: key })).status, 401);
  assert.equal((await api("GET", "/api/v1/partner/orders", { token: qKey })).status, 200);
});

test("partner webhook + money: https-only URL storage, dashboard/settlement totals come from real bookings", async () => {
  const P = await approvedPartner("wh");
  assert.equal((await api("PUT", "/api/v1/partner/webhook", { token: P.token, body: { webhookUrl: "http://plain.example.com/hook" } })).status, 400);
  assert.equal((await api("PUT", "/api/v1/partner/webhook", { token: P.token, body: { webhookUrl: "not a url" } })).status, 400);
  const saved = await api("PUT", "/api/v1/partner/webhook", { token: P.token, body: { webhookUrl: "https://pms.example.com/gft-events" } });
  assert.equal(saved.status, 200);
  assert.equal((await api("GET", "/api/v1/partner/webhook", { token: P.token })).data.webhookUrl, "https://pms.example.com/gft-events");
  const q = (await quote(A.token)).data.quote;
  const b = (await book(A.token, q)).data.booking;
  sql(`UPDATE bookings SET partner_id = '${P.id}' WHERE id = '${b.id}'`);
  const total = Number(sql(`SELECT total_minor FROM bookings WHERE id = '${b.id}'`)[0].total_minor);
  const dash = await api("GET", "/api/v1/partner/dashboard", { token: P.token });
  assert.equal(dash.data.stats.monthlyGrossKrw, total);
  const st = await api("GET", "/api/v1/partner/settlements", { token: P.token });
  assert.equal(st.data.summary.totalGrossKrw, total);
  assert.equal(st.data.summary.totalNetPayoutKrw, st.data.summary.totalGrossKrw - st.data.summary.totalCommissionKrw);
  assert.match(st.data.summary.nextPayoutDate, /^\d{4}-\d{2}-20$/);
  assert.equal(st.data.summary.payoutBank, null, "no bank on file means null, not a sample account");
  const spec = await api("GET", "/api/v1/partner/openapi.json", { token: P.token });
  assert.equal(spec.status, 200);
  assert.equal(spec.data.openapi, "3.0.3");
  assert.ok(spec.data.paths["/partner/api-keys"], "spec documents the integration surface");
});

test("partner orders: confirm/reject run the booking state machine (no raw status writes)", async () => {
  const P = await approvedPartner("decide");
  const Q = await approvedPartner("decideq");
  async function paidPending() {
    // Real payment flow (never raw-SQL capture): the PAYMENT_CAPTURED journal
    // must exist or the run-last ledger test flags a stranded deposit.
    const { p } = await fullHotelBooking(A.token, { supplier: "timeout" });
    const bk = p.data.booking;
    assert.equal(bk.status, "MANUAL_REVIEW_REQUIRED");
    assert.equal(bk.paymentStatus, "CAPTURED");
    sql(`UPDATE bookings SET partner_id = '${P.id}', supplier_id = 'ptn_htl_01' WHERE id = '${bk.id}'`);
    return bk.id;
  }
  const cId = await paidPending();
  assert.equal((await api("POST", `/api/v1/partner/orders/${cId}/confirm`, { token: P.token, body: {} })).status, 400, "reference required");
  assert.equal((await api("POST", `/api/v1/partner/orders/${cId}/confirm`, { token: Q.token, body: { supplierReference: "X" } })).status, 404);
  const c = await api("POST", `/api/v1/partner/orders/${cId}/confirm`, { token: P.token, body: { supplierReference: "HTL-8819" } });
  assert.equal(c.data.status, "VOUCHER_ISSUED");
  assert.equal(sql(`SELECT supplier_reference FROM bookings WHERE id = '${cId}'`)[0].supplier_reference, "HTL-8819");
  assert.ok(sql(`SELECT voucher_code FROM booking_items WHERE booking_id = '${cId}'`)[0].voucher_code, "voucher issued");
  const rId = await paidPending();
  const r = await api("POST", `/api/v1/partner/orders/${rId}/reject`, { token: P.token, body: { note: "sold out" } });
  assert.equal(r.data.status, "REFUNDED");
  const pay = sql(`SELECT status, refunded_minor, amount_minor FROM payments WHERE booking_id = '${rId}'`)[0];
  assert.equal(pay.status, "REFUNDED");
  assert.equal(pay.refunded_minor, pay.amount_minor, "full refund on supplier rejection");
});

test("admin: catalog API works across all product tables, search escapes LIKE wildcards", async () => {
  const all = await api("GET", "/api/v1/admin/catalog?limit=200", { token: ADMIN });
  assert.equal(all.status, 200, JSON.stringify(all.data));
  const domains = new Set(all.data.items.map((i) => i.domain_type));
  for (const d of ["HOTEL", "FLIGHT", "TRAIN", "CAR", "TRANSFER", "ACTIVITY", "PACKAGE"]) assert.ok(domains.has(d), `missing ${d}`);
  const ke = await api("GET", "/api/v1/admin/catalog?q=KE&domain=FLIGHT&limit=8", { token: ADMIN });
  assert.ok(ke.data.items.length > 0 && ke.data.items.every((i) => i.domain_type === "FLIGHT"));
  assert.equal((await api("GET", "/api/v1/admin/catalog?q=%25", { token: ADMIN })).data.items.length, 0);
  assert.equal((await api("GET", "/api/v1/admin/users?q=%25", { token: ADMIN })).data.users.length, 0);
  const literalUnderscore = sql("SELECT COUNT(*) AS c FROM bookings WHERE booking_number LIKE '%\\_%' ESCAPE '\\' OR customer_email LIKE '%\\_%' ESCAPE '\\' OR customer_name LIKE '%\\_%' ESCAPE '\\' OR title LIKE '%\\_%' ESCAPE '\\' OR id = '_'")[0].c;
  const totalBookings = sql("SELECT COUNT(*) AS c FROM bookings")[0].c;
  assert.ok(totalBookings > literalUnderscore, "wildcard test needs bookings without a literal _ to discriminate");
  const escaped = await api("GET", "/api/v1/admin/bookings?q=_&pageSize=200", { token: ADMIN });
  assert.equal(escaped.data.bookings.length, literalUnderscore);
  assert.equal(escaped.data.total, literalUnderscore, "paged total matches the escaped count");
  assert.equal(escaped.data.page, 1);
  assert.equal((await api("GET", "/api/v1/admin/catalog", { token: A.token })).status, 403);
});

test("admin: member suspension is refused (no schema support); coin adjustments are validated and ledgered", async () => {
  assert.equal((await api("PATCH", `/api/v1/admin/users/${A.id}`, { token: ADMIN, body: { isActive: false } })).status, 400);
  assert.equal((await api("PATCH", `/api/v1/admin/users/${A.id}`, { token: ADMIN, body: { coinAdjustment: 1.5 } })).status, 400);
  assert.equal((await api("PATCH", `/api/v1/admin/users/${A.id}`, { token: ADMIN, body: { role: "SUPER" } })).status, 400);
  assert.equal((await api("PATCH", "/api/v1/admin/users/usr_does_not_exist", { token: ADMIN, body: { coinAdjustment: 10 } })).status, 404);
  const before = Number(sql(`SELECT trip_coins FROM users WHERE id = '${A.id}'`)[0].trip_coins);
  assert.equal((await api("PATCH", `/api/v1/admin/users/${A.id}`, { token: ADMIN, body: { coinAdjustment: 10 } })).data.code, "IDEMPOTENCY_KEY_REQUIRED");
  const up = await api("PATCH", `/api/v1/admin/users/${A.id}`, { token: ADMIN, headers: { "Idempotency-Key": idem() }, body: { coinAdjustment: 250, note: "e2e" } });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal(up.data.coinBalance, before + 250);
  // Over-deduction clamps at zero and the ledger records only what was actually removed.
  const down = await api("PATCH", `/api/v1/admin/users/${A.id}`, { token: ADMIN, headers: { "Idempotency-Key": idem() }, body: { coinAdjustment: -(before + 1000) } });
  assert.equal(down.data.coinBalance, 0);
  const ledger = sql(`SELECT delta FROM coin_ledger WHERE user_id = '${A.id}' AND reason LIKE 'ADMIN_ADJUSTMENT%' ORDER BY created_at, rowid`).map((r) => Number(r.delta));
  assert.deepEqual(ledger.slice(-2), [250, -(before + 250)]);
  // Replay: same key returns the stored response without touching balance or ledger.
  const rkey = idem();
  const r1 = await api("PATCH", `/api/v1/admin/users/${A.id}`, { token: ADMIN, headers: { "Idempotency-Key": rkey }, body: { coinAdjustment: 40 } });
  const r2 = await api("PATCH", `/api/v1/admin/users/${A.id}`, { token: ADMIN, headers: { "Idempotency-Key": rkey }, body: { coinAdjustment: 40 } });
  assert.deepEqual(r2.data, r1.data);
  assert.equal(Number(sql(`SELECT trip_coins FROM users WHERE id = '${A.id}'`)[0].trip_coins), r1.data.coinBalance);
  assert.equal(sql(`SELECT COUNT(*) AS c FROM coin_ledger WHERE user_id = '${A.id}' AND delta = 40`)[0].c, 1);
  assert.equal((await api("PATCH", `/api/v1/admin/users/${A.id}`, { token: ADMIN, headers: { "Idempotency-Key": rkey }, body: { coinAdjustment: 41 } })).data.code, "IDEMPOTENCY_KEY_REUSED");
  const users = await api("GET", `/api/v1/admin/users?q=${encodeURIComponent(A.email)}`, { token: ADMIN });
  assert.equal(users.data.users[0].is_active, undefined, "no fabricated is_active column");
});

test("admin: partner status/commission and supplier LIVE switch are validated", async () => {
  const email = `qa_adm_${rnd()}@local.test`;
  const reg = await api("POST", "/api/v1/partner/register", { body: { email, password: "Passw0rd-QA-1", companyName: "QA admin", businessNumber: "000-00-00000" } });
  const id = reg.data.partnerId;
  const found = await api("GET", `/api/v1/admin/partners?q=${encodeURIComponent(email)}`, { token: ADMIN });
  assert.equal(found.data.partners[0].id, id);
  assert.equal((await api("PATCH", `/api/v1/admin/partners/${id}`, { token: ADMIN, body: { status: "REJECTED" } })).status, 400, "reason required");
  assert.equal((await api("PATCH", `/api/v1/admin/partners/${id}`, { token: ADMIN, body: { status: "BOGUS" } })).status, 400);
  assert.equal((await api("PATCH", `/api/v1/admin/partners/${id}`, { token: ADMIN, body: { settlementRateBps: -1 } })).status, 400);
  assert.equal((await api("PATCH", `/api/v1/admin/partners/${id}`, { token: ADMIN, body: { settlementRateBps: 1250.5 } })).status, 400);
  const gate = await api("PATCH", `/api/v1/admin/partners/${id}`, { token: ADMIN, body: { status: "ACTIVE", settlementRateBps: 1250 } });
  assert.equal(gate.status, 409, "C1: approval without onboarding docs is refused");
  assert.equal(gate.data.code, "DOCS_REQUIRED");
  sql(`UPDATE partner_profiles SET business_cert_url = 'https://r2.local.test/cert.pdf', bank_cert_url = 'https://r2.local.test/bank.pdf' WHERE partner_id = '${id}'`);
  const gate2 = await api("PATCH", `/api/v1/admin/partners/${id}`, { token: ADMIN, body: { status: "ACTIVE", settlementRateBps: 1250 } });
  assert.equal(gate2.status, 409, "C2: approval without a business check is refused");
  assert.equal(gate2.data.code, "BUSINESS_NOT_VERIFIED");
  assert.equal((await api("POST", `/api/v1/admin/partners/${id}/verify-business`, { token: ADMIN, body: { method: "MANUAL", note: "E2E gate" } })).status, 200);
  assert.equal((await api("PATCH", `/api/v1/admin/partners/${id}`, { token: ADMIN, body: { status: "ACTIVE", settlementRateBps: 1250 } })).status, 200);
  assert.equal(sql(`SELECT settlement_rate_bps FROM partner_profiles WHERE partner_id = '${id}'`)[0].settlement_rate_bps, 1250);

  const sup = (await api("GET", "/api/v1/admin/suppliers", { token: ADMIN })).data.suppliers.find((s) => !s.contract_id && s.integration_status !== "LIVE");
  assert.ok(sup, "a supplier without contract exists in seed data");
  assert.equal((await api("PATCH", `/api/v1/admin/suppliers/${sup.id}`, { token: ADMIN, body: { integrationStatus: "LIVE", adapter: "api" } })).status, 409);
  assert.equal((await api("PATCH", `/api/v1/admin/suppliers/${sup.id}`, { token: ADMIN, body: { adapter: "telepathy" } })).status, 400);
  assert.equal((await api("PATCH", `/api/v1/admin/suppliers/${sup.id}`, { token: ADMIN, body: { contractId: "ctr_does_not_exist" } })).status, 400);
});

test("url ingest: drafts are never published with missing facts; publish is once-only and invents nothing", async () => {
  const id = `ing_e2e_${rnd()}`.replace(/[^A-Za-z0-9_]/g, "");
  sql(`INSERT INTO url_product_ingestions (id, source_url, domain_type, title, currency, price_minor, country, city, cancellation_policy, status, created_by) VALUES ('${id}', 'https://example.org/p', 'ACTIVITY', 'E2E 투어', 'KRW', 0, '', '', '', 'DRAFT', 'e2e')`);
  const incomplete = await api("POST", `/api/v1/admin/ingest/${id}/publish`, { token: ADMIN });
  assert.equal(incomplete.status, 422, JSON.stringify(incomplete.data));
  assert.deepEqual(incomplete.data.details.missing.sort(), ["cancellation_policy", "city", "country", "price_minor"]);
  assert.equal((await api("PATCH", `/api/v1/admin/ingest/${id}`, { token: ADMIN, body: { price_minor: -5 } })).status, 400);
  const filled = await api("PATCH", `/api/v1/admin/ingest/${id}`, { token: ADMIN, body: { price_minor: 42000, country: "일본", city: "오사카", cancellation_policy: "이용 3일 전까지 무료 취소" } });
  assert.equal(filled.status, 200);
  const pub = await api("POST", `/api/v1/admin/ingest/${id}/publish`, { token: ADMIN });
  assert.equal(pub.status, 200, JSON.stringify(pub.data));
  const act = sql(`SELECT price_krw, review_score, review_count, free_cancellation, instant_confirmation, thumbnail_url FROM activities WHERE id = '${pub.data.published_item_id}'`)[0];
  assert.deepEqual({ ...act }, { price_krw: 42000, review_score: null, review_count: 0, free_cancellation: 0, instant_confirmation: 0, thumbnail_url: null });
  assert.equal((await api("POST", `/api/v1/admin/ingest/${id}/publish`, { token: ADMIN })).status, 409, "no duplicate catalogue rows");
  assert.equal((await api("PATCH", `/api/v1/admin/ingest/${id}`, { token: ADMIN, body: { title: "x" } })).status, 409, "published drafts are frozen");

  const car = `ing_e2e_car_${rnd()}`.replace(/[^A-Za-z0-9_]/g, "");
  sql(`INSERT INTO url_product_ingestions (id, source_url, domain_type, title, currency, price_minor, country, city, cancellation_policy, status, created_by) VALUES ('${car}', 'https://example.org/c', 'CAR', '렌터카', 'KRW', 50000, '일본', '오사카', '무료 취소', 'REVIEWED', 'e2e')`);
  assert.equal((await api("POST", `/api/v1/admin/ingest/${car}/publish`, { token: ADMIN })).status, 422, "unsupported domains are not silently turned into activities");
});

test("admin: moderation list includes blinded moments; promotions can be toggled", async () => {
  const promos = await api("GET", "/api/v1/admin/promotions", { token: ADMIN });
  assert.equal(promos.status, 200);
  assert.equal((await api("PATCH", "/api/v1/admin/promotions/promo_missing", { token: ADMIN, body: { isActive: false } })).status, 404);
  assert.equal((await api("PATCH", `/api/v1/admin/promotions/${promos.data.promotions[0].id}`, { token: ADMIN, body: { isActive: "no" } })).status, 400);
  const m = await api("GET", "/api/v1/admin/moments?filter=blinded", { token: ADMIN });
  assert.equal(m.status, 200);
  assert.ok(m.data.moments.every((x) => x.is_blinded === 1));
  assert.equal((await api("POST", "/api/v1/admin/moments/mmt_missing/blind", { token: ADMIN })).status, 404);
});

test("moments: public feed shape is {moments}; posting requires auth and echoes back", async () => {
  const feed = await api("GET", "/api/v1/moments");
  assert.equal(feed.status, 200);
  assert.ok(Array.isArray(feed.data.moments), "frontend parses .moments, not .data");
  assert.equal((await api("POST", "/api/v1/moments", { body: { title: "x", content: "y" } })).status, 401);
  assert.equal((await api("POST", "/api/v1/moments", { token: A.token, body: { title: "" } })).status, 400);
  const title = `E2E 모먼트 ${rnd()}`;
  const created = await api("POST", "/api/v1/moments", { token: A.token, body: { title, content: "E2E 여행 기록", city: "서울" } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const again = await api("GET", "/api/v1/moments");
  assert.ok(again.data.moments.some((m) => m.title === title), "posted moment appears in feed");
});

test("inquiries: customers file 1:1 tickets; operators triage them", async () => {
  assert.equal((await api("POST", "/api/v1/inquiries", { body: { subject: "x", body: "y" } })).status, 401);
  assert.equal((await api("GET", "/api/v1/inquiries")).status, 401);
  assert.equal((await api("POST", "/api/v1/inquiries", { token: A.token, body: { subject: "" } })).status, 400);
  assert.equal((await api("POST", "/api/v1/inquiries", { token: A.token, body: { subject: "x", body: "y", category: "NOPE" } })).status, 400);
  const subject = `E2E 문의 ${rnd()}`;
  const filed = await api("POST", "/api/v1/inquiries", { token: A.token, body: { subject, body: "환불이 언제 되나요?", category: "REFUND" } });
  assert.equal(filed.status, 201, JSON.stringify(filed.data));
  const mine = await api("GET", "/api/v1/inquiries", { token: A.token });
  assert.ok(mine.data.inquiries.some((t) => t.subject === subject && t.status === "OPEN"));
  const other = await api("GET", "/api/v1/inquiries", { token: B.token });
  assert.ok(!other.data.inquiries.some((t) => t.subject === subject), "tickets are scoped to the owner");
  assert.equal((await api("GET", "/api/v1/admin/tickets", { token: A.token })).status, 403);
  const queue = await api("GET", "/api/v1/admin/tickets?status=OPEN", { token: ADMIN });
  assert.ok(queue.data.tickets.some((t) => t.subject === subject));
  assert.equal((await api("PATCH", "/api/v1/admin/tickets/tkt_missing", { token: ADMIN, body: { status: "RESOLVED" } })).status, 404);
  const done = await api("PATCH", `/api/v1/admin/tickets/${filed.data.id}`, { token: ADMIN, body: { status: "RESOLVED", adminNote: "환불 승인됨" } });
  assert.equal(done.status, 200);
  const after = await api("GET", "/api/v1/inquiries", { token: A.token });
  assert.equal(after.data.inquiries.find((t) => t.subject === subject).status, "RESOLVED");
});

test("partner webhooks: capture/refund enqueue deliveries; dispatch retries; test-send works", async () => {
  resetLimiter("partner_register", "partner_login");
  sql(`UPDATE partner_profiles SET webhook_url = 'https://example.invalid/hook' WHERE partner_id = 'ptn_htl_01'`);
  const { b } = await fullHotelBooking(A.token);
  const created = sql(`SELECT status, attempts FROM partner_webhook_deliveries WHERE booking_id = '${b.id}' AND event_type = 'booking.created'`);
  assert.equal(created.length, 1, "capture enqueues booking.created");
  assert.equal(created[0].status, "PENDING");
  const secret = sql(`SELECT webhook_secret FROM partner_profiles WHERE partner_id = 'ptn_htl_01'`)[0].webhook_secret;
  assert.ok(secret && secret.startsWith("whsec_"), "signing secret auto-issued");
  await api("POST", "/api/v1/admin/maintenance/run", { token: ADMIN });
  const tried = sql(`SELECT status, attempts, last_error FROM partner_webhook_deliveries WHERE booking_id = '${b.id}' AND event_type = 'booking.created'`)[0];
  assert.equal(tried.attempts, 1, "maintenance attempts delivery");
  assert.equal(tried.status, "PENDING", "unreachable host stays pending until max attempts");
  assert.ok(tried.last_error, "failure reason recorded");
  const fail = await fullHotelBooking(A.token, { supplier: "fail" });
  const cancelled = sql(`SELECT status FROM partner_webhook_deliveries WHERE booking_id = '${fail.b.id}' AND event_type = 'booking.cancelled'`);
  assert.equal(cancelled.length, 1, "refund enqueues booking.cancelled");
  const P = await approvedPartner("hook");
  assert.equal((await api("POST", "/api/v1/partner/webhook/test", { token: P.token })).status, 400, "test needs a URL first");
  assert.equal((await api("PUT", "/api/v1/partner/webhook", { token: P.token, body: { webhookUrl: "https://example.invalid/p" } })).status, 200);
  const t = await api("POST", "/api/v1/partner/webhook/test", { token: P.token });
  assert.equal(t.status, 201, JSON.stringify(t.data));
  const log = await api("GET", "/api/v1/partner/webhook/deliveries", { token: P.token });
  assert.ok(log.data.deliveries.some((d) => d.id === t.data.id && d.event_type === "test"));
  const before = (await api("GET", "/api/v1/partner/webhook", { token: P.token })).data.secret;
  const rotated = await api("POST", "/api/v1/partner/webhook/rotate", { token: P.token });
  assert.ok(rotated.data.secret && rotated.data.secret !== before, "rotation issues a new secret");
});

test("partner catalog: products patch/toggle; withdrawn products leave the public catalog", async () => {
  resetLimiter("partner_register", "partner_login");
  const P = await approvedPartner("cat");
  const Q = await approvedPartner("cat2");
  const created = await api("POST", "/api/v1/partner/products", { token: P.token, body: { domain: "HOTEL", title: `E2E 호텔 ${rnd()}`, city: "부산", price: 99000 } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.id;
  assert.equal((await api("PATCH", `/api/v1/partner/products/${id}`, { token: Q.token, body: { title: "남의 상품" } })).status, 404);
  assert.equal((await api("PATCH", `/api/v1/partner/products/${id}`, { token: P.token, body: { price: -1 } })).status, 400);
  assert.equal((await api("PATCH", `/api/v1/partner/products/${id}`, { token: P.token, body: {} })).status, 400);
  const title = `E2E 호텔 수정 ${rnd()}`;
  assert.equal((await api("PATCH", `/api/v1/partner/products/${id}`, { token: P.token, body: { title, price: 129000 } })).status, 200);
  const list = await api("GET", "/api/v1/partner/products", { token: P.token });
  const mine = list.data.products.find((p) => p.id === id);
  assert.equal(mine.title, title);
  assert.equal(mine.base_price_krw, 129000);
  assert.equal((await api("PATCH", `/api/v1/partner/products/${id}`, { token: P.token, body: { isActive: false } })).status, 200);
  const pub = await api("GET", "/api/v1/hotels?limit=100");
  assert.ok(!pub.data.data.some((h) => h.id === id), "withdrawn product hidden from public list");
  assert.equal((await api("GET", `/api/v1/hotels/${id}`)).status, 404, "withdrawn product detail 404s");
  assert.equal((await api("PATCH", `/api/v1/partner/products/${id}`, { token: P.token, body: { isActive: true } })).status, 200);
  assert.equal((await api("GET", `/api/v1/hotels/${id}`)).status, 200, "re-listed product servable again");
});

test("partner staff: invite validation, login, role/active management", async () => {
  resetLimiter("partner_register", "partner_login");
  const P = await approvedPartner("stf");
  assert.equal((await api("POST", "/api/v1/partner/staff", { token: P.token, body: { email: "a@x.co", fullName: "A" } })).status, 400, "password required");
  assert.equal((await api("POST", "/api/v1/partner/staff", { token: P.token, body: { email: "a@x.co", fullName: "A", password: "short" } })).status, 400);
  assert.equal((await api("POST", "/api/v1/partner/staff", { token: P.token, body: { email: "a@x.co", fullName: "A", password: "Passw0rd-QA-1", role: "OWNER" } })).status, 400);
  const email = `stf_${rnd()}@local.test`;
  const inv = await api("POST", "/api/v1/partner/staff", { token: P.token, body: { email, fullName: "E2E 직원", role: "STAFF", password: "Passw0rd-QA-1" } });
  assert.equal(inv.status, 201, JSON.stringify(inv.data));
  assert.equal((await api("POST", "/api/v1/partner/staff", { token: P.token, body: { email, fullName: "중복", password: "Passw0rd-QA-1" } })).status, 409);
  const login = await api("POST", "/api/v1/partner/login", { body: { email, password: "Passw0rd-QA-1" } });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.partner.staffRole, "STAFF");
  assert.equal((await api("GET", "/api/v1/partner/dashboard", { token: login.data.token })).status, 200, "staff token works");
  assert.equal((await api("PATCH", "/api/v1/partner/profile", { token: login.data.token, body: { bankName: "X" } })).data.code, "OWNER_ONLY");
  assert.equal((await api("POST", "/api/v1/partner/staff", { token: login.data.token, body: { email: `n_${rnd()}@local.test`, fullName: "N", password: "Passw0rd-QA-1" } })).status, 403);
  assert.equal((await api("POST", "/api/v1/partner/orders/bkg_nope/confirm", { token: login.data.token, body: {} })).data.code, "MANAGER_ONLY");
  assert.equal((await api("PATCH", `/api/v1/partner/staff/${inv.data.id}`, { token: P.token, body: { role: "MANAGER" } })).status, 200);
  const mlogin = await api("POST", "/api/v1/partner/login", { body: { email, password: "Passw0rd-QA-1" } });
  assert.equal((await api("POST", "/api/v1/partner/orders/bkg_nope/confirm", { token: mlogin.data.token, body: {} })).status, 404, "manager passes RBAC, order missing");
  const roster = await api("GET", "/api/v1/partner/staff", { token: P.token });
  const owner = roster.data.staff.find((s) => s.role === "OWNER");
  assert.equal((await api("PATCH", `/api/v1/partner/staff/${owner.id}`, { token: P.token, body: { isActive: false } })).status, 403);
  assert.equal((await api("PATCH", `/api/v1/partner/staff/${inv.data.id}`, { token: P.token, body: { isActive: false } })).status, 200);
  assert.equal((await api("GET", "/api/v1/partner/dashboard", { token: login.data.token })).status, 401, "deactivated staff token rejected");
  assert.equal((await api("POST", "/api/v1/partner/login", { body: { email, password: "Passw0rd-QA-1" } })).status, 403);
});

test("partner inventory: writes are scoped to own products", async () => {
  resetLimiter("partner_register", "partner_login");
  const P = await approvedPartner("inv");
  const created = await api("POST", "/api/v1/partner/products", { token: P.token, body: { domain: "CAR", title: `E2E 차량 ${rnd()}`, city: "제주", price: 79000 } });
  const id = created.data.id;
  const day = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  assert.equal((await api("PUT", "/api/v1/partner/inventory", { token: P.token, body: { domain: "CAR", itemId: "ptn_prod_nope", serviceDate: day, allocatedUnits: 3 } })).status, 404);
  const put = await api("PUT", "/api/v1/partner/inventory", { token: P.token, body: { domain: "CAR", itemId: id, serviceDate: day, allocatedUnits: 3, priceOverrideMinor: 69000 } });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  const month = day.slice(0, 7);
  const got = await api("GET", `/api/v1/partner/inventory?month=${month}&itemId=${id}`, { token: P.token });
  assert.ok(got.data.inventory.some((r) => r.service_date === day && r.allocated_units === 3 && r.price_override_minor === 69000));
});

test("pagination: list endpoints return stable pages with totals", async () => {
  resetLimiter("partner_register", "partner_login");
  const p1 = await api("GET", "/api/v1/admin/bookings?page=1&pageSize=2", { token: ADMIN });
  assert.equal(p1.status, 200);
  assert.equal(p1.data.page, 1);
  assert.ok(p1.data.total >= p1.data.bookings.length);
  assert.ok(p1.data.totalPages >= 1);
  if (p1.data.total > 2) {
    const p2 = await api("GET", "/api/v1/admin/bookings?page=2&pageSize=2", { token: ADMIN });
    const ids1 = new Set(p1.data.bookings.map((b) => b.id));
    assert.ok(p2.data.bookings.every((b) => !ids1.has(b.id)), "pages do not overlap");
  }
  for (const path of ["/api/v1/admin/users?page=1&pageSize=5", "/api/v1/admin/partners?page=1&pageSize=5", "/api/v1/admin/tickets?page=1&pageSize=5"]) {
    const r = await api("GET", path, { token: ADMIN });
    assert.equal(r.status, 200, path);
    assert.equal(typeof r.data.total, "number", `${path} exposes total`);
    assert.equal(typeof r.data.totalPages, "number", `${path} exposes totalPages`);
  }
  const P = await approvedPartner("pg");
  const o = await api("GET", "/api/v1/partner/orders?page=1&pageSize=5", { token: P.token });
  assert.equal(typeof o.data.total, "number");
  const f = await api("GET", "/api/v1/partner/orders?status=CANCELLED,REFUNDED", { token: P.token });
  assert.ok((f.data.orders || []).every((x) => ["CANCELLED", "REFUNDED"].includes(x.status)));
});

test("promotions: operators issue codes that quotes honor", async () => {
  assert.equal((await api("POST", "/api/v1/admin/promotions", { token: ADMIN, body: { code: "x", title: "t", discountType: "FIXED_AMOUNT", discountValue: 1000 } })).status, 400);
  assert.equal((await api("POST", "/api/v1/admin/promotions", { token: ADMIN, body: { code: "E2E-BAD", title: "t", discountType: "PERCENTAGE", discountValue: 150 } })).status, 400);
  assert.equal((await api("POST", "/api/v1/admin/promotions", { token: ADMIN, body: { code: "E2E-BAD", title: "t", discountType: "FIXED_AMOUNT", discountValue: 1000, validFrom: day(10), validUntil: day(5) } })).status, 400);
  const code = `E2E-${Date.now().toString(36).toUpperCase()}${rnd().slice(0, 4).toUpperCase()}`;
  const created = await api("POST", "/api/v1/admin/promotions", { token: ADMIN, body: { code, title: "E2E 10% 쿠폰", discountType: "PERCENTAGE", discountValue: 10, minOrderAmountKrw: 0, maxDiscountKrw: 5000, validFrom: day(0), validUntil: day(30) } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal((await api("POST", "/api/v1/admin/promotions", { token: ADMIN, body: { code, title: "dup", discountType: "FIXED_AMOUNT", discountValue: 1 } })).status, 409);
  const pub = await api("GET", "/api/v1/promotions");
  assert.ok(pub.data.promotions.some((p) => p.code === code), "active code publicly listed");
  assert.equal((await api("POST", "/api/v1/user/coupons/claim", { token: A.token, body: { code } })).status, 200);
  const q = await quote(A.token, { promotionCode: code });
  assert.ok(q.data.quote.discountMinor > 0, "quote honors the new code");
  assert.ok(q.data.quote.totalMinor < 605000);
});

test("partner password reset: forgot issues single-use links for owners and staff", async (t) => {
  resetLimiter("partner_register", "partner_login", "partner_forgot");
  const P = await approvedPartner("rst");
  const ownerEmail = `qa_ptn_rst_${rnd()}@local.test`;
  const reg = await api("POST", "/api/v1/partner/register", { body: { email: ownerEmail, password: "Passw0rd-QA-1", companyName: "QA reset", businessNumber: "000-00-00000" } });
  sql(`UPDATE partner_profiles SET status = 'ACTIVE' WHERE partner_id = '${reg.data.partnerId}'`);
  assert.equal((await api("POST", "/api/v1/partner/forgot-password", { body: { email: "nobody@local.test" } })).status, 200, "no enumeration");
  assert.equal((await api("POST", "/api/v1/partner/forgot-password", { body: { email: ownerEmail } })).status, 200);
  const outbox = await api("GET", "/api/v1/auth/dev-outbox");
  const row = outbox.data.outbox.find((o) => o.recipient === ownerEmail && o.template === "PASSWORD_RESET");
  assert.ok(row, "reset email queued");
  const token = new URL(JSON.parse(row.payload_json).link).searchParams.get("token");
  assert.ok(token);
  assert.equal((await api("POST", "/api/v1/partner/reset-password", { body: { token, newPassword: "short" } })).status, 400);
  assert.equal((await api("POST", "/api/v1/partner/reset-password", { body: { token, newPassword: "BrandNew-Pass-9" } })).status, 200);
  assert.equal((await api("POST", "/api/v1/partner/login", { body: { email: ownerEmail, password: "Passw0rd-QA-1" } })).status, 401);
  assert.equal((await api("POST", "/api/v1/partner/login", { body: { email: ownerEmail, password: "BrandNew-Pass-9" } })).status, 200);
  assert.equal((await api("POST", "/api/v1/partner/reset-password", { body: { token, newPassword: "Another-Pass-9" } })).status, 400, "single use");
  const staffEmail = `rst_stf_${rnd()}@local.test`;
  await api("POST", "/api/v1/partner/staff", { token: P.token, body: { email: staffEmail, fullName: "리셋 직원", password: "Passw0rd-QA-1" } });
  assert.equal((await api("POST", "/api/v1/partner/forgot-password", { body: { email: staffEmail } })).status, 200);
  const outbox2 = await api("GET", "/api/v1/auth/dev-outbox");
  const row2 = outbox2.data.outbox.find((o) => o.recipient === staffEmail);
  const token2 = new URL(JSON.parse(row2.payload_json).link).searchParams.get("token");
  assert.equal((await api("POST", "/api/v1/partner/reset-password", { body: { token: token2, newPassword: "StaffNew-Pass-9" } })).status, 200);
  assert.equal((await api("POST", "/api/v1/partner/login", { body: { email: staffEmail, password: "StaffNew-Pass-9" } })).status, 200);
});

test("partner order detail: own booking with payments and history, PII contained", async () => {
  resetLimiter("partner_register", "partner_login");
  const P = await approvedPartner("ord");
  const Q = await approvedPartner("ord2");
  const { b } = await fullHotelBooking(A.token);
  sql(`UPDATE bookings SET partner_id = '${P.id}' WHERE id = '${b.id}'`);
  assert.equal((await api("GET", `/api/v1/partner/orders/${b.id}`, { token: Q.token })).status, 404);
  const d = await api("GET", `/api/v1/partner/orders/${b.id}`, { token: P.token });
  assert.equal(d.status, 200, JSON.stringify(d.data));
  assert.equal(d.data.booking.id, b.id);
  assert.ok(d.data.booking.customerNameMasked && !("customer_email" in d.data.booking), "email excluded");
  assert.ok(!("customer_phone" in d.data.booking), "phone excluded");
  assert.ok(Array.isArray(d.data.payments) && d.data.payments.length > 0);
  assert.ok(!("raw_json" in d.data.payments[0]), "PG raw payload excluded");
  assert.ok(Array.isArray(d.data.history) && d.data.history.length > 0);
  assert.equal((await api("GET", "/api/v1/partner/orders/bkg_missing", { token: P.token })).status, 404);
});

test("wishlist: save, list and remove sync per user", async () => {
  assert.equal((await api("POST", "/api/v1/wishlist", { body: { itemId: "htl_seoul_01" } })).status, 401);
  assert.equal((await api("POST", "/api/v1/wishlist", { token: A.token, body: {} })).status, 400);
  const add = await api("POST", "/api/v1/wishlist", { token: A.token, body: { domainType: "HOTEL", itemId: "htl_seoul_01", itemTitle: "E2E 찜", priceKrw: 550000 } });
  assert.equal(add.status, 201, JSON.stringify(add.data));
  const mine = await api("GET", "/api/v1/wishlist", { token: A.token });
  assert.ok(mine.data.wishlist.some((w) => w.item_id === "htl_seoul_01"));
  const other = await api("GET", "/api/v1/wishlist", { token: B.token });
  assert.ok(!other.data.wishlist.some((w) => w.item_id === "htl_seoul_01"), "wishlists are per-user");
  assert.equal((await api("DELETE", "/api/v1/wishlist/htl_seoul_01", { token: A.token })).status, 200);
  const after = await api("GET", "/api/v1/wishlist", { token: A.token });
  assert.ok(!after.data.wishlist.some((w) => w.item_id === "htl_seoul_01"));
});

test("coins: spend at checkout, restore on cancel; claimed coupons consumed", async () => {
  const C = await register("coin");
  const me = async () => (await api("GET", "/api/v1/auth/me", { token: C.token })).data;
  const grant = await api("PATCH", `/api/v1/admin/users/${C.id}`, { token: ADMIN, headers: { "Idempotency-Key": idem() }, body: { coinAdjustment: 20000, note: "e2e coins" } });
  assert.equal(grant.status, 200, JSON.stringify(grant.data));
  assert.equal(grant.data.coinBalance, 20000);
  const code = `E2E-C${Date.now().toString(36).toUpperCase()}${rnd().slice(0, 4).toUpperCase()}`;
  const created = await api("POST", "/api/v1/admin/promotions", { token: ADMIN, body: { code, title: "E2E 코인쿠폰", discountType: "FIXED_AMOUNT", discountValue: 1000, minOrderAmountKrw: 0, validFrom: day(0), validUntil: day(30) } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal((await api("POST", "/api/v1/user/coupons/claim", { token: C.token, body: { code } })).status, 200);

  assert.equal((await quote(C.token, { coinAmount: 20001 })).data.code, "INSUFFICIENT_COINS");
  assert.equal((await quote(C.token, { coinAmount: -5 })).status, 400);
  const qr = await quote(C.token, { promotionCode: code, coinAmount: 5000 });
  assert.equal(qr.status, 201, JSON.stringify(qr.data));
  const q = qr.data.quote;
  assert.equal(q.coinsMinor, 5000);
  assert.equal(q.totalMinor, q.grossMinor - 5000, "cash due drops by the coin amount");
  assert.ok(q.discountMinor >= 6000, "promo 1000 + coins 5000 both in discount");

  const b = (await book(C.token, q)).data.booking;
  assert.equal(b.coinsUsedMinor, 5000);
  assert.equal((await me()).tripCoins ?? (await me()).trip_coins, 15000, "coins deducted at booking");
  assert.equal(sql(`SELECT is_used AS u FROM user_coupons WHERE user_id = '${C.id}' AND coupon_code = '${code}'`)[0].u, 1, "claimed coupon consumed");
  assert.equal(sql(`SELECT delta AS d FROM coin_ledger WHERE user_id = '${C.id}' AND reason = 'COIN_SPENT'`).length, 1);

  // Unpaid cancel restores coins too.
  const q2 = (await quote(C.token, { coinAmount: 3000 })).data.quote;
  const b2 = (await book(C.token, q2)).data.booking;
  assert.equal((await me()).tripCoins ?? (await me()).trip_coins, 12000);
  assert.equal((await api("POST", `/api/v1/bookings/${b2.id}/cancel`, { token: C.token })).data.booking.status, "CANCELLED");
  assert.equal((await me()).tripCoins ?? (await me()).trip_coins, 15000);

  const p = await pay(C.token, b);
  assert.equal(p.data.booking.status, "VOUCHER_ISSUED");
  const c = await api("POST", `/api/v1/bookings/${b.id}/cancel`, { token: C.token });
  assert.equal(c.data.booking.status, "REFUNDED");
  assert.equal((await me()).tripCoins ?? (await me()).trip_coins, 20000, "coins fully restored on cancel");
  assert.equal(sql(`SELECT COALESCE(SUM(delta), 0) AS s FROM coin_ledger WHERE user_id = '${C.id}'`)[0].s, 20000, "ledger nets to the grant");
});

test("#13: full-coin quote is refused honestly (400, never a 500)", async () => {
  const C = await register("zerotot");
  const gross = (await quote(C.token)).data.quote.grossMinor;
  assert.ok(gross > 1000);
  assert.equal((await api("PATCH", `/api/v1/admin/users/${C.id}`, { token: ADMIN, headers: { "Idempotency-Key": idem() }, body: { coinAdjustment: gross, note: "e2e #13" } })).status, 200);
  const z = await quote(C.token, { coinAmount: gross });
  assert.equal(z.status, 400, JSON.stringify(z.data));
  assert.equal(z.data.code, "ZERO_TOTAL_UNSUPPORTED");
  const ok = await quote(C.token, { coinAmount: gross - 1 });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.quote.totalMinor, 1);
});

test("#14: coupons need a claim, consume once, restore on cancel, honor caps", async () => {
  const U = await register("cpn14");
  const code = `E2E-P14${Date.now().toString(36).toUpperCase()}${rnd().slice(0, 4).toUpperCase()}`;
  const promo = await api("POST", "/api/v1/admin/promotions", { token: ADMIN, body: { code, title: "E2E #14", discountType: "FIXED_AMOUNT", discountValue: 1000, minOrderAmountKrw: 0, validFrom: day(0), validUntil: day(30) } });
  assert.equal(promo.status, 201, JSON.stringify(promo.data));
  const promoId = promo.data.id;
  assert.equal((await quote(U.token, { promotionCode: code })).data.code, "COUPON_NOT_CLAIMED");
  assert.equal((await api("POST", "/api/v1/user/coupons/claim", { token: U.token, body: { code } })).status, 200);
  const q = (await quote(U.token, { promotionCode: code })).data.quote;
  const b = (await book(U.token, q)).data.booking;
  const used = () => sql(`SELECT is_used AS u FROM user_coupons WHERE user_id = '${U.id}' AND coupon_code = '${code}'`)[0].u;
  const counted = () => sql(`SELECT used_count AS c FROM promotions WHERE code = '${code}'`)[0].c;
  assert.equal(used(), 1, "booking consumes the claim");
  assert.equal(counted(), 1, "booking counts the redemption");
  assert.equal((await quote(U.token, { promotionCode: code })).data.code, "COUPON_ALREADY_USED");
  assert.equal((await api("POST", `/api/v1/bookings/${b.id}/cancel`, { token: U.token })).data.booking.status, "CANCELLED");
  assert.equal(used(), 0, "unpaid cancel restores the claim");
  assert.equal(counted(), 0, "unpaid cancel releases the cap");
  // Paid cancel restores too.
  const q2 = (await quote(U.token, { promotionCode: code })).data.quote;
  const b2 = (await book(U.token, q2)).data.booking;
  assert.equal((await pay(U.token, b2)).data.booking.status, "VOUCHER_ISSUED");
  assert.equal((await api("POST", `/api/v1/bookings/${b2.id}/cancel`, { token: U.token })).data.booking.status, "REFUNDED");
  assert.equal(used(), 0, "paid cancel restores the claim");
  assert.equal(counted(), 0, "paid cancel releases the cap");
  // Cap of 1: a second user's quote is refused once the first books.
  assert.equal((await api("PATCH", `/api/v1/admin/promotions/${promoId}`, { token: ADMIN, body: { usageLimit: 0 } })).data.code, "INVALID_USAGE_LIMIT");
  assert.equal((await api("PATCH", `/api/v1/admin/promotions/${promoId}`, { token: ADMIN, body: { usageLimit: 1 } })).status, 200);
  const V = await register("cpn14b");
  assert.equal((await api("POST", "/api/v1/user/coupons/claim", { token: V.token, body: { code } })).status, 200);
  const q3 = (await quote(U.token, { promotionCode: code })).data.quote;
  assert.equal((await book(U.token, q3)).status, 201);
  assert.equal((await quote(V.token, { promotionCode: code })).data.code, "PROMO_EXHAUSTED");
});

test("ledger: every journal balanced; no payment/refund/deposit mismatch (run last)", async () => {
  const r = await api("GET", "/api/v1/admin/reconciliation", { token: ADMIN });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.unbalancedJournals, []);
  assert.deepEqual(r.data.paidMismatch, []);
  assert.deepEqual(r.data.refundMismatch, []);
  assert.deepEqual(r.data.strandedDeposits, []);
  assert.deepEqual(r.data.payableStranded, []);
  assert.equal(r.data.ok, true);
});

test("autocomplete: places carry codes/ids, typos and 초성 match, wildcards escaped, city codes expand", async () => {
  const s = async (q, domain) => (await api("GET", `/api/v1/search/suggest?q=${encodeURIComponent(q)}&domain=${domain}`)).data;
  const icn = await s("ICN", "flights");
  assert.equal(icn.data[0].id, "apt_ICN");
  assert.equal(icn.data[0].code, "ICN");
  assert.equal(icn.meta.degraded, false);

  assert.equal((await s("tokio", "hotels")).data[0].id, "cty_TYO");
  assert.equal((await s("ㄷㅋ", "hotels")).data[0].id, "cty_TYO");
  for (const it of (await s("", "trains")).data) assert.equal(it.place_type, "STATION");
  assert.equal((await s("100%_", "all")).count, 0, "LIKE wildcards must be escaped");
  // Public catalog search must escape wildcards too: a literal % matches only rows
  // containing %, never "everything" (ground truth comes straight from SQL).
  const litPct = (table, cols) => sql(`SELECT COUNT(*) AS c FROM ${table} WHERE ` + cols.map((c) => `${c} LIKE '%\\%%' ESCAPE '\\'`).join(" OR "))[0].c;
  assert.equal((await api("GET", "/api/v1/hotels?city=%25")).data.count, litPct("hotels", ["city", "name_ko", "name_en", "neighborhood"]));
  assert.equal((await api("GET", "/api/v1/cars?loc=%25")).data.count, litPct("cars", ["pickup_location", "company_name", "vehicle_model"]));
  assert.equal((await api("GET", "/api/v1/activities?q=%25")).data.count, litPct("activities", ["title", "description", "city"]));
  assert.equal((await api("GET", "/api/v1/packages?dest=%25")).data.count, litPct("packages", ["destination_city", "title"]));
  assert.equal((await api("GET", "/api/v1/trains?dep=%25&arr=%25")).data.count, 0);
  assert.equal((await api("GET", "/api/v1/flights?origin=%25&dest=%25")).data.count, 0);
  assert.equal((await api("GET", "/api/v1/transfers?airport=%25")).data.count, litPct("transfers", ["airport_code", "service_title"]));

  const hotel = (await s("하얏트", "hotels")).data.find((x) => x.kind === "product");
  assert.ok(hotel && hotel.target_url === `/hotels/detail/${encodeURIComponent(hotel.id)}`);
  for (const it of (await s("도쿄", "all")).data) assert.ok(!("count_info" in it), "no fabricated count labels");

  const port = (await s("부산항", "cruise")).data.find((x) => x.place_type === "PORT");
  assert.equal(port.target_url, null);

  const f = (await api("GET", "/api/v1/flights?origin=ICN&dest=TYO")).data;
  const arr = (f.flights || f.data || []).map((x) => x.arrival_airport);
  assert.ok(arr.length > 0 && arr.every((a) => a === "NRT" || a === "HND"), `TYO must expand to NRT/HND, got ${arr}`);

  // Profile edit persists name/phone and rejects junk.
  const me = await register("profile");
  const upd = await api("PATCH", "/api/v1/auth/me", { token: me.token, body: { fullName: "새 이름", phoneNumber: "+82-10-2222-3333" } });
  assert.equal(upd.status, 200, JSON.stringify(upd.data));
  const after = (await api("GET", "/api/v1/auth/me", { token: me.token })).data;
  assert.equal(after.fullName, "새 이름"); assert.equal(after.phoneNumber, "+82-10-2222-3333");
  assert.equal((await api("PATCH", "/api/v1/auth/me", { token: me.token, body: { fullName: "", phoneNumber: "" } })).status, 400);
  assert.equal((await api("PATCH", "/api/v1/auth/me", { token: me.token, body: { fullName: "X", phoneNumber: "abc" } })).status, 400);
  assert.equal((await api("PATCH", "/api/v1/auth/me", { body: { fullName: "X" } })).status, 401);
  const fp = (await api("POST", "/api/v1/auth/forgot-password", { body: { email: me.email } })).data;
  assert.ok(fp.emailDelivery !== "NOT_CONFIGURED" || !/발송됩니다|발송되었습니다/.test(fp.message), "must not claim an email was sent when no provider exists");

  // Names picked from autocomplete (no code in the text) must resolve too: 서울 → ICN/GMP, 도쿄 → NRT/HND.
  const byName = (await api("GET", `/api/v1/flights?origin=${encodeURIComponent("서울")}&dest=${encodeURIComponent("도쿄")}`)).data.data || [];
  assert.ok(byName.length > 0, "city names must find flights");
  assert.ok(byName.every((x) => ["ICN", "GMP"].includes(x.departure_airport) && ["NRT", "HND"].includes(x.arrival_airport)));
  const byAirport = (await api("GET", `/api/v1/flights?origin=${encodeURIComponent("인천국제공항")}&dest=${encodeURIComponent("방콕")}`)).data.data || [];
  assert.ok(byAirport.length > 0 && byAirport.every((x) => x.departure_airport === "ICN" && x.arrival_airport === "BKK"));
  const tf = (await api("GET", `/api/v1/transfers?airport=${encodeURIComponent("인천국제공항")}`)).data.data || [];
  assert.ok(tf.length > 0 && tf.every((x) => x.airport_code === "ICN"), "transfer airport names must resolve to codes");
});

test("admin catalog CRUD: create/detail/patch/deactivate/delete hotel cycle", async () => {
  const created = await api("POST", "/api/v1/admin/catalog/HOTEL", { token: ADMIN, body: {
    name_ko: "E2E 테스트 호텔", name_en: "E2E Test Hotel", city: "서울", country: "대한민국",
    address: "서울시 중구", base_price_krw: 100000, star_rating: 4,
  } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.ok(created.data.id.startsWith("htl_"), `server id must carry domain prefix, got ${created.data.id}`);
  const id = created.data.id;
  const detail = (await api("GET", `/api/v1/admin/catalog/HOTEL/${id}`, { token: ADMIN })).data.product;
  assert.equal(detail.name_ko, "E2E 테스트 호텔");
  assert.equal(detail.base_price_krw, 100000);
  assert.equal((await api("PATCH", `/api/v1/admin/catalog/HOTEL/${id}`, { token: ADMIN, body: { base_price_krw: 123456, is_active: 0 } })).status, 200);
  const after = (await api("GET", `/api/v1/admin/catalog/HOTEL/${id}`, { token: ADMIN })).data.product;
  assert.equal(after.base_price_krw, 123456);
  assert.equal(after.is_active, 0);
  const inactive = (await api("GET", "/api/v1/admin/catalog?domain=HOTEL&status=inactive", { token: ADMIN })).data.items;
  assert.ok(inactive.some((i) => i.id === id), "deactivated product listed under status=inactive");
  assert.equal((await api("DELETE", `/api/v1/admin/catalog/HOTEL/${id}`, { token: ADMIN })).status, 200);
  assert.equal((await api("GET", `/api/v1/admin/catalog/HOTEL/${id}`, { token: ADMIN })).status, 404);
  assert.equal((await api("DELETE", `/api/v1/admin/catalog/HOTEL/${id}`, { token: ADMIN })).status, 404);
});

test("admin catalog CRUD: red paths", async () => {
  assert.equal((await api("POST", "/api/v1/admin/catalog/BOAT", { token: ADMIN, body: {} })).data.code, "INVALID_DOMAIN");
  assert.equal((await api("POST", "/api/v1/admin/catalog/HOTEL", { token: ADMIN, body: { name_ko: "X" } })).data.code, "FIELD_REQUIRED");
  assert.equal((await api("POST", "/api/v1/admin/catalog/HOTEL", { token: ADMIN, body: {
    name_ko: "X", name_en: "X", city: "X", country: "X", address: "X", base_price_krw: 1, nope_field: 1,
  } })).data.code, "UNKNOWN_FIELD");
  assert.equal((await api("POST", "/api/v1/admin/catalog/HOTEL", { token: ADMIN, body: {
    name_ko: "X", name_en: "X", city: "X", country: "X", address: "X", base_price_krw: -5,
  } })).data.code, "INVALID_FIELD");
  const id = `e2e_dup_${Date.now().toString(36)}`;
  const base = { id, name_ko: "X", name_en: "X", city: "X", country: "X", address: "X", base_price_krw: 1 };
  assert.equal((await api("POST", "/api/v1/admin/catalog/HOTEL", { token: ADMIN, body: base })).status, 201);
  assert.equal((await api("POST", "/api/v1/admin/catalog/HOTEL", { token: ADMIN, body: base })).data.code, "ID_EXISTS");
  assert.equal((await api("PATCH", `/api/v1/admin/catalog/HOTEL/${id}`, { token: ADMIN, body: { id: "other" } })).data.code, "IMMUTABLE_FIELD");
  assert.equal((await api("PATCH", `/api/v1/admin/catalog/HOTEL/${id}`, { token: ADMIN, body: {} })).data.code, "EMPTY_UPDATE");
  assert.equal((await api("PATCH", "/api/v1/admin/catalog/HOTEL/htl_missing", { token: ADMIN, body: { city: "X" } })).status, 404);
  assert.equal((await api("GET", "/api/v1/admin/catalog/HOTEL/htl_missing", { token: ADMIN })).status, 404);
  assert.equal((await api("GET", `/api/v1/admin/catalog/HOTEL/${id}`)).status, 401);
  assert.equal((await api("POST", "/api/v1/admin/catalog/HOTEL", { body: {} })).status, 401);
  assert.equal((await api("DELETE", `/api/v1/admin/catalog/HOTEL/${id}`, { token: ADMIN })).status, 200);
});

test("admin catalog bulk: upsert, partial failure, rerun convergence, caps", async () => {
  const tag = Date.now().toString(36);
  const r1 = `e2e_bulk_trn_${tag}_1`;
  const r2 = `e2e_bulk_trn_${tag}_2`;
  const train = (id) => ({ id, train_number: "KTX-999", train_type: "KTX", departure_station: "서울", arrival_station: "부산", departure_time: "09:00", arrival_time: "11:30", duration_minutes: 150, price_krw: 59800 });
  const res = await api("POST", "/api/v1/admin/catalog/bulk", { token: ADMIN, body: { domain: "TRAIN", rows: [
    train(r1), train(r2),
    { id: "e2e_bulk_bad", train_number: "X" },
    { id: "e2e_bulk_bad2", ...train("x"), bogus: 1 },
  ] } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.created, 2);
  assert.equal(res.data.failed.length, 2);
  assert.deepEqual(res.data.failed.map((f) => f.index), [2, 3]);
  assert.equal((await api("GET", `/api/v1/admin/catalog/TRAIN/${r1}`, { token: ADMIN })).data.product.train_number, "KTX-999");
  const rerun = await api("POST", "/api/v1/admin/catalog/bulk", { token: ADMIN, body: { domain: "TRAIN", rows: [{ id: r1, price_krw: 60000 }, { id: r2, price_krw: 60000 }] } });
  assert.equal(rerun.data.created, 0);
  assert.equal(rerun.data.updated, 2);
  assert.equal((await api("GET", `/api/v1/admin/catalog/TRAIN/${r1}`, { token: ADMIN })).data.product.price_krw, 60000);
  assert.equal((await api("POST", "/api/v1/admin/catalog/bulk", { token: ADMIN, body: { domain: "BOAT", rows: [{}] } })).data.code, "INVALID_DOMAIN");
  assert.equal((await api("POST", "/api/v1/admin/catalog/bulk", { token: ADMIN, body: { domain: "TRAIN", rows: [] } })).data.code, "ROWS_REQUIRED");
  assert.equal((await api("POST", "/api/v1/admin/catalog/bulk", { token: ADMIN, body: { domain: "TRAIN", rows: new Array(501).fill({}) } })).data.code, "TOO_MANY_ROWS");
  assert.equal((await api("DELETE", `/api/v1/admin/catalog/TRAIN/${r1}`, { token: ADMIN })).status, 200);
  assert.equal((await api("DELETE", `/api/v1/admin/catalog/TRAIN/${r2}`, { token: ADMIN })).status, 200);
});

test("admin catalog delete: blocked while bookings reference the product", async () => {
  const id = `e2e_guard_car_${Date.now().toString(36)}`;
  assert.equal((await api("POST", "/api/v1/admin/catalog/CAR", { token: ADMIN, body: {
    id, company_name: "E2E 렌터카", vehicle_model: "아반떼", daily_price_krw: 50000, pickup_location: "김포공항",
  } })).status, 201);
  const bn = `GFT-E2E-${Date.now().toString(36).toUpperCase()}`;
  sql("DELETE FROM bookings WHERE id = 'e2e_guard_b_1'");
  sql(`INSERT INTO bookings (id, booking_number, domain_type, item_id, title, total_price, currency, status, customer_name, customer_email) VALUES ('e2e_guard_b_1', '${bn}', 'CAR', '${id}', 'E2E guard', 50000, 'KRW', 'PENDING_PAYMENT', 'Guard', 'guard@e2e.test')`);
  const blocked = await api("DELETE", `/api/v1/admin/catalog/CAR/${id}`, { token: ADMIN });
  assert.equal(blocked.data.code, "REFERENCED_BY_BOOKING");
  assert.equal(blocked.data.details.count, 1);
  sql("DELETE FROM bookings WHERE id = 'e2e_guard_b_1'");
  assert.equal((await api("DELETE", `/api/v1/admin/catalog/CAR/${id}`, { token: ADMIN })).status, 200);
});

test("admin affiliate: clicks/conversions lists + summary", async () => {
  sql("DELETE FROM affiliate_conversions WHERE id = 'e2e_cnv_1'");
  sql("DELETE FROM affiliate_clicks WHERE click_id = 'e2e_clk_1'");
  sql(`INSERT INTO affiliate_clicks (click_id, domain_type, item_id, item_title, partner_name, outlink_url, sub_id, status) VALUES ('e2e_clk_1', 'HOTEL', 'htl_seoul_01', 'E2E click', 'e2e_trip', 'https://example.com/deep', 's1', 'CLICKED')`);
  sql(`INSERT INTO affiliate_conversions (id, click_id, partner_name, order_id, amount, currency, commission, status) VALUES ('e2e_cnv_1', 'e2e_clk_1', 'e2e_trip', 'e2e_ord_1', 100000, 'KRW', 5000, 'CONFIRMED')`);
  const clicks = (await api("GET", "/api/v1/admin/affiliate/clicks?partner=e2e_trip", { token: ADMIN })).data;
  assert.ok(clicks.clicks.some((c) => c.click_id === "e2e_clk_1"));
  assert.ok(clicks.total >= 1 && clicks.page === 1);
  const q = (await api("GET", "/api/v1/admin/affiliate/clicks?q=e2e_clk_1", { token: ADMIN })).data;
  assert.ok(q.clicks.some((c) => c.click_id === "e2e_clk_1"));
  const conv = (await api("GET", "/api/v1/admin/affiliate/conversions", { token: ADMIN })).data;
  const row = conv.conversions.find((c) => c.id === "e2e_cnv_1");
  assert.ok(row && row.amount === 100000 && row.commission === 5000);
  const sum = (await api("GET", "/api/v1/admin/affiliate/summary", { token: ADMIN })).data.summary;
  assert.ok(sum.clicks >= 1 && sum.conversions >= 1 && sum.gmv >= 100000);
  assert.equal((await api("GET", "/api/v1/admin/affiliate/clicks")).status, 401);
  sql("DELETE FROM affiliate_conversions WHERE id = 'e2e_cnv_1'");
  sql("DELETE FROM affiliate_clicks WHERE click_id = 'e2e_clk_1'");
});

test("admin product policy: upsert/get/validation + public read", async () => {
  const before = await api("GET", "/api/v1/admin/catalog/HOTEL/htl_seoul_01/policy", { token: ADMIN });
  assert.equal(before.status, 200);
  const put = await api("PUT", "/api/v1/admin/catalog/HOTEL/htl_seoul_01/policy", { token: ADMIN, body: {
    free_cancel_hours: 48, change_allowed: true, no_show_fee_bps: 1000,
    tiers: [{ hours_before: 24, refund_bps: 5000 }, { hours_before: 72, refund_bps: 10000, note: "얼리버드" }],
    note: "E2E 정책",
  } });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  const got = (await api("GET", "/api/v1/admin/catalog/HOTEL/htl_seoul_01/policy", { token: ADMIN })).data.policy;
  assert.equal(got.free_cancel_hours, 48);
  assert.equal(got.change_allowed, 1);
  assert.deepEqual(got.tiers.map((t) => t.hours_before), [72, 24], "tiers stored sorted desc");
  const pub = (await api("GET", "/api/v1/policies?domain=HOTEL&itemId=htl_seoul_01")).data.policy;
  assert.equal(pub.note, "E2E 정책");
  assert.equal((await api("GET", "/api/v1/policies")).data.policy, null);
  assert.equal((await api("PUT", "/api/v1/admin/catalog/HOTEL/htl_seoul_01/policy", { token: ADMIN, body: { tiers: [{ hours_before: 1, refund_bps: 20000 }] } })).data.code, "INVALID_POLICY");
  assert.equal((await api("PUT", "/api/v1/admin/catalog/HOTEL/htl_missing/policy", { token: ADMIN, body: {} })).status, 404);
  assert.equal((await api("GET", "/api/v1/admin/catalog/HOTEL/htl_missing/policy", { token: ADMIN })).status, 404);
  sql("DELETE FROM product_policies WHERE domain_type = 'HOTEL' AND item_id = 'htl_seoul_01'");
  assert.equal((await api("GET", "/api/v1/admin/catalog/HOTEL/htl_seoul_01/policy", { token: ADMIN })).data.policy, null);
});

test("admin legal registry: list/get/patch + public read", async () => {
  const list = (await api("GET", "/api/v1/legal")).data.documents;
  assert.ok(list.length >= 4 && list.some((d) => d.slug === "terms"));
  assert.equal((await api("GET", "/api/v1/legal/nope")).status, 404);
  const admin = (await api("GET", "/api/v1/admin/legal", { token: ADMIN })).data.documents;
  const prev = admin.find((d) => d.slug === "terms").version;
  assert.equal((await api("PATCH", "/api/v1/admin/legal/terms", { token: ADMIN, body: { version: "9.9" } })).status, 200);
  assert.equal((await api("GET", "/api/v1/legal/terms")).data.document.version, "9.9");
  assert.equal((await api("PATCH", "/api/v1/admin/legal/terms", { token: ADMIN, body: { version: "x" } })).data.code, "INVALID_VERSION");
  assert.equal((await api("PATCH", "/api/v1/admin/legal/nope", { token: ADMIN, body: { version: "1.0" } })).status, 404);
  assert.equal((await api("PATCH", "/api/v1/admin/legal/terms", { token: ADMIN, body: {} })).data.code, "EMPTY_UPDATE");
  assert.equal((await api("PATCH", "/api/v1/admin/legal/terms", { token: ADMIN, body: { version: prev } })).status, 200);
});

test("admin catalog list: status filter + pagination", async () => {
  const active = (await api("GET", "/api/v1/admin/catalog?domain=HOTEL&status=active&pageSize=50", { token: ADMIN })).data;
  assert.ok(active.items.length > 0);
  assert.ok(active.items.every((i) => i.is_active === 1 && i.domain_type === "HOTEL"));
  const p1 = (await api("GET", "/api/v1/admin/catalog?page=1&pageSize=2", { token: ADMIN })).data;
  assert.equal(p1.items.length, 2);
  assert.ok(p1.total >= 2 && p1.totalPages >= 1 && p1.page === 1);
  const p2 = (await api("GET", "/api/v1/admin/catalog?page=2&pageSize=2", { token: ADMIN })).data;
  assert.ok(p2.items.every((i) => !p1.items.some((a) => a.domain_type === i.domain_type && a.id === i.id)), "pages must not overlap");
});

test("1P direct sales: register on ptn_direct_01, go LIVE, sell, operator-confirms, voucher, cancel+refund", async () => {
  const tag = Date.now().toString(36);
  const hotelId = `e2e_direct_htl_${tag}`;
  const roomId = `e2e_direct_rm_${tag}`;
  // 1. Direct supplier ships NOT_INTEGRATED: nothing is bookable until the admin flips it LIVE.
  const sup0 = (await api("GET", "/api/v1/admin/suppliers", { token: ADMIN })).data.suppliers.find((s) => s.id === "ptn_direct_01");
  assert.ok(sup0, "migration 0020 must seed ptn_direct_01");
  assert.equal((await api("PATCH", "/api/v1/admin/suppliers/ptn_direct_01", { token: ADMIN, body: { adapter: "direct_contract", integrationStatus: "NOT_INTEGRATED" } })).status, 200);
  const created = await api("POST", "/api/v1/admin/catalog/HOTEL", { token: ADMIN, body: {
    id: hotelId, partner_id: "ptn_direct_01", name_ko: "E2E 직영 호텔", name_en: "E2E Direct Hotel",
    city: "서울", country: "대한민국", address: "서울시 중구", base_price_krw: 200000, star_rating: 4,
    free_cancellation: 1, rooms_json: [{ id: roomId, name_ko: "디럭스", base_price_krw: 200000, available_inventory: 5, max_occupancy: 2 }],
  } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const dark = (await api("GET", `/api/v1/hotels/${hotelId}`)).data.data;
  assert.equal(dark.bookable, false);
  assert.equal((await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "HOTEL", itemId: hotelId, unitId: roomId, startDate: day(60), endDate: day(61), travelers: { adults: 2 } } })).data.code, "NOT_DIRECTLY_BOOKABLE");
  // 2. Admin registers + activates the supplier contract, then flips the direct supplier LIVE.
  const ectId = `e2e_ect_${tag}`;
  assert.equal((await api("POST", "/api/v1/admin/contracts", { token: ADMIN, body: { id: ectId, entityId: "ent_primary", contractType: "SUPPLIER", counterparty: "E2E 직영 자사계약" } })).status, 201);
  assert.equal((await api("POST", "/api/v1/admin/contracts", { token: ADMIN, body: { id: ectId, entityId: "ent_primary", contractType: "SUPPLIER", counterparty: "x" } })).data.code, "ID_EXISTS");
  assert.equal((await api("POST", "/api/v1/admin/contracts", { token: ADMIN, body: { entityId: "ent_primary", contractType: "SUPPLIER" } })).data.code, "FIELD_REQUIRED");
  assert.equal((await api("POST", "/api/v1/admin/contracts", { token: ADMIN, body: { entityId: "ent_missing", contractType: "SUPPLIER", counterparty: "x" } })).data.code, "ENTITY_NOT_FOUND");
  assert.equal((await api("PATCH", `/api/v1/admin/contracts/${ectId}`, { token: ADMIN, body: { status: "ACTIVE" } })).status, 200);
  assert.equal((await api("PATCH", "/api/v1/admin/contracts/ect_missing", { token: ADMIN, body: { status: "ACTIVE" } })).status, 404);
  assert.equal((await api("PATCH", "/api/v1/admin/suppliers/ptn_direct_01", { token: ADMIN, body: { adapter: "direct_contract", integrationStatus: "LIVE", contractId: ectId } })).status, 200);
  const lit = (await api("GET", `/api/v1/hotels/${hotelId}`)).data.data;
  assert.equal(lit.bookable, true);
  assert.equal(lit.fulfilment_mode, "LIVE");
  // 3. Customer quote -> book -> sandbox pay. Direct-contract fulfilment waits for the operator.
  const q = (await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "HOTEL", itemId: hotelId, unitId: roomId, startDate: day(60), endDate: day(61), rooms: 1, travelers: { adults: 2 } } })).data.quote;
  assert.equal(q.totalMinor, 220000); // 1 night x 200,000 + 10% tax
  assert.equal(q.fulfilmentMode, "LIVE");
  const b = (await book(A.token, q)).data.booking;
  assert.equal(b.paymentMode, "LIVE");
  // #80: a direct sale names a supplier code, not a partner — attribution stays NULL.
  assert.equal(sql(`SELECT partner_id AS p FROM bookings WHERE id = '${b.id}'`)[0].p, null);
  const p = await pay(A.token, b, "ok");
  assert.equal(p.data.booking.status, "SUPPLIER_BOOKING_PENDING", JSON.stringify(p.data.booking));
  assert.equal(p.data.booking.items[0].voucher_code, null);
  // 4. Operator confirms in the OMS with the supplier reference: voucher issued.
  assert.equal((await api("POST", `/api/v1/admin/bookings/${b.id}/supplier-decision`, { token: ADMIN, body: { decision: "CONFIRM" } })).data.code, "SUPPLIER_REFERENCE_REQUIRED");
  const conf = await api("POST", `/api/v1/admin/bookings/${b.id}/supplier-decision`, { token: ADMIN, body: { decision: "CONFIRM", supplierReference: `DC-E2E-${tag}`, note: "E2E operator confirm" } });
  assert.equal(conf.data.booking.status, "VOUCHER_ISSUED", JSON.stringify(conf.data));
  assert.match(conf.data.booking.items[0].voucher_code, /^GFV-/);
  // 5. Free-cancel window: full cash refund through the PG, coins untouched.
  const c = await api("POST", `/api/v1/bookings/${b.id}/cancel`, { token: A.token });
  assert.equal(c.data.booking.status, "REFUNDED");
  assert.equal(c.data.booking.refundedMinor, 220000);
  assert.equal(c.data.booking.cancellationFeeMinor, 0);
  // 6. Leave the shared local fixture as found.
  assert.equal((await api("PATCH", "/api/v1/admin/suppliers/ptn_direct_01", { token: ADMIN, body: { integrationStatus: "NOT_INTEGRATED" } })).status, 200);
});

test("partner profile: response never carries password_hash or api_key", async () => {
  const P = await approvedPartner("noleak");
  const r = await api("GET", "/api/v1/partner/profile", { token: P.token });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.partner.email, /@local\.test$/, "profile carries the partner email");
  assert.ok(!("password_hash" in r.data.partner), "password_hash leaked in profile");
  assert.ok(!("api_key" in r.data.partner), "legacy api_key leaked in profile");
  assert.ok(!JSON.stringify(r.data).includes("password_hash"), "password_hash leaked anywhere in body");
  assert.ok(!JSON.stringify(r.data).includes("pbkdf2:"), "hash material leaked anywhere in body");
  // PATCH still works and the profile round-trips the editable fields.
  assert.equal((await api("PATCH", "/api/v1/partner/profile", { token: P.token, body: { contactPhone: "010-1234-5678", bankName: "E2E은행" } })).status, 200);
  const r2 = (await api("GET", "/api/v1/partner/profile", { token: P.token })).data.partner;
  assert.equal(r2.contact_phone, "010-1234-5678");
  assert.equal(r2.profile.bank_name, "E2E은행");
});

test("LIVE+api suppliers sell nothing until a real adapter exists", async () => {
  const tag = Date.now().toString(36);
  const supId = `e2e_sup_api_${tag}`;
  const hotelId = `e2e_api_htl_${tag}`;
  const roomId = `e2e_api_rm_${tag}`;
  const ectId = `e2e_ect_api_${tag}`;
  sql(`INSERT INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps) VALUES ('${supId}', 'E2E API 공급사', 'ALL', 'api', 'NOT_INTEGRATED', 'MERCHANT_OF_RECORD', 9000)`);
  assert.equal((await api("POST", "/api/v1/admin/catalog/HOTEL", { token: ADMIN, body: {
    id: hotelId, partner_id: supId, name_ko: "E2E API 호텔", name_en: "E2E API Hotel",
    city: "서울", country: "대한민국", address: "서울시 중구", base_price_krw: 100000, star_rating: 3,
    rooms_json: [{ id: roomId, name_ko: "스탠다드", base_price_krw: 100000, available_inventory: 5, max_occupancy: 2 }],
  } })).status, 201);
  // Commercially LIVE (contract ACTIVE) but technically unfulfillable: still dark.
  assert.equal((await api("POST", "/api/v1/admin/contracts", { token: ADMIN, body: { id: ectId, entityId: "ent_primary", contractType: "SUPPLIER", counterparty: "E2E API 계약" } })).status, 201);
  assert.equal((await api("PATCH", `/api/v1/admin/contracts/${ectId}`, { token: ADMIN, body: { status: "ACTIVE" } })).status, 200);
  assert.equal((await api("PATCH", `/api/v1/admin/suppliers/${supId}`, { token: ADMIN, body: { integrationStatus: "LIVE", contractId: ectId } })).status, 200);
  const dark = (await api("GET", `/api/v1/hotels/${hotelId}`)).data.data;
  assert.equal(dark.bookable, false);
  assert.equal(dark.bookable_reason, "SUPPLIER_API_NOT_IMPLEMENTED");
  const q = await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "HOTEL", itemId: hotelId, unitId: roomId, startDate: day(70), endDate: day(71), travelers: { adults: 2 } } });
  assert.equal(q.data.code, "NOT_DIRECTLY_BOOKABLE");
  assert.equal(q.data.details.reason, "SUPPLIER_API_NOT_IMPLEMENTED");
  // Cleanup: own rows only, nothing shared.
  sql(`DELETE FROM hotels WHERE id = '${hotelId}'; DELETE FROM suppliers WHERE id = '${supId}'; DELETE FROM entity_contracts WHERE id = '${ectId}'`);
});

test("direct-contract flights cannot quote: no ticketing exists", async () => {
  const tag = Date.now().toString(36);
  const flightId = `e2e_dc_flt_${tag}`;
  const ectId = `e2e_ect_flt_${tag}`;
  assert.equal((await api("POST", "/api/v1/admin/contracts", { token: ADMIN, body: { id: ectId, entityId: "ent_primary", contractType: "SUPPLIER", counterparty: "E2E 직계약 항공" } })).status, 201);
  assert.equal((await api("PATCH", `/api/v1/admin/contracts/${ectId}`, { token: ADMIN, body: { status: "ACTIVE" } })).status, 200);
  assert.equal((await api("PATCH", "/api/v1/admin/suppliers/ptn_direct_01", { token: ADMIN, body: { adapter: "direct_contract", integrationStatus: "LIVE", contractId: ectId } })).status, 200);
  assert.equal((await api("POST", "/api/v1/admin/catalog/FLIGHT", { token: ADMIN, body: {
    id: flightId, partner_id: "ptn_direct_01", flight_number: "GFT101", airline_name: "E2E 직항",
    airline_code: "GFT", departure_airport: "ICN", arrival_airport: "NRT",
    departure_city: "서울", arrival_city: "도쿄", departure_time: "2027-01-10T09:00:00Z", arrival_time: "2027-01-10T12:00:00Z",
    duration_minutes: 180, base_price_krw: 300000, available_seats: 10,
  } })).status, 201);
  const dark = (await api("GET", `/api/v1/flights/${flightId}`)).data.data;
  assert.equal(dark.bookable, false);
  assert.equal(dark.bookable_reason, "FLIGHT_TICKETING_UNSUPPORTED");
  const q = await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "FLIGHT", itemId: flightId, startDate: day(80), travelers: { adults: 1 } } });
  assert.equal(q.data.code, "FLIGHT_TICKETING_UNSUPPORTED");
  // Leave the shared fixture as found (status + seeded self-contract).
  assert.equal((await api("PATCH", "/api/v1/admin/suppliers/ptn_direct_01", { token: ADMIN, body: { integrationStatus: "NOT_INTEGRATED" } })).status, 200);
  sql(`UPDATE suppliers SET contract_id = 'ect_direct_01' WHERE id = 'ptn_direct_01'; DELETE FROM entity_contracts WHERE id = '${ectId}'`);
});

test("settlement: fulfilled booking writes a real attributed row; full refund marks it REFUNDED", async () => {
  const { b, p } = await fullHotelBooking(A.token, {}, "ok");
  assert.equal(p.data.booking.status, "VOUCHER_ISSUED");
  const rows = sql(`SELECT * FROM marketplace_order_settlements WHERE booking_id = '${b.id}'`);
  assert.equal(rows.length, 1, "exactly one settlement row per fulfilled booking");
  const s = rows[0];
  const supplierId = sql(`SELECT supplier_id AS v FROM bookings WHERE id = '${b.id}'`)[0].v;
  assert.equal(s.attribution_source, "SUPPLIER_FALLBACK");
  assert.equal(s.seller_id, supplierId, "seller is the real supplier of record");
  assert.equal(s.supplier_id, supplierId);
  assert.match(s.booking_item_id, /^bki_/, "booking item id is real, never fabricated");
  assert.equal(s.settlement_status, "PENDING");
  // Full refund takes the row out of the payable set; settle then refuses.
  const c = await api("POST", `/api/v1/bookings/${b.id}/cancel`, { token: A.token });
  assert.equal(c.data.booking.status, "REFUNDED");
  assert.equal(sql(`SELECT settlement_status AS v FROM marketplace_order_settlements WHERE booking_id = '${b.id}'`)[0].v, "REFUNDED");
  assert.equal((await api("PATCH", `/api/v1/admin/marketplace/settlements/${s.id}/settle`, { token: ADMIN })).data.code, "SETTLEMENT_NOT_PAYABLE");
});

test("floor price: quotes under the product floor are refused at quote and booking", async () => {
  const tag = Date.now().toString(36);
  const hotelId = `e2e_floor_htl_${tag}`;
  const roomId = `e2e_floor_rm_${tag}`;
  assert.equal((await api("POST", "/api/v1/admin/catalog/HOTEL", { token: ADMIN, body: {
    id: hotelId, partner_id: "ptn_htl_01", name_ko: "E2E 하한 호텔", name_en: "E2E Floor Hotel",
    city: "서울", country: "대한민국", address: "서울시 중구", base_price_krw: 100000, star_rating: 3,
    rooms_json: [{ id: roomId, name_ko: "스탠다드", base_price_krw: 100000, available_inventory: 5, max_occupancy: 2 }],
  } })).status, 201);
  const qbody = { domain: "HOTEL", itemId: hotelId, unitId: roomId, startDate: day(90), endDate: day(91), travelers: { adults: 2 } };
  const plain = (await api("POST", "/api/v1/quotes", { token: A.token, body: qbody })).data.quote;
  assert.ok(plain.quoteId, "no policy row means no floor");
  assert.equal((await api("PUT", `/api/v1/admin/catalog/HOTEL/${hotelId}/policy`, { token: ADMIN, body: { floor_price_minor: plain.totalMinor + 1 } })).status, 200);
  const blocked = await api("POST", "/api/v1/quotes", { token: A.token, body: qbody });
  assert.equal(blocked.data.code, "BELOW_FLOOR_PRICE");
  assert.equal(blocked.data.details.floorPriceMinor, plain.totalMinor + 1);
  assert.equal((await api("PUT", `/api/v1/admin/catalog/HOTEL/${hotelId}/policy`, { token: ADMIN, body: { floor_price_minor: plain.totalMinor } })).status, 200);
  assert.ok((await api("POST", "/api/v1/quotes", { token: A.token, body: qbody })).data.quote.quoteId, "total at the floor passes");
  assert.equal((await api("PUT", `/api/v1/admin/catalog/HOTEL/${hotelId}/policy`, { token: ADMIN, body: { floor_price_minor: null } })).status, 200);
  const pol = (await api("GET", `/api/v1/admin/catalog/HOTEL/${hotelId}/policy`, { token: ADMIN })).data.policy;
  assert.equal(pol.floor_price_minor, null);
  sql(`DELETE FROM product_policies WHERE domain_type = 'HOTEL' AND item_id = '${hotelId}'`);
});

test("settlement batches: settling a partner-seller row rolls into the monthly batch", async () => {
  const P = await approvedPartner("batch");
  sql(`INSERT INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps) VALUES ('${P.id}', 'E2E 배치 공급사', 'ALL', 'simulator', 'SANDBOX_VERIFIED', 'AGENCY', 9000)`);
  const reg = await api("POST", "/api/v1/partner/marketplace/products", { token: P.token, body: { title: "E2E 배치 투어", domain: "ACTIVITY", city: "서울", price: 50000, capacity: 10 } });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const itemId = reg.data.product.item_id;
  const q = (await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "ACTIVITY", itemId, startDate: day(95), travelers: { adults: 1 } } })).data.quote;
  const b = (await book(A.token, q)).data.booking;
  const paid = (await pay(A.token, b)).data.booking;
  assert.equal(paid.status, "VOUCHER_ISSUED");
  const s = sql(`SELECT * FROM marketplace_order_settlements WHERE booking_id = '${b.id}'`)[0];
  assert.equal(s.attribution_source, "CATALOG");
  assert.equal(s.seller_id, P.id);
  // B2: payout before tour completion is refused.
  assert.equal((await api("PATCH", `/api/v1/admin/marketplace/settlements/${s.id}/settle`, { token: ADMIN })).data.code, "SETTLEMENT_TOUR_INCOMPLETE");
  sql(`UPDATE bookings SET status = 'COMPLETED', service_end = '2020-01-02' WHERE id = '${b.id}'`);
  const settled = await api("PATCH", `/api/v1/admin/marketplace/settlements/${s.id}/settle`, { token: ADMIN, body: { payoutMethod: "MANUAL_TRANSFER", payoutReference: "E2E-TR-1" } });
  assert.equal(settled.status, 200, JSON.stringify(settled.data));
  assert.equal(settled.data.payout.method, "MANUAL_TRANSFER");
  assert.ok(settled.data.message.includes("별도로"), "no fake auto-transfer claim");
  const row = sql(`SELECT settlement_status AS st, payout_batch_id AS batch FROM marketplace_order_settlements WHERE id = '${s.id}'`)[0];
  assert.equal(row.st, "SETTLED");
  assert.ok(row.batch && row.batch.startsWith(`psb_${P.id}_`));
  const batch = sql(`SELECT * FROM partner_settlement_batches WHERE id = '${row.batch}'`)[0];
  assert.equal(batch.partner_id, P.id);
  assert.equal(batch.gross_minor, s.gross_amount_minor);
  assert.equal(batch.payout_minor, s.seller_payout_minor);
});

test("security: logout/reset revoke sessions; roles re-read; money paths throttled; list audited", async () => {
  // Logout kills the token.
  const D = await register("logout");
  assert.equal((await api("GET", "/api/v1/auth/me", { token: D.token })).status, 200);
  assert.equal((await api("POST", "/api/v1/auth/logout", { token: D.token })).status, 200);
  assert.equal((await api("GET", "/api/v1/auth/me", { token: D.token })).status, 401);
  // Password reset kills all sessions of the subject.
  const E = await register("resetsess");
  const login1 = await api("POST", "/api/v1/auth/login", { body: { email: E.email, password: "Passw0rd-QA-1" } });
  assert.equal((await api("POST", "/api/v1/auth/forgot-password", { body: { email: E.email } })).status, 200);
  const outbox = await api("GET", "/api/v1/auth/dev-outbox");
  const mail = outbox.data.outbox.find((m) => m.recipient === E.email && m.template === "PASSWORD_RESET");
  const token = new URL(JSON.parse(mail.payload_json).link).searchParams.get("token");
  assert.equal((await api("POST", "/api/v1/auth/reset-password", { body: { token, newPassword: "NewPassw0rd-QA-9" } })).status, 200);
  assert.equal((await api("GET", "/api/v1/auth/me", { token: login1.data.token })).status, 401, "pre-reset token dead");
  assert.equal((await api("POST", "/api/v1/auth/login", { body: { email: E.email, password: "NewPassw0rd-QA-9" } })).status, 200);
  // Roles come from the DB: a demoted admin's ADMIN-claimed token stops passing admin checks.
  const F = await register("demote");
  sql(`UPDATE users SET role = 'ADMIN' WHERE id = '${F.id}'`);
  const admLogin = await api("POST", "/api/v1/auth/login", { body: { email: F.email, password: "Passw0rd-QA-1" } });
  sql(`UPDATE users SET role = 'USER' WHERE id = '${F.id}'`);
  const q = (await quote(A.token)).data.quote;
  const b = (await book(A.token, q)).data.booking;
  assert.equal((await api("GET", `/api/v1/bookings/${b.id}`, { token: admLogin.data.token })).status, 403);
  // Money paths consume rate-limit buckets (wiring proof; thresholds stay above suite volume).
  for (const bucket of ["quotes:", "bookings:"]) {
    assert.ok(sql(`SELECT COUNT(*) AS c FROM login_attempts WHERE ip_address LIKE '${bucket}%'`)[0].c > 0, `${bucket} bucket missing`);
  }
  // Admin list views are audited like detail views; reconciliation tracks legacy hashes.
  assert.equal((await api("GET", "/api/v1/admin/bookings?pageSize=1", { token: ADMIN })).status, 200);
  assert.ok(sql("SELECT COUNT(*) AS c FROM admin_audit_logs WHERE action = 'ADMIN_LIST_BOOKINGS'")[0].c > 0);
  const rec = (await api("GET", "/api/v1/admin/reconciliation", { token: ADMIN })).data;
  assert.equal(typeof rec.legacyPasswordHashes, "number");
});

test("revived surfaces: is_active enforced, slots honest, partner rooms/inventory work, alerts fire, FX writable", async () => {
  // is_active: deactivating hides from lists/details and refuses quotes (restored after).
  sql("UPDATE flights SET is_active = 0 WHERE id = 'flt_ke703'");
  try {
    assert.ok(!(await api("GET", "/api/v1/flights?limit=100")).data.data.some((f) => f.id === "flt_ke703"));
    assert.equal((await api("GET", "/api/v1/flights/flt_ke703")).status, 404);
    assert.equal((await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "FLIGHT", itemId: "flt_ke703", startDate: fday(60), travelers: { adults: 1 } } })).data.code, "PRODUCT_NOT_FOUND");
  } finally {
    sql("UPDATE flights SET is_active = 1 WHERE id = 'flt_ke703'");
  }
  // Slots: no fabrication — every returned slot has a DB row.
  const date = day(100);
  const slots = (await api("GET", `/api/v1/activities/act_disney_tokyo/slots?date=${date}`)).data.slots;
  assert.equal(slots.length, sql(`SELECT COUNT(*) AS c FROM activity_time_slots WHERE activity_id = 'act_disney_tokyo' AND slot_date = '${date}' AND is_closed = 0`)[0].c);
  // Partner hotel without rooms is unquotable; PATCHing rooms makes it sellable.
  const P = await approvedPartner("rooms");
  sql(`INSERT INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps) VALUES ('${P.id}', 'E2E 객실 공급사', 'ALL', 'simulator', 'SANDBOX_VERIFIED', 'AGENCY', 9000)`);
  const created = await api("POST", "/api/v1/partner/products", { token: P.token, body: { title: "E2E 객실 호텔", domain: "HOTEL", city: "서울", price: 80000 } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const hid = created.data.id;
  assert.equal((await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "HOTEL", itemId: hid, startDate: day(101), endDate: day(102), travelers: { adults: 2 } } })).data.code, "ROOM_REQUIRED");
  const roomId = `e2e_ptn_rm_${Date.now().toString(36)}`;
  assert.equal((await api("PATCH", `/api/v1/partner/products/${hid}`, { token: P.token, body: { rooms: [{ id: roomId, name_ko: "디럭스", base_price_krw: 80000, available_inventory: 3, max_occupancy: 2 }] } })).status, 200);
  const hq = { domain: "HOTEL", itemId: hid, unitId: roomId, startDate: day(101), endDate: day(102), travelers: { adults: 2 } };
  assert.ok((await api("POST", "/api/v1/quotes", { token: A.token, body: hq })).data.quote.quoteId, "quotable after rooms set");
  // Partner inventory: closing the date sells nothing; reopening restores.
  assert.equal((await api("PUT", "/api/v1/partner/inventory", { token: P.token, body: { domain: "HOTEL", itemId: hid, unitId: roomId, serviceDate: day(101), allocatedUnits: 3, isClosed: true } })).status, 200);
  assert.equal((await api("POST", "/api/v1/quotes", { token: A.token, body: hq })).data.code, "SOLD_OUT");
  assert.equal((await api("PUT", "/api/v1/partner/inventory", { token: P.token, body: { domain: "HOTEL", itemId: hid, unitId: roomId, serviceDate: day(101), allocatedUnits: 3 } })).status, 200);
  assert.ok((await api("POST", "/api/v1/quotes", { token: A.token, body: hq })).data.quote.quoteId, "quotable after reopen");
  // Price alerts fire through maintenance exactly once.
  const G = await register("alertfire");
  const alert = await api("POST", "/api/v1/price-alerts", { token: G.token, body: { domainType: "ACTIVITY", itemId: "act_disney_tokyo", routeOrHotel: "도쿄", targetPrice: 99999999 } });
  assert.equal(alert.status, 201);
  const maint = await api("POST", "/api/v1/admin/maintenance/run", { token: ADMIN });
  assert.equal(maint.status, 200, JSON.stringify(maint.data));
  assert.ok(maint.data.stats.alertsFired >= 1);
  assert.equal(sql(`SELECT is_active AS v FROM price_alerts WHERE id = '${alert.data.id}'`)[0].v, 0);
  assert.ok(sql(`SELECT COUNT(*) AS c FROM notification_outbox WHERE template = 'PRICE_ALERT' AND recipient = '${G.email}'`)[0].c >= 1);
  // FX rates are writable by ops.
  assert.equal((await api("PUT", "/api/v1/admin/fx-rates", { token: ADMIN, body: { rates: [{ currency: "USD", symbol: "$", rate_to_krw: 1400.5 }] } })).status, 200);
  assert.equal((await api("PUT", "/api/v1/admin/fx-rates", { token: ADMIN, body: { rates: [{ currency: "US", rate_to_krw: 1 }] } })).status, 400);
  const fx = (await api("GET", "/api/v1/fx-rates")).data.rates.find((r) => r.currency === "USD");
  assert.equal(fx.rate_to_krw, 1400.5);
});

test("entities: go-live gate transitions are validated and logged", async () => {
  const list = (await api("GET", "/api/v1/admin/entities", { token: ADMIN })).data;
  assert.ok(list.entities.some((e) => e.id === "ent_primary"));
  assert.equal((await api("PATCH", "/api/v1/admin/entities/ent_nope", { token: ADMIN, body: { status: "ACTIVE" } })).status, 404);
  const tag = Date.now().toString(36);
  const eid = `ent_e2e_${tag}`;
  sql(`INSERT INTO business_entities (id, entity_type, legal_name, status) VALUES ('${eid}', 'CORPORATION', 'E2E 법인', 'DRAFT')`);
  try {
    assert.equal((await api("PATCH", `/api/v1/admin/entities/${eid}`, { token: ADMIN, body: { status: "ACTIVE" } })).data.code, "ENTITY_INCOMPLETE");
    const full = { status: "ACTIVE", business_registration_no: "111-22-33333", travel_agency_license_no: "제2026-1호", ecommerce_registration_no: "제2026-서울-1호", representative_name: "김대표", cs_phone: "02-111-2222" };
    assert.equal((await api("PATCH", `/api/v1/admin/entities/${eid}`, { token: ADMIN, body: full })).status, 200);
    const after = (await api("GET", "/api/v1/admin/entities", { token: ADMIN })).data.entities.find((e) => e.id === eid);
    assert.equal(after.status, "ACTIVE");
    assert.ok(after.effective_from, "ACTIVE stamps effective_from");
    assert.ok(sql(`SELECT COUNT(*) AS c FROM entity_change_log WHERE entity_id = '${eid}'`)[0].c >= 1);
  } finally {
    sql(`DELETE FROM entity_change_log WHERE entity_id = '${eid}'; DELETE FROM business_entities WHERE id = '${eid}'`);
  }
});

test("notices: publish, surface publicly, toggle", async () => {
  assert.equal((await api("POST", "/api/v1/admin/notices", { token: ADMIN, body: { title: "x" } })).status, 400);
  const title = `E2E 공지 ${Date.now().toString(36)}`;
  const created = await api("POST", "/api/v1/admin/notices", { token: ADMIN, body: { title, content: "내용", bannerActive: true } });
  assert.equal(created.status, 201);
  assert.ok((await api("GET", "/api/v1/notices")).data.notices.some((n) => n.title === title));
  assert.equal((await api("PATCH", `/api/v1/admin/notices/${created.data.id}`, { token: ADMIN, body: { bannerActive: false } })).status, 200);
  assert.ok(!(await api("GET", "/api/v1/notices")).data.notices.some((n) => n.title === title));
});

test("passport wallet: encrypted at rest, masked in reads, owner-scoped", async () => {
  const H = await register("pax");
  const passport = "M7654321";
  const saved = await api("POST", "/api/v1/user/passengers", { token: H.token, body: { nameKo: "홍길동", lastNameEn: "HONG", firstNameEn: "GILDONG", passportNumber: passport, passportExpiry: day(900), nationality: "KOR" } });
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  const stored = sql(`SELECT passport_number AS v FROM saved_travelers WHERE id = '${saved.data.id}'`)[0].v;
  assert.ok(stored.startsWith("v1:"), "ciphertext at rest");
  assert.ok(!stored.includes(passport));
  const mine = (await api("GET", "/api/v1/user/passengers", { token: H.token })).data.passengers;
  const row = mine.find((p) => p.id === saved.data.id);
  assert.ok(row, "row readable by owner");
  assert.equal(row.passport_masked, true);
  assert.ok(!String(row.passport_number).includes(passport), "masked in reads");
  assert.equal((await api("GET", "/api/v1/user/passengers", { token: A.token })).data.passengers.some((p) => p.id === saved.data.id), false, "not visible to others");
  assert.equal((await api("DELETE", `/api/v1/user/passengers/${saved.data.id}`, { token: H.token })).status, 200);
});

test("surface smoke: read-only endpoints answer; unregistered affiliate surface stays safe; 410 stubs hold", async () => {
  assert.equal((await api("GET", "/api/v1/feature-flags")).status, 200);
  assert.equal((await api("GET", "/api/v1/admin/feature-flags", { token: ADMIN })).status, 200);
  assert.equal((await api("GET", "/api/v1/suppliers/registry")).status, 404, "public registry removed (#41)");
  assert.equal((await api("GET", "/api/v1/esim/plans")).status, 200);
  assert.equal((await api("GET", "/api/v1/insurance/plans")).status, 200);
  assert.equal((await api("GET", "/api/v1/payments/config")).data.success, true);
  assert.equal((await api("GET", "/api/v1/marketplace/catalog?model=3P")).status, 200);
  assert.equal((await api("GET", "/api/v1/user/coupons", { token: A.token })).status, 200);
  assert.equal((await api("POST", "/api/v1/bookings/calculate", { token: A.token, body: {} })).status, 410);
  assert.equal((await api("POST", "/api/v1/bookings/bkg_x/pay", { token: A.token, body: {} })).status, 410);
  assert.equal((await api("GET", "/out/no_such_partner/xyz")).data.code, "PARTNER_LINK_UNAVAILABLE");
  assert.equal((await api("POST", "/api/v1/webhooks/postback", { body: { partner: "nope", click_id: "c", order_id: "o", amount: 1 } })).data.code, "MISSING_SIGNATURE");
  const ts = String(Math.floor(Date.now() / 1000));
  assert.equal((await api("POST", "/api/v1/webhooks/postback", { headers: { "X-Signature": "x", "X-Timestamp": ts }, body: { partner: "nope", click_id: "c", order_id: "o", amount: 1 } })).data.code, "UNKNOWN_PARTNER");
});

test("small surfaces: moment likes toggle, entity changes read, traveler import, completion cron", async () => {
  const mm = await api("POST", "/api/v1/moments", { token: A.token, body: { title: "E2E 모먼트", content: "내용", city: "서울" } });
  assert.equal(mm.status, 201);
  assert.equal((await api("POST", `/api/v1/moments/${mm.data.id}/like`, { token: A.token })).data.likesCount, 1);
  assert.equal((await api("POST", `/api/v1/moments/${mm.data.id}/like`, { token: A.token })).data.likesCount, 1, "like is idempotent");
  assert.equal((await api("DELETE", `/api/v1/moments/${mm.data.id}/like`, { token: A.token })).data.likesCount, 0);
  assert.equal((await api("POST", "/api/v1/moments/mmt_nope/like", { token: A.token })).status, 404);
  const ch = (await api("GET", "/api/v1/admin/entities/ent_primary/changes", { token: ADMIN })).data;
  assert.ok(Array.isArray(ch.changes));
  assert.equal((await api("GET", "/api/v1/admin/entities/ent_nope/changes", { token: ADMIN })).status, 404);
  // Saved traveler import: wallet row (encrypted) becomes the booking traveler.
  const I = await register("import");
  const pax = await api("POST", "/api/v1/user/passengers", { token: I.token, body: { nameKo: "김여행", lastNameEn: "KIM", firstNameEn: "YOHENG", birthDate: "1990-01-01", passportNumber: "M1122334", passportExpiry: day(900), nationality: "KOR" } });
  assert.equal(pax.status, 201);
  const fq = (await api("POST", "/api/v1/quotes", { token: I.token, body: { domain: "FLIGHT", itemId: "flt_ke703", startDate: fday(60), travelers: { adults: 1 } } })).data.quote;
  const fb = (await api("POST", "/api/v1/bookings", { token: I.token, headers: { "Idempotency-Key": idem() }, body: { quoteId: fq.quoteId, contact, travelers: [{ savedTravelerId: pax.data.id }], consents: TXC } })).data.booking;
  const det = (await api("GET", `/api/v1/bookings/${fb.id}`, { token: I.token })).data.booking;
  assert.equal(det.travelers[0].lastNameEn, "KIM");
  assert.equal(det.travelers[0].firstNameEn, "YOHENG");
  assert.ok(det.travelers[0].passport, "imported passport stored");
  assert.ok(!JSON.stringify(det.travelers[0]).includes("M1122334"), "passport number never serialized");
  const fq2 = (await api("POST", "/api/v1/quotes", { token: I.token, body: { domain: "FLIGHT", itemId: "flt_ke703", startDate: fday(60), travelers: { adults: 1 } } })).data.quote;
  assert.equal((await api("POST", "/api/v1/bookings", { token: I.token, headers: { "Idempotency-Key": idem() }, body: { quoteId: fq2.quoteId, contact, travelers: [{ savedTravelerId: "stv_nope" }], consents: TXC } })).data.code, "SAVED_TRAVELER_NOT_FOUND");
  // Completion: fulfilled + past service_end completes through maintenance.
  const { b } = await fullHotelBooking(A.token, {});
  sql(`UPDATE bookings SET service_end = '2020-01-02' WHERE id = '${b.id}'`);
  const mstat = (await api("POST", "/api/v1/admin/maintenance/run", { token: ADMIN })).data.stats;
  assert.ok(mstat.completed >= 1);
  assert.equal((await api("GET", `/api/v1/bookings/${b.id}`, { token: A.token })).data.booking.status, "COMPLETED");
});

test("affiliate partners: admin register → /out/ 302 → signed postback converts → deactivate blocks", async () => {
  const pid = `e2e_aff_${rnd()}`;
  const SECRET = "e2e_secret_0123456789abcdef";
  const template = "https://partner.example.net/offer/{item_id}?click={click_id}";
  const cfg = { partnerId: pid, name: "E2E 제휴사", deepLinkTemplate: template, affiliateId: "aff_e2e", secretKey: SECRET };
  assert.equal((await api("POST", "/api/v1/admin/affiliate/partners", { body: cfg })).status, 401);
  const created = await api("POST", "/api/v1/admin/affiliate/partners", { token: ADMIN, body: cfg });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.id, pid);
  assert.ok(!JSON.stringify(created.data).includes(SECRET), "secret never echoed");
  assert.equal((await api("POST", "/api/v1/admin/affiliate/partners", { token: ADMIN, body: cfg })).data.code, "ID_EXISTS");
  assert.equal((await api("POST", "/api/v1/admin/affiliate/partners", { token: ADMIN, body: { ...cfg, partnerId: `${pid}x`, deepLinkTemplate: "http://plain.example.net/x" } })).data.code, "INVALID_DEEP_LINK");
  assert.equal((await api("POST", "/api/v1/admin/affiliate/partners", { token: ADMIN, body: { ...cfg, partnerId: `${pid}y`, secretKey: "short" } })).data.code, "WEAK_PARTNER_SECRET");
  assert.equal((await api("POST", "/api/v1/admin/affiliate/partners", { token: ADMIN, body: { ...cfg, partnerId: "NOT-lower" } })).data.code, "INVALID_PARTNER_ID");
  const list = (await api("GET", "/api/v1/admin/affiliate/partners", { token: ADMIN })).data.partners;
  assert.ok(list.some((p) => p.partner_id === pid));
  assert.ok(!JSON.stringify(list).includes(SECRET), "secret never listed");
  // /out/ redirects through the registered template and records the click.
  const redir = await fetch(`${BASE}/out/${pid}/item123?domain=HOTEL`, { redirect: "manual" });
  assert.equal(redir.status, 302);
  const loc = redir.headers.get("location");
  assert.ok(loc.startsWith("https://partner.example.net/offer/item123?click=clk_"), loc);
  const clickId = new URL(loc).searchParams.get("click");
  const orderId = `e2e_ord_${rnd()}`;
  const post = (payload, secret, sigOverride) => {
    const raw = JSON.stringify(payload);
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sigOverride ?? createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
    return { raw, ts, sig };
  };
  const payload = { partner: pid, click_id: clickId, order_id: orderId, amount: 120000, currency: "KRW", commission: 6000 };
  const good = post(payload, SECRET);
  const cv = await fetch(BASE + "/api/v1/webhooks/postback", { method: "POST", headers: { "Content-Type": "application/json", "X-Signature": good.sig, "X-Timestamp": good.ts }, body: good.raw });
  assert.equal(cv.status, 200);
  assert.deepEqual(await cv.json(), { success: true, duplicate: false });
  const dup = post(payload, SECRET);
  const cv2 = await fetch(BASE + "/api/v1/webhooks/postback", { method: "POST", headers: { "Content-Type": "application/json", "X-Signature": dup.sig, "X-Timestamp": dup.ts }, body: dup.raw });
  assert.deepEqual(await cv2.json(), { success: true, duplicate: true });
  const bad = post(payload, SECRET, "0".repeat(64));
  assert.equal((await fetch(BASE + "/api/v1/webhooks/postback", { method: "POST", headers: { "Content-Type": "application/json", "X-Signature": bad.sig, "X-Timestamp": bad.ts }, body: bad.raw })).status, 403);
  const conv = (await api("GET", `/api/v1/admin/affiliate/conversions?q=${orderId}`, { token: ADMIN })).data.conversions;
  assert.ok(conv.some((c) => c.order_id === orderId && c.partner_name === pid));
  // Deactivation blocks both legs immediately.
  assert.equal((await api("PATCH", `/api/v1/admin/affiliate/partners/${pid}`, { token: ADMIN, body: { isActive: false } })).status, 200);
  assert.equal((await api("GET", `/out/${pid}/item123`)).data.code, "PARTNER_LINK_UNAVAILABLE");
  const off = post({ ...payload, order_id: `${orderId}b` }, SECRET);
  assert.equal((await api("POST", "/api/v1/webhooks/postback", { headers: { "X-Signature": off.sig, "X-Timestamp": off.ts }, body: JSON.parse(off.raw) })).data.code, "UNKNOWN_PARTNER");
  assert.equal((await api("PATCH", "/api/v1/admin/affiliate/partners/no_such", { token: ADMIN, body: { isActive: true } })).data.code, "PARTNER_NOT_FOUND");
  sql(`DELETE FROM affiliate_conversions WHERE partner_name = '${pid}'`);
  sql(`DELETE FROM affiliate_clicks WHERE partner_name = '${pid}'`);
  sql(`DELETE FROM affiliate_partners_config WHERE partner_id = '${pid}'`);
});

test("quote: ESIM/INSURANCE rejected with explicit 409; plan listings stay live", async () => {
  for (const d of ["ESIM", "esim", "INSURANCE", "insurance"]) {
    const r = await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: d, itemId: "x", startDate: day(40), travelers: { adults: 1 } } });
    assert.equal(r.status, 409, d);
    assert.equal(r.data.code, "ESIM_INSURANCE_QUOTE_UNSUPPORTED", d);
  }
  assert.equal((await api("GET", "/api/v1/esim/plans")).status, 200);
  assert.equal((await api("GET", "/api/v1/insurance/plans?days=7")).status, 200);
  const reg = (await api("GET", "/api/v1/admin/suppliers/registry", { token: ADMIN })).data.suppliers;
  assert.ok(reg.length >= 6, "six capability specs listed for admins");
  assert.ok(reg.every((s) => s.contractStatus === "PENDING_CONTRACT"), "nothing contracted (#41)");
  assert.ok(!/Amadeus|Agoda|Viator|Airalo|Chubb|Rentalcars/.test(JSON.stringify(reg)), "no vendor names (#41)");
  assert.ok(reg.some((s) => s.supplierCode === "ESIM_GLOBAL_01"), "generic eSIM capability listed");
});

test("p0 money: platform-failure refunds restore coins; fee-cancel voids settlement", async () => {
  const F = await register("p0fail");
  const coins = async () => (await api("GET", "/api/v1/auth/me", { token: F.token })).data.tripCoins;
  const grant = await api("PATCH", `/api/v1/admin/users/${F.id}`, { token: ADMIN, headers: { "Idempotency-Key": idem() }, body: { coinAdjustment: 50000, note: "e2e p0" } });
  assert.equal(grant.status, 200, JSON.stringify(grant.data));
  // 1. Supplier-fail full refund restores coins (P0 #1).
  const q1 = (await quote(F.token, { coinAmount: 5000 })).data.quote;
  const b1 = (await book(F.token, q1, { simulation: { supplier: "fail" } })).data.booking;
  const p1 = await pay(F.token, b1);
  assert.equal(p1.data.booking.status, "REFUNDED");
  assert.equal(await coins(), 50000, "coins restored on supplier-fail refund");
  // 2. PG amount-mismatch FAILED restores coins (P0 #2).
  const q2 = (await quote(F.token, { coinAmount: 4000 })).data.quote;
  const b2 = (await book(F.token, q2)).data.booking;
  const p2 = await pay(F.token, b2, "mismatch");
  assert.equal(p2.data.code, "PG_AMOUNT_MISMATCH");
  assert.equal((await api("GET", `/api/v1/bookings/${b2.id}`, { token: F.token })).data.booking.status, "FAILED");
  assert.equal(await coins(), 50000, "coins restored on mismatch FAILED");
  // 3. Lost payment reconciled to FAILED restores coins (P0 #2).
  const q3 = (await quote(F.token, { coinAmount: 3000 })).data.quote;
  const b3 = (await book(F.token, q3)).data.booking;
  const p3 = await pay(F.token, b3, "lost");
  assert.equal(p3.data.booking.status, "MANUAL_REVIEW_REQUIRED");
  await api("POST", "/api/v1/admin/maintenance/run", { token: ADMIN });
  assert.equal((await api("GET", `/api/v1/bookings/${b3.id}`, { token: F.token })).data.booking.status, "FAILED");
  assert.equal(await coins(), 50000, "coins restored on reconciled FAILED");
  // 4. Operator REJECT on an uncaptured booking under review restores coins + releases holds (P0 #2).
  const q4 = (await quote(F.token, { coinAmount: 2000 })).data.quote;
  const b4 = (await book(F.token, q4)).data.booking;
  assert.equal((await pay(F.token, b4, "lost")).data.booking.status, "MANUAL_REVIEW_REQUIRED");
  const rj = await api("POST", `/api/v1/admin/bookings/${b4.id}/supplier-decision`, { token: ADMIN, body: { decision: "REJECT", note: "e2e" } });
  assert.equal(rj.status, 200, JSON.stringify(rj.data));
  assert.equal(rj.data.booking.status, "FAILED");
  assert.equal(await coins(), 50000, "coins restored on unpaid REJECT");
  assert.equal(sql(`SELECT COUNT(*) AS c FROM inventory_holds WHERE booking_id = '${b4.id}' AND status != 'RELEASED'`)[0].c, 0);
  // 5. Fee-cancel voids the seller payout (P0 #3).
  const q5 = (await quote(F.token)).data.quote;
  const b5 = (await book(F.token, q5)).data.booking;
  const p5 = await pay(F.token, b5);
  assert.equal(p5.data.booking.status, "VOUCHER_ISSUED");
  assert.equal(sql(`SELECT settlement_status AS s FROM marketplace_order_settlements WHERE booking_id = '${b5.id}'`)[0].s, "PENDING");
  sql(`UPDATE bookings SET cancellation_policy_json = '{"type":"FREE_UNTIL","freeUntil":"2020-01-01T00:00:00.000Z","feeBpsAfter":5000,"source":"CATALOG_RULE"}' WHERE id = '${b5.id}'`);
  const c5 = await api("POST", `/api/v1/bookings/${b5.id}/cancel`, { token: F.token });
  assert.equal(c5.data.booking.status, "REFUNDED");
  assert.ok(c5.data.booking.cancellationFeeMinor > 0 && c5.data.booking.refundedMinor > 0, "partial refund");
  assert.equal(sql(`SELECT settlement_status AS s FROM marketplace_order_settlements WHERE booking_id = '${b5.id}'`)[0].s, "REFUNDED", "fee-cancel voids payout");
  assert.equal(sql(`SELECT COALESCE(SUM(delta), 0) AS s FROM coin_ledger WHERE user_id = '${F.id}'`)[0].s, 50000, "no double restore");
});

test("p0 inventory: unconfigured products refuse sale; capacity caps oversell", async () => {
  const P = await approvedPartner("cap");
  sql(`INSERT INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps) VALUES ('${P.id}', 'E2E 수용량 공급사', 'ALL', 'simulator', 'SANDBOX_VERIFIED', 'AGENCY', 9000)`);
  const reg = await api("POST", "/api/v1/partner/marketplace/products", { token: P.token, body: { title: "E2E 수용량 투어", domain: "ACTIVITY", city: "서울", price: 30000 } });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const itemId = reg.data.product.item_id;
  const svc = day(140 + (Date.now() % 40)); // per-run date: committed holds never release
  const ask = (d) => api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "ACTIVITY", itemId, startDate: d, travelers: { adults: 1 } } });
  assert.equal((await ask(svc)).data.code, "INVENTORY_NOT_CONFIGURED");
  assert.equal((await api("PATCH", `/api/v1/admin/catalog/ACTIVITY/${itemId}`, { token: ADMIN, body: { daily_capacity: 1 } })).status, 200);
  const q1 = (await ask(svc)).data.quote;
  assert.ok(q1.quoteId, JSON.stringify(q1));
  const b1 = (await book(A.token, q1)).data.booking;
  assert.ok(b1.id);
  assert.equal((await ask(svc)).data.code, "SOLD_OUT", "capacity 1 already held");
  const p1 = await pay(A.token, b1);
  assert.equal(p1.data.booking.status, "VOUCHER_ISSUED");
  assert.equal((await ask(svc)).data.code, "SOLD_OUT", "committed hold still counts");
});

test("p0 calendar: default-unit closure blocks sale; overrides reprice dates", async () => {
  const P = await approvedPartner("cal");
  sql(`INSERT INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps) VALUES ('${P.id}', 'E2E 캘린더 공급사', 'ALL', 'simulator', 'SANDBOX_VERIFIED', 'AGENCY', 9000)`);
  const reg = await api("POST", "/api/v1/partner/marketplace/products", { token: P.token, body: { title: "E2E 캘린더 투어", domain: "ACTIVITY", city: "서울", price: 30000, capacity: 5 } });
  const itemId = reg.data.product.item_id;
  const D = day(170 + (Date.now() % 20));
  const ask = () => api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "ACTIVITY", itemId, startDate: D, travelers: { adults: 1 } } });
  // Closure written the way the extranet calendar writes it (unitId default) blocks the sale.
  assert.equal((await api("PUT", "/api/v1/partner/inventory", { token: P.token, body: { domain: "ACTIVITY", itemId, unitId: "default", serviceDate: D, allocatedUnits: 5, isClosed: true } })).status, 200);
  assert.equal((await ask()).data.code, "SOLD_OUT");
  // Reopen with a price override: the quote reprices to the calendar rate.
  assert.equal((await api("PUT", "/api/v1/partner/inventory", { token: P.token, body: { domain: "ACTIVITY", itemId, unitId: "default", serviceDate: D, allocatedUnits: 5, priceOverrideMinor: 45000 } })).status, 200);
  const q = (await ask()).data.quote;
  assert.equal(q.totalMinor, 45000, JSON.stringify(q));
  const b = (await book(A.token, q)).data.booking;
  assert.equal((await pay(A.token, b)).data.booking.status, "VOUCHER_ISSUED");
  // Hotel nightly overrides price each night; revalidation agrees.
  const created = await api("POST", "/api/v1/partner/products", { token: P.token, body: { title: "E2E 캘린더 호텔", domain: "HOTEL", city: "서울", price: 100000 } });
  const hid = created.data.id;
  const roomId = `e2e_cal_rm_${Date.now().toString(36)}`;
  assert.equal((await api("PATCH", `/api/v1/partner/products/${hid}`, { token: P.token, body: { rooms: [{ id: roomId, name_ko: "디럭스", base_price_krw: 100000, available_inventory: 5, max_occupancy: 2 }] } })).status, 200);
  const shift = Date.now() % 20;
  const N1 = day(190 + shift);
  const N2 = day(191 + shift);
  const put = (d, minor) => api("PUT", "/api/v1/partner/inventory", { token: P.token, body: { domain: "HOTEL", itemId: hid, unitId: roomId, serviceDate: d, allocatedUnits: 5, priceOverrideMinor: minor } });
  assert.equal((await put(N1, 120000)).status, 200);
  assert.equal((await put(N2, 80000)).status, 200);
  const hq = (await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "HOTEL", itemId: hid, unitId: roomId, startDate: N1, endDate: day(192 + shift), travelers: { adults: 2 } } })).data.quote;
  assert.equal(hq.baseMinor, 200000, JSON.stringify(hq.lines));
  assert.equal(hq.totalMinor, 220000);
  assert.equal(hq.lines.filter((l) => l.code === "ROOM_NIGHT").length, 2);
  const hb = (await book(A.token, hq)).data.booking;
  assert.equal((await pay(A.token, hb)).data.booking.status, "VOUCHER_ISSUED");
});

test("A3: booking requires all three tx consents; stale versions rejected", async () => {
  const q1 = (await quote(A.token)).data.quote;
  const no = await book(A.token, q1, { consents: false });
  assert.equal(no.data.code, "CONSENT_REQUIRED");
  const q2 = (await quote(A.token)).data.quote;
  const partial = await book(A.token, q2, { consents: { refundPolicy: TXC.refundPolicy } });
  assert.equal(partial.data.code, "CONSENT_REQUIRED");
  const q3 = (await quote(A.token)).data.quote;
  const stale = await book(A.token, q3, { consents: { refundPolicy: "0.0", privacy: "0.0", thirdParty: "0.0" } });
  assert.equal(stale.data.code, "CONSENT_STALE");
  const q4 = (await quote(A.token)).data.quote;
  const ok = await book(A.token, q4);
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  // Registration recorded TERMS + PRIVACY against legal versions.
  const rows = sql(`SELECT consent_type, version, agreed FROM user_consents WHERE user_id = '${A.id}'`);
  assert.ok(rows.some((r) => r.consent_type === "TERMS" && r.agreed === 1));
  assert.ok(rows.some((r) => r.consent_type === "PRIVACY" && r.agreed === 1));
  assert.ok(rows.some((r) => r.consent_type === "THIRD_PARTY_SUPPLIER" && r.agreed === 1 && r.version === TXC.privacy));
});

test("A4: marketing consent toggles and every change is recorded with a date", async () => {
  const M = await register("mktg");
  const on = await api("PATCH", "/api/v1/auth/me", { token: M.token, body: { fullName: "QA mktg", phoneNumber: "+82-10-0000-0001", marketingConsent: true } });
  assert.equal(on.status, 200);
  assert.equal(on.data.marketingConsent, true);
  const off = await api("PATCH", "/api/v1/auth/me", { token: M.token, body: { fullName: "QA mktg", phoneNumber: "+82-10-0000-0001", marketingConsent: false } });
  assert.equal(off.status, 200);
  assert.equal(off.data.marketingConsent, false);
  const rows = sql(`SELECT agreed, agreed_at, version FROM user_consents WHERE user_id = '${M.id}' AND consent_type = 'MARKETING' ORDER BY agreed_at`);
  assert.equal(rows.length, 3, "register default + opt-in + opt-out");
  assert.deepEqual(rows.map((r) => r.agreed), [0, 1, 0]);
  assert.ok(rows.every((r) => r.agreed_at && r.version));
});

test("A1: withdrawal blocked by active booking; wrong password rejected; success purges PII and retains records", async () => {
  const W = await register("wdraw");
  const { b } = await fullHotelBooking(W.token, {});
  assert.equal((await api("POST", "/api/v1/auth/me/withdraw", { token: W.token, body: { password: "Passw0rd-QA-1" } })).data.code, "WITHDRAWAL_BLOCKED");
  assert.equal((await api("POST", "/api/v1/auth/me/withdraw", { token: W.token, body: { password: "wrong-pw-1234" } })).status, 401);
  sql(`UPDATE bookings SET status = 'COMPLETED' WHERE id = '${b.id}'`);
  const w = await api("POST", "/api/v1/auth/me/withdraw", { token: W.token, body: { password: "Passw0rd-QA-1", reason: "E2E" } });
  assert.equal(w.status, 200, JSON.stringify(w.data));
  const u = sql(`SELECT status, email, full_name, phone_number, trip_coins FROM users WHERE id = '${W.id}'`)[0];
  assert.equal(u.status, "DELETED");
  assert.ok(u.email.startsWith("deleted_"), u.email);
  assert.equal(u.full_name, "탈퇴회원");
  assert.equal(u.phone_number, null);
  assert.equal(u.trip_coins, 0);
  const retained = sql(`SELECT record_type FROM retained_records WHERE user_id = '${W.id}'`);
  assert.ok(retained.some((r) => r.record_type === "BOOKING"), "contract record retained");
  assert.ok(retained.some((r) => r.record_type === "PAYMENT"), "payment record retained");
  assert.equal((await api("POST", "/api/v1/auth/login", { body: { email: W.email, password: "Passw0rd-QA-1" } })).status, 401);
  assert.equal((await api("GET", "/api/v1/auth/me", { token: W.token })).status, 401);
});

test("A8: admin suspends with reason → sessions die → unsuspend restores; self-suspend refused", async () => {
  const S = await register("susp");
  assert.equal((await api("PATCH", `/api/v1/admin/users/${S.id}`, { token: ADMIN, body: { isActive: false } })).data.code, "REASON_REQUIRED");
  const susp = await api("PATCH", `/api/v1/admin/users/${S.id}`, { token: ADMIN, body: { isActive: false, reason: "E2E fraud probe" } });
  assert.equal(susp.status, 200, JSON.stringify(susp.data));
  assert.equal((await api("POST", "/api/v1/auth/login", { body: { email: S.email, password: "Passw0rd-QA-1" } })).data.code, "ACCOUNT_SUSPENDED");
  assert.equal((await api("GET", "/api/v1/auth/me", { token: S.token })).status, 401);
  const uns = await api("PATCH", `/api/v1/admin/users/${S.id}`, { token: ADMIN, body: { isActive: true } });
  assert.equal(uns.status, 200);
  assert.equal((await api("POST", "/api/v1/auth/login", { body: { email: S.email, password: "Passw0rd-QA-1" } })).status, 200);
  // Self-suspend is refused; the admin list now carries account status.
  const me = (await api("GET", "/api/v1/auth/me", { token: ADMIN })).data;
  assert.equal((await api("PATCH", `/api/v1/admin/users/${me.id}`, { token: ADMIN, body: { isActive: false, reason: "x" } })).data.code, "CANNOT_SUSPEND_SELF");
  const listed = (await api("GET", `/api/v1/admin/users?q=${encodeURIComponent(S.email)}`, { token: ADMIN })).data.users[0];
  assert.equal(listed.status, "ACTIVE");
});

test("A7: booking detail discloses per-order sales type and supplier", async () => {
  const { b } = await fullHotelBooking(A.token, {});
  const det = (await api("GET", `/api/v1/bookings/${b.id}`, { token: A.token })).data.booking;
  assert.ok(["DIRECT_1P", "AGENCY_3P"].includes(det.salesType), JSON.stringify(det.salesType));
  assert.ok(det.salesTypeLabel, "label present");
  assert.ok(det.supplierName, "supplier name present");
});

test("B1: PG-confirmed external cancel syncs booking, refund, holds, coins, payout; duplicates ignored", async () => {
  const W = await register("extcx");
  assert.equal((await api("PATCH", `/api/v1/admin/users/${W.id}`, { token: ADMIN, headers: { "Idempotency-Key": idem() }, body: { coinAdjustment: 5000, note: "e2e b1" } })).status, 200);
  const { b, p } = await fullHotelBooking(W.token, {}, "extcancel", { coinAmount: 1000 });
  assert.equal(p.data.booking.status, "VOUCHER_ISSUED");
  assert.equal(sql(`SELECT trip_coins AS v FROM users WHERE id = '${W.id}'`)[0].v, 4000);
  const hook = { eventType: "PAYMENT_CANCELED", data: { orderId: b.id, paymentKey: "toss_hint", status: "CANCELED" } };
  const w1 = await api("POST", "/api/v1/webhooks/toss", { body: hook });
  assert.equal(w1.data.action, "RECONCILED_EXTERNAL_CANCEL", JSON.stringify(w1.data));
  const det = (await api("GET", `/api/v1/bookings/${b.id}`, { token: W.token })).data.booking;
  assert.equal(det.status, "REFUNDED");
  assert.equal(det.refunds.length, 1);
  assert.equal(det.refunds[0].source, "EXTERNAL");
  assert.equal(det.payments[0].status, "REFUNDED");
  assert.equal(sql(`SELECT settlement_status AS v FROM marketplace_order_settlements WHERE booking_id = '${b.id}'`)[0].v, "REFUNDED");
  assert.equal(sql(`SELECT trip_coins AS v FROM users WHERE id = '${W.id}'`)[0].v, 5000, "coins restored");
  assert.equal(sql(`SELECT COUNT(*) AS v FROM inventory_holds WHERE booking_id = '${b.id}' AND status != 'RELEASED'`)[0].v, 0);
  const w2 = await api("POST", "/api/v1/webhooks/toss", { body: hook });
  assert.equal(w2.data.duplicate, true);
  assert.equal(sql(`SELECT COUNT(*) AS v FROM refunds WHERE booking_id = '${b.id}'`)[0].v, 1, "no double record");
});

test("B1: external partial cancel records the delta and keeps the live order", async () => {
  const W = await register("extpt");
  const { b, p } = await fullHotelBooking(W.token, {}, "extpartial");
  assert.equal(p.data.booking.status, "VOUCHER_ISSUED");
  const total = Number(sql(`SELECT amount_minor AS v FROM payments WHERE booking_id = '${b.id}'`)[0].v);
  const w = await api("POST", "/api/v1/webhooks/toss", { body: { eventType: "PAYMENT_STATUS_CHANGED", data: { orderId: b.id, status: "PARTIAL_CANCELED" } } });
  assert.equal(w.data.action, "RECONCILED_EXTERNAL_CANCEL");
  const det = (await api("GET", `/api/v1/bookings/${b.id}`, { token: W.token })).data.booking;
  assert.equal(det.status, "VOUCHER_ISSUED", "live order stays live");
  assert.equal(det.paymentStatus, "PARTIALLY_REFUNDED");
  assert.equal(det.refunds[0].amount_minor, Math.floor(total / 2));
});

test("B3: post-payout refund becomes a recovery claim auto-deducted from the next payout", async () => {
  // #79 finding: 1P rows carry no seller payout, so the payout endpoint
  // refuses them — recovery mechanics run on 3P rails, where money moves.
  const P = await approvedPartner("recov");
  sql(`INSERT INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps) VALUES ('${P.id}', 'E2E B3 공급사', 'ALL', 'simulator', 'SANDBOX_VERIFIED', 'AGENCY', 9000)`);
  const reg = await api("POST", "/api/v1/partner/marketplace/products", { token: P.token, body: { title: "E2E B3 투어", domain: "ACTIVITY", city: "서울", price: 50000, capacity: 10 } });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const itemId = reg.data.product.item_id;
  const R = await register("recov");
  const mk = async () => {
    const q = (await api("POST", "/api/v1/quotes", { token: R.token, body: { domain: "ACTIVITY", itemId, startDate: day(95), travelers: { adults: 1 } } })).data.quote;
    const b = (await book(R.token, q)).data.booking;
    const p = await pay(R.token, b);
    assert.equal(p.data.booking.status, "VOUCHER_ISSUED");
    sql(`UPDATE bookings SET status = 'COMPLETED', service_end = '2020-01-02' WHERE id = '${b.id}'`);
    return b;
  };
  const b1 = await mk();
  const b2 = await mk();
  const s1 = sql(`SELECT * FROM marketplace_order_settlements WHERE booking_id = '${b1.id}'`)[0];
  assert.equal((await api("PATCH", `/api/v1/admin/marketplace/settlements/${s1.id}/settle`, { token: ADMIN })).status, 200);
  // Post-payout admin refund (the approval): money out + OPEN claim, not silent loss.
  const rf = await api("POST", `/api/v1/admin/bookings/${b1.id}/refund`, { token: ADMIN, body: { amountMinor: b1.totalMinor, reason: "E2E 지급 후 환불" } });
  assert.equal(rf.data.booking.status, "REFUNDED", JSON.stringify(rf.data));
  const claims = sql(`SELECT * FROM settlement_recoveries WHERE booking_id = '${b1.id}'`);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].status, "OPEN");
  assert.equal(claims[0].amount_minor, b1.totalMinor);
  // #17: the claim is a booked receivable funding the refund (never phantom).
  const cj = sql(`SELECT account, direction, amount_minor FROM ledger_entries WHERE booking_id = '${b1.id}' AND event_type = 'SETTLEMENT_RECOVERY_RAISED'`);
  assert.equal(cj.length, 2);
  assert.ok(cj.some((l) => l.account === "SELLER_CLAIM_RECEIVABLE" && l.direction === "DEBIT" && l.amount_minor === b1.totalMinor));
  assert.ok(cj.some((l) => l.account === "CUSTOMER_DEPOSITS" && l.direction === "CREDIT" && l.amount_minor === b1.totalMinor));
  const dep1 = sql(`SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount_minor ELSE -amount_minor END),0) AS d FROM ledger_entries WHERE booking_id = '${b1.id}' AND account = 'CUSTOMER_DEPOSITS'`)[0].d;
  assert.equal(dep1, 0, "post-payout refund leaves no stranded deposits");
  assert.equal((await api("GET", "/api/v1/admin/marketplace/recoveries?status=OPEN", { token: ADMIN })).data.recoveries.length >= 1, true);
  // Next payout to the same seller auto-deducts the claim.
  const s2 = sql(`SELECT * FROM marketplace_order_settlements WHERE booking_id = '${b2.id}'`)[0];
  assert.equal(s2.seller_id, s1.seller_id);
  const st = await api("PATCH", `/api/v1/admin/marketplace/settlements/${s2.id}/settle`, { token: ADMIN });
  assert.equal(st.status, 200, JSON.stringify(st.data));
  const expectDed = Math.min(Number(s2.seller_payout_minor), b1.totalMinor);
  assert.equal(st.data.payout.recoveryDeductedMinor, expectDed);
  assert.equal(st.data.payout.netMinor, Number(s2.seller_payout_minor) - expectDed);
});

test("B3: auto-refund on a settled order parks for approval instead of paying twice", async () => {
  const P = await approvedPartner("guard");
  sql(`INSERT INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps) VALUES ('${P.id}', 'E2E B3가드 공급사', 'ALL', 'simulator', 'SANDBOX_VERIFIED', 'AGENCY', 9000)`);
  const reg = await api("POST", "/api/v1/partner/marketplace/products", { token: P.token, body: { title: "E2E B3가드 투어", domain: "ACTIVITY", city: "서울", price: 50000, capacity: 10 } });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const G = await register("guard");
  const q = (await api("POST", "/api/v1/quotes", { token: G.token, body: { domain: "ACTIVITY", itemId: reg.data.product.item_id, startDate: day(95), travelers: { adults: 1 } } })).data.quote;
  const b = (await book(G.token, q)).data.booking;
  assert.equal((await pay(G.token, b)).data.booking.status, "VOUCHER_ISSUED");
  sql(`UPDATE bookings SET status = 'COMPLETED', service_end = '2020-01-02' WHERE id = '${b.id}'`);
  const s = sql(`SELECT id FROM marketplace_order_settlements WHERE booking_id = '${b.id}'`)[0];
  assert.equal((await api("PATCH", `/api/v1/admin/marketplace/settlements/${s.id}/settle`, { token: ADMIN })).status, 200);
  // Legacy early-settled live order: flip back to a cancellable live state.
  sql(`UPDATE bookings SET status = 'VOUCHER_ISSUED' WHERE id = '${b.id}'`);
  const c = await api("POST", `/api/v1/bookings/${b.id}/cancel`, { token: G.token });
  assert.equal(c.data.booking.status, "MANUAL_REVIEW_REQUIRED", JSON.stringify(c.data.booking));
  assert.equal(c.data.booking.statusReason, "SETTLED_REFUND_NEEDS_APPROVAL");
  assert.equal(sql(`SELECT COUNT(*) AS v FROM refunds WHERE booking_id = '${b.id}' AND status = 'PENDING'`)[0].v, 0);
});

test("B7: force-cancel, manual partial refund, and offline refund with masked customer view", async () => {
  const F = await register("force");
  const { b: bf } = await fullHotelBooking(F.token, {});
  const fc = await api("POST", `/api/v1/admin/bookings/${bf.id}/force-cancel`, { token: ADMIN, body: { reason: "E2E 공급사 폐업" } });
  assert.equal(fc.data.booking.status, "REFUNDED", JSON.stringify(fc.data));
  assert.equal(fc.data.booking.refunds[0].source, "ADMIN_MANUAL");
  const { b: bp } = await fullHotelBooking(F.token, {});
  const half = Math.floor(bp.totalMinor / 2);
  const pr = await api("POST", `/api/v1/admin/bookings/${bp.id}/refund`, { token: ADMIN, body: { amountMinor: half, reason: "E2E CS 부분보상" } });
  assert.equal(pr.data.booking.status, "REFUNDED");
  assert.equal(pr.data.booking.paymentStatus, "PARTIALLY_REFUNDED");
  assert.equal(pr.data.booking.refundedMinor, half);
  assert.ok(pr.data.booking.cancellationFeeMinor > 0, "retained remainder recorded as fee");
  const { b: bo } = await fullHotelBooking(F.token, {});
  const bad = await api("POST", `/api/v1/admin/bookings/${bo.id}/offline-refund`, { token: ADMIN, body: { amountMinor: 1000, reason: "x" } });
  assert.equal(bad.data.code, "OFFLINE_DETAIL_REQUIRED");
  const off = await api("POST", `/api/v1/admin/bookings/${bo.id}/offline-refund`, { token: ADMIN, body: { amountMinor: bo.totalMinor, bank: "신한은행", account: "110123456789", reason: "E2E PG 장애 수기환불" } });
  assert.equal(off.data.booking.status, "REFUNDED", JSON.stringify(off.data));
  assert.equal(off.data.booking.refunds[0].source, "OFFLINE");
  assert.equal(off.data.booking.refunds[0].offline.account, "110123456789", "admin sees full account");
  const cust = (await api("GET", `/api/v1/bookings/${bo.id}`, { token: F.token })).data.booking;
  assert.ok(!JSON.stringify(cust.refunds[0].offline).includes("110123456789"), "customer sees masked account");
  assert.equal(cust.refunds[0].offline.bank, "신한은행");
});

test("B4/B5: payout statement JSON + CSV carry settled lines, tax email, and payout account", async () => {
  const P = await approvedPartner("stmt");
  sql(`INSERT INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps) VALUES ('${P.id}', 'E2E 명세 공급사', 'ALL', 'simulator', 'SANDBOX_VERIFIED', 'AGENCY', 9000)`);
  const reg = await api("POST", "/api/v1/partner/marketplace/products", { token: P.token, body: { title: "E2E 명세 투어", domain: "ACTIVITY", city: "서울", price: 50000, capacity: 10 } });
  const itemId = reg.data.product.item_id;
  const q = (await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "ACTIVITY", itemId, startDate: day(96), travelers: { adults: 1 } } })).data.quote;
  const b = (await book(A.token, q)).data.booking;
  assert.equal((await pay(A.token, b)).data.booking.status, "VOUCHER_ISSUED");
  sql(`UPDATE bookings SET status = 'COMPLETED', service_end = '2020-01-02' WHERE id = '${b.id}'`);
  const s = sql(`SELECT id FROM marketplace_order_settlements WHERE booking_id = '${b.id}'`)[0];
  assert.equal((await api("PATCH", `/api/v1/admin/marketplace/settlements/${s.id}/settle`, { token: ADMIN })).status, 200);
  const batchId = sql(`SELECT payout_batch_id AS v FROM marketplace_order_settlements WHERE id = '${s.id}'`)[0].v;
  const st = await api("GET", `/api/v1/admin/marketplace/batches/${batchId}/statement`, { token: ADMIN });
  assert.equal(st.status, 200);
  assert.equal(st.data.issuance, "MANUAL");
  assert.ok(st.data.lines.length >= 1);
  assert.ok(typeof st.data.lines[0].net_payout_minor === "number");
  const res = await fetch(`${BASE}/api/v1/admin/marketplace/batches/${batchId}/statement?format=csv`, { headers: { Authorization: `Bearer ${ADMIN}` } });
  const csv = await res.text();
  assert.ok(csv.includes("net_payout_minor"), csv.slice(0, 200));
  assert.ok(csv.includes("tax_invoice_email"), csv.slice(0, 300));
});

test("B6: customer receipt exposes recorded payments, refunds, and totals", async () => {
  const { b, p } = await fullHotelBooking(B.token, {});
  assert.equal(p.data.booking.status, "VOUCHER_ISSUED");
  const r = await api("GET", `/api/v1/bookings/${b.id}/receipt`, { token: B.token });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.receipt.bookingNumber, b.bookingNumber);
  assert.equal(r.data.receipt.paidMinor, b.totalMinor);
  assert.equal(r.data.receipt.payments.length, 1);
  assert.equal(r.data.receipt.payments[0].amountMinor, b.totalMinor);
  assert.ok(r.data.receipt.issuedAt);
  assert.equal((await api("GET", `/api/v1/bookings/${b.id}/receipt`, { token: A.token })).status, 403);
});

// ---------------------------------------------------------------------------
// Phase 6e (P1 #38-47): fulfilment truth.
// ---------------------------------------------------------------------------

test("#38: calendar closed after quote blocks booking; closed after booking blocks payment", async () => {
  const U = await register("cal38");
  const close = (id, date) => sql(`INSERT INTO partner_inventory (id, partner_id, domain_type, item_id, unit_id, service_date, allocated_units, is_closed) VALUES ('${id}', 'ptn_htl_01', 'HOTEL', 'htl_seoul_01', 'rm_seoul_01_dlx', '${date}', 5, 1)`);
  // Booking-time recheck: quote passes, partner closes the date, booking refuses.
  const q1 = (await quote(U.token, { startDate: day(200), endDate: day(201) })).data.quote;
  assert.ok(q1?.quoteId, "quote before close");
  const pin1 = `pinv_${rnd()}`;
  try {
    close(pin1, day(200));
    const blocked = await book(U.token, q1);
    assert.equal(blocked.status, 409, JSON.stringify(blocked.data));
    assert.equal(blocked.data.code, "SOLD_OUT");
  } finally {
    sql(`DELETE FROM partner_inventory WHERE id = '${pin1}'`);
  }
  // Payment-time revalidation: book passes, partner closes, payment refuses + expires.
  const q2 = (await quote(U.token, { startDate: day(202), endDate: day(203) })).data.quote;
  const b2 = (await book(U.token, q2)).data.booking;
  assert.equal(b2.status, "AWAITING_PAYMENT");
  const pin2 = `pinv_${rnd()}`;
  try {
    close(pin2, day(202));
    const denied = await pay(U.token, b2);
    assert.equal(denied.status, 409, JSON.stringify(denied.data));
    assert.equal(denied.data.code, "SOLD_OUT");
    assert.equal((await api("GET", `/api/v1/bookings/${b2.id}`, { token: U.token })).data.booking.status, "EXPIRED");
    assert.equal(sql(`SELECT id FROM inventory_holds WHERE booking_id = '${b2.id}' AND status != 'RELEASED'`).length, 0, "holds released");
  } finally {
    sql(`DELETE FROM partner_inventory WHERE id = '${pin2}'`);
  }
});

test("#39/#40: unsellable-domain 1P rows are paused out of the public catalog", async () => {
  const items = (await api("GET", "/api/v1/marketplace/catalog?model=1P")).data.items;
  for (const d of ["ESIM", "INSURANCE", "FLIGHT", "TRAIN"]) {
    assert.ok(!items.some((it) => it.domain_type === d), `no ${d} in public 1P catalog`);
  }
  assert.equal((await api("GET", "/api/v1/marketplace/catalog?domain=ESIM")).data.items.length, 0);
  // Rows survive as PAUSED so settlement attribution (no status filter) still resolves.
  const rows = sql("SELECT id, status FROM marketplace_catalog_items WHERE id IN ('mkt_esim_jp_01','mkt_ins_standard','mkt_flt_ke723','mkt_trn_ktx_025')");
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.status === "PAUSED"), JSON.stringify(rows));
  // Flight search annotates bookability so the UI fails closed (#39 CTA gate).
  const fl = (await api("GET", "/api/v1/flights?limit=5")).data.data;
  assert.ok(fl.length >= 1, "seeded flights listed");
  assert.ok(fl.every((f) => typeof f.bookable === "boolean"), "every flight carries bookable");
});

test("#41: supplier registry is admin-only", async () => {
  assert.equal((await api("GET", "/api/v1/admin/suppliers/registry")).status, 401);
  assert.equal((await api("GET", "/api/v1/admin/suppliers/registry", { token: A.token })).status, 403);
  const r = await api("GET", "/api/v1/admin/suppliers/registry", { token: ADMIN });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.suppliers.length >= 6);
});

test("#42: instant-confirm badge follows fulfilment mode, not the row flag", async () => {
  const tag = `E2EINSTANT${rnd()}`.toUpperCase();
  const aid = `act_${rnd()}`;
  sql(`INSERT INTO activities (id, partner_id, title, category, city, country, price_krw, instant_confirmation, is_active) VALUES ('${aid}', 'ptn_tour_01', '${tag}', 'TICKET', 'Seoul', 'KR', 10000, 1, 1)`);
  const before = sql("SELECT adapter, integration_status FROM suppliers WHERE id = 'ptn_tour_01'")[0];
  try {
    // Dev simulator auto-confirms: badge on, filter matches.
    let hits = (await api("GET", `/api/v1/activities?q=${tag}`)).data.data;
    assert.equal(hits.length, 1, JSON.stringify(hits));
    assert.equal(hits[0].instant_confirmed, true);
    assert.equal((await api("GET", "/api/v1/activities?instant=true")).data.data.some((a) => a.id === aid), true);
    // Direct-contract always PENDING: badge off, filter excludes. Flip through
    // the admin API (SANDBOX_VERIFIED needs no contract) so the bookability
    // cache invalidates in the same call.
    const flip = await api("PATCH", "/api/v1/admin/suppliers/ptn_tour_01", { token: ADMIN, body: { adapter: "direct_contract", integrationStatus: "SANDBOX_VERIFIED" } });
    assert.equal(flip.status, 200, JSON.stringify(flip.data));
    hits = (await api("GET", `/api/v1/activities?q=${tag}`)).data.data;
    assert.equal(hits.length, 1);
    assert.equal(hits[0].instant_confirmed, false, "direct-contract never instant");
    assert.equal((await api("GET", "/api/v1/activities?instant=true")).data.data.some((a) => a.id === aid), false);
  } finally {
    await api("PATCH", "/api/v1/admin/suppliers/ptn_tour_01", { token: ADMIN, body: { adapter: before.adapter, integrationStatus: before.integration_status, notes: "e2e #42 restore" } });
    sql(`DELETE FROM activities WHERE id = '${aid}'`);
  }
});

test("#43: trains/packages resolve per-product suppliers; unwired rows cannot sell", async () => {
  const U = await register("sup43");
  // Unwired: the shared unassigned_* placeholder refuses.
  const t0 = await api("POST", "/api/v1/quotes", { token: U.token, body: { domain: "TRAIN", itemId: "trn_ktx_025", startDate: day(210), travelers: { adults: 1 } } });
  assert.equal(t0.status, 409, JSON.stringify(t0.data));
  assert.equal(t0.data.code, "NOT_DIRECTLY_BOOKABLE");
  const p0 = await api("POST", "/api/v1/quotes", { token: U.token, body: { domain: "PACKAGE", itemId: "pkg_osaka_3d2n", startDate: day(210), travelers: { adults: 2 } } });
  assert.equal(p0.status, 409, JSON.stringify(p0.data));
  // Wire a scratch simulator supplier: per-product quotes work.
  const sid = `e2e_sup_${rnd()}`;
  sql(`INSERT INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps) VALUES ('${sid}', 'E2E', 'ALL', 'simulator', 'NOT_INTEGRATED', 'AGENCY', 9000)`);
  try {
    sql(`UPDATE trains SET partner_id = '${sid}' WHERE id = 'trn_ktx_025'`);
    sql(`UPDATE packages SET partner_id = '${sid}' WHERE id = 'pkg_osaka_3d2n'`);
    const t1 = await api("POST", "/api/v1/quotes", { token: U.token, body: { domain: "TRAIN", itemId: "trn_ktx_025", startDate: day(211), travelers: { adults: 1 } } });
    assert.equal(t1.status, 201, JSON.stringify(t1.data));
    const p1 = await api("POST", "/api/v1/quotes", { token: U.token, body: { domain: "PACKAGE", itemId: "pkg_osaka_3d2n", startDate: day(211), travelers: { adults: 2 } } });
    assert.equal(p1.status, 201, JSON.stringify(p1.data));
  } finally {
    sql("UPDATE trains SET partner_id = NULL WHERE id = 'trn_ktx_025'");
    sql("UPDATE packages SET partner_id = NULL WHERE id = 'pkg_osaka_3d2n'");
    sql(`DELETE FROM suppliers WHERE id = '${sid}'`);
  }
});

test("#44: postback requires a real click, integer amount, allowlisted currency", async () => {
  const secret = `e2e-secret44-${rnd()}${rnd()}`;
  sql(`INSERT OR REPLACE INTO affiliate_partners_config (partner_id, name, deep_link_template, affiliate_id, secret_key, is_active) VALUES ('e2e-aff-44', 'e2e-44', 'https://x.test/{item_id}?c={click_id}', 'E2E', '${secret}', 1)`);
  try {
    const click = await fetch(BASE + "/api/v1/out/e2e-aff-44/item9?domain=HOTEL", { redirect: "manual" });
    assert.equal(click.status, 302);
    const clickId = new URL(click.headers.get("location")).searchParams.get("c");
    const post = async (payload) => {
      const raw = JSON.stringify({ partner: "e2e-aff-44", ...payload });
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
      const r = await fetch(BASE + "/api/v1/webhooks/postback", { method: "POST", headers: { "Content-Type": "application/json", "X-Signature": sig, "X-Timestamp": ts }, body: raw });
      return { status: r.status, data: await r.json() };
    };
    assert.equal((await post({ click_id: `clk_nope_${rnd()}`, order_id: `o_${rnd()}`, amount: 1000 })).data.code, "UNKNOWN_CLICK");
    assert.equal((await post({ click_id: clickId, order_id: `o_${rnd()}`, amount: 19.99 })).data.code, "INVALID_AMOUNT");
    assert.equal((await post({ click_id: clickId, order_id: `o_${rnd()}`, amount: 1000, currency: "XXX" })).data.code, "INVALID_CURRENCY");
    const ok = await post({ click_id: clickId, order_id: `o_${rnd()}`, amount: 1000, currency: "krw" });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(sql(`SELECT currency FROM affiliate_conversions WHERE click_id = '${clickId}' ORDER BY created_at DESC LIMIT 1`)[0].currency, "KRW");
  } finally {
    sql("DELETE FROM affiliate_conversions WHERE partner_name = 'e2e-aff-44'");
    sql("DELETE FROM affiliate_clicks WHERE partner_name = 'e2e-aff-44'");
    sql("DELETE FROM affiliate_partners_config WHERE partner_id = 'e2e-aff-44'");
  }
});

test("#45: supplier-confirm timeout auto-refunds via maintenance", async () => {
  const F = await register("t45");
  const q = (await quote(F.token)).data.quote;
  const b = (await book(F.token, q, { simulation: { supplier: "pending" } })).data.booking;
  const p = await pay(F.token, b);
  assert.equal(p.data.booking.status, "SUPPLIER_BOOKING_PENDING", JSON.stringify(p.data));
  sql(`UPDATE bookings SET updated_at = '2020-01-01T00:00:00.000Z' WHERE id = '${b.id}'`);
  const stats = (await api("POST", "/api/v1/admin/maintenance/run", { token: ADMIN })).data.stats;
  assert.ok(stats.supplierTimeouts >= 1, JSON.stringify(stats));
  assert.equal((await api("GET", `/api/v1/bookings/${b.id}`, { token: F.token })).data.booking.status, "REFUNDED");
  assert.equal(sql(`SELECT status FROM refunds WHERE booking_id = '${b.id}' ORDER BY created_at DESC LIMIT 1`)[0].status, "SUCCEEDED");
  assert.equal(sql(`SELECT id FROM inventory_holds WHERE booking_id = '${b.id}' AND status != 'RELEASED'`).length, 0, "holds released");
});

test("#46/#50/#118: flag registry holds only enforced flags; dead prereqs gone", async () => {
  // 6e parked the unbuilt-automation flags at OFF; 6f (#50) deletes them — a
  // toggle that gates nothing is theater either way. Every surviving key is
  // consulted by a money/catalog/ingest gate (see worker/src callers).
  const admin = (await api("GET", "/api/v1/admin/feature-flags", { token: ADMIN })).data.flags;
  const keys = admin.map((f) => f.key).sort();
  const enforced = ["ACTIVITY_BOOKING", "AUTO_PRODUCT_PUBLISH", "CAR_RENTAL", "CONSIGNMENT_SALES", "FLIGHT_BOOKING", "HOTEL_BOOKING", "MARKETPLACE_1P_DIRECT", "MARKETPLACE_3P_PARTNER", "PACKAGE_TOUR", "PARTNER_SELF_PRODUCT_REGISTRATION", "PARTNER_URL_INGESTION", "TRANSIT_TICKETS", "URL_PRODUCT_INGESTION"].sort();
  assert.deepEqual(keys, enforced);
  for (const k of ["ESIM", "TRAVEL_INSURANCE", "AI_TRANSLATION", "REALTIME_INVENTORY_SYNC", "AUTO_BOOKING_CONFIRMATION", "PARTNER_AUTO_DISPATCH", "AUTO_BOOKING_DISPATCH", "AUTO_CANCEL_REFUND", "AUTO_SETTLEMENT", "AUTO_PARTNER_SETTLEMENT", "AUTO_SUPPLIER_SETTLEMENT", "SUPPLIER_API_INTEGRATION"]) {
    assert.ok(!keys.includes(k), `${k} removed from registry`);
    assert.equal((await api("PATCH", `/api/v1/admin/feature-flags/${k}`, { token: ADMIN, body: { is_enabled: true } })).status, 404, `${k} PATCH 404`);
  }
  const flight = admin.find((f) => f.key === "FLIGHT_BOOKING");
  assert.deepEqual(flight.requires_flags, [], "no dead REALTIME prereq (#118)");
});

test("#47: click rows carry real IP, allowlisted domain, resolved title", async () => {
  const secret = `e2e-secret47-${rnd()}${rnd()}`;
  sql(`INSERT OR REPLACE INTO affiliate_partners_config (partner_id, name, deep_link_template, affiliate_id, secret_key, is_active) VALUES ('e2e-aff-47', 'e2e-47', 'https://x.test/{item_id}?c={click_id}', 'E2E', '${secret}', 1)`);
  try {
    const act = sql("SELECT id, title FROM activities WHERE is_active = 1 LIMIT 1")[0];
    const r1 = await fetch(BASE + `/api/v1/out/e2e-aff-47/${act.id}?domain=ACTIVITY`, { redirect: "manual", headers: { "CF-Connecting-IP": "203.0.113.7" } });
    assert.equal(r1.status, 302);
    const c1 = new URL(r1.headers.get("location")).searchParams.get("c");
    const row = sql(`SELECT domain_type, item_title, ip_address FROM affiliate_clicks WHERE click_id = '${c1}'`)[0];
    assert.equal(row.domain_type, "ACTIVITY");
    assert.equal(row.item_title, act.title);
    assert.equal(row.ip_address, "203.0.113.7");
    const r2 = await fetch(BASE + "/api/v1/out/e2e-aff-47/whatever?domain=BOGUS", { redirect: "manual" });
    assert.equal(r2.status, 302);
    const c2 = new URL(r2.headers.get("location")).searchParams.get("c");
    const row2 = sql(`SELECT domain_type, item_title FROM affiliate_clicks WHERE click_id = '${c2}'`)[0];
    assert.equal(row2.domain_type, "UNKNOWN");
    assert.equal(row2.item_title, null);
  } finally {
    sql("DELETE FROM affiliate_clicks WHERE partner_name = 'e2e-aff-47'");
    sql("DELETE FROM affiliate_partners_config WHERE partner_id = 'e2e-aff-47'");
  }
});

const flag6f = (key, on) => api("PATCH", `/api/v1/admin/feature-flags/${key}`, { token: ADMIN, body: { is_enabled: on } });

test("#49: SELF_REG kill-switch gates partner registration (seeded, PATCH 200)", async () => {
  const P = await approvedPartner("selfreg49");
  const body = { title: "E2E 셀프등록 킬스위치", domain: "ACTIVITY", city: "서울", price: 50000, capacity: 10 };
  assert.equal((await flag6f("PARTNER_SELF_PRODUCT_REGISTRATION", true)).status, 200, "seeded row: no 404");
  assert.equal((await api("POST", "/api/v1/partner/marketplace/products", { token: P.token, body })).status, 201);
  assert.equal((await flag6f("PARTNER_SELF_PRODUCT_REGISTRATION", false)).status, 200);
  try {
    const blocked = await api("POST", "/api/v1/partner/marketplace/products", { token: P.token, body });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.data.code, "FEATURE_DISABLED");
  } finally {
    assert.equal((await flag6f("PARTNER_SELF_PRODUCT_REGISTRATION", true)).status, 200);
  }
  assert.equal((await api("POST", "/api/v1/partner/marketplace/products", { token: P.token, body })).status, 201);
});

test("#50: marketplace channel flags fail closed on the public surface only", async () => {
  sql(`INSERT INTO marketplace_catalog_items (id, domain_type, item_id, merchant_model, supplier_id, registered_by, seller_id, seller_name, fulfillment_provider, supply_cost_minor, retail_price_minor, commission_rate_bps, seller_payout_minor, platform_margin_minor, refund_responsible_party, status) VALUES ('mkt_e2e_50', 'ACTIVITY', 'act_e2e_50', 'CONSIGNMENT', 'sup_e2e_50', 'ADMIN', 'getfortrip', 'E2E 위탁', 'SUPPLIER', 10000, 15000, 0, 10000, 5000, 'GETFORTRIP', 'ACTIVE')`);
  try {
    const listed = (await api("GET", "/api/v1/marketplace/catalog?model=CONSIGNMENT")).data.items;
    assert.ok(listed.some((i) => i.id === "mkt_e2e_50"), "fixture listed while channel on");
    // A 3P row from an earlier test proves other channels stay visible (no
    // ACTIVE 1P rows exist: all four 1P seeds are PAUSED by 0037).
    const other = (await api("GET", "/api/v1/marketplace/catalog")).data.items.find((i) => i.merchant_model === "3P");
    assert.ok(other, "a 3P row exists before the toggle");
    assert.equal((await flag6f("CONSIGNMENT_SALES", false)).status, 200);
    try {
      const filtered = await api("GET", "/api/v1/marketplace/catalog?model=CONSIGNMENT");
      assert.equal(filtered.status, 503);
      assert.equal(filtered.data.code, "FEATURE_DISABLED");
      const unfiltered = (await api("GET", "/api/v1/marketplace/catalog")).data.items;
      assert.ok(!unfiltered.some((i) => i.id === "mkt_e2e_50"), "off channel hidden from unfiltered list");
      assert.ok(unfiltered.some((i) => i.id === other.id), "other channels unaffected");
      assert.equal((await api("GET", "/api/v1/admin/marketplace/summary", { token: ADMIN })).status, 200, "admin books unaffected");
    } finally {
      assert.equal((await flag6f("CONSIGNMENT_SALES", true)).status, 200);
    }
    assert.ok((await api("GET", "/api/v1/marketplace/catalog?model=CONSIGNMENT")).data.items.some((i) => i.id === "mkt_e2e_50"), "restored");
  } finally {
    sql("DELETE FROM marketplace_catalog_items WHERE id = 'mkt_e2e_50'");
  }
});

test("#50: PARTNER_URL_INGESTION gates partner ingestion; admin pipeline independent", async () => {
  const P = await approvedPartner("purl50");
  assert.equal((await flag6f("PARTNER_URL_INGESTION", false)).status, 200);
  try {
    const r = await api("POST", "/api/v1/partner/ingest/url", { token: P.token, body: { url: "https://travel.example.com/x" } });
    assert.equal(r.status, 503);
    assert.equal(r.data.code, "FEATURE_DISABLED");
    const admin = await api("POST", "/api/v1/admin/ingest/url", { token: ADMIN, body: { url: "http://169.254.169.254/x" } });
    assert.equal(admin.data.code, "SSRF_BLOCKED", "admin path answers its own guard, not the partner switch");
  } finally {
    assert.equal((await flag6f("PARTNER_URL_INGESTION", true)).status, 200);
  }
});

test("#56: maintenance heartbeats land in /health; staleness never fails health", async () => {
  assert.equal((await api("POST", "/api/v1/admin/maintenance/run", { token: ADMIN })).status, 200);
  const beat = sql("SELECT job, ok FROM cron_heartbeats WHERE job = 'maintenance'")[0];
  assert.equal(beat.job, "maintenance");
  assert.equal(beat.ok, 1);
  const cron = (await api("GET", "/api/v1/health")).data.checks.cron;
  assert.equal(cron.ok, true);
  assert.equal(cron.stale, false);
  assert.ok(cron.ageSec < 120, JSON.stringify(cron));
  sql("UPDATE cron_heartbeats SET ran_at = '2020-01-01T00:00:00.000Z' WHERE job = 'maintenance'");
  const stale = await api("GET", "/api/v1/health");
  assert.equal(stale.status, 200, "stale cron is reported, not a 503");
  assert.equal(stale.data.checks.cron.stale, true);
  assert.equal((await api("POST", "/api/v1/admin/maintenance/run", { token: ADMIN })).status, 200);
  assert.equal((await api("GET", "/api/v1/health")).data.checks.cron.stale, false);
});

test("#57: POST /admin/ingest/url scrapes a fixture page; SSRF stays 403", async () => {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>E2E 픽스처 투어</title>` +
    `<meta property="og:title" content="E2E 픽스처 입장권"><meta property="og:description" content="픽스처 설명">` +
    `<meta property="og:site_name" content="Fixture Travel"><meta property="og:image" content="/img.jpg">` +
    `<meta property="og:price:amount" content="25000"><meta property="og:price:currency" content="KRW">` +
    `<script type="application/ld+json">{"@type":"TouristAttraction","name":"E2E JSON-LD 명소",` +
    `"address":{"streetAddress":"1 Fixture St","addressLocality":"오사카","addressCountry":"일본"},` +
    `"geo":{"latitude":34.6,"longitude":135.5}}</script></head><body>fixture</body></html>`;
  const server = createServer((req, res) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const r = await api("POST", "/api/v1/admin/ingest/url", { token: ADMIN, body: { url: `http://127.0.0.1:${port}/tour` } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.draft.title, "E2E 픽스처 입장권");
    assert.equal(r.data.draft.price_minor, 25000);
    assert.equal(r.data.draft.city, "오사카");
    assert.equal(r.data.draft.country, "일본");
    assert.ok(r.data.draft.source_url.includes(`127.0.0.1:${port}`));
    sql(`DELETE FROM url_product_ingestions WHERE id = '${r.data.draft.id}'`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  for (const u of ["http://169.254.169.254/latest/meta-data", "http://127.0.0.2/x", "http://10.1.2.3/x", "http://[::1]/x"]) {
    const b = await api("POST", "/api/v1/admin/ingest/url", { token: ADMIN, body: { url: u } });
    assert.equal(b.status, 403, u);
    assert.equal(b.data.code, "SSRF_BLOCKED", u);
  }
  assert.equal((await api("POST", "/api/v1/admin/ingest/url", { token: ADMIN, body: { url: "ftp://example.com/x" } })).status, 400);
  assert.equal((await api("POST", "/api/v1/admin/ingest/url", { token: ADMIN, body: {} })).status, 400);
});

test("#133: postback rejects negative and non-numeric commission", async () => {
  const secret = `e2e-secret133-${rnd()}${rnd()}`;
  sql(`INSERT OR REPLACE INTO affiliate_partners_config (partner_id, name, deep_link_template, affiliate_id, secret_key, is_active) VALUES ('e2e-aff-133', 'e2e-133', 'https://x.test/{item_id}?c={click_id}', 'E2E', '${secret}', 1)`);
  try {
    const click = await fetch(BASE + "/api/v1/out/e2e-aff-133/item9?domain=HOTEL", { redirect: "manual" });
    assert.equal(click.status, 302);
    const clickId = new URL(click.headers.get("location")).searchParams.get("c");
    const post = async (payload) => {
      const raw = JSON.stringify({ partner: "e2e-aff-133", ...payload });
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
      const r = await fetch(BASE + "/api/v1/webhooks/postback", { method: "POST", headers: { "Content-Type": "application/json", "X-Signature": sig, "X-Timestamp": ts }, body: raw });
      return { status: r.status, data: await r.json() };
    };
    assert.equal((await post({ click_id: clickId, order_id: `o_${rnd()}`, amount: 1000, commission: -1 })).status, 400);
    assert.equal((await post({ click_id: clickId, order_id: `o_${rnd()}`, amount: 1000, commission: "abc" })).status, 400);
    assert.equal((await post({ click_id: clickId, order_id: `o_${rnd()}`, amount: 1000, commission: 50 })).status, 200, "honest commission still books");
  } finally {
    sql("DELETE FROM affiliate_conversions WHERE partner_name = 'e2e-aff-133'");
    sql("DELETE FROM affiliate_clicks WHERE partner_name = 'e2e-aff-133'");
    sql("DELETE FROM affiliate_partners_config WHERE partner_id = 'e2e-aff-133'");
  }
});

test("#62: price-alert notice is honest about mail delivery", async () => {
  resetLimiter("register");
  const G = await register("alert62");
  const r = await api("POST", "/api/v1/price-alerts", { token: G.token, body: { routeOrHotel: "ICN-NRT", targetPrice: 200000 } });
  assert.equal(r.status, 201);
  // Local/staging has no mail provider: the notice must say so (no promise).
  assert.equal(r.data.emailDelivery, "NOT_CONFIGURED");
  assert.ok(!r.data.notice.includes("알려드립니다"), JSON.stringify(r.data));
  await api("DELETE", `/api/v1/price-alerts/${r.data.id}`, { token: G.token });
});

test("#68: staff emails are globally unique; login resolves one tenant", async () => {
  resetLimiter("partner_register", "partner_login");
  const P = await approvedPartner("stf68a");
  const Q = await approvedPartner("stf68b");
  const email = `qa_staff68_${rnd()}@local.test`.toLowerCase();
  const inv = await api("POST", "/api/v1/partner/staff", { token: P.token, body: { email, fullName: "스태프68", role: "STAFF", password: "Passw0rd-QA-1" } });
  assert.equal(inv.status, 201, JSON.stringify(inv.data));
  try {
    // Same tenant again → 409.
    assert.equal((await api("POST", "/api/v1/partner/staff", { token: P.token, body: { email, fullName: "중복", role: "STAFF", password: "Passw0rd-QA-1" } })).status, 409);
    // Other tenant → 409, not a raw 500 (pre-#68 fell through to the constraint).
    const cross = await api("POST", "/api/v1/partner/staff", { token: Q.token, body: { email, fullName: "탈취", role: "STAFF", password: "Passw0rd-QA-1" } });
    assert.equal(cross.status, 409, JSON.stringify(cross.data));
    assert.equal(cross.data.code, "STAFF_EXISTS");
    // Login resolves the single global row → tenant A, never B.
    const login = await api("POST", "/api/v1/partner/login", { body: { email, password: "Passw0rd-QA-1" } });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    assert.equal(login.data.partner.id, P.id);
    assert.equal(login.data.partner.staffRole, "STAFF");
  } finally {
    sql(`DELETE FROM partner_staff WHERE email = '${email}'`);
  }
});

test("#69: partner product create rejects bad price and free-form domain", async () => {
  resetLimiter("partner_register", "partner_login");
  const P = await approvedPartner("price69");
  const post = (body) => api("POST", "/api/v1/partner/products", { token: P.token, body });
  assert.equal((await post({ title: "음수가", domain: "ACTIVITY", city: "서울", price: -5 })).data.code, "INVALID_PRICE");
  assert.equal((await post({ title: "문자열가", domain: "ACTIVITY", city: "서울", price: "abc" })).data.code, "INVALID_PRICE");
  assert.equal((await post({ title: "소수가", domain: "ACTIVITY", city: "서울", price: 19.99 })).data.code, "INVALID_PRICE");
  assert.equal((await post({ title: "무료", domain: "BOGUS", city: "서울", price: 1000 })).data.code, "INVALID_DOMAIN");
  const ok = await post({ title: "E2E 정가 투어", domain: "ACTIVITY", city: "서울", price: 30000 });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const zero = await post({ title: "E2E 무료 투어", domain: "ACTIVITY", city: "서울", price: 0 });
  assert.equal(zero.status, 201, "explicit 0 is a valid price, not the default");
  assert.equal(sql(`SELECT price_krw FROM activities WHERE id = '${zero.data.id}'`)[0].price_krw, 0);
});

test("#71: settlement splits on gross (paid + platform discount), like the ledger", async () => {
  resetLimiter("register");
  const U = await register("gross71");
  assert.equal((await api("POST", "/api/v1/user/coupons/claim", { token: U.token, body: { code: "TEST10" } })).status, 200);
  const q = (await quote(U.token, { promotionCode: "TEST10" })).data.quote;
  assert.ok(q.discountMinor > 0, "coupon discount present");
  const b = (await book(U.token, q)).data.booking;
  const p = await pay(U.token, b);
  assert.equal(p.data.booking.status, "VOUCHER_ISSUED");
  const row = sql(`SELECT paid_minor, discount_amount_krw FROM bookings WHERE id = '${b.id}'`)[0];
  const s = sql(`SELECT gross_amount_minor, commission_amount_minor, seller_payout_minor, merchant_model FROM marketplace_order_settlements WHERE booking_id = '${b.id}'`)[0];
  const gross = Number(row.paid_minor) + Number(row.discount_amount_krw);
  assert.ok(gross > Number(row.paid_minor), "discounted order");
  assert.equal(Number(s.gross_amount_minor), gross, "settlement basis is gross, not net-paid");
  if (s.merchant_model === "3P") {
    assert.equal(Number(s.seller_payout_minor) + Number(s.commission_amount_minor), gross, "3P split adds up on gross");
  }
});

test("#73: concurrent refund starts single-flight — one parks PENDING, the other 409s, never twice", async () => {
  resetLimiter("register");
  const U = await register("rf73");
  // refundfail: PG captures the payment but every refund attempt fails, so the
  // winner's row stays PENDING and any ordering converges on one row + 409s.
  const { b } = await fullHotelBooking(U.token, {}, "refundfail");
  assert.equal((await api("GET", `/api/v1/bookings/${b.id}`, { token: U.token })).data.booking.status, "VOUCHER_ISSUED");
  const fire = () => api("POST", `/api/v1/admin/bookings/${b.id}/refund`, { token: ADMIN, body: { amountMinor: b.totalMinor, reason: "E2E #73 race" } });
  const [ra, rb] = await Promise.all([fire(), fire()]);
  const sts = [ra.status, rb.status].sort();
  assert.deepEqual(sts, [200, 409], JSON.stringify([ra.data, rb.data]));
  // The loser may have lost the status walk instead of the refund INSERT
  // (both are 409s); settle it — a PENDING row now exists either way.
  let loser = [ra, rb].find((r) => r.status === 409);
  for (let i = 0; i < 5 && loser.data.code !== "REFUND_IN_PROGRESS"; i++) {
    loser = await fire();
    assert.equal(loser.status, 409, JSON.stringify(loser.data));
  }
  assert.equal(loser.data.code, "REFUND_IN_PROGRESS", JSON.stringify(loser.data));
  // And a third sequential start is refused deterministically.
  assert.equal((await fire()).data.code, "REFUND_IN_PROGRESS");
  const rows = sql(`SELECT id, status, attempts FROM refunds WHERE booking_id = '${b.id}'`);
  assert.equal(rows.length, 1, "exactly one refund row — no double pay");
  assert.equal(rows[0].status, "PENDING");
  assert.ok(rows[0].attempts >= 1, "winner's failed PG attempt recorded");
});

test("#72: crash-orphaned settlement is repaired; partial recovery takes are traced", async () => {
  resetLimiter("register");
  const P = await approvedPartner("stl72");
  sql(`INSERT INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps) VALUES ('${P.id}', 'E2E 72 공급사', 'ALL', 'simulator', 'SANDBOX_VERIFIED', 'AGENCY', 9000)`);
  const reg = await api("POST", "/api/v1/partner/marketplace/products", { token: P.token, body: { title: "E2E #72 투어", domain: "ACTIVITY", city: "서울", price: 50000, capacity: 10 } });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const itemId = reg.data.product.item_id;
  const mkCompleted = async (tag) => {
    const U = await register(tag);
    const q = (await api("POST", "/api/v1/quotes", { token: U.token, body: { domain: "ACTIVITY", itemId, startDate: day(95), travelers: { adults: 1 } } })).data.quote;
    const b = (await book(U.token, q)).data.booking;
    assert.equal((await pay(U.token, b)).data.booking.status, "VOUCHER_ISSUED");
    sql(`UPDATE bookings SET status = 'COMPLETED', service_end = '2020-01-02' WHERE id = '${b.id}'`);
    return b;
  };
  // Act 1: a post-payout full refund raises an OPEN claim larger than the next
  // payout, so the next settle takes partially — and traces the partial take.
  const b1 = await mkCompleted("s72a");
  const s1 = sql(`SELECT * FROM marketplace_order_settlements WHERE booking_id = '${b1.id}'`)[0];
  assert.equal(s1.seller_id, P.id);
  const st1 = await api("PATCH", `/api/v1/admin/marketplace/settlements/${s1.id}/settle`, { token: ADMIN });
  assert.equal(st1.status, 200, JSON.stringify(st1.data));
  assert.equal(st1.data.repaired, false);
  const rf = await api("POST", `/api/v1/admin/bookings/${b1.id}/refund`, { token: ADMIN, body: { amountMinor: b1.totalMinor, reason: "E2E #72 claim" } });
  assert.equal(rf.data.booking.status, "REFUNDED", JSON.stringify(rf.data));
  const claim = sql(`SELECT * FROM settlement_recoveries WHERE booking_id = '${b1.id}'`)[0];
  assert.equal(claim.status, "OPEN");
  const b2 = await mkCompleted("s72b");
  const s2 = sql(`SELECT * FROM marketplace_order_settlements WHERE booking_id = '${b2.id}'`)[0];
  assert.ok(Number(s2.seller_payout_minor) < Number(claim.amount_minor), "partial take is deterministic: payout < claim");
  const st2 = await api("PATCH", `/api/v1/admin/marketplace/settlements/${s2.id}/settle`, { token: ADMIN });
  assert.equal(st2.status, 200, JSON.stringify(st2.data));
  assert.equal(st2.data.payout.recoveryDeductedMinor, Number(s2.seller_payout_minor));
  assert.equal(st2.data.payout.netMinor, 0);
  const after = sql(`SELECT * FROM settlement_recoveries WHERE id = '${claim.id}'`)[0];
  assert.equal(after.status, "OPEN");
  assert.equal(Number(after.amount_minor), Number(claim.amount_minor) - Number(s2.seller_payout_minor));
  assert.equal(after.applied_settlement_id, s2.id, "partial take traced to its settlement");
  // Act 2: orphan the third settlement (gate UPDATE landed, completion never
  // ran) and repair it through the same endpoint.
  const b3 = await mkCompleted("s72c");
  const s3 = sql(`SELECT * FROM marketplace_order_settlements WHERE booking_id = '${b3.id}'`)[0];
  sql(`UPDATE marketplace_order_settlements SET settlement_status = 'SETTLED', settled_at = '2020-02-15T10:00:00.000Z', payout_method = 'MANUAL_TRANSFER', payout_reference = 'E2E-ORPHAN-72', recovery_deducted_minor = 0 WHERE id = '${s3.id}'`);
  assert.equal(sql(`SELECT COUNT(*) AS c FROM ledger_entries WHERE reference_id = '${s3.id}' AND event_type = 'SETTLEMENT_PAID_OUT'`)[0].c, 0);
  const rep = await api("PATCH", `/api/v1/admin/marketplace/settlements/${s3.id}/settle`, { token: ADMIN });
  assert.equal(rep.status, 200, JSON.stringify(rep.data));
  assert.equal(rep.data.repaired, true);
  assert.equal(rep.data.settled_at, "2020-02-15T10:00:00.000Z");
  assert.equal(rep.data.payout.recoveryDeductedMinor, 0);
  // Zero-deduct payout: payable relieved to operating cash (the zero
  // SELLER_CLAIM_RECEIVABLE leg is dropped by journal(), like every
  // no-deduct settle — exact lines, not just a count).
  const jl = sql(`SELECT account, direction, amount_minor AS amt FROM ledger_entries WHERE reference_id = '${s3.id}' AND event_type = 'SETTLEMENT_PAID_OUT' ORDER BY account`);
  assert.deepEqual(jl.map((l) => [l.account, l.direction, l.amt]), [
    ["OPERATING_CASH", "CREDIT", s3.seller_payout_minor],
    ["SUPPLIER_PAYABLE", "DEBIT", s3.seller_payout_minor],
  ]);
  const linked = sql(`SELECT payout_batch_id FROM marketplace_order_settlements WHERE id = '${s3.id}'`)[0];
  assert.equal(linked.payout_batch_id, `psb_${P.id}_2020-02`, "batch link follows the settled month, not the repair month");
  const batch = sql(`SELECT * FROM partner_settlement_batches WHERE id = '${linked.payout_batch_id}'`)[0];
  const sums = sql(`SELECT COALESCE(SUM(gross_amount_minor),0) g, COALESCE(SUM(commission_amount_minor),0) cm, COALESCE(SUM(seller_payout_minor - COALESCE(recovery_deducted_minor,0)),0) po FROM marketplace_order_settlements WHERE payout_batch_id = '${linked.payout_batch_id}'`)[0];
  assert.equal(batch.gross_minor, sums.g, "recompute-SET rollup matches linked rows");
  assert.equal(batch.commission_minor, sums.cm);
  assert.equal(batch.payout_minor, sums.po);
  // A zero-deduct repair never touches foreign claims.
  const claimAfter = sql(`SELECT amount_minor, applied_settlement_id FROM settlement_recoveries WHERE id = '${claim.id}'`)[0];
  assert.equal(Number(claimAfter.amount_minor), Number(after.amount_minor));
  assert.equal(claimAfter.applied_settlement_id, s2.id);
  // Repaired means complete: the next call 409s exactly as before.
  const again = await api("PATCH", `/api/v1/admin/marketplace/settlements/${s3.id}/settle`, { token: ADMIN });
  assert.equal(again.status, 409);
  assert.equal(again.data.code, "SETTLEMENT_NOT_PAYABLE");
});

test("#74: refund UNKNOWN consults the PG — ghost refunds complete, lost ones stay visible", async () => {
  resetLimiter("register");
  // Ghost: the PG lost the response but took the refund — lookup CANCELED
  // covers our amount, so the refund completes instead of blind-retrying.
  const G = await register("rf74g");
  const { b: bg } = await fullHotelBooking(G.token, {}, "refundghost");
  const cg = await api("POST", `/api/v1/bookings/${bg.id}/cancel`, { token: G.token });
  assert.equal(cg.data.booking.status, "REFUNDED", JSON.stringify(cg.data));
  const rg = sql(`SELECT status, provider_refund_id FROM refunds WHERE booking_id = '${bg.id}'`)[0];
  assert.equal(rg.status, "SUCCEEDED");
  assert.ok(rg.provider_refund_id && rg.provider_refund_id.startsWith("sbx_tx_"), rg.provider_refund_id);
  // Lost: the PG never took it — attempts+1 with a lookup note, stays
  // PENDING, and shows up in the admin ops queue.
  const L = await register("rf74l");
  const { b: bl } = await fullHotelBooking(L.token, {}, "refundlost");
  const cl = await api("POST", `/api/v1/bookings/${bl.id}/cancel`, { token: L.token });
  assert.equal(cl.data.booking.status, "REFUND_PENDING", JSON.stringify(cl.data));
  const rl = sql(`SELECT status, attempts, last_error FROM refunds WHERE booking_id = '${bl.id}'`)[0];
  assert.equal(rl.status, "PENDING");
  assert.equal(rl.attempts, 1);
  assert.ok(rl.last_error.includes("PG_LOOKUP:CAPTURED"), rl.last_error);
  const pend = await api("GET", "/api/v1/admin/refunds?status=PENDING", { token: ADMIN });
  assert.equal(pend.status, 200, JSON.stringify(pend.data));
  const row = pend.data.refunds.find((r) => r.booking_id === bl.id);
  assert.ok(row, "lost refund visible in the admin queue");
  assert.ok(row.last_error.includes("PG_LOOKUP"), row.last_error);
  assert.equal((await api("GET", "/api/v1/admin/refunds?status=BOGUS", { token: ADMIN })).status, 400);
});

test("#75: coin grants land via admin adjust with a ledger row (no phantom accrual)", async () => {
  resetLimiter("register");
  const U = await register("coin75");
  const before = Number(sql(`SELECT trip_coins FROM users WHERE id = '${U.id}'`)[0].trip_coins);
  const up = await api("PATCH", `/api/v1/admin/users/${U.id}`, { token: ADMIN, headers: { "Idempotency-Key": idem() }, body: { coinAdjustment: 500, note: "E2E #75 event grant" } });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal(up.data.coinBalance, before + 500);
  const rows = sql(`SELECT delta, reason FROM coin_ledger WHERE user_id = '${U.id}' ORDER BY created_at, rowid`);
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].delta), 500);
  assert.ok(rows[0].reason.startsWith("ADMIN_ADJUSTMENT"), rows[0].reason);
});

test("#76-78: hot money/calendar reads use indexes, never table scans", async () => {
  for (const name of ["idx_partner_inventory_item_date_unit", "idx_payments_booking", "idx_price_alerts_active_item"]) {
    assert.equal(sql(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name = '${name}'`)[0].c, 1, name);
  }
  const plan = (q) => sql(`EXPLAIN QUERY PLAN ${q}`).map((r) => r.detail ?? r.Detail).join(" | ");
  const inv = plan("SELECT allocated_units, is_closed FROM partner_inventory WHERE item_id = 'x' AND service_date = '2026-01-01' AND (unit_id = 'y' OR unit_id = 'default') ORDER BY CASE WHEN unit_id = 'y' THEN 0 ELSE 1 END LIMIT 1");
  assert.ok(inv.includes("USING INDEX idx_partner_inventory_item_date_unit"), inv);
  const pay = plan("SELECT * FROM payments WHERE booking_id = 'x' AND status IN ('CAPTURED', 'PARTIALLY_REFUNDED') ORDER BY created_at DESC LIMIT 1");
  assert.ok(pay.includes("USING INDEX idx_payments_booking"), pay);
  const al = plan("SELECT id FROM price_alerts WHERE is_active = 1 AND item_id IS NOT NULL AND item_id != 'general' LIMIT 100");
  assert.ok(al.includes("USING INDEX idx_price_alerts_active_item"), al);
  for (const p of [inv, pay, al]) assert.ok(!p.includes("SCAN "), p);
});

test("#79: orphan references are audited and refused — reconciliation clean, orphans rejected", async () => {
  const clean = await api("GET", "/api/v1/admin/reconciliation", { token: ADMIN });
  assert.equal(clean.data.ok, true, JSON.stringify({ orphans: clean.data.orphanViolations, payable: clean.data.payableStranded }));
  assert.deepEqual(clean.data.orphanViolations, []);
  // The declared REFERENCES hold: a direct orphan insert is refused, so the
  // audit above stays clean by enforcement, and would flag any violation that
  // slipped through on a runtime with different enforcement posture.
  let refused = null;
  try {
    sql(`INSERT INTO booking_items (id, booking_id, domain_type, item_id, supplier_id, title, service_start, service_end, quantity, total_minor, params_json) VALUES ('bki_orphan79', 'bkg_does_not_exist_79', 'HOTEL', 'htl_seoul_01', 'ptn_htl_01', 'orphan probe', '2026-01-01', '2026-01-02', 1, 100, '{}')`);
  } catch (e) {
    refused = String((e).stdout || e.message || e);
  }
  assert.ok(refused && refused.includes("FOREIGN KEY"), `orphan insert refused, got: ${refused}`);
  assert.equal(sql("SELECT COUNT(*) AS c FROM booking_items WHERE id = 'bki_orphan79'")[0].c, 0);
});

test("#80: bookings attribute to the product's real partner — supplier codes never leak in", async () => {
  resetLimiter("register");
  const P = await approvedPartner("attr80");
  sql(`INSERT INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps) VALUES ('${P.id}', 'E2E 80 공급사', 'ALL', 'simulator', 'SANDBOX_VERIFIED', 'AGENCY', 9000)`);
  const reg = await api("POST", "/api/v1/partner/marketplace/products", { token: P.token, body: { title: "E2E #80 투어", domain: "ACTIVITY", city: "서울", price: 50000, capacity: 10 } });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const U = await register("attr80");
  const q = (await api("POST", "/api/v1/quotes", { token: U.token, body: { domain: "ACTIVITY", itemId: reg.data.product.item_id, startDate: day(96), travelers: { adults: 1 } } })).data.quote;
  const b = (await book(U.token, q)).data.booking;
  assert.equal(sql(`SELECT partner_id AS p FROM bookings WHERE id = '${b.id}'`)[0].p, P.id);
  assert.equal((await pay(U.token, b)).data.booking.status, "VOUCHER_ISSUED");
  const orders = await api("GET", "/api/v1/partner/orders", { token: P.token });
  assert.ok(orders.data.orders.some((o) => o.id === b.id), "own booking visible in the extranet");
  // Catalog sale: attributed to the seed partner that owns the catalog row —
  // a real partners row either way, never a bare supplier code.
  const U2 = await register("attr80b");
  const { b: bc } = await fullHotelBooking(U2.token, {});
  const got = sql(`SELECT partner_id AS p FROM bookings WHERE id = '${bc.id}'`)[0].p;
  assert.ok(got && sql(`SELECT COUNT(*) AS c FROM partners WHERE id = '${got}'`)[0].c === 1, `real partner, got ${got}`);
});

test("#81: product partner refs resolve (partner or supplier); admin create stamps NULL", async () => {
  // The column is dual-purpose by design (1P products name their supplier
  // code); only codes resolving nowhere are dangling.
  for (const t of ["hotels", "flights", "cars", "activities", "transfers", "trains", "packages"]) {
    const d = sql(`SELECT COUNT(*) AS c FROM ${t} WHERE partner_id IS NOT NULL AND partner_id NOT LIKE 'unassigned%' AND partner_id NOT IN (SELECT id FROM partners) AND partner_id NOT IN (SELECT id FROM suppliers)`)[0].c;
    assert.equal(d, 0, `${t} unresolvable partner refs`);
  }
  assert.equal(sql("SELECT COUNT(*) AS c FROM flights WHERE partner_id IS NULL")[0].c, 16, "seed flights unattributed");
  const c = await api("POST", "/api/v1/admin/catalog/FLIGHT", { token: ADMIN, body: {
    flight_number: "E281X", airline_name: "E2E Air", airline_code: "E2", departure_airport: "ICN", arrival_airport: "NRT",
    departure_city: "서울", arrival_city: "도쿄", departure_time: "10:00", arrival_time: "13:00",
    duration_minutes: 180, base_price_krw: 200000,
  } });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  try {
    assert.equal(sql(`SELECT partner_id AS p FROM flights WHERE id = '${c.data.id}'`)[0].p, null, "no legacy default leak");
  } finally {
    sql(`DELETE FROM flights WHERE id = '${c.data.id}'`);
  }
});

test("#82: partners manage activity time slots; the public read shows them", async () => {
  const P = await approvedPartner("slot82");
  const created = await api("POST", "/api/v1/partner/products", { token: P.token, body: { title: "E2E 슬롯 액티비티", domain: "ACTIVITY", city: "서울", price: 30000 } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const aid = created.data.id;
  const date = day(120);
  const put = await api("PUT", `/api/v1/partner/activities/${aid}/slots`, { token: P.token, body: { date, slots: [
    { startTime: "09:00", endTime: "11:00", capacity: 20, priceAdult: 30000, priceChild: 15000 },
    { startTime: "14:00", capacity: 10, priceAdult: 35000 },
  ] } });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  assert.equal(put.data.upserted, 2);
  const pub = (await api("GET", `/api/v1/activities/${aid}/slots?date=${date}`)).data.slots;
  assert.equal(pub.length, 2);
  assert.equal(pub[0].start_time, "09:00");
  assert.equal(pub[1].price_adult_minor, 35000);
  // Re-price keeps booked_count; closing hides the slot from the public read.
  sql(`UPDATE activity_time_slots SET booked_count = 5 WHERE activity_id = '${aid}' AND slot_date = '${date}' AND start_time = '09:00'`);
  const put2 = await api("PUT", `/api/v1/partner/activities/${aid}/slots`, { token: P.token, body: { date, slots: [
    { startTime: "09:00", capacity: 20, priceAdult: 31000 },
    { startTime: "14:00", capacity: 10, priceAdult: 35000, closed: true },
  ] } });
  assert.equal(put2.status, 200, JSON.stringify(put2.data));
  assert.equal(sql(`SELECT booked_count AS b, price_adult_minor AS p FROM activity_time_slots WHERE activity_id = '${aid}' AND slot_date = '${date}' AND start_time = '09:00'`)[0].b, 5);
  assert.equal((await api("GET", `/api/v1/activities/${aid}/slots?date=${date}`)).data.slots.length, 1);
  // Guards: overbook, bad time, dup start, foreign product.
  assert.equal((await api("PUT", `/api/v1/partner/activities/${aid}/slots`, { token: P.token, body: { date, slots: [{ startTime: "09:00", capacity: 4, priceAdult: 1 }] } })).data.code, "SLOT_OVERBOOKED");
  assert.equal((await api("PUT", `/api/v1/partner/activities/${aid}/slots`, { token: P.token, body: { date, slots: [{ startTime: "25:00", capacity: 1, priceAdult: 1 }] } })).status, 400);
  assert.equal((await api("PUT", `/api/v1/partner/activities/${aid}/slots`, { token: P.token, body: { date, slots: [{ startTime: "10:00", capacity: 1, priceAdult: 1 }, { startTime: "10:00", capacity: 1, priceAdult: 1 }] } })).data.code, "DUPLICATE_SLOT");
  const Q = await approvedPartner("slot82b");
  assert.equal((await api("PUT", `/api/v1/partner/activities/${aid}/slots`, { token: Q.token, body: { date, slots: [{ startTime: "10:00", capacity: 1, priceAdult: 1 }] } })).status, 404);
});

test("#83: consignment ghost listings stay gone", async () => {
  assert.equal(sql("SELECT COUNT(*) AS c FROM marketplace_catalog_items WHERE merchant_model = 'CONSIGNMENT'")[0].c, 0);
});

test("#79 finding: fallback-3P splits match recognition (seller share, not commission)", async () => {
  resetLimiter("register");
  const P = await approvedPartner("fb79");
  sql(`INSERT INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps) VALUES ('${P.id}', 'E2E 폴백 공급사', 'ALL', 'simulator', 'SANDBOX_VERIFIED', 'AGENCY', 9000)`);
  // /partner/products writes no marketplace row: the SUPPLIER_FALLBACK path prices this.
  const created = await api("POST", "/api/v1/partner/products", { token: P.token, body: { title: "E2E 폴백 투어", domain: "ACTIVITY", city: "서울", price: 40000 } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  sql(`UPDATE activities SET daily_capacity = 10 WHERE id = '${created.data.id}'`);
  const U = await register("fb79");
  const q = (await api("POST", "/api/v1/quotes", { token: U.token, body: { domain: "ACTIVITY", itemId: created.data.id, startDate: day(97), travelers: { adults: 1 } } })).data.quote;
  const b = (await book(U.token, q)).data.booking;
  assert.equal((await pay(U.token, b)).data.booking.status, "VOUCHER_ISSUED");
  const s = sql(`SELECT * FROM marketplace_order_settlements WHERE booking_id = '${b.id}'`)[0];
  assert.equal(s.attribution_source, "SUPPLIER_FALLBACK");
  assert.equal(s.merchant_model, "3P");
  assert.equal(Number(s.seller_payout_minor), Math.round(Number(s.gross_amount_minor) * 0.9), "90% seller share, not 10%");
  sql(`UPDATE bookings SET status = 'COMPLETED', service_end = '2020-01-02' WHERE id = '${b.id}'`);
  assert.equal((await api("PATCH", `/api/v1/admin/marketplace/settlements/${s.id}/settle`, { token: ADMIN })).status, 200);
  const net = sql(`SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount_minor ELSE -amount_minor END),0) AS n FROM ledger_entries WHERE booking_id = '${b.id}' AND account = 'SUPPLIER_PAYABLE'`)[0].n;
  assert.equal(net, 0, "payout relieves exactly what recognition booked");
});

test("#79 finding: 1P rows (no seller payout) refuse payout recording", async () => {
  resetLimiter("register");
  const U = await register("nopay79");
  const { b } = await fullHotelBooking(U.token, {});
  sql(`UPDATE bookings SET status = 'COMPLETED', service_end = '2020-01-02' WHERE id = '${b.id}'`);
  const s = sql(`SELECT id, merchant_model, seller_payout_minor FROM marketplace_order_settlements WHERE booking_id = '${b.id}'`)[0];
  assert.equal(s.merchant_model, "1P");
  assert.equal(s.seller_payout_minor, 0);
  assert.equal((await api("PATCH", `/api/v1/admin/marketplace/settlements/${s.id}/settle`, { token: ADMIN })).data.code, "SETTLEMENT_NOTHING_TO_PAY");
});

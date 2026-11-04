/**
 * End-to-end API scenarios against a running LOCAL worker (wrangler dev -c wrangler.local.jsonc).
 *   BASE=http://127.0.0.1:8799 ADMIN_PASSWORD=... node --test worker/test/e2e/api.e2e.mjs
 * Uses the sandbox PG and the supplier simulator only. Never point this at production.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

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
  const args = ["wrangler", "d1", "execute", "ota_local", "--local", "-c", "wrangler.local.jsonc", "--json", "--command", command];
  const out = execFileSync(isWin ? "cmd.exe" : "npx", isWin ? ["/c", "npx", ...args] : args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out)[0].results;
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
async function quote(token, extra = {}) {
  stayOffset += 2;
  return api("POST", "/api/v1/quotes", { token, body: { ...HOTEL, startDate: day(stayOffset), endDate: day(stayOffset + 1), rooms: 1, travelers: { adults: 2 }, ...extra } });
}

async function book(token, q, { simulation, travelers = lead, key = idem() } = {}) {
  return api("POST", "/api/v1/bookings", { token, headers: { "Idempotency-Key": key }, body: { quoteId: q.quoteId, contact, travelers, simulation } });
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

let A, B, ADMIN;
before(async () => {
  sql("DELETE FROM login_attempts"); // local DB only: reset rate-limit window between runs
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
  assert.equal((await api("POST", "/api/v1/auth/login", { body: { email: A.email, password: "NewPassw0rd-QA-2" } })).status, 200);
});

test("quote: server computes price; client price fields ignored; invalid inputs rejected", async () => {
  const r = await quote(A.token, { totalPrice: 1, amount: 1, final_amount_krw: 1 });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.quote.totalMinor, 605000); // 1 night × 550,000 + 10% tax
  assert.equal((await quote(A.token, { startDate: day(-1), endDate: day(1) })).status, 400);
  assert.equal((await quote(A.token, { travelers: { adults: 3 } })).data.code, "OCCUPANCY_EXCEEDED");
  assert.equal((await quote(A.token, { promotionCode: "EXPIRED" })).data.code, "PROMO_EXPIRED");
  const promo = await quote(A.token, { promotionCode: "TEST10" });
  assert.equal(promo.data.quote.discountMinor, 30000);
  assert.equal((await api("POST", "/api/v1/quotes", { body: { ...HOTEL, startDate: day(40), endDate: day(42) } })).status, 401);
});

test("booking: idempotency key required, replay returns same booking, quote single-use", async () => {
  const q = (await quote(A.token)).data.quote;
  assert.equal((await api("POST", "/api/v1/bookings", { token: A.token, body: { quoteId: q.quoteId, contact, travelers: lead } })).data.code, "IDEMPOTENCY_KEY_REQUIRED");
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

test("payment: amount mismatch rejected before PG; decline returns to AWAITING_PAYMENT; success issues voucher", async () => {
  const q = (await quote(A.token)).data.quote;
  const b = (await book(A.token, q)).data.booking;
  const mm = await api("POST", "/api/v1/payments/confirm", { token: A.token, body: { bookingId: b.id, orderId: b.id, amount: b.totalMinor - 1, paymentKey: `sbx_ok_${rnd()}` } });
  assert.equal(mm.data.code, "AMOUNT_MISMATCH");
  const dec = await pay(A.token, b, "declined");
  assert.equal(dec.status, 402);
  assert.equal((await api("GET", `/api/v1/bookings/${b.id}`, { token: A.token })).data.booking.status, "AWAITING_PAYMENT");
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

test("flight: passport required & encrypted; PNR and ticket are separate steps", async () => {
  const fq = (await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "FLIGHT", itemId: "flt_ke703", startDate: day(50), travelers: { adults: 1, infants: 1 } } })).data.quote;
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
  const fq = (await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "FLIGHT", itemId: "flt_ke703", startDate: day(51), travelers: { adults: 1 } } })).data.quote;
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

  const fq = (await api("POST", "/api/v1/quotes", { token: A.token, body: { domain: "FLIGHT", itemId: "flt_ke703", startDate: day(52), travelers: { adults: 1 } } })).data.quote;
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
  assert.equal((await api("POST", "/api/v1/user/coupons/claim", { token: A.token, body: { code: "TEST10" } })).status, 200);
  assert.equal((await api("POST", "/api/v1/user/coupons/claim", { token: A.token, body: { code: "TEST10" } })).data.code, "ALREADY_CLAIMED");
  const rv = await api("POST", "/api/v1/reviews", { token: B.token, body: { targetId: "htl_seoul_01", rating: 5, comment: "unverified" } });
  assert.equal(rv.data.verifiedStay, false);
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

test("ledger: every journal balanced; no payment/refund/deposit mismatch (run last)", async () => {
  const r = await api("GET", "/api/v1/admin/reconciliation", { token: ADMIN });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.unbalancedJournals, []);
  assert.deepEqual(r.data.paidMismatch, []);
  assert.deepEqual(r.data.refundMismatch, []);
  assert.deepEqual(r.data.strandedDeposits, []);
  assert.equal(r.data.ok, true);
});

#!/usr/bin/env node
/**
 * TG-13 order-trace demo: one trace id rides quote -> booking -> payment, then
 * the finished waterfall is printed from the admin trace lookup.
 *   BASE=http://127.0.0.1:8799 ADMIN_PASSWORD=... node scripts/trace-order.mjs
 * Localhost only (same rule as the E2E suite). The demo booking is real — run
 * it against an isolated DB, never production.
 */
import { randomBytes } from "node:crypto";

const BASE = process.env.BASE || "http://127.0.0.1:8799";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "LocalAdmin2026!x";
const baseHost = (() => { try { return new URL(BASE).hostname.toLowerCase(); } catch { return ""; } })();
if (!["127.0.0.1", "localhost", "::1"].includes(baseHost)) throw new Error("trace-order runs against localhost only");

const rnd = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const hex = (n) => randomBytes(n).toString("hex");
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function api(method, path, { token, body, headers = {} } = {}) {
  const h = { "Content-Type": "application/json", ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const traceId = hex(16);
console.log(`trace ${traceId}\n`);

const email = `trace_demo_${rnd()}@local.test`;
const reg = await api("POST", "/api/v1/auth/register", {
  body: { email, password: "Passw0rd-QA-1", fullName: "Trace Demo", agreeTerms: true, agreePrivacy: true },
});
if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.data)}`);
const token = reg.data.token;

const docs = (await api("GET", "/api/v1/legal")).data.documents || [];
const ver = Object.fromEntries(docs.map((d) => [d.slug, d.version]));
const consents = { refundPolicy: ver["refund-policy"], privacy: ver.privacy, thirdParty: ver.privacy };

const tp = (span) => ({ traceparent: `00-${traceId}-${span}-01` });
const off = 200 + Math.floor(Math.random() * 100);
const q = await api("POST", "/api/v1/quotes", {
  token, headers: tp(hex(8)),
  body: { domain: "HOTEL", itemId: "htl_seoul_01", unitId: "rm_seoul_01_dlx", startDate: day(off), endDate: day(off + 1), rooms: 1, travelers: { adults: 2 } },
});
if (q.status !== 201) throw new Error(`quote failed: ${q.status} ${JSON.stringify(q.data)}`);

const b = await api("POST", "/api/v1/bookings", {
  token, headers: { "Idempotency-Key": `idem_${rnd()}${rnd()}`, ...tp(hex(8)) },
  body: {
    quoteId: q.data.quote.quoteId,
    contact: { name: "김민지", email: "trace@local.test", phone: "+82-10-1111-2222" },
    travelers: [{ type: "ADULT", lastNameEn: "KIM", firstNameEn: "MINJI" }],
    consents,
  },
});
if (b.status !== 201) throw new Error(`booking failed: ${b.status} ${JSON.stringify(b.data)}`);
const booking = b.data.booking;

const p = await api("POST", "/api/v1/payments/confirm", {
  token, headers: tp(hex(8)),
  body: { bookingId: booking.id, orderId: booking.id, amount: booking.totalMinor, paymentKey: `sbx_ok_${rnd()}` },
});
if (p.status !== 200) throw new Error(`payment failed: ${p.status} ${JSON.stringify(p.data)}`);
console.log(`order ${booking.bookingNumber} ${booking.status} (paid ${(booking.totalMinor || 0).toLocaleString("ko-KR")} KRW)\n`);

const login = await api("POST", "/api/v1/auth/login", { body: { email: "admin@local.test", password: ADMIN_PASSWORD } });
if (login.status !== 200) throw new Error(`admin login failed: ${login.status}`);
const t = await api("GET", `/api/v1/admin/traces/${traceId}`, { token: login.data.token });
if (t.status !== 200) throw new Error(`trace lookup failed: ${t.status} ${JSON.stringify(t.data)}`);

for (const tr of t.data.traces) {
  console.log(`${tr.method} ${tr.route} -> ${tr.status} (${tr.durationMs}ms)`);
  const byId = new Map(tr.spans.map((s) => [s.spanId, s]));
  const kids = new Map();
  for (const s of tr.spans) {
    if (!byId.has(s.parentId)) continue;
    if (!kids.has(s.parentId)) kids.set(s.parentId, []);
    kids.get(s.parentId).push(s);
  }
  const walk = (s, depth) => {
    const ms = s.endMs != null ? Math.max(0, s.endMs - s.startMs) : -1;
    console.log(`${"  ".repeat(depth + 1)}- ${s.name} ${ms}ms${s.status === "error" ? " [error]" : ""}`);
    for (const k of kids.get(s.spanId) || []) walk(k, depth + 1);
  };
  for (const s of tr.spans.filter((x) => !byId.has(x.parentId))) walk(s, 0);
  console.log("");
}
console.log(`waterfall complete: ${t.data.traces.length} requests, ${t.data.traces.reduce((n, tr) => n + tr.spans.length, 0)} spans`);

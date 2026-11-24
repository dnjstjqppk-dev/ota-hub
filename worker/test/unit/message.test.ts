/** GAP-09 (2026-11-24 commercialization audit): SMS + Kakao Alimtalk channel. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  flushSmsOutbox, isKakaoConfigured, isSmsConfigured, kakaoTemplateId,
  notifyBooking, renderOutboxText, sendKakao, sendSms,
} from "../../src/services/message-service.ts";
import { fakeDb } from "./_fakedb.ts";

const SITE = "https://getfortrip.com";

// ---------------------------------------------------------------- stub (Solapi v4 shape)
interface Seen { url: string; auth: string; body: any }
const seen: Seen[] = [];
let failNext = false;
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => void (raw += c));
  req.on("end", () => {
    seen.push({ url: req.url || "", auth: String(req.headers.authorization || ""), body: raw ? JSON.parse(raw) : {} });
    res.writeHead(failNext ? 500 : 200, { "Content-Type": "application/json" });
    res.end(failNext ? JSON.stringify({ error: "x" }) : JSON.stringify({ error_count: 0, groupId: "G1" }));
  });
});
let stub = "";
before(async () => {
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", () => res()));
  const a = server.address();
  stub = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
});
after(async () => { await new Promise((res) => server.close(() => res(null))); });

const smsEnv = (over: Record<string, unknown> = {}) => ({
  SOLAPI_API_KEY: "key1", SOLAPI_API_SECRET: "sec1", SOLAPI_SENDER: "01011112222",
  SOLAPI_API_BASE: stub, PUBLIC_SITE_URL: SITE, ...over,
}) as any;

test("sms config: key + secret + sender gate SMS; pfId gates Alimtalk", () => {
  assert.equal(isSmsConfigured({} as any), false);
  assert.equal(isSmsConfigured({ SOLAPI_API_KEY: "k", SOLAPI_API_SECRET: "s" } as any), false);
  assert.equal(isSmsConfigured(smsEnv()), true);
  assert.equal(isKakaoConfigured(smsEnv()), false);
  assert.equal(isKakaoConfigured(smsEnv({ SOLAPI_KAKAO_PFID: "pf" })), true);
});

test("kakao templates: JSON map resolves ids; missing means SMS fallback", () => {
  const env = smsEnv({ SOLAPI_KAKAO_TEMPLATES: JSON.stringify({ BOOKING_CONFIRMED: "KA01" }) });
  assert.equal(kakaoTemplateId(env, "BOOKING_CONFIRMED"), "KA01");
  assert.equal(kakaoTemplateId(env, "REFUND_COMPLETED"), null);
  assert.equal(kakaoTemplateId(smsEnv(), "BOOKING_CONFIRMED"), null);
  assert.equal(kakaoTemplateId(smsEnv({ SOLAPI_KAKAO_TEMPLATES: "{bad" }), "BOOKING_CONFIRMED"), null);
});

test("sms text: booking lifecycle renders with number, amount, link; unknown never renders", () => {
  for (const [tpl, payload, needle] of [
    ["BOOKING_CONFIRMED", { bookingNumber: "GFT-1" }, "GFT-1"],
    ["PAYMENT_COMPLETED", { bookingNumber: "GFT-2", amountMinor: 123456 }, "123,456원"],
    ["BOOKING_CANCELLED", { bookingNumber: "GFT-3" }, "GFT-3"],
    ["REFUND_COMPLETED", { bookingNumber: "GFT-4", amountMinor: 5000 }, "5,000원"],
    ["FLIGHT_TICKETED", { bookingNumber: "GFT-5" }, "GFT-5"],
    ["WHOLESALE_ISSUED", { bookingNumber: "GFT-6" }, "GFT-6"],
    ["SUPPLIER_REJECTED", { bookingNumber: "GFT-7" }, "GFT-7"],
  ] as const) {
    const t = renderOutboxText(tpl, JSON.stringify(payload), SITE);
    assert.ok(t && t.includes(needle) && t.includes("getfortrip"), tpl);
  }
  assert.equal(renderOutboxText("MARKETING_BLAST", JSON.stringify({}), SITE), null);
  assert.equal(renderOutboxText("BOOKING_CONFIRMED", "{bad", SITE), null);
  assert.equal(renderOutboxText("REFUND_COMPLETED", JSON.stringify({ bookingNumber: "GFT-4" }), SITE), null);
  const xss = renderOutboxText("BOOKING_CONFIRMED", JSON.stringify({ bookingNumber: 'GFT-1"><script>' }), SITE);
  assert.ok(xss && !xss.includes("<script>"));
});

test("solapi sender: SMS/LMS split by length, ATA carries pfId + template", async () => {
  seen.length = 0;
  assert.equal(await sendSms(smsEnv(), "01099998888", "짧은 안내"), true);
  assert.equal(seen[0].url, "/messages/v4/send");
  assert.match(seen[0].auth, /^HMAC-SHA256 apiKey=key1, date=.+, salt=.+, signature=[0-9a-f]{64}$/);
  assert.equal(seen[0].body.message.type, "SMS");
  assert.equal(seen[0].body.message.to, "01099998888");
  assert.equal(await sendSms(smsEnv(), "01099998888", "긴 안내 ".repeat(40)), true);
  assert.equal(seen[1].body.message.type, "LMS");
  assert.ok(seen[1].body.message.subject);
  const env = smsEnv({ SOLAPI_KAKAO_PFID: "pf9", SOLAPI_KAKAO_TEMPLATES: JSON.stringify({ BOOKING_CONFIRMED: "KA01" }) });
  assert.equal(await sendKakao(env, "01099998888", "BOOKING_CONFIRMED", "예약 확정 안내", { bookingNumber: "GFT-1" }), true);
  assert.equal(seen[2].body.message.type, "ATA");
  assert.equal(seen[2].body.message.kakaoOptions.pfId, "pf9");
  assert.equal(seen[2].body.message.kakaoOptions.templateId, "KA01");
  failNext = true;
  try {
    assert.equal(await sendSms(smsEnv(), "01099998888", "x"), false);
  } finally {
    failNext = false;
  }
});

test("notifyBooking: EMAIL always, KAKAO only with a dialable phone", async () => {
  const captured: Array<{ sql: string; params: unknown[] }> = [];
  const db = fakeDb({ run: (sql, params) => { captured.push({ sql, params }); return { meta: { changes: 1 } }; } });
  const b = { id: "b1", booking_number: "GFT-1", customer_email: "u@t.t", customer_phone: "010-1234-5678" };
  for (const s of notifyBooking(db, b as any, "BOOKING_CONFIRMED", { bookingNumber: "GFT-1" })) await s.run();
  assert.equal(captured.length, 2);
  assert.deepEqual(captured.map((c) => c.params[1]).sort(), ["EMAIL", "KAKAO"]);
  captured.length = 0;
  for (const s of notifyBooking(db, { ...b, customer_phone: "n/a" } as any, "BOOKING_CONFIRMED", {})) await s.run();
  assert.equal(captured.length, 1);
  assert.equal(captured[0].params[1], "EMAIL");
});

function flushEnv(rows: Map<string, any>, over: Record<string, unknown> = {}) {
  const audits: unknown[] = [];
  const env = smsEnv({
    DB: fakeDb({
      all: () => [...rows.values()],
      run: (sql, params) => {
        if (sql.startsWith("UPDATE notification_outbox SET status = 'FAILED', attempts")) {
          rows.get(params[0] as string).status = "FAILED";
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("UPDATE notification_outbox SET status = ?")) {
          const r = rows.get(params[2] as string);
          r.status = params[0];
          r.attempts = params[1];
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("UPDATE notification_outbox SET status = 'SENT'")) {
          rows.get(params[0] as string).status = "SENT";
          return { meta: { changes: 1 } };
        }
        if (sql.includes("admin_audit_logs")) {
          audits.push(params);
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
    }),
    ...over,
  });
  return { env, audits };
}

test("sms flush: unconfigured leaves everything queued", async () => {
  const rows = new Map<string, any>([
    ["k1", { id: "k1", channel: "KAKAO", recipient: "0101", template: "BOOKING_CONFIRMED", payload_json: JSON.stringify({ bookingNumber: "GFT-1" }), attempts: 0 }],
  ]);
  const { env } = flushEnv(rows, { SOLAPI_API_KEY: "", SOLAPI_API_SECRET: "", SOLAPI_SENDER: "" });
  const r = await flushSmsOutbox(env);
  assert.deepEqual([r.sent, r.failed, r.pending], [0, 0, 1]);
  assert.equal(rows.get("k1").status, undefined);
});

test("sms flush: KAKAO without an approved template falls back to SMS", async () => {
  seen.length = 0;
  const rows = new Map<string, any>([
    ["k1", { id: "k1", channel: "KAKAO", recipient: "01099998888", template: "BOOKING_CONFIRMED", payload_json: JSON.stringify({ bookingNumber: "GFT-1" }), attempts: 0 }],
  ]);
  const { env } = flushEnv(rows); // no KAKAO pfId/templates configured
  const r = await flushSmsOutbox(env);
  assert.equal(r.sent, 1);
  assert.equal(rows.get("k1").status, "SENT");
  assert.equal(seen.length, 1);
  assert.ok(["SMS", "LMS"].includes(seen[0].body.message.type));
});

test("sms flush: unrenderable rows dead-letter with an audit", async () => {
  const rows = new Map<string, any>([
    ["bad", { id: "bad", channel: "SMS", recipient: "0101", template: "NOPE", payload_json: "{}", attempts: 0 }],
  ]);
  const { env, audits } = flushEnv(rows);
  const r = await flushSmsOutbox(env);
  assert.equal(r.failed, 1);
  assert.equal(rows.get("bad").status, "FAILED");
  assert.ok(audits.some((a: any) => a[2] === "SMS_DEAD_LETTER" && String(a[5]).includes("UNRENDERABLE")));
});

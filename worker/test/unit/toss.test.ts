import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { getPaymentProvider, tossProvider } from "../../src/payments/provider.ts";
import type { Env } from "../../src/env.ts";

/**
 * Toss Payments contract tests against a local stub of api.tosspayments.com/v1.
 * Proves request shapes (path/body/auth/idempotency) and response mapping, so
 * go-live day only needs real keys — no code changes.
 */

interface Seen { method: string; url: string; auth: string; idem: string; body: any }
const seen: Seen[] = [];
let handler: (req: http.IncomingMessage, body: any) => { status: number; json: any } = () => ({ status: 500, json: {} });

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => void (raw += c));
  req.on("end", () => {
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    seen.push({ method: req.method || "", url: req.url || "", auth: String(req.headers.authorization || ""), idem: String(req.headers["idempotency-key"] || ""), body });
    const r = handler(req, body);
    res.writeHead(r.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(r.json));
  });
});

let stub = "";
before(async () => {
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", () => res()));
  const a = server.address();
  stub = `http://127.0.0.1/${typeof a === "object" && a ? a.port : 0}`.replace("127.0.0.1/", "127.0.0.1:");
});
after(async () => { await new Promise((res) => server.close(() => res(null))); });

const SECRET = "test_sk_contract";
const last = () => seen[seen.length - 1];

test("toss: confirm approval maps DONE to CAPTURED with the PG amount", async () => {
  seen.length = 0;
  handler = () => ({ status: 200, json: { status: "DONE", paymentKey: "pg_key_1", totalAmount: 605000, method: "CARD", approvedAt: "2026-11-09T00:00:00Z" } });
  const p = tossProvider(SECRET, "test_ck_x", stub);
  const r = await p.confirm({ orderId: "bkg_1", paymentKey: "pg_key_1", amountMinor: 605000, currency: "KRW", idempotencyKey: "confirm_bkg_1" });
  assert.equal(r.outcome, "CAPTURED");
  if (r.outcome !== "CAPTURED") return;
  assert.equal(r.amountMinor, 605000);
  assert.equal(r.method, "CARD");
  assert.equal(last().method, "POST");
  assert.equal(last().url, "/payments/confirm");
  assert.equal(last().auth, "Basic " + Buffer.from(`${SECRET}:`).toString("base64"));
  assert.equal(last().idem, "confirm_bkg_1");
  assert.deepEqual(last().body, { paymentKey: "pg_key_1", orderId: "bkg_1", amount: 605000 });
});

test("toss: confirm decline maps the PG error code, 5xx maps to UNKNOWN", async () => {
  handler = () => ({ status: 400, json: { code: "REJECT_CARD_COMPANY", message: "카드사 거절" } });
  const p = tossProvider(SECRET, undefined, stub);
  const f = await p.confirm({ orderId: "b", paymentKey: "k", amountMinor: 1, currency: "KRW", idempotencyKey: "i" });
  assert.equal(f.outcome, "FAILED");
  if (f.outcome !== "FAILED") return;
  assert.equal(f.code, "REJECT_CARD_COMPANY");
  handler = () => ({ status: 500, json: {} });
  assert.equal((await p.confirm({ orderId: "b", paymentKey: "k", amountMinor: 1, currency: "KRW", idempotencyKey: "i" })).outcome, "UNKNOWN");
});

test("toss: network failure maps to UNKNOWN (never FAILED)", async () => {
  const p = tossProvider(SECRET, undefined, "http://127.0.0.1:9"); // closed port
  const r = await p.confirm({ orderId: "b", paymentKey: "k", amountMinor: 1, currency: "KRW", idempotencyKey: "i" });
  assert.equal(r.outcome, "UNKNOWN");
});

test("toss: refund posts cancelAmount and reads the last transactionKey", async () => {
  seen.length = 0;
  handler = () => ({ status: 200, json: { cancels: [{ transactionKey: "tx_1" }, { transactionKey: "tx_2" }] } });
  const p = tossProvider(SECRET, undefined, stub);
  const r = await p.refund({ paymentKey: "pg key/1", amountMinor: 10000, reason: "변심 환불", idempotencyKey: "rf_1" });
  assert.equal(r.outcome, "SUCCEEDED");
  if (r.outcome !== "SUCCEEDED") return;
  assert.equal(r.refundId, "tx_2");
  assert.equal(last().url, "/payments/pg%20key%2F1/cancel");
  assert.deepEqual(last().body, { cancelReason: "변심 환불", cancelAmount: 10000 });
  assert.equal(last().idem, "rf_1");
  handler = () => ({ status: 400, json: { code: "ALREADY_CANCELED_PAYMENT", message: "x" } });
  const f = await p.refund({ paymentKey: "k", amountMinor: 1, reason: "r", idempotencyKey: "i" });
  assert.equal(f.outcome, "FAILED");
  if (f.outcome !== "FAILED") return;
  assert.equal(f.code, "ALREADY_CANCELED_PAYMENT");
});

test("toss: lookup distinguishes captured, missing, and in-flight payments", async () => {
  const p = tossProvider(SECRET, undefined, stub);
  handler = () => ({ status: 200, json: { status: "DONE", paymentKey: "k", totalAmount: 5000, method: "CARD", approvedAt: "2026-11-09T00:00:00Z" } });
  const c = await p.lookup({ orderId: "b", paymentKey: null, amountMinor: 5000 });
  assert.equal(c.outcome, "CAPTURED");
  assert.equal(last().method, "GET");
  assert.equal(last().url, "/payments/orders/b");
  handler = () => ({ status: 404, json: { code: "NOT_FOUND_PAYMENT", message: "x" } });
  assert.equal((await p.lookup({ orderId: "b", paymentKey: null, amountMinor: 0 })).outcome, "NOT_CAPTURED");
  handler = () => ({ status: 200, json: { status: "WAITING_FOR_DEPOSIT", paymentKey: "k" } });
  assert.equal((await p.lookup({ orderId: "b", paymentKey: null, amountMinor: 0 })).outcome, "NOT_CAPTURED");
});

test("toss: test_ keys run in SANDBOX mode, live_ keys in LIVE mode", () => {
  assert.equal(tossProvider("test_sk_abc", undefined).mode, "SANDBOX");
  assert.equal(tossProvider("live_sk_abc", undefined).mode, "LIVE");
  assert.equal(tossProvider("test_sk_abc", "test_ck_1").publicConfig().clientKey, "test_ck_1");
  assert.ok(!JSON.stringify(tossProvider("live_sk_abc", "live_ck_1").publicConfig()).includes("live_sk_abc"));
});

test("toss: provider resolution honors the stub in test, refuses sandbox in production", async () => {
  seen.length = 0;
  handler = () => ({ status: 404, json: {} });
  const viaStub = getPaymentProvider({ APP_ENV: "test", PAYMENT_PROVIDER: "toss", TOSS_SECRET_KEY: SECRET, TOSS_API_BASE: stub } as Env);
  assert.ok(viaStub);
  await viaStub!.lookup({ orderId: "probe", paymentKey: null, amountMinor: 0 });
  assert.equal(seen.length, 1); // the stub was hit, not the real Toss API
  assert.equal(getPaymentProvider({ APP_ENV: "production", PAYMENT_PROVIDER: "sandbox" } as Env), null);
  assert.equal(getPaymentProvider({ APP_ENV: "production", PAYMENT_PROVIDER: "toss" } as Env), null); // no key
  const live = getPaymentProvider({ APP_ENV: "production", PAYMENT_PROVIDER: "toss", TOSS_SECRET_KEY: "live_sk_x" } as Env);
  assert.equal(live?.name, "toss");
  assert.equal(live?.mode, "LIVE");
});

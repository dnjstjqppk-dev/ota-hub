import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHmac } from "node:crypto";
import { getPaymentProvider } from "../../src/payments/provider.ts";
import { stripeProvider as stripeDirect, stripeDispute, verifyStripeSignature } from "../../src/payments/stripe.ts";
import type { Env } from "../../src/env.ts";

/**
 * TG-17: Stripe contract tests against a local stub of api.stripe.com.
 * Proves form-encoded shapes, 3DS mapping, and dispute verification, so
 * go-live day only needs real keys — no code changes.
 */

interface Seen { method: string; url: string; auth: string; idem: string; form: Record<string, string> }
const seen: Seen[] = [];
let stub = "";

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => void (raw += c));
  req.on("end", () => {
    const form: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(raw || "")) form[k] = v;
    seen.push({ method: req.method || "", url: req.url || "", auth: String(req.headers.authorization || ""), idem: String(req.headers["idempotency-key"] || ""), form });
    const send = (status: number, json: any) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const m = req.method || "";
    const u = req.url || "";
    if (m === "POST" && u === "/v1/payment_intents") {
      const pm = form.payment_method || "";
      if (pm.includes("http3ds")) {
        return send(200, { id: "pi_stub_http", object: "payment_intent", status: "requires_action", amount: Number(form.amount), currency: form.currency, next_action: { type: "redirect_to_url", redirect_to_url: { url: "http://127.0.0.1:18799/3ds-test/pi_stub_http" } }, created: 1790000000 });
      }
      if (pm.includes("3ds")) {
        return send(200, { id: "pi_stub_3ds", object: "payment_intent", status: "requires_action", amount: Number(form.amount), currency: form.currency, next_action: { type: "redirect_to_url", redirect_to_url: { url: "https://hooks.stripe.com/3ds/pi_stub_3ds" } }, created: 1790000000 });
      }
      if (pm.includes("decline")) return send(402, { error: { code: "card_declined", type: "card_error", message: "Your card was declined." } });
      if (pm.includes("err500")) return send(500, { error: { type: "api_error" } });
      return send(200, { id: "pi_stub_ok", object: "payment_intent", status: "succeeded", amount_received: Number(form.amount), currency: form.currency, created: 1790000000, charges: { data: [{ payment_method_details: { card: { brand: "visa" } } }] } });
    }
    if (m === "GET" && u.startsWith("/v1/payment_intents/")) {
      const id = u.split("/").pop() || "";
      if (id.includes("cancel")) return send(200, { id, status: "canceled" });
      if (id.includes("action")) return send(200, { id, status: "requires_action" });
      if (id.includes("missing")) return send(404, { error: { code: "resource_missing" } });
      return send(200, { id, status: "succeeded", amount_received: 605000, currency: "krw", created: 1790000000, charges: { data: [{ payment_method_details: { card: { brand: "mastercard" } } }] } });
    }
    if (m === "POST" && u === "/v1/refunds") {
      if (String(form.payment_intent || "").includes("fail")) return send(400, { error: { code: "charge_already_refunded", message: "already refunded" } });
      return send(200, { id: "re_stub_1", object: "refund", status: "succeeded" });
    }
    if (m === "GET" && u.startsWith("/v1/disputes/")) {
      return send(200, { id: "dp_stub_1", object: "dispute", amount: 605000, currency: "krw", reason: "fraudulent", status: "needs_response", charge: "ch_stub_1" });
    }
    if (m === "GET" && u.startsWith("/v1/charges/")) {
      return send(200, { id: "ch_stub_1", object: "charge", payment_intent: "pi_stub_ok" });
    }
    return send(404, { error: { code: "not_found" } });
  });
});

before(async () => {
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", () => res()));
  const a = server.address();
  stub = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
});
after(async () => { await new Promise((res) => server.close(() => res(null))); });

const SECRET = "sk_test_contract";
const last = () => seen[seen.length - 1];
const p = () => stripeDirect(SECRET, "pk_test_x", stub);

test("stripe: confirm approval maps succeeded to CAPTURED with form shape", async () => {
  seen.length = 0;
  const r = await p().confirm({ orderId: "bkg_1", paymentKey: "pm_stub_ok_x", amountMinor: 605000, currency: "KRW", idempotencyKey: "confirm_1" });
  assert.equal(r.outcome, "CAPTURED");
  if (r.outcome !== "CAPTURED") return;
  assert.equal(r.paymentKey, "pi_stub_ok");
  assert.equal(r.amountMinor, 605000);
  assert.equal(r.method, "CARD:VISA");
  assert.equal(last().method, "POST");
  assert.equal(last().url, "/v1/payment_intents");
  assert.equal(last().auth, "Basic " + Buffer.from(`${SECRET}:`).toString("base64"));
  assert.equal(last().idem, "confirm_1");
  assert.equal(last().form.amount, "605000");
  assert.equal(last().form.currency, "krw");
  assert.equal(last().form["metadata[order_id]"], "bkg_1");
});

test("stripe: 3DS surfaces ACTION_REQUIRED; decline and 5xx map honestly", async () => {
  const a = await p().confirm({ orderId: "b", paymentKey: "pm_stub_3ds_x", amountMinor: 1, currency: "KRW", idempotencyKey: "i1" });
  assert.equal(a.outcome, "ACTION_REQUIRED");
  if (a.outcome !== "ACTION_REQUIRED") return;
  assert.equal(a.paymentKey, "pi_stub_3ds");
  assert.match(a.actionUrl, /^https:\/\/hooks\.stripe\.com\//);
  const h = await p().confirm({ orderId: "b", paymentKey: "pm_stub_http3ds_x", amountMinor: 1, currency: "KRW", idempotencyKey: "i1b" });
  assert.equal(h.outcome, "ACTION_REQUIRED");
  const f = await p().confirm({ orderId: "b", paymentKey: "pm_stub_decline_x", amountMinor: 1, currency: "KRW", idempotencyKey: "i2" });
  assert.equal(f.outcome, "FAILED");
  if (f.outcome !== "FAILED") return;
  assert.equal(f.code, "card_declined");
  const u = await p().confirm({ orderId: "b", paymentKey: "pm_stub_err500_x", amountMinor: 1, currency: "KRW", idempotencyKey: "i3" });
  assert.equal(u.outcome, "UNKNOWN");
  const net = stripeDirect(SECRET, undefined, "http://127.0.0.1:9");
  assert.equal((await net.confirm({ orderId: "b", paymentKey: "pm_x", amountMinor: 1, currency: "KRW", idempotencyKey: "i4" })).outcome, "UNKNOWN");
});

test("stripe: lookup maps succeeded/canceled/in-flight/missing", async () => {
  const c = await p().lookup({ orderId: "b", paymentKey: "pi_stub_ok", amountMinor: 605000 });
  assert.equal(c.outcome, "CAPTURED");
  assert.equal((await p().lookup({ orderId: "b", paymentKey: "pi_stub_cancel", amountMinor: 1 })).outcome, "NOT_CAPTURED");
  assert.equal((await p().lookup({ orderId: "b", paymentKey: "pi_stub_action", amountMinor: 1 })).outcome, "UNKNOWN");
  assert.equal((await p().lookup({ orderId: "b", paymentKey: "pi_stub_missing", amountMinor: 1 })).outcome, "NOT_CAPTURED");
  assert.equal((await p().lookup({ orderId: "b", paymentKey: null, amountMinor: 1 })).outcome, "NOT_CAPTURED");
});

test("stripe: refund posts the PI and reads the refund id", async () => {
  const s = await p().refund({ paymentKey: "pi_stub_ok", amountMinor: 605000, reason: "test", idempotencyKey: "rf1" });
  assert.equal(s.outcome, "SUCCEEDED");
  if (s.outcome !== "SUCCEEDED") return;
  assert.equal(s.refundId, "re_stub_1");
  assert.equal(last().form.payment_intent, "pi_stub_ok");
  assert.equal((await p().refund({ paymentKey: "pi_stub_fail", amountMinor: 1, reason: "x", idempotencyKey: "rf2" })).outcome, "FAILED");
});

test("stripe: sk_test_ runs SANDBOX, sk_live_ runs LIVE, wiring resolves", async () => {
  assert.equal(stripeDirect("sk_test_1", undefined, stub).mode, "SANDBOX");
  assert.equal(stripeDirect("sk_live_1", undefined, stub).mode, "LIVE");
  assert.deepEqual(stripeDirect("sk_test_1", "pk_test_1", stub).publicConfig(), { provider: "stripe", mode: "SANDBOX", publishableKey: "pk_test_1" });
  const env = { PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_1", STRIPE_API_BASE: stub, APP_ENV: "test" } as Env;
  assert.equal(getPaymentProvider(env)?.name, "stripe");
  assert.equal(getPaymentProvider({ PAYMENT_PROVIDER: "stripe", APP_ENV: "test" } as Env), null);
});

test("stripe: dispute fetch resolves PI through the charge", async () => {
  const env = { STRIPE_SECRET_KEY: "sk_test_1", STRIPE_API_BASE: stub, APP_ENV: "test" } as Env;
  const d = await stripeDispute(env, "dp_stub_1");
  assert.ok(d);
  assert.equal(d!.paymentIntentId, "pi_stub_ok");
  assert.equal(d!.amountMinor, 605000);
  assert.equal(d!.reason, "fraudulent");
  assert.equal(await stripeDispute(env, "nope"), null);
  assert.equal(await stripeDispute({ APP_ENV: "test" } as Env, "dp_stub_1"), null);
});

test("stripe: webhook signature verifies a fixed vector, rejects forgeries", async () => {
  const secret = "whsec_test_vector";
  const t = String(Math.floor(Date.now() / 1000));
  const raw = '{"id":"evt_1","type":"charge.dispute.created"}';
  const v1 = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  assert.equal(await verifyStripeSignature(raw, `t=${t},v1=${v1}`, secret), true);
  assert.equal(await verifyStripeSignature(raw + "x", `t=${t},v1=${v1}`, secret), false);
  assert.equal(await verifyStripeSignature(raw, `t=${t},v1=${"0".repeat(64)}`, secret), false);
  const old = String(Math.floor(Date.now() / 1000) - 600);
  const vOld = createHmac("sha256", secret).update(`${old}.${raw}`).digest("hex");
  assert.equal(await verifyStripeSignature(raw, `t=${old},v1=${vOld}`, secret), false);
  assert.equal(await verifyStripeSignature(raw, null, secret), false);
});

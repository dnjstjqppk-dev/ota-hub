/**
 * Payment-gateway webhooks (Toss Payments event format).
 *
 * Toss delivers status-change hints to this endpoint. A webhook is NEVER
 * trusted for money movement on its own: it only triggers a PG lookup, and
 * the booking moves only when the PG confirms the outcome:
 *  - UNKNOWN payments are reconciled (same path as the maintenance cron);
 *  - CAPTURED payments with a cancel hint are re-queried, and a PG-confirmed
 *    dashboard cancel / chargeback is RECORDED (never re-executed) with
 *    holds released, coins restored, and payouts voided or claimed back (B1).
 * Duplicate deliveries are acknowledged without re-processing.
 *
 * Authentication (B1, GAP-05): Toss signs no webhook payload, so the PG
 * lookup IS the verification, and the registered webhook URL should carry
 * an unguessable `?key=` query: when TOSS_WEBHOOK_SECRET is set, calls
 * without a matching key are rejected before any lookup (constant-time
 * compare). Production without a registered secret rejects everything
 * (fail-closed, same as Stripe); development/test stay open for the suites.
 * Forged events can at most enqueue a lookup that the PG then rejects.
 * Responses are deliberately generic: unknown order IDs get the same shape
 * as known-but-settled ones, so the endpoint is not an order-existence
 * oracle.
 */
import { type Env, isNonProduction } from "../env.ts";
import { HttpError, json, readJson, str } from "../lib/http.ts";
import { rateLimit } from "../lib/auth.ts";
import { constantTimeEqual, newId } from "../lib/crypto.ts";
import { getPaymentProvider, getPaymentProviderFor } from "../payments/provider.ts";
import { stripeDispute, verifyStripeSignature } from "../payments/stripe.ts";
import { applyExternalCancel, getBooking, reconcilePaymentByLookup } from "../services/booking-service.ts";

async function record(env: Env, eventId: string, eventType: string, body: unknown, outcome: string): Promise<void> {
  await env.DB.prepare("INSERT OR IGNORE INTO payment_events (id, provider, event_id, event_type, payload, outcome) VALUES (?, 'toss', ?, ?, ?, ?)")
    .bind(newId("pev"), eventId, eventType, JSON.stringify(body).slice(0, 8000), outcome).run();
}

export async function handleWebhooks(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === "/api/v1/webhooks/stripe" && request.method === "POST") return stripeWebhook(request, env, url);
  if (url.pathname !== "/api/v1/webhooks/toss" || request.method !== "POST") return null;
  // Shared-secret check on the registered URL (?key=...). Toss calls the exact
  // URL registered in its console, so the secret rides along on real events.
  // GAP-05: constant-time compare (no early-exit oracle), and production
  // without a registered secret rejects everything — same fail-closed rule
  // as the Stripe branch below. Development/test stay open for the suites.
  const hookSecret = (env.TOSS_WEBHOOK_SECRET || "").trim();
  if (hookSecret) {
    if (!constantTimeEqual(url.searchParams.get("key") || "", hookSecret)) {
      throw new HttpError(403, "INVALID_WEBHOOK_SECRET", "웹훅 인증에 실패했습니다.");
    }
  } else if (!isNonProduction(env)) {
    throw new HttpError(403, "WEBHOOK_NOT_CONFIGURED", "웹훅 시크릿이 등록되지 않았습니다.");
  }
  // #99: PG callbacks are low-volume; 2/s sustained is plenty and a 5x
  // tighter bound against quota-filling floods than the old 600/min.
  await rateLimit(request, env, "toss_webhook", 120, 60);
  const body = await readJson(request);
  const eventType = str(body.eventType, 60);
  const data = (body.data && typeof body.data === "object" ? body.data : {}) as any;
  const orderId = str(data.orderId, 64);
  const paymentKey = str(data.paymentKey, 200);
  const status = str(data.status, 30).toUpperCase();
  if (!eventType || !orderId) throw new HttpError(400, "INVALID_WEBHOOK", "eventType과 data.orderId가 필요합니다.");

  // Dedupe redeliveries: same order + key + status is the same fact. 2026-11-27
  // review: successive partial cancels of ONE payment share order/key/status
  // (PARTIAL_CANCELED), so the latest cancel's transactionKey joins the id, and
  // cancel hints never short-circuit on a duplicate — they always re-query the
  // PG (applyExternalCancel works on cumulative amounts, so a rerun is a no-op).
  const cancels = Array.isArray(data.cancels) ? data.cancels : [];
  const lastCancelKey = cancels.length ? str(cancels[cancels.length - 1]?.transactionKey, 64) : "";
  const eventId = `${orderId}:${paymentKey || "-"}:${status || eventType}${lastCancelKey ? `:${lastCancelKey}` : ""}`.slice(0, 200);
  const isCancelHint = /CANCEL|CHARGEBACK|ABORTED|EXPIRED/.test(`${eventType} ${status}`.toUpperCase());
  const dup = await env.DB.prepare("SELECT outcome FROM payment_events WHERE provider = 'toss' AND event_id = ?").bind(eventId).first<{ outcome: string | null }>();
  if (dup && !isCancelHint) {
    // Same oracle rule as fresh events: an unknown order stays indistinguishable.
    const action = dup.outcome === "IGNORED_UNKNOWN_ORDER" ? "NO_UNKNOWN_PAYMENT" : dup.outcome;
    return json({ success: true, duplicate: true, reconciled: dup.outcome === "RECONCILED", action, outcome: action });
  }

  // Unknown orders answer generically WITHOUT needing any provider: there is
  // nothing to look up, and the response must not reveal config either.
  const b = await getBooking(env, orderId);
  if (!b) {
    // Recorded distinctly server-side, answered generically: same shape as a
    // known order with nothing to reconcile, so callers cannot probe order IDs.
    await record(env, eventId, eventType, body, "IGNORED_UNKNOWN_ORDER");
    return json({ success: true, duplicate: false, reconciled: false, action: "NO_UNKNOWN_PAYMENT" });
  }
  const unknowns = await env.DB.prepare("SELECT id FROM payments WHERE booking_id = ? AND status = 'UNKNOWN' ORDER BY created_at").bind(b.id).all<{ id: string }>();
  let reconciled = 0;
  for (const p of unknowns.results || []) {
    if ((await reconcilePaymentByLookup(env, p.id)) === "RECONCILED") reconciled++;
  }
  // B1: a cancel hint re-queries CAPTURED payments; a PG-confirmed external
  // cancel is recorded (money already moved — never executed twice).
  let externalApplied = 0;
  if (isCancelHint) {
    const captured = await env.DB.prepare("SELECT id, provider, provider_payment_key, amount_minor FROM payments WHERE booking_id = ? AND status IN ('CAPTURED', 'PARTIALLY_REFUNDED') ORDER BY created_at").bind(b.id).all<any>();
    // Multi-PG: each payment is re-queried through its OWN provider; rows with
    // an unresolvable provider fall back to the default, then skip quietly.
    const fallback = getPaymentProvider(env);
    for (const p of captured.results || []) {
      const pp = getPaymentProviderFor(env, p.provider) || fallback;
      if (!pp) continue;
      const r = await pp.lookup({ orderId: b.id, paymentKey: p.provider_payment_key, amountMinor: p.amount_minor });
      if (r.outcome === "CANCELED" || r.outcome === "PARTIAL_CANCELED") {
        const applied = await applyExternalCancel(env, b.id, { paymentId: p.id, canceledMinor: r.canceledMinor, cancelReason: r.cancelReason, transactionKey: r.transactionKey });
        if (applied === "APPLIED") externalApplied++;
      }
    }
  }
  const outcome = externalApplied ? "RECONCILED_EXTERNAL_CANCEL" : reconciled ? "RECONCILED" : "NO_UNKNOWN_PAYMENT";
  await record(env, eventId, eventType, body, outcome);
  return json({ success: true, duplicate: false, reconciled: reconciled > 0 || externalApplied > 0, action: outcome, bookingId: b.id });
}

/**
 * TG-17 Stripe webhooks. Same money rules as Toss (lookup-verified, generic
 * responses, deduped), but Stripe SIGNS payloads — verification is real:
 * STRIPE_WEBHOOK_SECRET must verify whenever it is set; production without
 * a secret rejects everything (fail-closed where money moves).
 */
async function stripeRecord(env: Env, eventId: string, eventType: string, body: unknown, outcome: string): Promise<void> {
  await env.DB.prepare("INSERT OR IGNORE INTO payment_events (id, provider, event_id, event_type, payload, outcome) VALUES (?, 'stripe', ?, ?, ?, ?)")
    .bind(newId("pev"), eventId, eventType, JSON.stringify(body).slice(0, 8000), outcome).run();
}

async function stripeWebhook(request: Request, env: Env, url: URL): Promise<Response> {
  await rateLimit(request, env, "stripe_webhook", 120, 60);
  const raw = await request.text();
  if (raw.length > 64 * 1024) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "요청 본문이 너무 큽니다.");
  const secret = (env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (secret) {
    if (!(await verifyStripeSignature(raw, request.headers.get("Stripe-Signature"), secret))) {
      throw new HttpError(403, "INVALID_WEBHOOK_SIGNATURE", "웹훅 서명 검증에 실패했습니다.");
    }
  } else if (env.APP_ENV !== "development" && env.APP_ENV !== "test") {
    throw new HttpError(403, "WEBHOOK_NOT_CONFIGURED", "웹훅 시크릿이 등록되지 않았습니다.");
  }
  let body: any = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    throw new HttpError(400, "MALFORMED_JSON", "요청 본문이 올바른 JSON이 아닙니다.");
  }
  const eventId = str(body?.id, 200);
  const eventType = str(body?.type, 100);
  if (!eventId || !eventType) throw new HttpError(400, "INVALID_WEBHOOK", "Stripe event id/type이 필요합니다.");
  const dup = await env.DB.prepare("SELECT outcome FROM payment_events WHERE provider = 'stripe' AND event_id = ?").bind(eventId).first<{ outcome: string | null }>();
  if (dup) return json({ success: true, duplicate: true, reconciled: dup.outcome === "RECONCILED", action: dup.outcome });
  const provider = getPaymentProviderFor(env, "stripe");
  if (!provider) {
    await stripeRecord(env, eventId, eventType, body, "IGNORED_NO_PROVIDER");
    return json({ success: true, reconciled: false, action: "IGNORED_NO_PROVIDER" });
  }
  const obj = (body?.data?.object && typeof body.data.object === "object" ? body.data.object : {}) as any;

  if (eventType === "charge.dispute.created") {
    const disputeId = str(obj.id, 100);
    const d = disputeId ? await stripeDispute(env, disputeId) : null;
    if (!d || !d.paymentIntentId) {
      await stripeRecord(env, eventId, eventType, body, "UNVERIFIED_DISPUTE");
      return json({ success: true, reconciled: false, action: "UNVERIFIED_DISPUTE" });
    }
    const pay = await env.DB.prepare("SELECT id, booking_id, amount_minor, refunded_minor FROM payments WHERE provider = 'stripe' AND provider_payment_key = ?").bind(d.paymentIntentId).first<any>();
    if (!pay) {
      await stripeRecord(env, eventId, eventType, body, "IGNORED_UNKNOWN_ORDER");
      return json({ success: true, duplicate: false, reconciled: false, action: "NO_UNKNOWN_PAYMENT" });
    }
    // applyExternalCancel takes a CUMULATIVE cancelled amount; a dispute reports
    // only the disputed part, so add what was already refunded (2026-11-27 review:
    // a chargeback after a partial refund was dropped as ALREADY_APPLIED).
    const cumulative = Math.min(Number(pay.refunded_minor || 0) + d.amountMinor, Number(pay.amount_minor || 0));
    const applied = await applyExternalCancel(env, pay.booking_id, {
      paymentId: pay.id, canceledMinor: cumulative, cancelReason: `CHARGEBACK:${d.reason}`.slice(0, 200), transactionKey: d.id,
    });
    const outcome = applied === "APPLIED" ? "RECONCILED_EXTERNAL_CANCEL" : applied;
    await stripeRecord(env, eventId, eventType, body, outcome);
    return json({ success: true, duplicate: false, reconciled: applied === "APPLIED", action: outcome, bookingId: pay.booking_id });
  }

  if (eventType === "payment_intent.succeeded") {
    const pi = str(obj.id, 100);
    const pay = pi ? await env.DB.prepare("SELECT id, booking_id FROM payments WHERE provider = 'stripe' AND provider_payment_key = ? AND status = 'UNKNOWN'").bind(pi).first<any>() : null;
    if (!pay) {
      await stripeRecord(env, eventId, eventType, body, "NO_UNKNOWN_PAYMENT");
      return json({ success: true, duplicate: false, reconciled: false, action: "NO_UNKNOWN_PAYMENT" });
    }
    const out = await reconcilePaymentByLookup(env, pay.id);
    await stripeRecord(env, eventId, eventType, body, out === "RECONCILED" ? "RECONCILED" : "SKIPPED");
    return json({ success: true, duplicate: false, reconciled: out === "RECONCILED", action: out, bookingId: pay.booking_id });
  }

  await stripeRecord(env, eventId, eventType, body, "IGNORED_TYPE");
  return json({ success: true, duplicate: false, reconciled: false, action: "IGNORED_TYPE" });
}

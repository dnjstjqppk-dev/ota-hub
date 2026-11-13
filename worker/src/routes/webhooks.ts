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
 * Authentication (B1): Toss signs no webhook payload, so the PG lookup IS the
 * verification, and the registered webhook URL should carry an unguessable
 * `?key=` query: when TOSS_WEBHOOK_SECRET is set, calls without it are
 * rejected before any lookup. Forged events can at most enqueue a lookup
 * that the PG then rejects. Responses are deliberately generic: unknown
 * order IDs get the same shape as known-but-settled ones, so the endpoint
 * is not an order-existence oracle.
 */
import type { Env } from "../env.ts";
import { HttpError, json, readJson, str } from "../lib/http.ts";
import { rateLimit } from "../lib/auth.ts";
import { newId } from "../lib/crypto.ts";
import { getPaymentProvider } from "../payments/provider.ts";
import { applyExternalCancel, getBooking, reconcilePaymentByLookup } from "../services/booking-service.ts";

async function record(env: Env, eventId: string, eventType: string, body: unknown, outcome: string): Promise<void> {
  await env.DB.prepare("INSERT OR IGNORE INTO payment_events (id, provider, event_id, event_type, payload, outcome) VALUES (?, 'toss', ?, ?, ?, ?)")
    .bind(newId("pev"), eventId, eventType, JSON.stringify(body).slice(0, 8000), outcome).run();
}

export async function handleWebhooks(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/v1/webhooks/toss" || request.method !== "POST") return null;
  // Shared-secret check on the registered URL (?key=...). Toss calls the exact
  // URL registered in its console, so the secret rides along on real events.
  if (env.TOSS_WEBHOOK_SECRET && url.searchParams.get("key") !== env.TOSS_WEBHOOK_SECRET) {
    throw new HttpError(403, "INVALID_WEBHOOK_SECRET", "웹훅 인증에 실패했습니다.");
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

  // Dedupe redeliveries: same order + key + status is the same fact.
  const eventId = `${orderId}:${paymentKey || "-"}:${status || eventType}`.slice(0, 200);
  const dup = await env.DB.prepare("SELECT outcome FROM payment_events WHERE provider = 'toss' AND event_id = ?").bind(eventId).first<{ outcome: string | null }>();
  if (dup) {
    // Same oracle rule as fresh events: an unknown order stays indistinguishable.
    const action = dup.outcome === "IGNORED_UNKNOWN_ORDER" ? "NO_UNKNOWN_PAYMENT" : dup.outcome;
    return json({ success: true, duplicate: true, reconciled: dup.outcome === "RECONCILED", action, outcome: action });
  }

  const provider = getPaymentProvider(env);
  if (!provider) {
    await record(env, eventId, eventType, body, "IGNORED_NO_PROVIDER");
    return json({ success: true, reconciled: false, action: "IGNORED_NO_PROVIDER" });
  }
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
  const hint = `${eventType} ${status}`.toUpperCase();
  const cancelHint = /CANCEL|CHARGEBACK|ABORTED|EXPIRED/.test(hint);
  if (cancelHint) {
    const captured = await env.DB.prepare("SELECT id, provider_payment_key, amount_minor FROM payments WHERE booking_id = ? AND status IN ('CAPTURED', 'PARTIALLY_REFUNDED') ORDER BY created_at").bind(b.id).all<any>();
    for (const p of captured.results || []) {
      const r = await provider.lookup({ orderId: b.id, paymentKey: p.provider_payment_key, amountMinor: p.amount_minor });
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

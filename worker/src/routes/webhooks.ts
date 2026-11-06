/**
 * Payment-gateway webhooks (Toss Payments event format).
 *
 * Toss delivers status-change hints to this endpoint. A webhook is NEVER
 * trusted for money movement on its own: it only triggers the same PG lookup
 * the maintenance cron uses, and the booking moves only when the PG confirms
 * the outcome. Duplicate deliveries are acknowledged without re-processing.
 */
import type { Env } from "../env.ts";
import { HttpError, json, readJson, str } from "../lib/http.ts";
import { rateLimit } from "../lib/auth.ts";
import { newId } from "../lib/crypto.ts";
import { getPaymentProvider } from "../payments/provider.ts";
import { getBooking, reconcilePaymentByLookup } from "../services/booking-service.ts";

async function record(env: Env, eventId: string, eventType: string, body: unknown, outcome: string): Promise<void> {
  await env.DB.prepare("INSERT OR IGNORE INTO payment_events (id, provider, event_id, event_type, payload, outcome) VALUES (?, 'toss', ?, ?, ?, ?)")
    .bind(newId("pev"), eventId, eventType, JSON.stringify(body).slice(0, 8000), outcome).run();
}

export async function handleWebhooks(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== "/api/v1/webhooks/toss" || request.method !== "POST") return null;
  await rateLimit(request, env, "toss_webhook", 600, 60);
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
  if (dup) return json({ success: true, duplicate: true, reconciled: dup.outcome === "RECONCILED", action: dup.outcome, outcome: dup.outcome });

  const provider = getPaymentProvider(env);
  if (!provider) {
    await record(env, eventId, eventType, body, "IGNORED_NO_PROVIDER");
    return json({ success: true, reconciled: false, action: "IGNORED_NO_PROVIDER" });
  }
  const b = await getBooking(env, orderId);
  if (!b) {
    await record(env, eventId, eventType, body, "IGNORED_UNKNOWN_ORDER");
    return json({ success: true, reconciled: false, action: "IGNORED_UNKNOWN_ORDER" });
  }
  const unknowns = await env.DB.prepare("SELECT id FROM payments WHERE booking_id = ? AND status = 'UNKNOWN' ORDER BY created_at").bind(b.id).all<{ id: string }>();
  let reconciled = 0;
  for (const p of unknowns.results || []) {
    if ((await reconcilePaymentByLookup(env, p.id)) === "RECONCILED") reconciled++;
  }
  const outcome = reconciled ? "RECONCILED" : "NO_UNKNOWN_PAYMENT";
  await record(env, eventId, eventType, body, outcome);
  return json({ success: true, duplicate: false, reconciled: reconciled > 0, action: outcome, bookingId: b.id });
}

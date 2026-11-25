import type { Env } from "../env.ts";
import { HttpError, json, readJson, str } from "../lib/http.ts";
import { idempotencyPrecheck, idempotencyStore } from "../lib/idempotency.ts";
import { rateLimit, requireUser } from "../lib/auth.ts";
import { db } from "../db/database.ts";
import { trackEvent } from "../lib/analytics.ts";
import { attributionFromRequest, ownHostsOf } from "../services/traffic-source.ts";
import { availablePaymentProviders } from "../payments/provider.ts";
import * as S from "../services/booking-service.ts";
import * as changeSvc from "../services/change-service.ts";
import { startSpan, traceOf, withSpan } from "../lib/tracing.ts";

/** payment.confirm span that parents supplier spans (waterfall fidelity). */
async function confirmTraced(request: Request, env: Env, user: any, body: any) {
  const tctx = traceOf(request);
  if (!tctx) return S.confirmPayment(env, user, body);
  const span = startSpan(tctx, "payment.confirm");
  try {
    const out = await S.confirmPayment(env, user, body, tctx, span.spanId);
    span.end("ok");
    return out;
  } catch (e) {
    span.end("error");
    throw e;
  }
}

export async function handleBookings(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  const attr = attributionFromRequest(request, ownHostsOf(env)) || {};

  if (path === "/api/v1/payments/config" && method === "GET") {
    const all = availablePaymentProviders(env);
    const p = all[0] || null;
    return json({ success: true, enabled: Boolean(p), ...(p ? p.publicConfig() : { provider: null, mode: null }), providers: all.map((x) => x.publicConfig()) });
  }

  if (path === "/api/v1/quotes" && method === "POST") {
    const user = await requireUser(request, env);
    // #164 (CI-calibrated): 30/60 tripped legitimate CI bursts (the Linux
    // runner paces ~3x the dev box). 120 keeps a real per-IP backstop.
    await rateLimit(request, env, "quotes", 120, 60);
    return json({ success: true, quote: await S.createQuote(env, user, await readJson(request)) }, 201);
  }

  if (path === "/api/v1/bookings" && method === "POST") {
    const user = await requireUser(request, env);
    await rateLimit(request, env, "bookings", 120, 60);
    const bookingBody = await readJson(request);
    const creator = Array.isArray(bookingBody.cartQuoteIds) ? S.createCartBooking : S.createBooking;
    const r = await withSpan(traceOf(request), "booking.create", () => creator(env, user, bookingBody, request.headers.get("Idempotency-Key"), request));
    // TG-03: funnel "book" fires on fresh bookings only — replays already counted.
    if (!r.replayed) await trackEvent(db(env), { type: "book", domain: r.booking.domain, entityId: r.booking.id, userId: user.id, ...attr });
    return json({ success: true, replayed: r.replayed, booking: r.booking }, r.replayed ? 200 : 201);
  }

  // GAP-08: flight itinerary change (assisted cancel + rebook).
  let chm = path.match(/^\/api\/v1\/bookings\/([A-Za-z0-9_-]{4,64})\/change-request$/);
  if (chm && method === "POST") {
    const user = await requireUser(request, env);
    await rateLimit(request, env, "bookings", 120, 60);
    return json({ success: true, ...(await changeSvc.requestChange(env, user, chm[1], await readJson(request))) }, 201);
  }
  chm = path.match(/^\/api\/v1\/change-requests\/([A-Za-z0-9_-]{4,64})\/confirm$/);
  if (chm && method === "POST") {
    const user = await requireUser(request, env);
    await rateLimit(request, env, "bookings", 120, 60);
    return json({ success: true, ...(await changeSvc.confirmChange(env, user, chm[1], await readJson(request))) });
  }
  chm = path.match(/^\/api\/v1\/bookings\/([A-Za-z0-9_-]{4,64})\/change-requests$/);
  if (chm && method === "GET") {
    const user = await requireUser(request, env);
    return json({ success: true, requests: await changeSvc.listChanges(env, user.id, chm[1], null) });
  }

  if (path === "/api/v1/bookings" && method === "GET") {
    const user = await requireUser(request, env);
    await rateLimit(request, env, "user_read", 600, 60);
    const rows = await env.DB.prepare(
      `SELECT id, booking_number, domain_type, item_id, title, status, total_minor, currency, payment_status, service_start, service_end, created_at
       FROM bookings WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
    ).bind(user.id).all<any>();
    const { STATUS_LABEL_KO } = await import("../domain/state-machine.ts");
    return json({
      success: true,
      bookings: (rows.results || []).map((r: any) => ({
        id: r.id, bookingNumber: r.booking_number, domain: r.domain_type, itemId: r.item_id, title: r.title, status: r.status,
        statusLabel: (STATUS_LABEL_KO as any)[r.status] || r.status,
        totalMinor: r.total_minor ?? 0, currency: r.currency,
        paymentStatus: r.payment_status, serviceStart: r.service_start, serviceEnd: r.service_end, createdAt: r.created_at,
      })),
    });
  }

  if (path === "/api/v1/payments/confirm" && method === "POST") {
    const user = await requireUser(request, env);
    // #164 (CI-calibrated): restored to the CI-proven 120 until per-minute
    // payment peaks are measured; 60 never earned its margin.
    await rateLimit(request, env, "payments", 120, 60);
    const body = await readJson(request);
    // #147: concurrent tabs submitting one payment share a key — the second
    // replays the first instead of 409ing. Optional (old clients send none);
    // same key + different payment is a 422, like the coin-adjust endpoint.
    const idemKey = str(request.headers.get("Idempotency-Key"), 100);
    if (idemKey) {
      if (!/^[A-Za-z0-9_-]{16,80}$/.test(idemKey)) throw new HttpError(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key는 16~80자의 영문·숫자·-_여야 합니다.");
      const idem = await idempotencyPrecheck(env, "payments:confirm", idemKey, [user.id, str(body.bookingId, 64), str(body.orderId, 64), String(body.amount), str(body.paymentKey, 200)]);
      if (idem.replay) return json({ ...(idem.replay.body as Record<string, unknown>), replayed: true }, idem.replay.status);
      const keyed = await confirmTraced(request, env, user, body);
      const out = { success: true, ...keyed };
      await idempotencyStore(env, "payments:confirm", idemKey, 200, out);
      return json(out);
    }
    const r = await confirmTraced(request, env, user, body);
    return json({ success: true, ...r });
  }

  // TG-17: 3DS return landing (Stripe redirects the browser here with the PI).
  // Finalizes through reconcile — the PI must already exist as an UNKNOWN
  // payment row, so a forged PI id settles nothing.
  if (path === "/api/v1/payments/stripe/return" && method === "GET") {
    await rateLimit(request, env, "stripe_return", 120, 60);
    const pi = str(url.searchParams.get("payment_intent"), 100);
    if (!pi) throw new HttpError(400, "PAYMENT_INTENT_REQUIRED", "payment_intent이 필요합니다.");
    const row = await env.DB.prepare("SELECT id, booking_id FROM payments WHERE provider = 'stripe' AND provider_payment_key = ?").bind(pi).first<any>();
    if (!row) throw new HttpError(404, "PAYMENT_NOT_FOUND", "결제를 찾을 수 없습니다.");
    const out = await S.reconcilePaymentByLookup(env, row.id);
    const rb = await S.getBooking(env, row.booking_id);
    return json({ success: true, reconciled: out === "RECONCILED", bookingId: row.booking_id, status: rb?.status || null });
  }

  // #171: exact retired paths first -- the :id matcher below swallows
  // /bookings/calculate ("calculate" looks like an id) and used to 404 it
  // instead of answering the honest 410.

  if (/^\/api\/v1\/bookings\/[^/]+\/pay$/.test(path)) {
    throw new HttpError(410, "ENDPOINT_REMOVED", "이 결제 경로는 폐기되었습니다. /api/v1/payments/confirm 을 사용하세요.");
  }
  if (path === "/api/v1/bookings/calculate") {
    throw new HttpError(410, "ENDPOINT_REMOVED", "가격 계산은 /api/v1/quotes 로 서버에서만 수행됩니다.");
  }

  let m = path.match(/^\/api\/v1\/bookings\/([A-Za-z0-9_-]{4,64})$/);
  if (m && method === "GET") {
    const user = await requireUser(request, env);
    await rateLimit(request, env, "user_read", 600, 60);
    const b = await S.getBooking(env, m[1]);
    if (!b) throw new HttpError(404, "BOOKING_NOT_FOUND", "예약 정보를 찾을 수 없습니다.");
    if (b.user_id !== user.id && user.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "타인의 예약에는 접근할 수 없습니다.");
    // Lazily expire an abandoned booking so the customer sees the truth even before the cron runs.
    if (b.status === "AWAITING_PAYMENT" && b.inventory_lock_expires_at <= new Date().toISOString()) await S.expireBooking(env, b, "PAYMENT_WINDOW_ELAPSED");
    return json({ success: true, booking: await S.serializeBooking(env, (await S.getBooking(env, b.id))!, user) });
  }

  m = path.match(/^\/api\/v1\/bookings\/([A-Za-z0-9_-]{4,64})\/cancel$/);
  if (m && method === "POST") {
    const user = await requireUser(request, env);
    await rateLimit(request, env, "cancel", 120, 60);
    return json({ success: true, booking: await S.cancelByCustomer(env, user, m[1]) });
  }

  // B6: customer payment receipt. Every figure comes from recorded payments.
  m = path.match(/^\/api\/v1\/bookings\/([A-Za-z0-9_-]{4,64})\/receipt$/);
  if (m && method === "GET") {
    const ruser = await requireUser(request, env);
    await rateLimit(request, env, "user_read", 600, 60);
    const rb = await S.getBooking(env, m[1]);
    if (!rb) throw new HttpError(404, "BOOKING_NOT_FOUND", "예약 정보를 찾을 수 없습니다.");
    if (rb.user_id !== ruser.id && ruser.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "타인의 예약에는 접근할 수 없습니다.");
    const full = await S.serializeBooking(env, rb, ruser);
    const raws = await env.DB.prepare("SELECT id, raw_json FROM payments WHERE booking_id = ?").bind(rb.id).all<any>();
    const cardById: Record<string, any> = {};
    for (const r of raws.results || []) {
      try {
        const card = JSON.parse(r.raw_json || "null")?.card;
        if (card) cardById[r.id] = { company: card.company || null, number: card.number || null, installmentMonths: card.installmentPlanMonths ?? null };
      } catch { /* sandbox rows carry no card */ }
    }
    return json({
      success: true,
      receipt: {
        bookingNumber: full.bookingNumber, title: full.title, serviceStart: full.serviceStart, serviceEnd: full.serviceEnd,
        salesTypeLabel: full.salesTypeLabel, supplierName: full.supplierName, contact: full.contact,
        currency: full.currency, totalMinor: full.totalMinor, paidMinor: full.paidMinor, refundedMinor: full.refundedMinor,
        payments: (full.payments || []).map((p: any) => ({ id: p.id, provider: p.provider, mode: p.mode, method: p.method, amountMinor: p.amount_minor, refundedMinor: p.refunded_minor, status: p.status, approvedAt: p.approved_at, card: cardById[p.id] || null })),
        refunds: (full.refunds || []).map((r: any) => ({ id: r.id, amountMinor: r.amount_minor, status: r.status, reason: r.reason, source: r.source, offline: r.offline, createdAt: r.created_at })),
        issuedAt: new Date().toISOString(),
      },
    });
  }

  return null;
}

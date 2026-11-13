import type { Env } from "../env.ts";
import { HttpError, json, readJson } from "../lib/http.ts";
import { rateLimit, requireUser } from "../lib/auth.ts";
import { getPaymentProvider } from "../payments/provider.ts";
import * as S from "../services/booking-service.ts";

export async function handleBookings(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/v1/payments/config" && method === "GET") {
    const p = getPaymentProvider(env);
    return json({ success: true, enabled: Boolean(p), ...(p ? p.publicConfig() : { provider: null, mode: null }) });
  }

  if (path === "/api/v1/quotes" && method === "POST") {
    const user = await requireUser(request, env);
    await rateLimit(request, env, "quotes", 300, 60);
    return json({ success: true, quote: await S.createQuote(env, user, await readJson(request)) }, 201);
  }

  if (path === "/api/v1/bookings" && method === "POST") {
    const user = await requireUser(request, env);
    await rateLimit(request, env, "bookings", 120, 60);
    const r = await S.createBooking(env, user, await readJson(request), request.headers.get("Idempotency-Key"), request);
    return json({ success: true, replayed: r.replayed, booking: r.booking }, r.replayed ? 200 : 201);
  }

  if (path === "/api/v1/bookings" && method === "GET") {
    const user = await requireUser(request, env);
    await rateLimit(request, env, "user_read", 600, 60);
    const rows = await env.DB.prepare(
      `SELECT id, booking_number, domain_type, item_id, title, status, total_minor, total_price, currency, payment_status, service_start, service_end, created_at
       FROM bookings WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
    ).bind(user.id).all<any>();
    const { STATUS_LABEL_KO } = await import("../domain/state-machine.ts");
    return json({
      success: true,
      bookings: (rows.results || []).map((r: any) => ({
        id: r.id, bookingNumber: r.booking_number, domain: r.domain_type, itemId: r.item_id, title: r.title, status: r.status,
        statusLabel: (STATUS_LABEL_KO as any)[r.status] || r.status,
        totalMinor: r.total_minor ?? Math.round(Number(r.total_price || 0)), currency: r.currency,
        paymentStatus: r.payment_status, serviceStart: r.service_start, serviceEnd: r.service_end, createdAt: r.created_at,
      })),
    });
  }

  if (path === "/api/v1/payments/confirm" && method === "POST") {
    const user = await requireUser(request, env);
    await rateLimit(request, env, "payments", 120, 60);
    const r = await S.confirmPayment(env, user, await readJson(request));
    return json({ success: true, ...r });
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

  if (/^\/api\/v1\/bookings\/[^/]+\/pay$/.test(path)) {
    throw new HttpError(410, "ENDPOINT_REMOVED", "이 결제 경로는 폐기되었습니다. /api/v1/payments/confirm 을 사용하세요.");
  }
  if (path === "/api/v1/bookings/calculate") {
    throw new HttpError(410, "ENDPOINT_REMOVED", "가격 계산은 /api/v1/quotes 로 서버에서만 수행됩니다.");
  }
  return null;
}

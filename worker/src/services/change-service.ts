/**
 * GAP-08: flight itinerary change (reissue) as an assisted cancel + rebook.
 *
 * Airlines change schedules and travelers change plans; NDC OrderChange APIs
 * need carrier contracts that do not exist yet, so v1 reissues through the
 * primitives that already move money safely: the old booking is cancelled
 * (policy fees, or waived for admin-approved involuntary changes) and a new
 * booking is created for the new dates. The new booking is paid normally —
 * no second payment movement ever lands on one booking.
 *
 * Safety order (2026-11-27 review — two phases): confirm only CREATES the new
 * booking (status stays EXECUTING with new_booking_id set). The old booking is
 * cancelled by finalizeChangeAfterCapture() once the NEW booking's payment is
 * captured. A declined card or a lapsed payment window therefore never leaves
 * the customer with no booking and a cancellation fee; the abandoned request
 * is closed as CANCELLED and the old booking stays untouched.
 */
import type { Env } from "../env.ts";
import type { AuthUser } from "../lib/auth.ts";
import { HttpError, str } from "../lib/http.ts";
import { decryptField, newId } from "../lib/crypto.ts";
import { cancelByCustomer, cancellationPreview, createBooking, createQuote, getBooking, serializeBooking } from "./booking-service.ts";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface ChangePreview {
  requestId: string;
  status: string;
  executable: boolean;
  newTotalMinor: number;
  cancelFeeMinor: number;
  refundDueMinor: number;
}

export async function requestChange(env: Env, user: AuthUser, bookingId: string, body: any): Promise<ChangePreview> {
  const b = await getBooking(env, str(bookingId, 64));
  if (!b || b.user_id !== user.id) throw new HttpError(404, "BOOKING_NOT_FOUND", "예약을 찾을 수 없습니다.");
  if (b.domain_type !== "FLIGHT" && b.domain_type !== "HOTEL") throw new HttpError(400, "CHANGE_DOMAIN_UNSUPPORTED", "일정 변경은 항공·호텔부터 지원합니다. 날짜를 바꾸려면 취소 후 다시 예약해 주세요.");
  if (b.status !== "TICKETED" && b.status !== "VOUCHER_ISSUED") throw new HttpError(409, "CHANGE_NOT_ELIGIBLE", "발급 완료된 예약만 일정을 변경할 수 있습니다.");
  const type = str(body.type, 20).toUpperCase();
  if (type !== "VOLUNTARY" && type !== "INVOLUNTARY") throw new HttpError(400, "CHANGE_TYPE_REQUIRED", "변경 사유(자발적·항공사 사유)를 선택해 주세요.");
  const startDate = str(body.newStartDate, 10);
  const endDate = str(body.newEndDate, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (!ISO.test(startDate) || startDate < today) throw new HttpError(400, "INVALID_NEW_DATES", "변경할 날짜가 올바르지 않습니다.");
  if (endDate && (!ISO.test(endDate) || endDate < startDate)) throw new HttpError(400, "INVALID_NEW_DATES", "변경할 날짜가 올바르지 않습니다.");
  const open = await env.DB.prepare("SELECT id FROM change_requests WHERE booking_id = ? AND status IN ('PENDING_APPROVAL','APPROVED','EXECUTING')").bind(b.id).first();
  if (open) throw new HttpError(409, "CHANGE_ALREADY_OPEN", "진행 중인 일정 변경이 있습니다.");
  const origQuote = await env.DB.prepare("SELECT unit_id, params_json FROM quotes WHERE id = ?").bind(b.quote_id).first<{ unit_id: string | null; params_json: string }>();
  if (!origQuote) throw new HttpError(409, "CHANGE_QUOTE_LOST", "원본 견적을 찾을 수 없습니다. 고객센터로 문의해 주세요.");
  const params = JSON.parse(origQuote.params_json);
  const quote = await createQuote(env, user, {
    ...params, domain: b.domain_type, itemId: b.item_id, unitId: origQuote.unit_id,
    startDate, endDate: endDate || undefined, promotionCode: undefined, coinAmount: 0,
  });
  const preview = cancellationPreview(b as any);
  const id = newId("chg");
  const approved = type === "VOLUNTARY";
  await env.DB.prepare(
    `INSERT INTO change_requests (id, booking_id, user_id, type, status, new_quote_id, new_start_date, new_end_date,
      new_total_minor, cancel_fee_minor, refund_due_minor, reason, decided_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, b.id, user.id, type, approved ? "APPROVED" : "PENDING_APPROVAL", quote.quoteId,
    startDate, endDate || null, quote.totalMinor, preview.feeMinor, preview.refundMinor,
    str(body.reason, 500) || null, approved ? new Date().toISOString() : null).run();
  return {
    requestId: id, status: approved ? "APPROVED" : "PENDING_APPROVAL", executable: approved,
    newTotalMinor: quote.totalMinor, cancelFeeMinor: preview.feeMinor, refundDueMinor: preview.refundMinor,
  };
}

export async function confirmChange(env: Env, user: AuthUser, requestId: string, body: any): Promise<{ oldBooking: unknown; newBookingId: string }> {
  const r = await env.DB.prepare("SELECT * FROM change_requests WHERE id = ?").bind(str(requestId, 64)).first<any>();
  if (!r || r.user_id !== user.id) throw new HttpError(404, "CHANGE_NOT_FOUND", "일정 변경 요청을 찾을 수 없습니다.");
  if (r.status === "EXECUTED" && r.new_booking_id) {
    return { oldBooking: await serializeBooking(env, (await getBooking(env, r.booking_id))!, user), newBookingId: r.new_booking_id };
  }
  if (r.status === "EXECUTING" && r.new_booking_id) {
    // Phase 1 already ran: the new booking is waiting for its payment.
    const nb = await getBooking(env, r.new_booking_id);
    if (nb && nb.status === "AWAITING_PAYMENT") {
      return { oldBooking: await serializeBooking(env, (await getBooking(env, r.booking_id))!, user), newBookingId: r.new_booking_id };
    }
    if (!nb || ["EXPIRED", "FAILED", "CANCELLED"].includes(nb.status)) {
      // The new booking died unpaid; its quote is consumed, so this request is
      // closed. The old booking was never touched.
      await env.DB.prepare("UPDATE change_requests SET status = 'CANCELLED' WHERE id = ? AND status = 'EXECUTING'").bind(r.id).run();
      throw new HttpError(409, "CHANGE_EXPIRED", "새 예약의 결제 시간이 지나 일정 변경이 취소되었습니다. 기존 예약은 그대로 유지됩니다. 다시 요청해 주세요.");
    }
    return { oldBooking: await serializeBooking(env, (await getBooking(env, r.booking_id))!, user), newBookingId: r.new_booking_id };
  }
  if (r.status !== "APPROVED") throw new HttpError(409, "CHANGE_NOT_APPROVED", "아직 실행할 수 없는 요청입니다.");
  const claimed = await env.DB.prepare("UPDATE change_requests SET status = 'EXECUTING' WHERE id = ? AND status = 'APPROVED'").bind(r.id).run();
  if (!claimed.meta.changes) {
    const cur = await env.DB.prepare("SELECT status, new_booking_id FROM change_requests WHERE id = ?").bind(r.id).first<any>();
    if (cur?.status === "EXECUTED" && cur.new_booking_id) {
      return { oldBooking: await serializeBooking(env, (await getBooking(env, r.booking_id))!, user), newBookingId: cur.new_booking_id };
    }
    throw new HttpError(409, "CHANGE_NOT_APPROVED", "아직 실행할 수 없는 요청입니다.");
  }
  try {
    const b = await getBooking(env, r.booking_id);
    if (!b || (b.status !== "TICKETED" && b.status !== "VOUCHER_ISSUED")) throw new HttpError(409, "CHANGE_NOT_ELIGIBLE", "발급 완료된 예약만 일정을 변경할 수 있습니다.");
    // Same party: the server reuses the old booking's travelers (owner-scoped,
    // passports decrypted in-process) so passports are never retyped or
    // exposed; createBooking still validates + re-encrypts everything.
    let travelers = body.travelers;
    if (body.reuseTravelers) {
      const rows = await env.DB.prepare(
        "SELECT traveler_type, last_name_en, first_name_en, birth_date, gender, nationality, passport_enc, passport_expiry FROM booking_travelers WHERE booking_id = ? ORDER BY is_lead DESC",
      ).bind(r.booking_id).all<any>();
      travelers = [];
      for (const t of rows.results || []) {
        travelers.push({
          type: t.traveler_type, lastNameEn: t.last_name_en, firstNameEn: t.first_name_en,
          birthDate: t.birth_date, gender: t.gender, nationality: t.nationality,
          passportNumber: t.passport_enc ? await decryptField(t.passport_enc, env.PII_ENC_KEY!) : null,
          passportExpiry: t.passport_expiry,
        });
      }
      if (!travelers.length) throw new HttpError(409, "CHANGE_TRAVELERS_LOST", "기존 여행자 정보를 찾을 수 없습니다. 고객센터로 문의해 주세요.");
    }
    const created = await createBooking(env, user, {
      quoteId: r.new_quote_id, contact: body.contact, travelers,
      specialRequests: body.specialRequests, consents: body.consents,
    }, `chg_${r.id}_${Date.now().toString(36)}`.slice(0, 80));
    // Phase 1 ends here: the old booking stays live until the new one is paid.
    await env.DB.prepare("UPDATE change_requests SET new_booking_id = ? WHERE id = ?").bind(created.booking.id, r.id).run();
    return { oldBooking: await serializeBooking(env, b, user), newBookingId: created.booking.id };
  } catch (e) {
    await env.DB.prepare("UPDATE change_requests SET status = 'APPROVED' WHERE id = ? AND status = 'EXECUTING'").bind(r.id).run();
    throw e;
  }
}

/**
 * Phase 2: called after a booking's payment is captured. When that booking is
 * the replacement of an EXECUTING change request, the old booking is cancelled
 * now (fee waived for approved involuntary changes) and the request completes.
 * Never throws into the payment path: a failure leaves the request EXECUTING
 * (visible to ops in the change-request console) and is reported to the caller.
 */
export async function finalizeChangeAfterCapture(env: Env, newBookingId: string): Promise<"NONE" | "EXECUTED" | "FAILED"> {
  const r = await env.DB.prepare("SELECT * FROM change_requests WHERE new_booking_id = ? AND status = 'EXECUTING'").bind(newBookingId).first<any>();
  if (!r) return "NONE";
  try {
    const owner: AuthUser = { id: r.user_id, email: "", role: "USER" };
    const waived = r.type === "INVOLUNTARY";
    await cancelByCustomer(env, owner, r.booking_id, waived ? { feeWaived: true, waiveReason: `INVOLUNTARY:${r.id}` } : {});
    await env.DB.prepare("UPDATE change_requests SET status = 'EXECUTED', executed_at = ? WHERE id = ? AND status = 'EXECUTING'")
      .bind(new Date().toISOString(), r.id).run();
    return "EXECUTED";
  } catch {
    return "FAILED";
  }
}

export async function listChanges(env: Env, userId: string | null, bookingId: string | null, status: string | null): Promise<any[]> {
  let where = "1=1";
  const p: unknown[] = [];
  if (userId) { where += " AND user_id = ?"; p.push(userId); }
  if (bookingId) { where += " AND booking_id = ?"; p.push(bookingId); }
  if (status) { where += " AND status = ?"; p.push(status); }
  const rows = await env.DB.prepare(`SELECT * FROM change_requests WHERE ${where} ORDER BY created_at DESC LIMIT 100`).bind(...p).all<any>();
  return rows.results || [];
}

export async function decideChange(env: Env, requestId: string, approve: boolean, note: string): Promise<any> {
  const r = await env.DB.prepare("SELECT * FROM change_requests WHERE id = ?").bind(str(requestId, 64)).first<any>();
  if (!r) throw new HttpError(404, "CHANGE_NOT_FOUND", "일정 변경 요청을 찾을 수 없습니다.");
  if (r.status !== "PENDING_APPROVAL") throw new HttpError(409, "CHANGE_NOT_PENDING", "대기 중인 요청이 아닙니다.");
  const status = approve ? "APPROVED" : "REJECTED";
  await env.DB.prepare("UPDATE change_requests SET status = ?, admin_note = ?, decided_at = ? WHERE id = ?")
    .bind(status, str(note, 500) || null, new Date().toISOString(), r.id).run();
  return { ...(await env.DB.prepare("SELECT * FROM change_requests WHERE id = ?").bind(r.id).first<any>()) };
}

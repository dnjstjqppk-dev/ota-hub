/**
 * Customer-engagement surfaces (COMMERCIAL_READINESS_AUDIT.md §7):
 *   CR-01 partner review inbox + replies, operator review moderation
 *   CR-02 threaded 1:1 support tickets (customer <-> operator)
 *   CR-03 booking conversations (customer <-> selling partner, operator oversight)
 * Every read/write is scoped by ownership first: another party's row is
 * indistinguishable from a missing one (404, never 403-with-existence).
 */
import type { Env } from "../env.ts";
import { HttpError, json, readJson, str } from "../lib/http.ts";
import { audit, rateLimit, requireAdmin, requirePartner, requireUser } from "../lib/auth.ts";
import { maskName, newId } from "../lib/crypto.ts";
import { pageMeta, pageParams } from "../lib/pagination.ts";
import { outboxInsert } from "../services/email-service.ts";
import { handoffTicket, maybeBotReply, reportBotMessage } from "../services/csbot-service.ts";
import { parsePhotos, rescoreStatement } from "../services/review-service.ts";

const MAX_MESSAGE = 2000;
const MAX_REPLY = 1000;
const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
type Party = "USER" | "PARTNER" | "ADMIN";

const now = () => new Date().toISOString();

function messageBody(b: any): string {
  const body = str(b?.body, MAX_MESSAGE + 1);
  if (!body) throw new HttpError(400, "MESSAGE_REQUIRED", "메시지 내용을 입력해주세요.");
  if (body.length > MAX_MESSAGE) throw new HttpError(400, "MESSAGE_TOO_LONG", `메시지는 ${MAX_MESSAGE.toLocaleString("ko-KR")}자 이내로 입력해주세요.`);
  return body;
}

/** Party-aware view of a booking thread. The other side's identity is reduced to a label. */
async function bookingThread(env: Env, booking: any, viewer: Party) {
  const db = env.DB;
  const rows = await db.prepare(
    "SELECT id, sender_type, body, created_at FROM booking_messages WHERE booking_id = ? ORDER BY created_at ASC, id ASC LIMIT 500",
  ).bind(booking.id).all<any>();
  const reads = await db.prepare("SELECT reader_type, last_read_at FROM booking_message_reads WHERE booking_id = ?").bind(booking.id).all<any>();
  const readAt: Record<string, string> = {};
  for (const r of reads.results || []) readAt[r.reader_type] = r.last_read_at;
  const partnerName = booking.partner_id
    ? ((await db.prepare("SELECT company_name FROM partners WHERE id = ?").bind(booking.partner_id).first<any>())?.company_name || "판매 파트너")
    : null;
  const label = (t: Party) => t === "USER" ? (viewer === "USER" ? "나" : maskName(booking.customer_name || "고객"))
    : t === "PARTNER" ? (partnerName || "판매 파트너")
    : "getfortrip 고객센터";
  const mine = viewer;
  const messages = (rows.results || []).map((m: any) => ({
    id: m.id, senderType: m.sender_type, senderLabel: label(m.sender_type), body: m.body, createdAt: m.created_at, mine: m.sender_type === mine,
  }));
  const lastRead = readAt[viewer] || "";
  const unread = messages.filter((m) => !m.mine && m.createdAt > lastRead).length;
  // Opening the thread marks it read for this side.
  if (messages.length) {
    await db.prepare(
      `INSERT INTO booking_message_reads (booking_id, reader_type, last_read_at) VALUES (?, ?, ?)
       ON CONFLICT(booking_id, reader_type) DO UPDATE SET last_read_at = excluded.last_read_at`,
    ).bind(booking.id, viewer, now()).run();
  }
  return {
    bookingId: booking.id, bookingNumber: booking.booking_number, counterpart: viewer === "USER" ? (partnerName || "getfortrip 고객센터") : viewer === "PARTNER" ? maskName(booking.customer_name || "고객") : null,
    hasPartner: Boolean(booking.partner_id), messages, unreadBeforeOpen: unread,
    canPost: booking.status !== "EXPIRED",
  };
}

async function postBookingMessage(env: Env, booking: any, sender: Party, senderId: string, body: string) {
  if (booking.status === "EXPIRED") throw new HttpError(409, "BOOKING_EXPIRED", "만료된 예약에는 메시지를 보낼 수 없습니다.");
  if (sender === "PARTNER" && !booking.partner_id) throw new HttpError(404, "ORDER_NOT_FOUND", "주문을 찾을 수 없습니다.");
  const id = newId("bmsg");
  const ts = now();
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare("INSERT INTO booking_messages (id, booking_id, sender_type, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, booking.id, sender, senderId, body, ts),
    env.DB.prepare(
      `INSERT INTO booking_message_reads (booking_id, reader_type, last_read_at) VALUES (?, ?, ?)
       ON CONFLICT(booking_id, reader_type) DO UPDATE SET last_read_at = excluded.last_read_at`,
    ).bind(booking.id, sender, ts),
  ];
  // The customer hears about partner/operator replies by mail (link only, no body).
  if (sender !== "USER" && booking.customer_email) {
    const from = sender === "PARTNER"
      ? ((await env.DB.prepare("SELECT company_name FROM partners WHERE id = ?").bind(booking.partner_id).first<any>())?.company_name || "판매 파트너")
      : "getfortrip 고객센터";
    stmts.push(outboxInsert(env.DB, "EMAIL", booking.customer_email, "BOOKING_MESSAGE", { bookingNumber: booking.booking_number, from }));
  }
  await env.DB.batch(stmts);
  return { id, createdAt: ts };
}

const BOOKING_COLS = "id, booking_number, user_id, partner_id, status, customer_name, customer_email";

async function ticketView(env: Env, ticket: any) {
  const rows = await env.DB.prepare(
    "SELECT id, author_type, author_id, body, created_at FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC, id ASC LIMIT 500",
  ).bind(ticket.id).all<any>();
  return {
    id: ticket.id, category: ticket.category, subject: ticket.subject, body: ticket.body, bookingId: ticket.booking_id,
    status: ticket.status, createdAt: ticket.created_at, updatedAt: ticket.updated_at, resolvedAt: ticket.resolved_at,
    handoffAt: ticket.handoff_at || null,
    messages: (rows.results || []).map((m: any) => ({ id: m.id, authorType: m.author_type, authorId: m.author_id, body: m.body, createdAt: m.created_at })),
  };
}

export async function handleEngagement(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  const db = env.DB;
  let m: RegExpMatchArray | null;

  // =========================== CR-03 booking messages ===========================
  m = path.match(/^\/api\/v1\/bookings\/([A-Za-z0-9_-]{4,64})\/messages$/);
  if (m && (method === "GET" || method === "POST")) {
    const user = await requireUser(request, env);
    const b = await db.prepare(`SELECT ${BOOKING_COLS} FROM bookings WHERE id = ?`).bind(m[1]).first<any>();
    if (!b || b.user_id !== user.id) throw new HttpError(404, "BOOKING_NOT_FOUND", "예약 정보를 찾을 수 없습니다.");
    if (method === "GET") {
      await rateLimit(request, env, "user_read", 600, 60);
      return json({ success: true, thread: await bookingThread(env, b, "USER") });
    }
    await rateLimit(request, env, "booking_message", 30, 3600);
    const msg = await postBookingMessage(env, b, "USER", user.id, messageBody(await readJson(request)));
    return json({ success: true, message: msg }, 201);
  }

  m = path.match(/^\/api\/v1\/partner\/orders\/([A-Za-z0-9_-]+)\/messages$/);
  if (m && (method === "GET" || method === "POST")) {
    const partner = await requirePartner(request, env);
    const b = await db.prepare(`SELECT ${BOOKING_COLS} FROM bookings WHERE id = ? AND partner_id = ?`).bind(m[1], partner.partnerId).first<any>();
    if (!b) throw new HttpError(404, "ORDER_NOT_FOUND", "주문을 찾을 수 없습니다.");
    if (method === "GET") return json({ success: true, thread: await bookingThread(env, b, "PARTNER") });
    await rateLimit(request, env, "partner_message", 120, 3600);
    const msg = await postBookingMessage(env, b, "PARTNER", partner.staffId || partner.partnerId, messageBody(await readJson(request)));
    return json({ success: true, message: msg }, 201);
  }

  if (path === "/api/v1/partner/messages" && method === "GET") {
    const partner = await requirePartner(request, env);
    // Inbox: one row per order with a thread, newest activity first, unread = customer messages after the partner's last read.
    const rows = await db.prepare(
      `SELECT b.id, b.booking_number, b.title, b.status, b.customer_name, b.service_start,
              MAX(bm.created_at) AS last_at,
              SUM(CASE WHEN bm.sender_type <> 'PARTNER' AND bm.created_at > COALESCE(r.last_read_at, '') THEN 1 ELSE 0 END) AS unread
       FROM booking_messages bm
       JOIN bookings b ON b.id = bm.booking_id
       LEFT JOIN booking_message_reads r ON r.booking_id = b.id AND r.reader_type = 'PARTNER'
       WHERE b.partner_id = ?
       GROUP BY b.id ORDER BY last_at DESC LIMIT 100`,
    ).bind(partner.partnerId).all<any>();
    const threads = (rows.results || []).map((r: any) => ({
      bookingId: r.id, bookingNumber: r.booking_number, title: r.title, status: r.status, serviceStart: r.service_start,
      customer: maskName(r.customer_name || "고객"), lastAt: r.last_at, unread: Number(r.unread || 0),
    }));
    return json({ success: true, threads, unreadTotal: threads.reduce((s, t) => s + t.unread, 0) });
  }

  m = path.match(/^\/api\/v1\/admin\/bookings\/([A-Za-z0-9_-]+)\/messages$/);
  if (m && (method === "GET" || method === "POST")) {
    const admin = await requireAdmin(request, env);
    const b = await db.prepare(`SELECT ${BOOKING_COLS} FROM bookings WHERE id = ?`).bind(m[1]).first<any>();
    if (!b) throw new HttpError(404, "BOOKING_NOT_FOUND", "예약 정보를 찾을 수 없습니다.");
    if (method === "GET") {
      await audit(env, admin.id, "ADMIN_VIEW_BOOKING_MESSAGES", "BOOKING", b.id, {});
      return json({ success: true, thread: await bookingThread(env, b, "ADMIN") });
    }
    const msg = await postBookingMessage(env, b, "ADMIN", admin.id, messageBody(await readJson(request)));
    await audit(env, admin.id, "ADMIN_BOOKING_MESSAGE", "BOOKING", b.id, { messageId: msg.id });
    return json({ success: true, message: msg }, 201);
  }

  // =========================== CR-02 ticket threads ===========================
  m = path.match(/^\/api\/v1\/inquiries\/([A-Za-z0-9_-]+)$/);
  if (m && method === "GET") {
    const user = await requireUser(request, env);
    await rateLimit(request, env, "user_read", 600, 60);
    const t = await db.prepare("SELECT * FROM support_tickets WHERE id = ? AND user_id = ?").bind(m[1], user.id).first<any>();
    if (!t) throw new HttpError(404, "TICKET_NOT_FOUND", "문의 내역을 찾을 수 없습니다.");
    return json({ success: true, ticket: await ticketView(env, t) });
  }
  m = path.match(/^\/api\/v1\/inquiries\/([A-Za-z0-9_-]+)\/messages$/);
  if (m && method === "POST") {
    const user = await requireUser(request, env);
    await rateLimit(request, env, "inquiry_reply", 30, 3600);
    const t = await db.prepare("SELECT * FROM support_tickets WHERE id = ? AND user_id = ?").bind(m[1], user.id).first<any>();
    if (!t) throw new HttpError(404, "TICKET_NOT_FOUND", "문의 내역을 찾을 수 없습니다.");
    if (t.status === "CLOSED") throw new HttpError(409, "TICKET_CLOSED", "종료된 문의에는 답글을 달 수 없습니다. 새 문의를 남겨주세요.");
    const body = messageBody(await readJson(request));
    const ts = now();
    // A customer follow-up puts the ticket back in the operator queue.
    await db.batch([
      db.prepare("INSERT INTO support_ticket_messages (id, ticket_id, author_type, author_id, body, created_at) VALUES (?, ?, 'USER', ?, ?, ?)")
        .bind(newId("tmsg"), t.id, user.id, body, ts),
      db.prepare("UPDATE support_tickets SET status = 'OPEN', resolved_at = NULL, updated_at = ? WHERE id = ?").bind(ts, t.id),
    ]);
    // TG-21: treatment members get a bot follow-up reply (control: none).
    await maybeBotReply(env, { ...t, status: "OPEN" }, body, user.fullName || "고객");
    const fresh = await db.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(t.id).first<any>();
    return json({ success: true, ticket: await ticketView(env, fresh) }, 201);
  }

  // TG-21: one-click human handoff (any arm; bot or human queue).
  m = path.match(/^\/api\/v1\/inquiries\/([A-Za-z0-9_-]+)\/handoff$/);
  if (m && method === "POST") {
    const user = await requireUser(request, env);
    await rateLimit(request, env, "inquiry_handoff", 10, 3600);
    return json({ success: true, ...(await handoffTicket(env, m[1], user.id)) });
  }

  // TG-21: wrong-answer report (bot messages only; auto-hands off).
  m = path.match(/^\/api\/v1\/inquiries\/([A-Za-z0-9_-]+)\/report$/);
  if (m && method === "POST") {
    const user = await requireUser(request, env);
    await rateLimit(request, env, "bot_report", 20, 3600);
    const b = await readJson(request);
    const messageId = str(b.messageId || b.message_id, 64);
    if (!messageId) throw new HttpError(400, "MESSAGE_REQUIRED", "신고할 메시지를 지정해주세요.");
    return json({ success: true, ...(await reportBotMessage(env, { ticketId: m[1], messageId, userId: user.id, reason: str(b.reason, 500) || null })) });
  }

  m = path.match(/^\/api\/v1\/admin\/tickets\/([A-Za-z0-9_-]+)$/);
  if (m && method === "GET") {
    const admin = await requireAdmin(request, env);
    const t = await db.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(m[1]).first<any>();
    if (!t) throw new HttpError(404, "TICKET_NOT_FOUND", "문의 내역을 찾을 수 없습니다.");
    const customer = await db.prepare("SELECT id, email, full_name, tier, status FROM users WHERE id = ?").bind(t.user_id).first<any>();
    const booking = t.booking_id
      ? await db.prepare("SELECT id, booking_number, title, status, total_minor, service_start FROM bookings WHERE id = ?").bind(t.booking_id).first<any>()
      : null;
    await audit(env, admin.id, "ADMIN_VIEW_TICKET", "SUPPORT_TICKET", t.id, {});
    return json({ success: true, ticket: { ...(await ticketView(env, t)), email: t.email }, customer, booking });
  }
  m = path.match(/^\/api\/v1\/admin\/tickets\/([A-Za-z0-9_-]+)\/messages$/);
  if (m && method === "POST") {
    const admin = await requireAdmin(request, env);
    const t = await db.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(m[1]).first<any>();
    if (!t) throw new HttpError(404, "TICKET_NOT_FOUND", "문의 내역을 찾을 수 없습니다.");
    const b = await readJson(request);
    const body = messageBody(b);
    const status = str(b.status || "IN_PROGRESS", 20).toUpperCase();
    if (!(TICKET_STATUSES as readonly string[]).includes(status)) throw new HttpError(400, "INVALID_STATUS", "티켓 상태가 올바르지 않습니다.");
    const ts = now();
    await db.batch([
      db.prepare("INSERT INTO support_ticket_messages (id, ticket_id, author_type, author_id, body, created_at) VALUES (?, ?, 'ADMIN', ?, ?, ?)")
        .bind(newId("tmsg"), t.id, admin.id, body, ts),
      // admin_note keeps mirroring the latest operator answer for the legacy list view.
      db.prepare(
        `UPDATE support_tickets SET status = ?, admin_note = ?, updated_at = ?,
           resolved_at = CASE WHEN ? IN ('RESOLVED', 'CLOSED') THEN ? ELSE NULL END WHERE id = ?`,
      ).bind(status, body, ts, status, ts, t.id),
      outboxInsert(db, "EMAIL", t.email, "SUPPORT_REPLY", { subject: t.subject }),
    ]);
    await audit(env, admin.id, "TICKET_REPLY", "SUPPORT_TICKET", t.id, { status });
    const fresh = await db.prepare("SELECT * FROM support_tickets WHERE id = ?").bind(t.id).first<any>();
    return json({ success: true, ticket: await ticketView(env, fresh) }, 201);
  }

  // =========================== CR-01 review operations ===========================
  // TG-21: per-product review digest (weekly batch; null when none yet).
  if (path === "/api/v1/reviews/digest" && method === "GET") {
    await rateLimit(request, env, "user_read", 600, 60);
    const domain = str(url.searchParams.get("domain"), 20).toUpperCase();
    const itemId = str(url.searchParams.get("itemId") || url.searchParams.get("item_id"), 100);
    if (!domain || !itemId) throw new HttpError(400, "DOMAIN_ITEM_REQUIRED", "domain과 itemId가 필요합니다.");
    const row = await db.prepare("SELECT domain, item_id, summary, source, review_count, avg_rating, computed_at FROM review_digests WHERE domain = ? AND item_id = ?").bind(domain, itemId).first<any>();
    return json({ success: true, digest: row || null });
  }
  if (path === "/api/v1/partner/reviews" && method === "GET") {
    const partner = await requirePartner(request, env);
    const filter = str(url.searchParams.get("filter") || "all", 20);
    let where = "r.partner_id = ?";
    if (filter === "unanswered") where += " AND r.partner_reply IS NULL AND r.is_blinded = 0";
    else if (filter === "answered") where += " AND r.partner_reply IS NOT NULL";
    const pg = pageParams(url);
    const total = Number((await db.prepare(`SELECT COUNT(*) AS c FROM reviews r WHERE ${where}`).bind(partner.partnerId).first<any>())?.c || 0);
    const stats = await db.prepare(
      "SELECT COUNT(*) AS total, ROUND(AVG(rating) * 10) / 10 AS average, SUM(CASE WHEN partner_reply IS NULL AND is_blinded = 0 THEN 1 ELSE 0 END) AS unanswered FROM reviews WHERE partner_id = ? AND is_blinded = 0",
    ).bind(partner.partnerId).first<any>();
    const rows = await db.prepare(
      `SELECT r.id, r.user_name, r.domain_type, r.target_id, r.rating, r.comment, r.photos_json, r.partner_reply, r.partner_replied_at, r.is_blinded, r.created_at,
              b.booking_number, b.title
       FROM reviews r LEFT JOIN bookings b ON b.id = r.booking_id
       WHERE ${where}
       ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    ).bind(partner.partnerId, pg.pageSize, pg.offset).all<any>();
    const reviews = (rows.results || []).map(({ photos_json, user_name, ...r }: any) => ({
      ...r, userName: maskName(user_name), photos: parsePhotos(photos_json), is_blinded: r.is_blinded === 1,
    }));
    return json({
      success: true, reviews,
      stats: { total: Number(stats?.total || 0), average: stats?.average === null || stats?.average === undefined ? null : Number(stats.average), unanswered: Number(stats?.unanswered || 0) },
      ...pageMeta(total, pg.page, pg.pageSize),
    });
  }
  m = path.match(/^\/api\/v1\/partner\/reviews\/([A-Za-z0-9_-]+)\/reply$/);
  if (m && (method === "PUT" || method === "DELETE")) {
    const partner = await requirePartner(request, env);
    const role = partner.staffId ? String(partner.staffRole || "STAFF").toUpperCase() : "OWNER";
    if (role !== "OWNER" && role !== "MANAGER") throw new HttpError(403, "MANAGER_ONLY", "리뷰 답글은 매니저 이상만 작성할 수 있습니다.");
    await rateLimit(request, env, "partner_review_reply", 120, 3600);
    const r = await db.prepare("SELECT id, is_blinded FROM reviews WHERE id = ? AND partner_id = ?").bind(m[1], partner.partnerId).first<any>();
    if (!r) throw new HttpError(404, "REVIEW_NOT_FOUND", "리뷰를 찾을 수 없습니다.");
    if (method === "DELETE") {
      await db.prepare("UPDATE reviews SET partner_reply = NULL, partner_replied_at = NULL WHERE id = ?").bind(r.id).run();
      return json({ success: true, id: r.id, reply: null });
    }
    if (r.is_blinded === 1) throw new HttpError(409, "REVIEW_BLINDED", "블라인드 처리된 리뷰에는 답글을 달 수 없습니다.");
    const reply = str((await readJson(request)).reply, MAX_REPLY + 1);
    if (!reply) throw new HttpError(400, "REPLY_REQUIRED", "답글 내용을 입력해주세요.");
    if (reply.length > MAX_REPLY) throw new HttpError(400, "REPLY_TOO_LONG", `답글은 ${MAX_REPLY.toLocaleString("ko-KR")}자 이내로 입력해주세요.`);
    const ts = now();
    await db.prepare("UPDATE reviews SET partner_reply = ?, partner_replied_at = ? WHERE id = ?").bind(reply, ts, r.id).run();
    return json({ success: true, id: r.id, reply, repliedAt: ts });
  }

  if (path === "/api/v1/admin/reviews" && method === "GET") {
    const admin = await requireAdmin(request, env);
    const filter = str(url.searchParams.get("filter") || "all", 20);
    const q = str(url.searchParams.get("q"), 80);
    const conds: string[] = [];
    const args: unknown[] = [];
    if (filter === "blinded") conds.push("r.is_blinded = 1");
    else if (filter === "visible") conds.push("r.is_blinded = 0");
    else if (filter === "low") conds.push("r.rating <= 2 AND r.is_blinded = 0");
    if (q) { conds.push("(r.target_id = ? OR r.id = ? OR b.booking_number = ?)"); args.push(q, q, q); }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const pg = pageParams(url);
    const total = Number((await db.prepare(`SELECT COUNT(*) AS c FROM reviews r LEFT JOIN bookings b ON b.id = r.booking_id ${where}`).bind(...args).first<any>())?.c || 0);
    const rows = await db.prepare(
      `SELECT r.id, r.user_id, r.user_name, r.domain_type, r.target_id, r.rating, r.comment, r.photos_json, r.partner_reply, r.is_blinded, r.blinded_reason, r.created_at,
              b.booking_number, b.title
       FROM reviews r LEFT JOIN bookings b ON b.id = r.booking_id ${where}
       ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    ).bind(...args, pg.pageSize, pg.offset).all<any>();
    await audit(env, admin.id, "ADMIN_LIST_REVIEWS", "REVIEW", "*", { filter, count: (rows.results || []).length });
    const reviews = (rows.results || []).map(({ photos_json, ...r }: any) => ({ ...r, photos: parsePhotos(photos_json), is_blinded: r.is_blinded === 1 }));
    return json({ success: true, reviews, ...pageMeta(total, pg.page, pg.pageSize) });
  }
  m = path.match(/^\/api\/v1\/admin\/reviews\/([A-Za-z0-9_-]+)\/(blind|restore)$/);
  if (m && method === "POST") {
    const admin = await requireAdmin(request, env);
    const r = await db.prepare("SELECT id, domain_type, target_id, is_blinded FROM reviews WHERE id = ?").bind(m[1]).first<any>();
    if (!r) throw new HttpError(404, "REVIEW_NOT_FOUND", "리뷰를 찾을 수 없습니다.");
    const blind = m[2] === "blind";
    const reason = str((await readJson(request).catch(() => ({}))).reason, 300);
    if (blind && !reason) throw new HttpError(400, "REASON_REQUIRED", "블라인드 사유를 입력해주세요.");
    const update = db.prepare("UPDATE reviews SET is_blinded = ?, blinded_reason = ? WHERE id = ?").bind(blind ? 1 : 0, blind ? reason : null, r.id);
    const rescore = rescoreStatement(db, r.domain_type, r.target_id);
    await db.batch(rescore ? [update, rescore] : [update]);
    await audit(env, admin.id, blind ? "REVIEW_BLIND" : "REVIEW_RESTORE", "REVIEW", r.id, { reason: reason || null });
    return json({ success: true, id: r.id, isBlinded: blind });
  }

  return null;
}

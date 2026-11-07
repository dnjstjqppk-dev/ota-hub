import type { Env } from "../env.ts";
import { HttpError, json, readJson, str } from "../lib/http.ts";
import { audit, rateLimit, requireAdmin, requireUser } from "../lib/auth.ts";
import { newId } from "../lib/crypto.ts";
import { pageMeta, pageParams } from "../lib/pagination.ts";

const CATEGORIES = ["BOOKING", "PAYMENT", "REFUND", "ACCOUNT", "TECHNICAL", "GENERAL"] as const;
const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

export async function handleSupport(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  const db = env.DB;

  // ---------------- Customer 1:1 inquiries ----------------
  if (path === "/api/v1/inquiries" && method === "POST") {
    const u = await requireUser(request, env);
    await rateLimit(request, env, "inquiry", 10, 3600);
    const b = await readJson(request);
    const category = str(b.category || "GENERAL", 20).toUpperCase();
    if (!(CATEGORIES as readonly string[]).includes(category)) {
      throw new HttpError(400, "INVALID_CATEGORY", "문의 유형이 올바르지 않습니다.");
    }
    const subject = str(b.subject, 120);
    const body = str(b.body, 5000);
    if (!subject || !body) throw new HttpError(400, "FIELDS_REQUIRED", "제목과 내용을 입력해주세요.");
    const bookingId = b.bookingId ? str(b.bookingId, 64) : null;
    if (bookingId) {
      const own = await db.prepare("SELECT id FROM bookings WHERE id = ? AND user_id = ?").bind(bookingId, u.id).first();
      if (!own) throw new HttpError(404, "BOOKING_NOT_FOUND", "본인의 예약에 대해서만 문의할 수 있습니다.");
    }
    const id = newId("tkt");
    await db.prepare(
      "INSERT INTO support_tickets (id, user_id, email, category, subject, body, booking_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, u.id, u.email, category, subject, body, bookingId).run();
    return json({ success: true, id, status: "OPEN" }, 201);
  }
  if (path === "/api/v1/inquiries" && method === "GET") {
    const u = await requireUser(request, env);
    const rows = await db.prepare(
      "SELECT id, category, subject, body, booking_id, status, admin_note, created_at, resolved_at FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
    ).bind(u.id).all();
    return json({ success: true, inquiries: rows.results || [] });
  }

  // ---------------- Operator ticket triage ----------------
  if (path === "/api/v1/admin/tickets" && method === "GET") {
    const admin = await requireAdmin(request, env);
    void admin;
    const status = str(url.searchParams.get("status") || "", 20).toUpperCase();
    if (status && !(STATUSES as readonly string[]).includes(status)) {
      throw new HttpError(400, "INVALID_STATUS", "티켓 상태가 올바르지 않습니다.");
    }
    const pg = pageParams(url);
    const where = status ? "status = ?" : "1=1";
    const args: unknown[] = status ? [status] : [];
    const total = ((await db.prepare(`SELECT COUNT(*) AS total FROM support_tickets WHERE ${where}`).bind(...args).first<{ total: number }>())?.total || 0) as number;
    const rows = await db.prepare(`SELECT * FROM support_tickets WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...args, pg.pageSize, pg.offset).all();
    return json({ success: true, tickets: rows.results || [], ...pageMeta(total, pg.page, pg.pageSize) });
  }
  const m = path.match(/^\/api\/v1\/admin\/tickets\/([A-Za-z0-9_-]+)$/);
  if (m && method === "PATCH") {
    const admin = await requireAdmin(request, env);
    const b = await readJson(request);
    const status = str(b.status, 20).toUpperCase();
    if (!status || !(STATUSES as readonly string[]).includes(status)) {
      throw new HttpError(400, "INVALID_STATUS", "티켓 상태가 올바르지 않습니다.");
    }
    const note = str(b.adminNote || b.admin_note, 2000) || null;
    const r = await db.prepare(
      `UPDATE support_tickets SET status = ?, admin_note = COALESCE(?, admin_note),
        resolved_at = CASE WHEN ? IN ('RESOLVED', 'CLOSED') THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE resolved_at END,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).bind(status, note, status, m[1]).run();
    if (!r.meta.changes) throw new HttpError(404, "TICKET_NOT_FOUND", "문의 내역을 찾을 수 없습니다.");
    await audit(env, admin.id, "TICKET_TRIAGE", "SUPPORT_TICKET", m[1], { status });
    return json({ success: true, id: m[1], status });
  }

  return null;
}

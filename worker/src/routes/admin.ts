import type { Env } from "../env.ts";
import { HttpError, json, readJson, str } from "../lib/http.ts";
import { audit, requireAdmin } from "../lib/auth.ts";
import * as S from "../services/booking-service.ts";
import { BOOKING_STATUSES } from "../domain/state-machine.ts";
import { newId } from "../lib/crypto.ts";

export async function handleAdmin(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/v1/admin/")) return null;
  const method = request.method;
  const admin = await requireAdmin(request, env);
  const db = env.DB;

  if (path === "/api/v1/admin/dashboard" && method === "GET") {
    const one = async (sql: string) => Number((await db.prepare(sql).first<{ c: number }>())?.c || 0);
    const byStatus = await db.prepare("SELECT status, COUNT(*) AS c, COALESCE(SUM(total_minor), 0) AS total FROM bookings GROUP BY status").all();
    const recent = await db.prepare("SELECT id, booking_number, title, status, total_minor, currency, customer_name, created_at FROM bookings ORDER BY created_at DESC LIMIT 10").all();
    const ledger = await db.prepare("SELECT account, SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE -amount_minor END) AS balance FROM ledger_entries GROUP BY account").all();
    return json({
      success: true,
      metrics: {
        totalUsers: await one("SELECT COUNT(*) AS c FROM users"),
        totalBookings: await one("SELECT COUNT(*) AS c FROM bookings"),
        capturedPayments: await one("SELECT COUNT(*) AS c FROM payments WHERE status IN ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED')"),
        manualReview: await one("SELECT COUNT(*) AS c FROM bookings WHERE status = 'MANUAL_REVIEW_REQUIRED'"),
        pendingRefunds: await one("SELECT COUNT(*) AS c FROM refunds WHERE status = 'PENDING'"),
        supplierPending: await one("SELECT COUNT(*) AS c FROM bookings WHERE status = 'SUPPLIER_BOOKING_PENDING'"),
        grossCapturedMinor: await one("SELECT COALESCE(SUM(amount_minor), 0) AS c FROM payments WHERE status IN ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED')"),
        refundedMinor: await one("SELECT COALESCE(SUM(amount_minor), 0) AS c FROM refunds WHERE status = 'SUCCEEDED'"),
      },
      byStatus: byStatus.results,
      ledgerBalances: ledger.results,
      recentBookings: recent.results,
    });
  }

  if (path === "/api/v1/admin/bookings" && method === "GET") {
    const status = str(url.searchParams.get("status"), 40);
    const q = str(url.searchParams.get("q"), 80);
    let sql = "SELECT id, booking_number, domain_type, title, status, status_reason, total_minor, paid_minor, refunded_minor, currency, payment_status, supplier_status, payment_mode, customer_name, customer_email, service_start, created_at FROM bookings WHERE 1=1";
    const p: unknown[] = [];
    if (status && (BOOKING_STATUSES as readonly string[]).includes(status)) {
      sql += " AND status = ?";
      p.push(status);
    }
    if (q) {
      sql += " AND (booking_number LIKE ? OR customer_email LIKE ? OR customer_name LIKE ?)";
      p.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    sql += " ORDER BY created_at DESC LIMIT 200";
    const rows = await db.prepare(sql).bind(...p).all();
    return json({ success: true, bookings: rows.results, statuses: BOOKING_STATUSES });
  }

  let m = path.match(/^\/api\/v1\/admin\/bookings\/([A-Za-z0-9_-]+)$/);
  if (m && method === "GET") {
    const b = await S.getBooking(env, m[1]);
    if (!b) throw new HttpError(404, "BOOKING_NOT_FOUND", "예약을 찾을 수 없습니다.");
    await audit(env, admin.id, "ADMIN_VIEW_BOOKING", "BOOKING", b.id, null);
    const ledger = await db.prepare("SELECT journal_id, account, direction, amount_minor, event_type, created_at FROM ledger_entries WHERE booking_id = ? ORDER BY created_at, rowid").bind(b.id).all();
    const calls = await db.prepare("SELECT operation, outcome, latency_ms, response_summary, created_at FROM supplier_api_calls WHERE booking_id = ? ORDER BY created_at").bind(b.id).all();
    return json({ success: true, booking: await S.serializeBooking(env, b, admin), ledger: ledger.results, supplierCalls: calls.results });
  }

  m = path.match(/^\/api\/v1\/admin\/bookings\/([A-Za-z0-9_-]+)\/supplier-decision$/);
  if (m && method === "POST") {
    const body = await readJson(request);
    const before = await S.getBooking(env, m[1]);
    if (!before) throw new HttpError(404, "BOOKING_NOT_FOUND", "예약을 찾을 수 없습니다.");
    const after = await S.adminSupplierDecision(env, admin, before.id, body);
    await audit(env, admin.id, `SUPPLIER_DECISION_${str(body.decision, 20).toUpperCase()}`, "BOOKING", before.id, { from: before.status, to: after.status, note: str(body.note, 300) });
    return json({ success: true, booking: await S.serializeBooking(env, after, admin) });
  }

  if (path === "/api/v1/admin/maintenance/run" && method === "POST") {
    const stats = await S.runMaintenance(env);
    await audit(env, admin.id, "RUN_MAINTENANCE", "SYSTEM", "maintenance", stats);
    return json({ success: true, stats });
  }

  if (path === "/api/v1/admin/reconciliation" && method === "GET") {
    // Integrity checks: unbalanced journals, payment vs booking mismatches, deposits left on terminal bookings.
    const unbalanced = await db.prepare("SELECT journal_id, SUM(CASE WHEN direction='DEBIT' THEN amount_minor ELSE -amount_minor END) AS diff FROM ledger_entries GROUP BY journal_id HAVING diff != 0").all();
    const paidMismatch = await db.prepare(
      "SELECT b.id, b.booking_number, b.paid_minor, COALESCE(SUM(p.amount_minor),0) AS captured FROM bookings b LEFT JOIN payments p ON p.booking_id = b.id AND p.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') WHERE b.total_minor IS NOT NULL GROUP BY b.id HAVING b.paid_minor != captured",
    ).all();
    const refundMismatch = await db.prepare(
      "SELECT b.id, b.booking_number, b.refunded_minor, COALESCE(SUM(r.amount_minor),0) AS refunded FROM bookings b LEFT JOIN refunds r ON r.booking_id = b.id AND r.status = 'SUCCEEDED' WHERE b.total_minor IS NOT NULL GROUP BY b.id HAVING b.refunded_minor != refunded",
    ).all();
    const strandedDeposits = await db.prepare(
      "SELECT l.booking_id, b.status, SUM(CASE WHEN l.direction='CREDIT' THEN l.amount_minor ELSE -l.amount_minor END) AS deposit FROM ledger_entries l JOIN bookings b ON b.id = l.booking_id WHERE l.account = 'CUSTOMER_DEPOSITS' AND b.status IN ('REFUNDED','CANCELLED','FAILED','VOUCHER_ISSUED','TICKETED','COMPLETED') GROUP BY l.booking_id HAVING deposit != 0",
    ).all();
    const ok = !unbalanced.results.length && !paidMismatch.results.length && !refundMismatch.results.length && !strandedDeposits.results.length;
    return json({ success: true, ok, unbalancedJournals: unbalanced.results, paidMismatch: paidMismatch.results, refundMismatch: refundMismatch.results, strandedDeposits: strandedDeposits.results });
  }

  if (path === "/api/v1/admin/suppliers" && method === "GET") {
    return json({ success: true, suppliers: (await db.prepare("SELECT * FROM suppliers ORDER BY product_domain, id").all()).results });
  }
  m = path.match(/^\/api\/v1\/admin\/suppliers\/([A-Za-z0-9_-]+)$/);
  if (m && method === "PATCH") {
    const b = await readJson(request);
    const before = await db.prepare("SELECT * FROM suppliers WHERE id = ?").bind(m[1]).first<any>();
    if (!before) throw new HttpError(404, "SUPPLIER_NOT_FOUND", "공급사를 찾을 수 없습니다.");
    const adapter = b.adapter ? str(b.adapter, 20) : before.adapter;
    const status = b.integrationStatus ? str(b.integrationStatus, 40) : before.integration_status;
    if (status === "LIVE" && !before.contract_id && !b.contractId) {
      throw new HttpError(409, "CONTRACT_REQUIRED", "LIVE 전환에는 계약(entity_contracts) 등록이 필요합니다.");
    }
    await db.prepare("UPDATE suppliers SET adapter = ?, integration_status = ?, contract_id = COALESCE(?, contract_id), notes = COALESCE(?, notes), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
      .bind(adapter, status, b.contractId ? str(b.contractId, 64) : null, b.notes ? str(b.notes, 500) : null, m[1]).run();
    await audit(env, admin.id, "UPDATE_SUPPLIER", "SUPPLIER", m[1], { before: { adapter: before.adapter, status: before.integration_status }, after: { adapter, status } });
    return json({ success: true });
  }

  if (path === "/api/v1/admin/entities" && method === "GET") {
    const entities = await db.prepare("SELECT * FROM business_entities ORDER BY created_at").all();
    const contracts = await db.prepare("SELECT * FROM entity_contracts ORDER BY created_at").all();
    return json({ success: true, entities: entities.results, contracts: contracts.results });
  }
  m = path.match(/^\/api\/v1\/admin\/entities\/([A-Za-z0-9_-]+)$/);
  if (m && method === "PATCH") {
    const b = await readJson(request);
    const before = await db.prepare("SELECT * FROM business_entities WHERE id = ?").bind(m[1]).first<any>();
    if (!before) throw new HttpError(404, "ENTITY_NOT_FOUND", "사업자 엔터티를 찾을 수 없습니다.");
    const fields = ["legal_name", "business_registration_no", "corporate_registration_no", "tax_id", "travel_agency_license_no", "ecommerce_registration_no", "representative_name", "address", "cs_phone", "cs_email"];
    const next: Record<string, string | null> = {};
    for (const f of fields) next[f] = b[f] !== undefined ? str(b[f], 200) || null : before[f];
    let status = before.status;
    if (b.status) {
      status = str(b.status, 20);
      if (status === "ACTIVE" && (!next.business_registration_no || !next.travel_agency_license_no || !next.ecommerce_registration_no || !next.representative_name || !next.cs_phone)) {
        throw new HttpError(409, "ENTITY_INCOMPLETE", "ACTIVE 전환에는 사업자등록번호, 관광사업(여행업) 등록번호, 통신판매업 신고번호, 대표자, 고객센터 연락처가 필요합니다.");
      }
    }
    await db.batch([
      db.prepare(`UPDATE business_entities SET ${fields.map((f) => `${f} = ?`).join(", ")}, status = ?, effective_from = COALESCE(effective_from, CASE WHEN ? = 'ACTIVE' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
        .bind(...fields.map((f) => next[f]), status, status, m[1]),
      db.prepare("INSERT INTO entity_change_log (id, entity_id, changed_by, change_type, before_json, after_json) VALUES (?, ?, ?, 'UPDATE', ?, ?)")
        .bind(newId("ecl"), m[1], admin.id, JSON.stringify(before), JSON.stringify({ ...next, status })),
    ]);
    await audit(env, admin.id, "UPDATE_ENTITY", "ENTITY", m[1], { status });
    return json({ success: true });
  }

  if (path === "/api/v1/admin/audit-logs" && method === "GET") {
    const rows = await db.prepare("SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT 200").all();
    return json({ success: true, logs: rows.results });
  }

  if (path === "/api/v1/admin/notices" && method === "GET") {
    return json({ success: true, notices: (await db.prepare("SELECT * FROM notices ORDER BY created_at DESC").all()).results });
  }
  if (path === "/api/v1/admin/notices" && method === "POST") {
    const b = await readJson(request);
    const title = str(b.title, 200);
    const content = str(b.content, 4000);
    if (!title || !content) throw new HttpError(400, "INVALID_NOTICE", "제목과 내용을 입력해주세요.");
    const id = newId("ntc");
    await db.prepare("INSERT INTO notices (id, title, content, is_emergency, banner_active) VALUES (?, ?, ?, ?, ?)").bind(id, title, content, b.isEmergency ? 1 : 0, b.bannerActive === false ? 0 : 1).run();
    await audit(env, admin.id, "CREATE_NOTICE", "NOTICE", id, { title });
    return json({ success: true, id }, 201);
  }

  if (path === "/api/v1/admin/catalog" && method === "GET") {
    const hotels = await db.prepare("SELECT id, name_ko AS title, 'HOTEL' AS domain_type, base_price_krw AS price, partner_id FROM hotels LIMIT 100").all();
    const flights = await db.prepare("SELECT id, airline_name || ' ' || flight_number AS title, 'FLIGHT' AS domain_type, base_price_krw AS price, partner_id FROM flights LIMIT 100").all();
    return json({ success: true, items: [...hotels.results, ...flights.results] });
  }

  m = path.match(/^\/api\/v1\/admin\/moments\/([A-Za-z0-9_-]+)\/(approve|blind)$/);
  if (m && method === "POST") {
    const approve = m[2] === "approve";
    await db.prepare(approve ? "UPDATE trip_moments SET is_featured = 1, is_blinded = 0 WHERE id = ?" : "UPDATE trip_moments SET is_blinded = 1, is_featured = 0 WHERE id = ?").bind(m[1]).run();
    await audit(env, admin.id, approve ? "APPROVE_MOMENT" : "BLIND_MOMENT", "MOMENT", m[1], null);
    return json({ success: true });
  }

  throw new HttpError(404, "NOT_FOUND", "요청하신 관리자 API를 찾을 수 없습니다.");
}

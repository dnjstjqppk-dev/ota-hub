import type { Env } from "../env.ts";
import { HttpError, json, readJson, str } from "../lib/http.ts";
import { audit, requireAdmin } from "../lib/auth.ts";
import * as S from "../services/booking-service.ts";
import { BOOKING_STATUSES } from "../domain/state-machine.ts";
import { newId } from "../lib/crypto.ts";
import { invalidateSupplierCache } from "../services/catalog.ts";
import { likeEscape } from "../services/suggest-service.ts";
import { pageMeta, pageParams } from "../lib/pagination.ts";

const PARTNER_STATUSES = ["ACTIVE", "REJECTED", "SUSPENDED", "PENDING_APPROVAL"] as const;
const USER_ROLES = ["USER", "ADMIN"] as const;
const MAX_COIN_ADJUSTMENT = 10_000_000;
// Mirrors the CHECK constraints on `suppliers` (migrations/0002_ota_core.sql).
const SUPPLIER_ADAPTERS = ["none", "direct_contract", "simulator", "api"] as const;
const SUPPLIER_STATUSES = ["LIVE", "SANDBOX_VERIFIED", "DEV_DONE_CONTRACT_PENDING", "CONTRACTED_IN_DEV", "EXTERNAL_LINK_ONLY", "NOT_INTEGRATED", "BLOCKED"] as const;

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
    const cols = "id, booking_number, domain_type, title, status, status_reason, total_minor, paid_minor, refunded_minor, currency, payment_status, supplier_status, payment_mode, customer_name, customer_email, service_start, created_at";
    let where = "1=1";
    const p: unknown[] = [];
    if (status && (BOOKING_STATUSES as readonly string[]).includes(status)) {
      where += " AND status = ?";
      p.push(status);
    }
    if (q) {
      const like = `%${likeEscape(q)}%`;
      where += " AND (booking_number LIKE ? ESCAPE '\\' OR customer_email LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR id = ?)";
      p.push(like, like, like, like, q);
    }
    const pg = pageParams(url);
    const total = ((await db.prepare(`SELECT COUNT(*) AS total FROM bookings WHERE ${where}`).bind(...p).first<{ total: number }>())?.total || 0) as number;
    const rows = await db.prepare(`SELECT ${cols} FROM bookings WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...p, pg.pageSize, pg.offset).all();
    return json({ success: true, bookings: rows.results, statuses: BOOKING_STATUSES, ...pageMeta(total, pg.page, pg.pageSize) });
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
    if (!(SUPPLIER_ADAPTERS as readonly string[]).includes(adapter)) {
      throw new HttpError(400, "INVALID_ADAPTER", `adapter는 ${SUPPLIER_ADAPTERS.join(" | ")} 중 하나여야 합니다.`);
    }
    if (!(SUPPLIER_STATUSES as readonly string[]).includes(status)) {
      throw new HttpError(400, "INVALID_STATUS", `integrationStatus는 ${SUPPLIER_STATUSES.join(" | ")} 중 하나여야 합니다.`);
    }
    const contractId = b.contractId ? str(b.contractId, 64) : before.contract_id;
    if (b.contractId) {
      const c = await db.prepare("SELECT status, contract_type FROM entity_contracts WHERE id = ?").bind(contractId).first<{ status: string; contract_type: string }>();
      if (!c || c.contract_type !== "SUPPLIER") throw new HttpError(400, "CONTRACT_NOT_FOUND", "등록된 공급사 계약(SUPPLIER)이 아닙니다.");
    }
    if (status === "LIVE") {
      if (!contractId) throw new HttpError(409, "CONTRACT_REQUIRED", "LIVE 전환에는 계약(entity_contracts) 등록이 필요합니다.");
      const c = await db.prepare("SELECT status FROM entity_contracts WHERE id = ?").bind(contractId).first<{ status: string }>();
      if (c?.status !== "ACTIVE") throw new HttpError(409, "CONTRACT_NOT_ACTIVE", "LIVE 전환에는 유효(ACTIVE) 상태의 공급사 계약이 필요합니다.");
      if (adapter !== "direct_contract" && adapter !== "api") throw new HttpError(409, "ADAPTER_NOT_LIVE", "LIVE 전환은 direct_contract 또는 api 어댑터에서만 가능합니다.");
    }
    await db.prepare("UPDATE suppliers SET adapter = ?, integration_status = ?, contract_id = COALESCE(?, contract_id), notes = COALESCE(?, notes), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
      .bind(adapter, status, b.contractId ? str(b.contractId, 64) : null, b.notes ? str(b.notes, 500) : null, m[1]).run();
    invalidateSupplierCache();
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
    // One SELECT per product table with the columns that actually exist in each schema.
    // `title`/`subtitle` are what the admin list shows; `search` is what `q` matches.
    const q = str(url.searchParams.get("q"), 80);
    const domain = str(url.searchParams.get("domain"), 20).toUpperCase();
    const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "100", 10) || 100));
    const sources: Record<string, string> = {
      HOTEL: "SELECT id, 'HOTEL' AS domain_type, name_ko AS title, city AS subtitle, base_price_krw AS price, partner_id, name_ko || ' ' || COALESCE(name_en,'') || ' ' || COALESCE(city,'') AS search FROM hotels",
      FLIGHT: "SELECT id, 'FLIGHT' AS domain_type, airline_name || ' ' || flight_number AS title, departure_airport || ' → ' || arrival_airport AS subtitle, base_price_krw AS price, partner_id, airline_name || ' ' || flight_number || ' ' || departure_airport || ' ' || arrival_airport || ' ' || COALESCE(departure_city,'') || ' ' || COALESCE(arrival_city,'') AS search FROM flights",
      TRAIN: "SELECT id, 'TRAIN' AS domain_type, train_type || ' ' || train_number AS title, departure_station || ' → ' || arrival_station AS subtitle, price_krw AS price, NULL AS partner_id, train_type || ' ' || train_number || ' ' || departure_station || ' ' || arrival_station AS search FROM trains",
      CAR: "SELECT id, 'CAR' AS domain_type, vehicle_model AS title, company_name || ' · ' || COALESCE(pickup_location,'') AS subtitle, daily_price_krw AS price, partner_id, vehicle_model || ' ' || company_name || ' ' || COALESCE(pickup_location,'') AS search FROM cars",
      TRANSFER: "SELECT id, 'TRANSFER' AS domain_type, service_title AS title, airport_code || ' · ' || COALESCE(destination_area,'') AS subtitle, price_krw AS price, partner_id, service_title || ' ' || airport_code || ' ' || COALESCE(destination_area,'') AS search FROM transfers",
      ACTIVITY: "SELECT id, 'ACTIVITY' AS domain_type, title, COALESCE(city,'') AS subtitle, price_krw AS price, partner_id, title || ' ' || COALESCE(city,'') || ' ' || COALESCE(category,'') AS search FROM activities",
      PACKAGE: "SELECT id, 'PACKAGE' AS domain_type, title, COALESCE(destination_city,'') AS subtitle, total_package_krw AS price, NULL AS partner_id, title || ' ' || COALESCE(destination_city,'') AS search FROM packages",
    };
    // D1 caps the number of terms in a compound SELECT, so each table is queried on its own (in parallel)
    // and the results are merged here.
    const picked = domain && sources[domain] ? [domain] : Object.keys(sources);
    const where = q ? " WHERE search LIKE ? ESCAPE '\\' OR id = ?" : "";
    const binds: unknown[] = q ? [`%${likeEscape(q)}%`, q, limit] : [limit];
    const parts = await Promise.all(picked.map((d) =>
      db.prepare(`SELECT id, domain_type, title, subtitle, price, partner_id FROM (${sources[d]})${where} ORDER BY title LIMIT ?`).bind(...binds).all()));
    const items = parts.flatMap((p) => p.results || [])
      .sort((a: any, b: any) => String(a.domain_type).localeCompare(String(b.domain_type)) || String(a.title).localeCompare(String(b.title), "ko"))
      .slice(0, limit);
    return json({ success: true, items, domains: Object.keys(sources) });
  }

  // Admin Partners Management & Approvals
  if (path === "/api/v1/admin/partners" && method === "GET") {
    const q = str(url.searchParams.get("q"), 80);
    const status = str(url.searchParams.get("status"), 20).toUpperCase();
    const cols = `p.id, p.email, p.company_name, p.partner_type, p.business_number, p.contact_phone, p.is_active,
              COALESCE(pr.status, 'ACTIVE') AS profile_status, COALESCE(pr.settlement_rate_bps, 1000) AS settlement_rate_bps,
              pr.representative_name, pr.bank_name, pr.bank_account_number, pr.bank_account_holder, pr.tax_invoice_email,
              pr.rejection_reason, pr.created_at, pr.approved_at, pr.approved_by`;
    const from = "partners p LEFT JOIN partner_profiles pr ON pr.partner_id = p.id";
    let where = "1=1";
    const p: unknown[] = [];
    if (q) {
      const like = `%${likeEscape(q)}%`;
      where += " AND (p.company_name LIKE ? ESCAPE '\\' OR p.email LIKE ? ESCAPE '\\' OR p.business_number LIKE ? ESCAPE '\\' OR p.id = ?)";
      p.push(like, like, like, q);
    }
    if ((PARTNER_STATUSES as readonly string[]).includes(status)) {
      where += " AND COALESCE(pr.status, 'ACTIVE') = ?";
      p.push(status);
    }
    const pg = pageParams(url);
    const total = ((await db.prepare(`SELECT COUNT(*) AS total FROM ${from} WHERE ${where}`).bind(...p).first<{ total: number }>())?.total || 0) as number;
    const rows = await db.prepare(`SELECT ${cols} FROM ${from} WHERE ${where} ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`).bind(...p, pg.pageSize, pg.offset).all();
    return json({ success: true, partners: rows.results || [], ...pageMeta(total, pg.page, pg.pageSize) });
  }

  m = path.match(/^\/api\/v1\/admin\/partners\/([A-Za-z0-9_-]+)$/);
  if (m && method === "PATCH") {
    const b = await readJson(request);
    const partnerId = m[1];
    const targetStatus = b.status ? str(b.status, 20).toUpperCase() : null;
    const settlementRateBps = b.settlementRateBps !== undefined ? Number(b.settlementRateBps) : null;
    const reason = b.reason ? str(b.reason, 300) : null;
    if (targetStatus !== null && !(PARTNER_STATUSES as readonly string[]).includes(targetStatus)) {
      throw new HttpError(400, "INVALID_STATUS", `status는 ${PARTNER_STATUSES.join(" | ")} 중 하나여야 합니다.`);
    }
    if ((targetStatus === "REJECTED" || targetStatus === "SUSPENDED") && !reason) {
      throw new HttpError(400, "REASON_REQUIRED", "반려·정지에는 사유가 필요합니다.");
    }
    if (settlementRateBps !== null && (!Number.isInteger(settlementRateBps) || settlementRateBps < 0 || settlementRateBps > 5000)) {
      throw new HttpError(400, "INVALID_RATE", "수수료율은 0–50% 사이(0–5000bps 정수)여야 합니다.");
    }
    const exists = await db.prepare("SELECT id FROM partners WHERE id = ?").bind(partnerId).first();
    if (!exists) throw new HttpError(404, "PARTNER_NOT_FOUND", "파트너를 찾을 수 없습니다.");

    if (targetStatus) {
      const isActive = targetStatus === "ACTIVE" ? 1 : 0;
      await db.batch([
        db.prepare("UPDATE partners SET is_active = ? WHERE id = ?").bind(isActive, partnerId),
        db.prepare(
          `UPDATE partner_profiles
           SET status = ?, rejection_reason = ?, approved_by = ?, approved_at = CASE WHEN ? = 'ACTIVE' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE approved_at END, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE partner_id = ?`
        ).bind(targetStatus, reason, admin.id, targetStatus, partnerId),
      ]);
      await audit(env, admin.id, `PARTNER_${targetStatus}`, "PARTNER", partnerId, { reason });
    }

    if (settlementRateBps !== null) {
      await db.prepare("UPDATE partner_profiles SET settlement_rate_bps = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE partner_id = ?")
        .bind(settlementRateBps, partnerId).run();
      await audit(env, admin.id, "UPDATE_PARTNER_COMMISSION", "PARTNER", partnerId, { settlementRateBps });
    }

    return json({ success: true, message: "파트너 정보가 업데이트되었습니다." });
  }

  // Admin Users Management (RBAC)
  if (path === "/api/v1/admin/users" && method === "GET") {
    const q = str(url.searchParams.get("q"), 80);
    const role = str(url.searchParams.get("role"), 20).toUpperCase();
    // No is_active column exists on users, so none is reported (accounts cannot be suspended yet).
    const cols = "id, email, full_name, phone_number, role, tier, trip_coins AS coin_balance, created_at";
    let where = "1=1";
    const p: unknown[] = [];
    if (q) {
      const like = `%${likeEscape(q)}%`;
      where += " AND (email LIKE ? ESCAPE '\\' OR full_name LIKE ? ESCAPE '\\' OR phone_number LIKE ? ESCAPE '\\' OR id = ?)";
      p.push(like, like, like, q);
    }
    if ((USER_ROLES as readonly string[]).includes(role)) {
      where += " AND role = ?";
      p.push(role);
    }
    const pg = pageParams(url);
    const total = ((await db.prepare(`SELECT COUNT(*) AS total FROM users WHERE ${where}`).bind(...p).first<{ total: number }>())?.total || 0) as number;
    const rows = await db.prepare(`SELECT ${cols} FROM users WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...p, pg.pageSize, pg.offset).all();
    return json({ success: true, users: rows.results || [], ...pageMeta(total, pg.page, pg.pageSize) });
  }

  m = path.match(/^\/api\/v1\/admin\/users\/([A-Za-z0-9_-]+)$/);
  if (m && method === "PATCH") {
    const b = await readJson(request);
    const userId = m[1];
    const role = b.role ? str(b.role, 20).toUpperCase() : null;
    const coinAdjustment = b.coinAdjustment !== undefined && b.coinAdjustment !== null && b.coinAdjustment !== "" ? Number(b.coinAdjustment) : null;
    const note = str(b.note, 200) || null;

    if (b.isActive !== undefined) {
      throw new HttpError(400, "NOT_SUPPORTED", "회원 정지 기능은 아직 지원하지 않습니다.");
    }
    if (role !== null && !(USER_ROLES as readonly string[]).includes(role)) {
      throw new HttpError(400, "INVALID_ROLE", `role은 ${USER_ROLES.join(" | ")} 중 하나여야 합니다.`);
    }
    if (coinAdjustment !== null && (!Number.isInteger(coinAdjustment) || coinAdjustment === 0 || Math.abs(coinAdjustment) > MAX_COIN_ADJUSTMENT)) {
      throw new HttpError(400, "INVALID_COIN_ADJUSTMENT", `코인 조정값은 0이 아닌 ±${MAX_COIN_ADJUSTMENT.toLocaleString("ko-KR")} 이내 정수여야 합니다.`);
    }
    if (userId === admin.id && role && role !== "ADMIN") {
      throw new HttpError(400, "CANNOT_DEMOTE_SELF", "자기 자신의 관리자 권한을 해제할 수 없습니다.");
    }
    const user = await db.prepare("SELECT id, trip_coins FROM users WHERE id = ?").bind(userId).first<{ id: string; trip_coins: number }>();
    if (!user) throw new HttpError(404, "USER_NOT_FOUND", "회원을 찾을 수 없습니다.");

    if (role !== null) {
      await db.prepare("UPDATE users SET role = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(role, userId).run();
      await audit(env, admin.id, "UPDATE_USER_ROLE", "USER", userId, { role });
    }
    let coinBalance = Number(user.trip_coins || 0);
    if (coinAdjustment !== null) {
      // Balance never goes below zero; the ledger records the change actually applied.
      const next = Math.max(0, coinBalance + coinAdjustment);
      const applied = next - coinBalance;
      if (applied !== 0) {
        await db.batch([
          db.prepare("UPDATE users SET trip_coins = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND trip_coins = ?").bind(next, userId, coinBalance),
          db.prepare("INSERT INTO coin_ledger (id, user_id, delta, reason, reference_id) VALUES (?, ?, ?, ?, ?)").bind(newId("coin"), userId, applied, `ADMIN_ADJUSTMENT${note ? `: ${note}` : ""}`, admin.id),
        ]);
      }
      await audit(env, admin.id, "ADJUST_USER_COINS", "USER", userId, { requested: coinAdjustment, applied, note });
      coinBalance = next;
    }

    return json({ success: true, message: "사용자 정보가 변경되었습니다.", coinBalance });
  }

  // Promotions: the public endpoint only lists active codes; operators need all of them.
  if (path === "/api/v1/admin/promotions" && method === "GET") {
    const rows = await db.prepare("SELECT * FROM promotions ORDER BY is_active DESC, valid_until DESC").all();
    return json({ success: true, promotions: rows.results || [] });
  }
  if (path === "/api/v1/admin/promotions" && method === "POST") {
    const b = await readJson(request);
    const code = str(b.code, 32).toUpperCase();
    const title = str(b.title, 200);
    const discountType = str(b.discountType || "FIXED_AMOUNT", 20).toUpperCase();
    const discountValue = Number(b.discountValue);
    const minOrder = b.minOrderAmountKrw === undefined ? 0 : Number(b.minOrderAmountKrw);
    const maxDiscount = b.maxDiscountKrw === undefined ? 0 : Number(b.maxDiscountKrw);
    const validFrom = b.validFrom ? str(b.validFrom, 30) : null;
    const validUntil = b.validUntil ? str(b.validUntil, 30) : null;
    if (!/^[A-Z0-9-]{4,32}$/.test(code)) throw new HttpError(400, "INVALID_CODE", "코드는 4~32자의 영문 대문자·숫자·하이픈이어야 합니다.");
    if (!title) throw new HttpError(400, "TITLE_REQUIRED", "프로모션 제목을 입력해주세요.");
    if (!["PERCENTAGE", "FIXED_AMOUNT"].includes(discountType)) throw new HttpError(400, "INVALID_DISCOUNT_TYPE", "할인 방식은 PERCENTAGE 또는 FIXED_AMOUNT이어야 합니다.");
    if (!Number.isFinite(discountValue) || discountValue <= 0) throw new HttpError(400, "INVALID_DISCOUNT_VALUE", "할인값은 0보다 커야 합니다.");
    if (discountType === "PERCENTAGE" && discountValue > 100) throw new HttpError(400, "INVALID_DISCOUNT_VALUE", "정률 할인은 100%를 넘을 수 없습니다.");
    if (!Number.isFinite(minOrder) || minOrder < 0) throw new HttpError(400, "INVALID_MIN_ORDER", "최소 주문금액은 0 이상이어야 합니다.");
    if (!Number.isFinite(maxDiscount) || maxDiscount < 0) throw new HttpError(400, "INVALID_MAX_DISCOUNT", "최대 할인액은 0 이상이어야 합니다.");
    for (const [label, v] of [["시작일", validFrom], ["종료일", validUntil]] as const) {
      if (v && Number.isNaN(Date.parse(v))) throw new HttpError(400, "INVALID_DATE", `${label} 형식이 올바르지 않습니다.`);
    }
    if (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) {
      throw new HttpError(400, "INVALID_PERIOD", "종료일은 시작일보다 뒤여야 합니다.");
    }
    const dup = await db.prepare("SELECT id FROM promotions WHERE code = ?").bind(code).first();
    if (dup) throw new HttpError(409, "CODE_EXISTS", "이미 등록된 코드입니다.");
    const id = newId("promo");
    await db.prepare(
      "INSERT INTO promotions (id, code, title, discount_type, discount_value, min_order_amount_krw, max_discount_krw, valid_from, valid_until, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
    ).bind(id, code, title, discountType, discountValue, minOrder, maxDiscount, validFrom, validUntil).run();
    await audit(env, admin.id, "CREATE_PROMOTION", "PROMOTION", id, { code });
    return json({ success: true, id, code }, 201);
  }
  m = path.match(/^\/api\/v1\/admin\/promotions\/([A-Za-z0-9_-]+)$/);
  if (m && method === "PATCH") {
    const b = await readJson(request);
    if (typeof b.isActive !== "boolean") throw new HttpError(400, "INVALID_BODY", "isActive(boolean)가 필요합니다.");
    const r = await db.prepare("UPDATE promotions SET is_active = ? WHERE id = ?").bind(b.isActive ? 1 : 0, m[1]).run();
    if (!r.meta.changes) throw new HttpError(404, "PROMOTION_NOT_FOUND", "프로모션을 찾을 수 없습니다.");
    await audit(env, admin.id, b.isActive ? "ENABLE_PROMOTION" : "DISABLE_PROMOTION", "PROMOTION", m[1], null);
    return json({ success: true });
  }

  // Moderation list includes blinded posts (the public /moments feed hides them).
  if (path === "/api/v1/admin/moments" && method === "GET") {
    const filter = str(url.searchParams.get("filter"), 20);
    const where = filter === "blinded" ? "WHERE is_blinded = 1" : filter === "featured" ? "WHERE is_featured = 1" : filter === "visible" ? "WHERE is_blinded = 0" : "";
    const rows = await db.prepare(`SELECT id, user_id, user_name, city, title, content, photos_json, likes_count, is_featured, is_blinded, created_at FROM trip_moments ${where} ORDER BY created_at DESC LIMIT 200`).all();
    return json({ success: true, moments: rows.results || [] });
  }

  m = path.match(/^\/api\/v1\/admin\/moments\/([A-Za-z0-9_-]+)\/(approve|blind|restore)$/);
  if (m && method === "POST") {
    const sql = {
      approve: "UPDATE trip_moments SET is_featured = 1, is_blinded = 0 WHERE id = ?",
      blind: "UPDATE trip_moments SET is_blinded = 1, is_featured = 0 WHERE id = ?",
      restore: "UPDATE trip_moments SET is_blinded = 0 WHERE id = ?",
    }[m[2] as "approve" | "blind" | "restore"];
    const r = await db.prepare(sql).bind(m[1]).run();
    if (!r.meta.changes) throw new HttpError(404, "MOMENT_NOT_FOUND", "게시물을 찾을 수 없습니다.");
    await audit(env, admin.id, `${m[2].toUpperCase()}_MOMENT`, "MOMENT", m[1], null);
    return json({ success: true });
  }

  m = path.match(/^\/api\/v1\/admin\/notices\/([A-Za-z0-9_-]+)$/);
  if (m && method === "PATCH") {
    const b = await readJson(request);
    const r = await db.prepare("UPDATE notices SET banner_active = COALESCE(?, banner_active), is_emergency = COALESCE(?, is_emergency) WHERE id = ?")
      .bind(b.bannerActive === undefined ? null : b.bannerActive ? 1 : 0, b.isEmergency === undefined ? null : b.isEmergency ? 1 : 0, m[1]).run();
    if (!r.meta.changes) throw new HttpError(404, "NOTICE_NOT_FOUND", "공지를 찾을 수 없습니다.");
    await audit(env, admin.id, "UPDATE_NOTICE", "NOTICE", m[1], { bannerActive: b.bannerActive, isEmergency: b.isEmergency });
    return json({ success: true });
  }

  throw new HttpError(404, "NOT_FOUND", "요청하신 관리자 API를 찾을 수 없습니다.");
}

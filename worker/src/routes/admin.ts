import type { Env } from "../env.ts";
import { HttpError, json, readJson, str } from "../lib/http.ts";
import { audit, rateLimit, requireAdmin } from "../lib/auth.ts";
import * as S from "../services/booking-service.ts";
import { BOOKING_STATUSES } from "../domain/state-machine.ts";
import { newId } from "../lib/crypto.ts";
import { invalidateSupplierCache } from "../services/catalog.ts";
import { likeEscape } from "../services/suggest-service.ts";
import { pageMeta, pageParams } from "../lib/pagination.ts";
import { idempotencyPrecheck, idempotencyStore } from "../lib/idempotency.ts";

const PARTNER_STATUSES = ["ACTIVE", "REJECTED", "SUSPENDED", "PENDING_APPROVAL"] as const;
const USER_ROLES = ["USER", "ADMIN"] as const;
const MAX_COIN_ADJUSTMENT = 10_000_000;
// Mirrors the CHECK constraints on `suppliers` (migrations/0002_ota_core.sql).
const SUPPLIER_ADAPTERS = ["none", "direct_contract", "simulator", "api"] as const;
const SUPPLIER_STATUSES = ["LIVE", "SANDBOX_VERIFIED", "DEV_DONE_CONTRACT_PENDING", "CONTRACTED_IN_DEV", "EXTERNAL_LINK_ONLY", "NOT_INTEGRATED", "BLOCKED"] as const;

// ---------------------------------------------------------------------------
// Admin product catalog: per-domain tables, one validated CRUD surface.
// Column names mirror worker/migrations/0001 (+0014/+0017 is_active).
// ---------------------------------------------------------------------------
type CatalogFieldType = "text" | "int" | "num" | "bool" | "json";
interface CatalogField { col: string; type: CatalogFieldType; max?: number; required?: boolean; min?: number; maxv?: number; array?: boolean }
interface CatalogDomain { table: string; prefix: string; fields: CatalogField[] }
const CATALOG_DOMAINS: Record<string, CatalogDomain> = {
  HOTEL: { table: "hotels", prefix: "htl", fields: [
    { col: "partner_id", type: "text", max: 100 }, { col: "name_ko", type: "text", max: 200, required: true },
    { col: "name_en", type: "text", max: 200, required: true }, { col: "city", type: "text", max: 100, required: true },
    { col: "country", type: "text", max: 100, required: true }, { col: "address", type: "text", max: 300, required: true },
    { col: "latitude", type: "num" }, { col: "longitude", type: "num" }, { col: "star_rating", type: "int", min: 1, maxv: 7 },
    { col: "property_type", type: "text", max: 20 }, { col: "review_score", type: "num", min: 0 }, { col: "review_count", type: "int", min: 0 },
    { col: "neighborhood", type: "text", max: 200 }, { col: "subway_nearby", type: "text", max: 200 },
    { col: "free_cancellation", type: "bool" }, { col: "free_breakfast", type: "bool" },
    { col: "base_price_krw", type: "num", min: 0, required: true }, { col: "thumbnail_url", type: "text", max: 500 },
    { col: "images_json", type: "json", array: true }, { col: "amenities_json", type: "json", array: true },
    { col: "rooms_json", type: "json", array: true }, { col: "is_active", type: "bool" },
  ] },
  FLIGHT: { table: "flights", prefix: "flt", fields: [
    { col: "partner_id", type: "text", max: 100 }, { col: "flight_number", type: "text", max: 50, required: true },
    { col: "airline_name", type: "text", max: 100, required: true }, { col: "airline_code", type: "text", max: 10, required: true },
    { col: "departure_airport", type: "text", max: 10, required: true }, { col: "arrival_airport", type: "text", max: 10, required: true },
    { col: "departure_city", type: "text", max: 100, required: true }, { col: "arrival_city", type: "text", max: 100, required: true },
    { col: "departure_time", type: "text", max: 30, required: true }, { col: "arrival_time", type: "text", max: 30, required: true },
    { col: "duration_minutes", type: "int", min: 0, required: true }, { col: "stops", type: "int", min: 0 },
    { col: "departure_time_slot", type: "text", max: 20 }, { col: "cabin_class", type: "text", max: 20 },
    { col: "base_price_krw", type: "num", min: 0, required: true }, { col: "free_baggage_kg", type: "int", min: 0 },
    { col: "available_seats", type: "int", min: 0 }, { col: "is_active", type: "bool" },
  ] },
  TRAIN: { table: "trains", prefix: "trn", fields: [
    { col: "train_number", type: "text", max: 50, required: true }, { col: "train_type", type: "text", max: 50, required: true },
    { col: "departure_station", type: "text", max: 100, required: true }, { col: "arrival_station", type: "text", max: 100, required: true },
    { col: "departure_time", type: "text", max: 30, required: true }, { col: "arrival_time", type: "text", max: 30, required: true },
    { col: "duration_minutes", type: "int", min: 0, required: true }, { col: "seat_class", type: "text", max: 50 },
    { col: "price_krw", type: "num", min: 0, required: true }, { col: "available_seats", type: "int", min: 0 },
    { col: "is_active", type: "bool" },
  ] },
  CAR: { table: "cars", prefix: "car", fields: [
    { col: "partner_id", type: "text", max: 100 }, { col: "company_name", type: "text", max: 200, required: true },
    { col: "vehicle_model", type: "text", max: 200, required: true }, { col: "vehicle_type", type: "text", max: 50 },
    { col: "seats", type: "int", min: 0 }, { col: "transmission", type: "text", max: 20 },
    { col: "daily_price_krw", type: "num", min: 0, required: true }, { col: "pickup_location", type: "text", max: 300, required: true },
    { col: "insurance_included", type: "bool" }, { col: "image_url", type: "text", max: 500 },
    { col: "available_stock", type: "int", min: 0 }, { col: "is_active", type: "bool" },
  ] },
  TRANSFER: { table: "transfers", prefix: "trf", fields: [
    { col: "partner_id", type: "text", max: 100 }, { col: "service_title", type: "text", max: 300, required: true },
    { col: "airport_code", type: "text", max: 20, required: true }, { col: "destination_area", type: "text", max: 300, required: true },
    { col: "vehicle_class", type: "text", max: 50 }, { col: "max_passengers", type: "int", min: 0 },
    { col: "max_luggage", type: "int", min: 0 }, { col: "price_krw", type: "num", min: 0, required: true },
    { col: "flight_tracking", type: "bool" }, { col: "image_url", type: "text", max: 500 }, { col: "is_active", type: "bool" },
  ] },
  ACTIVITY: { table: "activities", prefix: "act", fields: [
    { col: "partner_id", type: "text", max: 100 }, { col: "title", type: "text", max: 300, required: true },
    { col: "category", type: "text", max: 50, required: true }, { col: "city", type: "text", max: 100, required: true },
    { col: "country", type: "text", max: 100, required: true }, { col: "price_krw", type: "num", min: 0, required: true },
    { col: "review_score", type: "num", min: 0 }, { col: "review_count", type: "int", min: 0 },
    { col: "instant_confirmation", type: "bool" }, { col: "free_cancellation", type: "bool" },
    { col: "duration_type", type: "text", max: 50 }, { col: "guide_language", type: "text", max: 50 },
    { col: "voucher_type", type: "text", max: 50 }, { col: "thumbnail_url", type: "text", max: 500 },
    { col: "description", type: "text", max: 2000 }, { col: "packages_json", type: "json", array: true },
    { col: "is_active", type: "bool" },
  ] },
  PACKAGE: { table: "packages", prefix: "pkg", fields: [
    { col: "title", type: "text", max: 300, required: true }, { col: "destination_city", type: "text", max: 100, required: true },
    { col: "hotel_id", type: "text", max: 100 }, { col: "flight_id", type: "text", max: 100 },
    { col: "package_discount_rate", type: "num", min: 0 }, { col: "total_original_krw", type: "num", min: 0, required: true },
    { col: "total_package_krw", type: "num", min: 0, required: true }, { col: "thumbnail_url", type: "text", max: 500 },
    { col: "details_json", type: "json" }, { col: "is_active", type: "bool" },
  ] },
};

const CATALOG_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

/** Coerce one admin-supplied product field; throws 400 naming the field. */
function coerceCatalogField(spec: CatalogField, raw: unknown): unknown {
  const bad = (msg: string): never => { throw new HttpError(400, "INVALID_FIELD", `${spec.col}: ${msg}`, { field: spec.col }); };
  if (raw === undefined || raw === null || raw === "") {
    if (spec.required) throw new HttpError(400, "FIELD_REQUIRED", `${spec.col}은(는) 필수 항목입니다.`, { field: spec.col });
    return null;
  }
  switch (spec.type) {
    case "text": {
      const v = str(raw, spec.max || 500);
      if (spec.required && !v) throw new HttpError(400, "FIELD_REQUIRED", `${spec.col}은(는) 필수 항목입니다.`, { field: spec.col });
      return v;
    }
    case "int": {
      const v = typeof raw === "number" ? raw : Number(str(raw, 20));
      if (!Number.isInteger(v)) bad("정수여야 합니다.");
      if (spec.min !== undefined && v < spec.min) bad(`${spec.min} 이상이어야 합니다.`);
      if (spec.maxv !== undefined && v > spec.maxv) bad(`${spec.maxv} 이하여야 합니다.`);
      return v;
    }
    case "num": {
      const v = typeof raw === "number" ? raw : Number(str(raw, 20));
      if (!Number.isFinite(v)) bad("숫자여야 합니다.");
      if (spec.min !== undefined && v < spec.min) bad(`${spec.min} 이상이어야 합니다.`);
      if (spec.maxv !== undefined && v > spec.maxv) bad(`${spec.maxv} 이하여야 합니다.`);
      return v;
    }
    case "bool": {
      if (raw === true || raw === 1 || raw === "1") return 1;
      if (raw === false || raw === 0 || raw === "0") return 0;
      bad("true/false(0/1)여야 합니다.");
    }
    case "json": {
      let v: unknown = raw;
      if (typeof v === "string") {
        try { v = JSON.parse(v); } catch { bad("올바른 JSON이어야 합니다."); }
      }
      if (spec.array && !Array.isArray(v)) bad("배열 JSON이어야 합니다.");
      const s = JSON.stringify(v);
      if (s.length > 100000) bad("100KB를 넘을 수 없습니다.");
      return s;
    }
  }
}

function catalogSpec(domain: string): CatalogDomain {
  const d = CATALOG_DOMAINS[domain];
  if (!d) throw new HttpError(400, "INVALID_DOMAIN", `domain은 ${Object.keys(CATALOG_DOMAINS).join(" | ")} 중 하나여야 합니다.`);
  return d;
}

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
    // The list carries customer PII like the audited detail view, so list views are audited too (audit [m]).
    await audit(env, admin.id, "ADMIN_LIST_BOOKINGS", "BOOKING", "*", { status: status || null, filtered: Boolean(q), count: (rows.results || []).length });
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
    // Legacy static-salt SHA-256 password hashes still on record (users + partners + staff).
    // Sunset is blocked on email delivery (Resend): forcing rotation now would lock out
    // users with no recovery path. Tracked here until then (2026-11-09 audit [M]).
    const legacy = await db.prepare(
      `SELECT (SELECT COUNT(*) FROM users WHERE LENGTH(password_hash) = 64 AND password_hash GLOB '[0-9a-f]*')
        + (SELECT COUNT(*) FROM partners WHERE LENGTH(password_hash) = 64 AND password_hash GLOB '[0-9a-f]*')
        + (SELECT COUNT(*) FROM partner_staff WHERE LENGTH(password_hash) = 64 AND password_hash GLOB '[0-9a-f]*') AS c`,
    ).first<{ c: number }>();
    const ok = !unbalanced.results.length && !paidMismatch.results.length && !refundMismatch.results.length && !strandedDeposits.results.length;
    return json({ success: true, ok, unbalancedJournals: unbalanced.results, paidMismatch: paidMismatch.results, refundMismatch: refundMismatch.results, strandedDeposits: strandedDeposits.results, legacyPasswordHashes: Number(legacy?.c || 0) });
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
      // LIVE+api is allowed as a contract state, but bookabilityOf() keeps it
      // unsellable (SUPPLIER_API_NOT_IMPLEMENTED) until a real adapter exists.
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
  m = path.match(/^\/api\/v1\/admin\/entities\/([A-Za-z0-9_-]+)\/changes$/);
  if (m && method === "GET") {
    const ent = await db.prepare("SELECT id FROM business_entities WHERE id = ?").bind(m[1]).first();
    if (!ent) throw new HttpError(404, "ENTITY_NOT_FOUND", "사업자 정보를 찾을 수 없습니다.");
    const rows = await db.prepare("SELECT * FROM entity_change_log WHERE entity_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 100").bind(m[1]).all();
    return json({ success: true, changes: rows.results });
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

  // Entity contracts (PG / supplier / settlement / insurance). The supplier
  // LIVE switch requires an ACTIVE SUPPLIER contract, so onboarding any
  // supplier — including first-party direct sales — starts here.
  if (path === "/api/v1/admin/contracts" && method === "POST") {
    const b = await readJson(request);
    const entityId = str(b.entityId, 64);
    const type = str(b.contractType, 20).toUpperCase();
    const counterparty = str(b.counterparty, 200);
    if (!entityId || !counterparty) throw new HttpError(400, "FIELD_REQUIRED", "entityId와 counterparty는 필수 항목입니다.");
    if (!["PG", "SUPPLIER", "SETTLEMENT_ACCOUNT", "INSURANCE", "OTHER"].includes(type)) {
      throw new HttpError(400, "INVALID_CONTRACT_TYPE", "contractType은 PG | SUPPLIER | SETTLEMENT_ACCOUNT | INSURANCE | OTHER 중 하나여야 합니다.");
    }
    const ent = await db.prepare("SELECT id FROM business_entities WHERE id = ?").bind(entityId).first();
    if (!ent) throw new HttpError(400, "ENTITY_NOT_FOUND", "등록된 사업자 엔터티가 아닙니다.");
    const id = b.id !== undefined ? str(b.id, 64) : newId("ect");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpError(400, "INVALID_ID", "id는 64자 이하의 영문·숫자·-_만 허용됩니다.");
    if (await db.prepare("SELECT id FROM entity_contracts WHERE id = ?").bind(id).first()) {
      throw new HttpError(409, "ID_EXISTS", "이미 등록된 계약 ID입니다.");
    }
    await db.prepare("INSERT INTO entity_contracts (id, entity_id, contract_type, counterparty, reference, status, effective_from, effective_to, notes) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)")
      .bind(id, entityId, type, counterparty, b.reference !== undefined ? str(b.reference, 200) || null : null,
        b.effectiveFrom !== undefined ? str(b.effectiveFrom, 30) || null : null,
        b.effectiveTo !== undefined ? str(b.effectiveTo, 30) || null : null,
        b.notes !== undefined ? str(b.notes, 500) || null : null).run();
    await audit(env, admin.id, "CREATE_CONTRACT", "CONTRACT", id, { entityId, type });
    return json({ success: true, id }, 201);
  }
  m = path.match(/^\/api\/v1\/admin\/contracts\/([A-Za-z0-9_-]+)$/);
  if (m && method === "PATCH") {
    const b = await readJson(request);
    const before = await db.prepare("SELECT * FROM entity_contracts WHERE id = ?").bind(m[1]).first<any>();
    if (!before) throw new HttpError(404, "CONTRACT_NOT_FOUND", "계약을 찾을 수 없습니다.");
    const status = b.status !== undefined ? str(b.status, 20).toUpperCase() : before.status;
    if (!["PENDING", "ACTIVE", "EXPIRED", "TERMINATED"].includes(status)) {
      throw new HttpError(400, "INVALID_STATUS", "status는 PENDING | ACTIVE | EXPIRED | TERMINATED 중 하나여야 합니다.");
    }
    const counterparty = b.counterparty !== undefined ? str(b.counterparty, 200) : before.counterparty;
    const reference = b.reference !== undefined ? str(b.reference, 200) || null : before.reference;
    const notes = b.notes !== undefined ? str(b.notes, 500) || null : before.notes;
    if (!counterparty) throw new HttpError(400, "FIELD_REQUIRED", "counterparty는 필수 항목입니다.");
    await db.prepare("UPDATE entity_contracts SET status = ?, counterparty = ?, reference = ?, notes = ? WHERE id = ?")
      .bind(status, counterparty, reference, notes, m[1]).run();
    invalidateSupplierCache();
    await audit(env, admin.id, "UPDATE_CONTRACT", "CONTRACT", m[1], { before: before.status, after: status });
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
    const status = str(url.searchParams.get("status"), 20).toLowerCase();
    const pg = pageParams(url, 100, 200);
    const sources: Record<string, string> = {
      HOTEL: "SELECT id, 'HOTEL' AS domain_type, name_ko AS title, city AS subtitle, base_price_krw AS price, partner_id, is_active, name_ko || ' ' || COALESCE(name_en,'') || ' ' || COALESCE(city,'') AS search FROM hotels",
      FLIGHT: "SELECT id, 'FLIGHT' AS domain_type, airline_name || ' ' || flight_number AS title, departure_airport || ' → ' || arrival_airport AS subtitle, base_price_krw AS price, partner_id, is_active, airline_name || ' ' || flight_number || ' ' || departure_airport || ' ' || arrival_airport || ' ' || COALESCE(departure_city,'') || ' ' || COALESCE(arrival_city,'') AS search FROM flights",
      TRAIN: "SELECT id, 'TRAIN' AS domain_type, train_type || ' ' || train_number AS title, departure_station || ' → ' || arrival_station AS subtitle, price_krw AS price, NULL AS partner_id, is_active, train_type || ' ' || train_number || ' ' || departure_station || ' ' || arrival_station AS search FROM trains",
      CAR: "SELECT id, 'CAR' AS domain_type, vehicle_model AS title, company_name || ' · ' || COALESCE(pickup_location,'') AS subtitle, daily_price_krw AS price, partner_id, is_active, vehicle_model || ' ' || company_name || ' ' || COALESCE(pickup_location,'') AS search FROM cars",
      TRANSFER: "SELECT id, 'TRANSFER' AS domain_type, service_title AS title, airport_code || ' · ' || COALESCE(destination_area,'') AS subtitle, price_krw AS price, partner_id, is_active, service_title || ' ' || airport_code || ' ' || COALESCE(destination_area,'') AS search FROM transfers",
      ACTIVITY: "SELECT id, 'ACTIVITY' AS domain_type, title, COALESCE(city,'') AS subtitle, price_krw AS price, partner_id, is_active, title || ' ' || COALESCE(city,'') || ' ' || COALESCE(category,'') AS search FROM activities",
      PACKAGE: "SELECT id, 'PACKAGE' AS domain_type, title, COALESCE(destination_city,'') AS subtitle, total_package_krw AS price, NULL AS partner_id, is_active, title || ' ' || COALESCE(destination_city,'') AS search FROM packages",
    };
    // D1 caps the number of terms in a compound SELECT, so each table is queried on its own (in parallel)
    // and the results are merged here.
    const picked = domain && sources[domain] ? [domain] : Object.keys(sources);
    const conds: string[] = [];
    const binds: unknown[] = [];
    if (q) { conds.push("(search LIKE ? ESCAPE '\\' OR id = ?)"); binds.push(`%${likeEscape(q)}%`, q); }
    if (status === "active" || status === "inactive") { conds.push("is_active = ?"); binds.push(status === "active" ? 1 : 0); }
    const where = conds.length ? ` WHERE ${conds.join(" AND ")}` : "";
    const parts = await Promise.all(picked.map((d) =>
      db.prepare(`SELECT id, domain_type, title, subtitle, price, partner_id, is_active FROM (${sources[d]})${where} ORDER BY title LIMIT 200`).bind(...binds).all()));
    const merged = parts.flatMap((p) => p.results || [])
      .sort((a: any, b: any) => String(a.domain_type).localeCompare(String(b.domain_type)) || String(a.title).localeCompare(String(b.title), "ko"));
    const items = merged.slice(pg.offset, pg.offset + pg.pageSize);
    return json({ success: true, items, domains: Object.keys(sources), ...pageMeta(merged.length, pg.page, pg.pageSize) });
  }

  // Admin product detail: full row for the edit form.
  m = path.match(/^\/api\/v1\/admin\/catalog\/([A-Z]+)\/([A-Za-z0-9_-]+)$/);
  if (m && method === "GET" && !path.endsWith("/policy")) {
    const spec = catalogSpec(m[1]);
    const row = await db.prepare(`SELECT * FROM ${spec.table} WHERE id = ?`).bind(m[2]).first();
    if (!row) throw new HttpError(404, "PRODUCT_NOT_FOUND", "상품을 찾을 수 없습니다.");
    return json({ success: true, domain: m[1], product: row });
  }

  // Admin product create.
  m = path.match(/^\/api\/v1\/admin\/catalog\/([A-Z]+)$/);
  if (m && method === "POST") {
    const spec = catalogSpec(m[1]);
    const b = await readJson(request);
    const id = b.id !== undefined ? str(b.id, 100) : newId(spec.prefix);
    if (!CATALOG_ID_RE.test(id)) throw new HttpError(400, "INVALID_ID", "id는 100자 이하의 영문·숫자·-_만 허용됩니다.");
    if (await db.prepare(`SELECT id FROM ${spec.table} WHERE id = ?`).bind(id).first()) {
      throw new HttpError(409, "ID_EXISTS", "이미 등록된 상품 ID입니다.");
    }
    const byCol = new Map(spec.fields.map((f) => [f.col, f]));
    for (const k of Object.keys(b)) {
      if (k !== "id" && !byCol.has(k)) throw new HttpError(400, "UNKNOWN_FIELD", `알 수 없는 필드입니다: ${k}`, { field: k });
    }
    const cols = ["id"];
    const vals: unknown[] = [id];
    for (const f of spec.fields) {
      if (b[f.col] === undefined) {
        if (f.required) throw new HttpError(400, "FIELD_REQUIRED", `${f.col}은(는) 필수 항목입니다.`, { field: f.col });
        continue; // DB default applies
      }
      cols.push(f.col);
      vals.push(coerceCatalogField(f, b[f.col]));
    }
    await db.prepare(`INSERT INTO ${spec.table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).bind(...vals).run();
    await audit(env, admin.id, "CREATE_PRODUCT", m[1], id, { table: spec.table });
    return json({ success: true, id, domain: m[1] }, 201);
  }

  // Admin product update (partial; id/domain immutable).
  m = path.match(/^\/api\/v1\/admin\/catalog\/([A-Z]+)\/([A-Za-z0-9_-]+)$/);
  if (m && method === "PATCH" && !path.endsWith("/policy")) {
    const spec = catalogSpec(m[1]);
    const b = await readJson(request);
    if (b.id !== undefined || b.domain !== undefined) throw new HttpError(400, "IMMUTABLE_FIELD", "id/domain은 변경할 수 없습니다.");
    const byCol = new Map(spec.fields.map((f) => [f.col, f]));
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(b)) {
      const f = byCol.get(k);
      if (!f) throw new HttpError(400, "UNKNOWN_FIELD", `알 수 없는 필드입니다: ${k}`, { field: k });
      sets.push(`${f.col} = ?`);
      vals.push(coerceCatalogField(f, v));
    }
    if (!sets.length) throw new HttpError(400, "EMPTY_UPDATE", "변경할 필드가 없습니다.");
    const r = await db.prepare(`UPDATE ${spec.table} SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, m[2]).run();
    if (!r.meta.changes) throw new HttpError(404, "PRODUCT_NOT_FOUND", "상품을 찾을 수 없습니다.");
    await audit(env, admin.id, "UPDATE_PRODUCT", m[1], m[2], { fields: Object.keys(b) });
    return json({ success: true });
  }

  // Admin product delete: blocked while bookings (or package components) reference it.
  m = path.match(/^\/api\/v1\/admin\/catalog\/([A-Z]+)\/([A-Za-z0-9_-]+)$/);
  if (m && method === "DELETE") {
    const spec = catalogSpec(m[1]);
    const refs = await db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE domain_type = ? AND item_id = ?").bind(m[1], m[2]).first<{ c: number }>();
    if (Number(refs?.c || 0) > 0) {
      const sample = await db.prepare("SELECT booking_number FROM bookings WHERE domain_type = ? AND item_id = ? LIMIT 5").bind(m[1], m[2]).all();
      throw new HttpError(409, "REFERENCED_BY_BOOKING", `예약 ${refs!.c}건이 참조 중이라 삭제할 수 없습니다. 판매중지(is_active=0)를 사용하세요.`,
        { count: refs!.c, samples: (sample.results || []).map((s: any) => s.booking_number) });
    }
    if (m[1] === "HOTEL" || m[1] === "FLIGHT") {
      const col = m[1] === "HOTEL" ? "hotel_id" : "flight_id";
      const pkg = await db.prepare(`SELECT COUNT(*) AS c FROM packages WHERE ${col} = ?`).bind(m[2]).first<{ c: number }>();
      if (Number(pkg?.c || 0) > 0) throw new HttpError(409, "REFERENCED_BY_PACKAGE", `패키지 ${pkg!.c}건이 참조 중이라 삭제할 수 없습니다.`, { count: pkg!.c });
    }
    const r = await db.prepare(`DELETE FROM ${spec.table} WHERE id = ?`).bind(m[2]).run();
    if (!r.meta.changes) throw new HttpError(404, "PRODUCT_NOT_FOUND", "상품을 찾을 수 없습니다.");
    await audit(env, admin.id, "DELETE_PRODUCT", m[1], m[2], { table: spec.table });
    return json({ success: true });
  }

  // Admin bulk upsert: { domain, rows: [{...fields, id?}] }. Re-running the same
  // payload converges (upsert by id), so no idempotency key is needed.
  if (path === "/api/v1/admin/catalog/bulk" && method === "POST") {
    await rateLimit(request, env, "admin_bulk", 30, 3600);
    const b = await readJson(request, 2 * 1024 * 1024);
    const spec = catalogSpec(str(b.domain, 20).toUpperCase());
    const rows = Array.isArray(b.rows) ? b.rows : null;
    if (!rows || !rows.length) throw new HttpError(400, "ROWS_REQUIRED", "rows 배열(1~500건)가 필요합니다.");
    if (rows.length > 500) throw new HttpError(400, "TOO_MANY_ROWS", "한 번에 500건까지 업로드할 수 있습니다.");
    const byCol = new Map(spec.fields.map((f) => [f.col, f]));
    const failed: Array<{ index: number; id: string | null; error: string }> = [];
    // Phase 1: id shape check, so existence is known before field validation.
    const withIds: Array<{ index: number; row: any; id: string }> = [];
    rows.forEach((row: any, index: number) => {
      try {
        if (!row || typeof row !== "object") throw new HttpError(400, "INVALID_ROW", "행은 객체여야 합니다.");
        const id = row.id !== undefined ? str(row.id, 100) : newId(spec.prefix);
        if (!CATALOG_ID_RE.test(id)) throw new HttpError(400, "INVALID_ID", "id는 100자 이하의 영문·숫자·-_만 허용됩니다.");
        withIds.push({ index, row, id });
      } catch (e: any) {
        failed.push({ index, id: row && typeof row.id === "string" ? row.id.slice(0, 100) : null, error: e instanceof HttpError ? e.message : "행 처리 실패" });
      }
    });
    const existing = new Set<string>();
    for (let i = 0; i < withIds.length; i += 200) {
      const chunk = withIds.slice(i, i + 200);
      const found = await db.prepare(`SELECT id FROM ${spec.table} WHERE id IN (${chunk.map(() => "?").join(",")})`)
        .bind(...chunk.map((r) => r.id)).all<{ id: string }>();
      for (const r of found.results || []) existing.add(r.id);
    }
    // Phase 2: new ids need every required field; existing ids accept partial rows.
    const valid: Array<{ id: string; cols: string[]; vals: unknown[]; isNew: boolean }> = [];
    for (const { index, row, id } of withIds) {
      try {
        const isNew = !existing.has(id);
        const cols = ["id"];
        const vals: unknown[] = [id];
        for (const [k, v] of Object.entries(row)) {
          if (k === "id") continue;
          const f = byCol.get(k);
          if (!f) throw new HttpError(400, "UNKNOWN_FIELD", `알 수 없는 필드입니다: ${k}`, { field: k });
          cols.push(f.col);
          vals.push(coerceCatalogField(f, v));
        }
        if (isNew) {
          for (const f of spec.fields) {
            if (f.required && row[f.col] === undefined) {
              throw new HttpError(400, "FIELD_REQUIRED", `${f.col}은(는) 신규 등록 시 필수 항목입니다.`, { field: f.col });
            }
          }
        }
        valid.push({ id, cols, vals, isNew });
      } catch (e: any) {
        failed.push({ index, id, error: e instanceof HttpError ? e.message : "행 처리 실패" });
      }
    }
    // D1 rejects partial-column INSERTs (NOT NULL check runs before ON CONFLICT
    // resolution), so existence — already known — picks INSERT vs UPDATE.
    let created = 0;
    let updated = 0;
    for (let i = 0; i < valid.length; i += 50) {
      const stmts = [];
      for (const r of valid.slice(i, i + 50)) {
        if (r.isNew) {
          created++;
          stmts.push(db.prepare(`INSERT INTO ${spec.table} (${r.cols.join(", ")}) VALUES (${r.cols.map(() => "?").join(", ")})`).bind(...r.vals));
        } else {
          updated++;
          const dataCols = r.cols.filter((c) => c !== "id");
          if (!dataCols.length) continue; // id-only row: nothing to change
          stmts.push(db.prepare(`UPDATE ${spec.table} SET ${dataCols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).bind(...r.vals.slice(1), r.id));
        }
      }
      if (stmts.length) await db.batch(stmts);
    }
    await audit(env, admin.id, "BULK_UPSERT_PRODUCT", spec.table, `${created + updated}/${rows.length}`, { domain: str(b.domain, 20).toUpperCase(), created, updated, failed: failed.length });
    return json({ success: true, created, updated, failed });
  }

  // Affiliate click log (outlink tracking). Reads only; rows are written by /out/* redirects.
  if (path === "/api/v1/admin/affiliate/clicks" && method === "GET") {
    const partner = str(url.searchParams.get("partner"), 100).toLowerCase();
    const status = str(url.searchParams.get("status"), 20).toUpperCase();
    const q = str(url.searchParams.get("q"), 100);
    const conds: string[] = [];
    const p: unknown[] = [];
    if (partner) { conds.push("partner_name = ?"); p.push(partner); }
    if (status) { conds.push("status = ?"); p.push(status); }
    if (q) { const like = `%${likeEscape(q)}%`; conds.push("(click_id LIKE ? ESCAPE '\\' OR item_id LIKE ? ESCAPE '\\' OR partner_name LIKE ? ESCAPE '\\')"); p.push(like, like, like); }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const pg = pageParams(url);
    const total = (await db.prepare(`SELECT COUNT(*) AS total FROM affiliate_clicks ${where}`).bind(...p).first<{ total: number }>())?.total || 0;
    const rows = await db.prepare(`SELECT click_id, domain_type, item_id, item_title, partner_name, sub_id, status, created_at FROM affiliate_clicks ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...p, pg.pageSize, pg.offset).all();
    return json({ success: true, clicks: rows.results || [], ...pageMeta(total, pg.page, pg.pageSize) });
  }

  // Affiliate conversion log (postback-verified orders). Reads only.
  if (path === "/api/v1/admin/affiliate/conversions" && method === "GET") {
    const partner = str(url.searchParams.get("partner"), 100).toLowerCase();
    const status = str(url.searchParams.get("status"), 20).toUpperCase();
    const q = str(url.searchParams.get("q"), 100);
    const conds: string[] = [];
    const p: unknown[] = [];
    if (partner) { conds.push("partner_name = ?"); p.push(partner); }
    if (status) { conds.push("status = ?"); p.push(status); }
    if (q) { const like = `%${likeEscape(q)}%`; conds.push("(order_id LIKE ? ESCAPE '\\' OR click_id LIKE ? ESCAPE '\\')"); p.push(like, like); }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const pg = pageParams(url);
    const total = (await db.prepare(`SELECT COUNT(*) AS total FROM affiliate_conversions ${where}`).bind(...p).first<{ total: number }>())?.total || 0;
    const rows = await db.prepare(`SELECT id, click_id, partner_name, order_id, amount, currency, commission, status, created_at FROM affiliate_conversions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...p, pg.pageSize, pg.offset).all();
    return json({ success: true, conversions: rows.results || [], ...pageMeta(total, pg.page, pg.pageSize) });
  }

  // Affiliate funnel summary.
  if (path === "/api/v1/admin/affiliate/summary" && method === "GET") {
    const clicks = await db.prepare("SELECT COUNT(*) AS c FROM affiliate_clicks").first<{ c: number }>();
    const conv = await db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS gmv, COALESCE(SUM(commission), 0) AS commission FROM affiliate_conversions").first<any>();
    const byPartner = await db.prepare(`SELECT partner_name, COUNT(*) AS clicks,
      (SELECT COUNT(*) FROM affiliate_conversions c WHERE c.partner_name = k.partner_name) AS conversions,
      (SELECT COALESCE(SUM(amount), 0) FROM affiliate_conversions c WHERE c.partner_name = k.partner_name) AS gmv
      FROM affiliate_clicks k GROUP BY partner_name ORDER BY clicks DESC LIMIT 50`).all();
    return json({ success: true, summary: { clicks: clicks?.c || 0, conversions: conv?.c || 0, gmv: conv?.gmv || 0, commission: conv?.commission || 0 }, byPartner: byPartner.results || [] });
  }

  // Product policy read (null when the product follows domain defaults).
  m = path.match(/^\/api\/v1\/admin\/catalog\/([A-Z]+)\/([A-Za-z0-9_-]+)\/policy$/);
  if (m && method === "GET") {
    const spec = catalogSpec(m[1]);
    if (!await db.prepare(`SELECT id FROM ${spec.table} WHERE id = ?`).bind(m[2]).first()) {
      throw new HttpError(404, "PRODUCT_NOT_FOUND", "상품을 찾을 수 없습니다.");
    }
    const row = await db.prepare("SELECT domain_type, item_id, free_cancel_hours, change_allowed, no_show_fee_bps, tiers_json, floor_price_minor, note, updated_at FROM product_policies WHERE domain_type = ? AND item_id = ?").bind(m[1], m[2]).first();
    return json({ success: true, policy: row ? { ...row as object, tiers: JSON.parse((row as any).tiers_json || "[]") } : null });
  }

  // Product policy upsert (full replace).
  m = path.match(/^\/api\/v1\/admin\/catalog\/([A-Z]+)\/([A-Za-z0-9_-]+)\/policy$/);
  if (m && (method === "PUT" || method === "PATCH")) {
    const spec = catalogSpec(m[1]);
    if (!await db.prepare(`SELECT id FROM ${spec.table} WHERE id = ?`).bind(m[2]).first()) {
      throw new HttpError(404, "PRODUCT_NOT_FOUND", "상품을 찾을 수 없습니다.");
    }
    const b = await readJson(request);
    const freeHours = b.free_cancel_hours === undefined || b.free_cancel_hours === null ? null : Number(b.free_cancel_hours);
    if (freeHours !== null && (!Number.isInteger(freeHours) || freeHours < 0)) throw new HttpError(400, "INVALID_POLICY", "free_cancel_hours는 0 이상의 정수여야 합니다.");
    const changeAllowed = b.change_allowed === undefined ? 0 : (b.change_allowed === true || b.change_allowed === 1 || b.change_allowed === "1" ? 1 : 0);
    if (b.change_allowed !== undefined && !(b.change_allowed === true || b.change_allowed === false || b.change_allowed === 1 || b.change_allowed === 0 || b.change_allowed === "1" || b.change_allowed === "0")) {
      throw new HttpError(400, "INVALID_POLICY", "change_allowed는 true/false여야 합니다.");
    }
    const noShow = b.no_show_fee_bps === undefined || b.no_show_fee_bps === null ? null : Number(b.no_show_fee_bps);
    if (noShow !== null && (!Number.isInteger(noShow) || noShow < 0 || noShow > 10000)) throw new HttpError(400, "INVALID_POLICY", "no_show_fee_bps는 0~10000(bps) 정수여야 합니다.");
    const tiersIn = b.tiers === undefined ? [] : b.tiers;
    if (!Array.isArray(tiersIn) || tiersIn.length > 10) throw new HttpError(400, "INVALID_POLICY", "tiers는 최대 10개의 배열이어야 합니다.");
    const tiers = tiersIn.map((t: any) => {
      const h = Number(t?.hours_before);
      const r = Number(t?.refund_bps);
      if (!Number.isInteger(h) || h < 0) throw new HttpError(400, "INVALID_POLICY", "tiers[].hours_before는 0 이상의 정수여야 합니다.");
      if (!Number.isInteger(r) || r < 0 || r > 10000) throw new HttpError(400, "INVALID_POLICY", "tiers[].refund_bps는 0~10000(bps) 정수여야 합니다.");
      return { hours_before: h, refund_bps: r, note: str(t?.note, 200) };
    }).sort((a, b2) => b2.hours_before - a.hours_before);
    const note = b.note === undefined || b.note === null ? null : str(b.note, 1000);
    const floor = b.floor_price_minor === undefined || b.floor_price_minor === null ? null : Number(b.floor_price_minor);
    if (floor !== null && (!Number.isInteger(floor) || floor < 0)) throw new HttpError(400, "INVALID_POLICY", "floor_price_minor는 0 이상의 정수(마이너 단위)여야 합니다.");
    await db.prepare(`INSERT INTO product_policies (domain_type, item_id, free_cancel_hours, change_allowed, no_show_fee_bps, tiers_json, floor_price_minor, note, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(domain_type, item_id) DO UPDATE SET free_cancel_hours = excluded.free_cancel_hours, change_allowed = excluded.change_allowed,
      no_show_fee_bps = excluded.no_show_fee_bps, tiers_json = excluded.tiers_json, floor_price_minor = excluded.floor_price_minor, note = excluded.note, updated_at = excluded.updated_at`)
      .bind(m[1], m[2], freeHours, changeAllowed, noShow, JSON.stringify(tiers), floor, note).run();
    await audit(env, admin.id, "UPSERT_PRODUCT_POLICY", m[1], m[2], { tiers: tiers.length, floor_price_minor: floor });
    return json({ success: true });
  }

  // Legal document version registry.
  if (path === "/api/v1/admin/legal" && method === "GET") {
    const rows = await db.prepare("SELECT slug, version, title, effective_from, updated_at FROM legal_documents ORDER BY slug").all();
    return json({ success: true, documents: rows.results || [] });
  }
  m = path.match(/^\/api\/v1\/admin\/legal\/([a-z-]+)$/);
  if (m && method === "PATCH") {
    const b = await readJson(request);
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (b.version !== undefined) {
      const v = str(b.version, 20);
      if (!/^\d+\.\d+$/.test(v)) throw new HttpError(400, "INVALID_VERSION", "version은 '2.0' 형식이어야 합니다.");
      sets.push("version = ?"); vals.push(v);
    }
    if (b.title !== undefined) { sets.push("title = ?"); vals.push(str(b.title, 200)); }
    if (b.effective_from !== undefined) {
      const d = str(b.effective_from, 30);
      if (Number.isNaN(Date.parse(d))) throw new HttpError(400, "INVALID_DATE", "effective_from 형식이 올바르지 않습니다.");
      sets.push("effective_from = ?"); vals.push(d);
    }
    if (!sets.length) throw new HttpError(400, "EMPTY_UPDATE", "변경할 필드가 없습니다.");
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    const r = await db.prepare(`UPDATE legal_documents SET ${sets.join(", ")} WHERE slug = ?`).bind(...vals, m[1]).run();
    if (!r.meta.changes) throw new HttpError(404, "LEGAL_NOT_FOUND", "약관 문서를 찾을 수 없습니다.");
    await audit(env, admin.id, "UPDATE_LEGAL", "LEGAL", m[1], { fields: Object.keys(b) });
    return json({ success: true });
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
      // Money-moving admin op: Idempotency-Key is required so a retried or
      // double-submitted request replays instead of double-applying (audit [M]).
      const idemKey = str(request.headers.get("Idempotency-Key"), 100);
      if (!idemKey) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "코인 조정에는 Idempotency-Key 헤더가 필요합니다.");
      const idem = await idempotencyPrecheck(env, "admin:coin-adjust", idemKey, [admin.id, userId, String(coinAdjustment), note || ""]);
      if (idem.replay) return json(idem.replay.body as any, idem.replay.status);
      // Balance never goes below zero; the ledger records the change actually applied.
      const next = Math.max(0, coinBalance + coinAdjustment);
      const applied = next - coinBalance;
      if (applied !== 0) {
        // CAS first and CHECK it: without the changes check a lost race would
        // still insert the ledger row and diverge balance from ledger (audit [M]).
        const cas = await db.prepare("UPDATE users SET trip_coins = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND trip_coins = ?").bind(next, userId, coinBalance).run();
        if (!cas.meta.changes) throw new HttpError(409, "CONCURRENT_MODIFICATION", "잔액이 방금 변경되었습니다. 새로고침 후 다시 시도해주세요.");
        await db.prepare("INSERT INTO coin_ledger (id, user_id, delta, reason, reference_id) VALUES (?, ?, ?, ?, ?)").bind(newId("coin"), userId, applied, `ADMIN_ADJUSTMENT${note ? `: ${note}` : ""}`, admin.id).run();
      }
      await audit(env, admin.id, "ADJUST_USER_COINS", "USER", userId, { requested: coinAdjustment, applied, note });
      coinBalance = next;
      const body = { success: true, message: "사용자 정보가 변경되었습니다.", coinBalance };
      await idempotencyStore(env, "admin:coin-adjust", idemKey, 200, body);
      return json(body);
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

  // FX rates manual update. No automatic rate feed exists yet, so operations
  // refreshes rates by hand from the treasury source (2026-11-09 audit [M]).
  if (path === "/api/v1/admin/fx-rates" && method === "PUT") {
    const b = await readJson(request);
    const rates = b.rates;
    if (!Array.isArray(rates) || !rates.length || rates.length > 100) throw new HttpError(400, "INVALID_RATES", "rates 배열(1~100개)이 필요합니다.");
    for (const r of rates) {
      const cur = str(r?.currency, 8).toUpperCase();
      const rate = Number(r?.rate_to_krw);
      if (!/^[A-Z]{3}$/.test(cur)) throw new HttpError(400, "INVALID_RATES", "통화 코드는 영문 3자여야 합니다.");
      if (!Number.isFinite(rate) || rate <= 0) throw new HttpError(400, "INVALID_RATES", `${cur} 환율이 올바르지 않습니다.`);
    }
    await db.batch(rates.map((r: any) =>
      db.prepare("INSERT INTO fx_rates (currency, symbol, rate_to_krw, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(currency) DO UPDATE SET rate_to_krw = excluded.rate_to_krw, updated_at = excluded.updated_at")
        .bind(str(r.currency, 8).toUpperCase(), str(r.symbol, 8) || str(r.currency, 8).toUpperCase(), Number(r.rate_to_krw)),
    ));
    await audit(env, admin.id, "UPDATE_FX_RATES", "FX", "*", { count: rates.length });
    return json({ success: true, updated: rates.length });
  }

  throw new HttpError(404, "NOT_FOUND", "요청하신 관리자 API를 찾을 수 없습니다.");
}

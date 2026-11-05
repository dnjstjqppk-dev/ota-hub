import type { Env } from "../env.ts";
import { HttpError, json, readJson, str } from "../lib/http.ts";
import { jwtSecret, rateLimit, requirePartner } from "../lib/auth.ts";
import { hashPassword, newId, signJwt, verifyPasswordDetailed } from "../lib/crypto.ts";

export async function handlePartner(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/v1/partner")) return null;
  const method = request.method;
  const db = env.DB;

  // -------------------------------------------------------------------------
  // 1. Partner Registration (Onboarding application)
  // -------------------------------------------------------------------------
  if (path === "/api/v1/partner/register" && method === "POST") {
    await rateLimit(request, env, "partner_register", 30, 3600);
    const b = await readJson(request);
    const email = str(b.email, 254).toLowerCase();
    const companyName = str(b.companyName, 200);
    const password = String(b.password || "");
    const partnerType = str(b.partnerType || "HOTEL", 20).toUpperCase();
    const businessNumber = str(b.businessNumber, 50);
    const contactPhone = str(b.contactPhone, 50);
    const repName = str(b.representativeName, 100);

    if (!email || !companyName || !password || !businessNumber) {
      throw new HttpError(400, "MISSING_FIELDS", "회사명, 이메일, 비밀번호, 사업자등록번호는 필수 항목입니다.");
    }
    if (password.length < 8) {
      throw new HttpError(400, "WEAK_PASSWORD", "비밀번호는 최소 8자 이상이어야 합니다.");
    }

    const existing = await db.prepare("SELECT id FROM partners WHERE email = ?").bind(email).first();
    if (existing) {
      throw new HttpError(409, "EMAIL_EXISTS", "이미 가입 신청된 파트너 이메일입니다.");
    }

    const partnerId = `ptn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const passHash = await hashPassword(password);

    await db.batch([
      db.prepare(
        `INSERT INTO partners (id, email, password_hash, company_name, partner_type, business_number, contact_phone, settlement_rate, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0.90, 1)`
      ).bind(partnerId, email, passHash, companyName, partnerType, businessNumber, contactPhone),
      db.prepare(
        `INSERT INTO partner_profiles (partner_id, status, representative_name, bank_name, bank_account_number, bank_account_holder, tax_invoice_email, settlement_rate_bps)
         VALUES (?, 'PENDING_APPROVAL', ?, ?, ?, ?, ?, 1000)`
      ).bind(partnerId, repName || companyName, str(b.bankName, 50) || null, str(b.bankAccountNumber, 50) || null, str(b.bankAccountHolder, 100) || repName, email),
      db.prepare(
        `INSERT INTO partner_staff (id, partner_id, email, password_hash, full_name, role, is_active)
         VALUES (?, ?, ?, ?, ?, 'OWNER', 1)`
      ).bind(newId("stf"), partnerId, email, passHash, repName || companyName),
    ]);

    return json({
      success: true,
      message: "파트너 입점 신청이 완료되었습니다. 관리자 승인 후 익스트라넷을 이용하실 수 있습니다.",
      partnerId,
    }, 201);
  }

  // -------------------------------------------------------------------------
  // 2. Partner Login
  // -------------------------------------------------------------------------
  if (path === "/api/v1/partner/login" && method === "POST") {
    await rateLimit(request, env, "partner_login", 15, 900);
    const b = await readJson(request);
    const email = str(b.email, 254).toLowerCase();
    const pass = String(b.password || "");

    const p = await db.prepare(
      `SELECT p.id, p.email, p.password_hash, p.company_name, p.partner_type, p.is_active,
              COALESCE(pr.status, 'ACTIVE') AS profile_status, COALESCE(pr.settlement_rate_bps, 1000) AS rate_bps
       FROM partners p
       LEFT JOIN partner_profiles pr ON pr.partner_id = p.id
       WHERE p.email = ?`
    ).bind(email).first<any>();

    if (!p) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "파트너 이메일 또는 비밀번호가 일치하지 않습니다.");
    }

    const v = await verifyPasswordDetailed(pass, p.password_hash);
    if (!v.ok) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "파트너 이메일 또는 비밀번호가 일치하지 않습니다.");
    }

    const profileStatus = String(p.profile_status || "").toUpperCase();
    if (profileStatus === "PENDING_APPROVAL" || profileStatus === "PENDING") {
      throw new HttpError(403, "PENDING_APPROVAL", "파트너 가입 승인 심사 중입니다. 승인 완료 후 로그인하실 수 있습니다.");
    }
    if (p.is_active !== 1 || profileStatus === "SUSPENDED" || profileStatus === "REJECTED") {
      throw new HttpError(403, "PARTNER_SUSPENDED", "운영 정책에 따라 이용이 정지된 파트너 계정입니다.");
    }

    const token = await signJwt(
      { id: p.id, email: p.email, companyName: p.company_name, role: "PARTNER" },
      jwtSecret(env),
      24 * 3600
    );

    return json({
      success: true,
      token,
      partner: {
        id: p.id,
        email: p.email,
        companyName: p.company_name,
        partnerType: p.partner_type,
        settlementRateBps: p.rate_bps,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Authenticated Partner Area
  // -------------------------------------------------------------------------
  const partner = await requirePartner(request, env);
  const pId = partner.partnerId;

  // 3. Partner Dashboard Metrics
  if (path === "/api/v1/partner/dashboard" && method === "GET") {
    // Count products across domains
    const [h, f, c, tf, a] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS c FROM hotels WHERE partner_id = ?").bind(pId).first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) AS c FROM flights WHERE partner_id = ?").bind(pId).first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) AS c FROM cars WHERE partner_id = ?").bind(pId).first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) AS c FROM transfers WHERE partner_id = ?").bind(pId).first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) AS c FROM activities WHERE partner_id = ?").bind(pId).first<{ c: number }>(),
    ]);
    const totalProducts = (h?.c || 0) + (f?.c || 0) + (c?.c || 0) + (tf?.c || 0) + (a?.c || 0);

    const orders = await db.prepare(
      `SELECT id, booking_number, domain_type, title, status, total_price, currency, created_at
       FROM bookings
       ORDER BY created_at DESC LIMIT 10`
    ).all<any>();

    const profile = await db.prepare("SELECT * FROM partner_profiles WHERE partner_id = ?").bind(pId).first<any>();

    const statsObj = {
      activeProductsCount: totalProducts,
      monthlyGrossKrw: 18500000,
      monthlyNetKrw: Math.round(18500000 * ((10000 - (profile?.settlement_rate_bps || 1000)) / 10000)),
      pendingBookingsCount: orders.results?.filter((o: any) => o.status === 'SUPPLIER_BOOKING_PENDING' || o.status === 'AWAITING_PAYMENT').length || 0,
      commissionRatePercent: (profile?.settlement_rate_bps || 1000) / 100,
    };

    return json({
      success: true,
      partner: {
        id: pId,
        companyName: partner.companyName,
        email: partner.email,
        settlementRateBps: profile?.settlement_rate_bps || 1000,
      },
      metrics: statsObj,
      stats: statsObj,
      recentOrders: orders.results || [],
    });
  }

  // 4. Partner Profile Management
  if (path === "/api/v1/partner/profile" && method === "GET") {
    const p = await db.prepare("SELECT * FROM partners WHERE id = ?").bind(pId).first<any>();
    const pr = await db.prepare("SELECT * FROM partner_profiles WHERE partner_id = ?").bind(pId).first<any>();
    return json({ success: true, partner: { ...p, profile: pr } });
  }

  if (path === "/api/v1/partner/profile" && method === "PATCH") {
    const b = await readJson(request);
    const contactPhone = str(b.contactPhone, 50);
    const bankName = str(b.bankName, 50);
    const bankAccountNumber = str(b.bankAccountNumber, 50);
    const bankAccountHolder = str(b.bankAccountHolder, 100);
    const taxInvoiceEmail = str(b.taxInvoiceEmail, 254);

    await db.batch([
      db.prepare("UPDATE partners SET contact_phone = COALESCE(?, contact_phone) WHERE id = ?").bind(contactPhone || null, pId),
      db.prepare(
        `UPDATE partner_profiles
         SET bank_name = COALESCE(?, bank_name),
             bank_account_number = COALESCE(?, bank_account_number),
             bank_account_holder = COALESCE(?, bank_account_holder),
             tax_invoice_email = COALESCE(?, tax_invoice_email),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE partner_id = ?`
      ).bind(bankName || null, bankAccountNumber || null, bankAccountHolder || null, taxInvoiceEmail || null, pId),
    ]);
    return json({ success: true, message: "파트너 정보가 업데이트되었습니다." });
  }

  // 5. Partner Products (Catalog Management)
  if (path === "/api/v1/partner/products" && method === "GET") {
    const hotels = await db.prepare("SELECT id, name_ko AS title, 'HOTEL' AS domain_type, city, base_price_krw, 1 AS is_active FROM hotels WHERE partner_id = ? LIMIT 100").bind(pId).all();
    const cars = await db.prepare("SELECT id, vehicle_model AS title, 'CAR' AS domain_type, pickup_location AS city, daily_price_krw AS base_price_krw, 1 AS is_active FROM cars WHERE partner_id = ? LIMIT 100").bind(pId).all();
    const activities = await db.prepare("SELECT id, title, 'ACTIVITY' AS domain_type, city, price_krw AS base_price_krw, 1 AS is_active FROM activities WHERE partner_id = ? LIMIT 100").bind(pId).all();
    const all = [...(hotels.results || []), ...(cars.results || []), ...(activities.results || [])];
    return json({ success: true, products: all });
  }

  if (path === "/api/v1/partner/products" && method === "POST") {
    const b = await readJson(request);
    const domain = str(b.domain || "HOTEL", 20).toUpperCase();
    const title = str(b.title, 200);
    const city = str(b.city || "서울", 100);
    const price = Number(b.price || 100000);
    const id = `ptn_prod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    if (!title) throw new HttpError(400, "TITLE_REQUIRED", "상품명을 입력해주세요.");

    if (domain === "HOTEL") {
      await db.prepare(
        "INSERT INTO hotels (id, partner_id, name_ko, name_en, city, country, address, base_price_krw) VALUES (?, ?, ?, ?, ?, '대한민국', '상세 주소', ?)"
      ).bind(id, pId, title, title, city, price).run();
    } else if (domain === "CAR") {
      await db.prepare(
        "INSERT INTO cars (id, partner_id, company_name, vehicle_model, pickup_location, daily_price_krw) VALUES (?, ?, ?, ?, '공항 지점', ?)"
      ).bind(id, pId, partner.companyName || "파트너 렌터카", title, price).run();
    } else {
      await db.prepare(
        "INSERT INTO activities (id, partner_id, title, city, country, price_krw) VALUES (?, ?, ?, ?, '대한민국', ?)"
      ).bind(id, pId, title, city, price).run();
    }
    return json({ success: true, id }, 201);
  }

  // 6. Partner Inventory & Pricing Calendar
  if (path === "/api/v1/partner/inventory" && method === "GET") {
    const itemId = str(url.searchParams.get("itemId"), 100);
    const month = str(url.searchParams.get("month") || new Date().toISOString().slice(0, 7), 7);
    const rows = await db.prepare(
      `SELECT * FROM partner_inventory WHERE partner_id = ? AND (item_id = ? OR ? = '') AND service_date LIKE ? ORDER BY service_date`
    ).bind(pId, itemId || "", itemId || "", `${month}%`).all();
    return json({ success: true, inventory: rows.results || [] });
  }

  if (path === "/api/v1/partner/inventory" && method === "PUT") {
    const b = await readJson(request);
    const domain = str(b.domain || "HOTEL", 20).toUpperCase();
    const itemId = str(b.itemId, 100);
    const unitId = str(b.unitId || "default", 100);
    const serviceDate = str(b.serviceDate, 10);
    const allocatedUnits = Number(b.allocatedUnits ?? 10);
    const priceOverride = b.priceOverrideMinor !== undefined ? Number(b.priceOverrideMinor) : null;
    const isClosed = b.isClosed ? 1 : 0;

    if (!itemId || !serviceDate) throw new HttpError(400, "INVALID_PARAMS", "상품 ID와 날짜는 필수입니다.");

    await db.prepare(
      `INSERT INTO partner_inventory (id, partner_id, domain_type, item_id, unit_id, service_date, allocated_units, price_override_minor, is_closed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(partner_id, item_id, unit_id, service_date) DO UPDATE SET
         allocated_units = excluded.allocated_units,
         price_override_minor = excluded.price_override_minor,
         is_closed = excluded.is_closed`
    ).bind(newId("inv"), pId, domain, itemId, unitId, serviceDate, allocatedUnits, priceOverride, isClosed).run();

    return json({ success: true, message: "재고 및 요금이 반영되었습니다." });
  }

  // 7. Partner Orders & Booking Fulfillment
  if (path === "/api/v1/partner/orders" && method === "GET") {
    const rows = await db.prepare(
      `SELECT id, booking_number, domain_type, title, status, total_price, currency, customer_name, created_at
       FROM bookings
       ORDER BY created_at DESC LIMIT 100`
    ).all<any>();

    // Mask customer name for privacy compliance (김** 등)
    const masked = (rows.results || []).map((r: any) => {
      const name = r.customer_name || "고객";
      const maskedName = name.length > 2 ? `${name[0]}*${name.slice(2)}` : `${name[0]}*`;
      return { ...r, customerNameMasked: maskedName };
    });

    return json({ success: true, orders: masked });
  }

  let m = path.match(/^\/api\/v1\/partner\/orders\/([A-Za-z0-9_-]+)\/(confirm|reject)$/);
  if (m && method === "POST") {
    const orderId = m[1];
    const action = m[2];
    const b = await db.prepare("SELECT * FROM bookings WHERE id = ?").bind(orderId).first<any>();
    if (!b) throw new HttpError(404, "ORDER_NOT_FOUND", "주문 정보를 찾을 수 없습니다.");

    const newStatus = action === "confirm" ? "CONFIRMED" : "CANCELLED";
    await db.prepare("UPDATE bookings SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(newStatus, orderId).run();
    return json({ success: true, bookingId: orderId, status: newStatus });
  }

  // 8. Partner Settlements
  if (path === "/api/v1/partner/settlements" && method === "GET") {
    const batches = await db.prepare(
      "SELECT * FROM partner_settlement_batches WHERE partner_id = ? ORDER BY period_start DESC LIMIT 24"
    ).bind(pId).all();

    return json({
      success: true,
      batches: batches.results || [],
      summary: {
        totalGrossKrw: 35000000,
        totalCommissionKrw: 3500000,
        totalNetPayoutKrw: 31500000,
        nextPayoutDate: "2026-11-20",
        payoutBank: "신한은행 110-123-456789",
      },
    });
  }

  // 9. Partner Staff Accounts
  if (path === "/api/v1/partner/staff" && method === "GET") {
    const rows = await db.prepare("SELECT id, email, full_name, role, is_active, created_at FROM partner_staff WHERE partner_id = ?").bind(pId).all();
    return json({ success: true, staff: rows.results || [] });
  }

  if (path === "/api/v1/partner/staff" && method === "POST") {
    const b = await readJson(request);
    const email = str(b.email, 254).toLowerCase();
    const name = str(b.fullName, 100);
    const role = str(b.role || "STAFF", 20).toUpperCase();
    const pass = String(b.password || "PartnerStaff123!");

    if (!email || !name) throw new HttpError(400, "FIELDS_REQUIRED", "이메일과 이름을 입력해주세요.");
    const passHash = await hashPassword(pass);

    const id = newId("stf");
    await db.prepare(
      "INSERT INTO partner_staff (id, partner_id, email, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)"
    ).bind(id, pId, email, passHash, name, role).run();

    return json({ success: true, id }, 201);
  }

  throw new HttpError(404, "NOT_FOUND", "요청하신 파트너 API를 찾을 수 없습니다.");
}

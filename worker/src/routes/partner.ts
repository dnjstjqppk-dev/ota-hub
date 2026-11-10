import type { Env } from "../env.ts";
import { HttpError, json, readJson, str } from "../lib/http.ts";
import { jwtSecret, rateLimit, requirePartner, requirePartnerOnboarding, resetSubjectSessions } from "../lib/auth.ts";
import { hashPassword, newId, randomToken, resolvePbkdf2Iterations, sha256Hex, signJwt, verifyPasswordDetailed } from "../lib/crypto.ts";
import { isEmailConfigured } from "../services/email-service.ts";
import { EMAIL_RE, validatePasswordPolicy } from "./auth.ts";
import * as S from "../services/booking-service.ts";
import { BOOKING_STATUSES } from "../domain/state-machine.ts";
import { pageMeta, pageParams } from "../lib/pagination.ts";
import { likeEscape } from "../services/suggest-service.ts";

/** Validate partner-supplied hotel rooms. Absent input means "no rooms yet" ([]). */
function parseRooms(input: unknown): Array<{ id: string; name_ko: string; base_price_krw: number; available_inventory: number; max_occupancy: number }> {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > 50) throw new HttpError(400, "INVALID_ROOMS", "객실은 최대 50개까지 배열로 전달해주세요.");
  return input.map((r: any, i: number) => {
    const name = str(r?.name_ko || r?.name, 100);
    const price = Number(r?.base_price_krw);
    const inv = Number(r?.available_inventory);
    const occ = Number(r?.max_occupancy ?? 2);
    if (!name) throw new HttpError(400, "INVALID_ROOMS", `${i + 1}번째 객실명이 비어 있습니다.`);
    if (!Number.isInteger(price) || price < 0) throw new HttpError(400, "INVALID_ROOMS", `${i + 1}번째 객실 요금이 올바르지 않습니다.`);
    if (!Number.isInteger(inv) || inv < 0) throw new HttpError(400, "INVALID_ROOMS", `${i + 1}번째 객실 재고가 올바르지 않습니다.`);
    return { id: str(r?.id, 64) || `rm_${Date.now().toString(36)}_${i}`, name_ko: name, base_price_krw: price, available_inventory: inv, max_occupancy: Number.isInteger(occ) && occ > 0 ? occ : 2 };
  });
}

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
    validatePasswordPolicy(password);

    const existing = await db.prepare("SELECT id FROM partners WHERE email = ?").bind(email).first();
    if (existing) {
      throw new HttpError(409, "EMAIL_EXISTS", "이미 가입 신청된 파트너 이메일입니다.");
    }

    const partnerId = `ptn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const passHash = await hashPassword(password, resolvePbkdf2Iterations(env));

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
      const s = await db.prepare(
        `SELECT s.id, s.partner_id, s.email, s.password_hash, s.full_name, s.role, s.is_active,
                p.company_name, p.partner_type, p.is_active AS parent_active,
                COALESCE(pr.status, 'ACTIVE') AS profile_status, COALESCE(pr.settlement_rate_bps, 1000) AS rate_bps
         FROM partner_staff s
         JOIN partners p ON p.id = s.partner_id
         LEFT JOIN partner_profiles pr ON pr.partner_id = p.id
         WHERE s.email = ?`
      ).bind(email).first<any>();
      if (!s) throw new HttpError(401, "INVALID_CREDENTIALS", "파트너 이메일 또는 비밀번호가 일치하지 않습니다.");
      const sv = await verifyPasswordDetailed(pass, s.password_hash, resolvePbkdf2Iterations(env));
      if (!sv.ok) throw new HttpError(401, "INVALID_CREDENTIALS", "파트너 이메일 또는 비밀번호가 일치하지 않습니다.");
      if (s.is_active !== 1) throw new HttpError(403, "STAFF_DEACTIVATED", "비활성화된 직원 계정입니다. 관리자에게 문의하세요.");
      const sProfile = String(s.profile_status || "").toUpperCase();
      if (sProfile === "PENDING_APPROVAL" || sProfile === "PENDING") {
        throw new HttpError(403, "PENDING_APPROVAL", "파트너 가입 승인 심사 중입니다. 승인 완료 후 로그인하실 수 있습니다.");
      }
      if (s.parent_active !== 1 || sProfile === "SUSPENDED" || sProfile === "REJECTED") {
        throw new HttpError(403, "PARTNER_SUSPENDED", "운영 정책에 따라 이용이 정지된 파트너 계정입니다.");
      }
      const staffToken = await signJwt(
        { id: s.partner_id, email: s.email, companyName: s.company_name, role: "PARTNER", staffId: s.id, staffRole: s.role, fullName: s.full_name },
        jwtSecret(env),
        24 * 3600
      );
      return json({
        success: true,
        token: staffToken,
        partner: {
          id: s.partner_id,
          email: s.email,
          companyName: s.company_name,
          partnerType: s.partner_type,
          settlementRateBps: s.rate_bps,
          staffId: s.id,
          staffRole: s.role,
          staffName: s.full_name,
        },
      });
    }

    const v = await verifyPasswordDetailed(pass, p.password_hash, resolvePbkdf2Iterations(env));
    if (!v.ok) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "파트너 이메일 또는 비밀번호가 일치하지 않습니다.");
    }

    // C1: PENDING owners log in to complete onboarding (profile + docs).
    // Business endpoints stay ACTIVE-only via requirePartner.
    const profileStatus = String(p.profile_status || "").toUpperCase();
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
        profileStatus: p.profile_status,
      },
    });
  }

  if (path === "/api/v1/partner/forgot-password" && method === "POST") {
    await rateLimit(request, env, "partner_forgot", 5, 3600);
    const b = await readJson(request);
    const email = str(b.email, 254).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "INVALID_EMAIL", "유효한 이메일 주소를 입력해주세요.");
    // Owner accounts take precedence: the OWNER staff row shares the owner email.
    const owner = await db.prepare("SELECT id FROM partners WHERE email = ?").bind(email).first<{ id: string }>();
    const staff = owner ? null : await db.prepare("SELECT partner_id FROM partner_staff WHERE email = ?").bind(email).first<{ partner_id: string }>();
    const partnerId = owner?.id || staff?.partner_id || null;
    if (partnerId) {
      const token = randomToken(32);
      const expires = Math.floor(Date.now() / 1000) + 1800;
      const site = (env.PARTNER_SITE_URL || "https://ota-partner.dnjstjqppk.workers.dev").replace(/\/+$/, "");
      await db.batch([
        db.prepare("INSERT INTO password_reset_tokens (token, token_hash, user_id, partner_id, email, expires_at, used) VALUES (?, ?, '', ?, ?, ?, 0)")
          .bind(newId("rst"), await sha256Hex(token), partnerId, email, expires),
        db.prepare("INSERT INTO notification_outbox (id, channel, recipient, template, payload_json, status) VALUES (?, 'EMAIL', ?, 'PASSWORD_RESET', ?, 'PENDING')")
          .bind(newId("ntf"), email, JSON.stringify({ link: `${site}/reset-password?token=${token}` })),
      ]);
    }
    if (!isEmailConfigured(env)) {
      return json({ success: true, message: "요청을 접수했어요. 다만 지금은 메일 발송 서비스가 준비 중이라 재설정 메일이 도착하지 않아요. 고객센터로 문의해 주세요.", emailDelivery: "NOT_CONFIGURED" });
    }
    return json({ success: true, message: "비밀번호 재설정 링크를 이메일로 보냈어요. 30분 안에 확인해주세요.", emailDelivery: "QUEUED" });
  }

  if (path === "/api/v1/partner/reset-password" && method === "POST") {
    await rateLimit(request, env, "partner_reset", 10, 3600);
    const b = await readJson(request);
    const token = str(b.token, 128);
    const pw = String(b.newPassword || b.password || "");
    validatePasswordPolicy(pw);
    const now = Math.floor(Date.now() / 1000);
    const rec = await env.DB.prepare("SELECT token, email, partner_id FROM password_reset_tokens WHERE token_hash = ? AND used = 0 AND expires_at > ? AND partner_id IS NOT NULL")
      .bind(await sha256Hex(token), now).first<{ token: string; email: string; partner_id: string }>();
    if (!rec) throw new HttpError(400, "INVALID_RESET_TOKEN", "만료되었거나 이미 사용된 링크입니다.");
    const stmts: any[] = [env.DB.prepare("UPDATE password_reset_tokens SET used = 1 WHERE token = ? AND used = 0").bind(rec.token)];
    const owner = await env.DB.prepare("SELECT id FROM partners WHERE email = ?").bind(rec.email).first<{ id: string }>();
    if (owner) {
      stmts.push(env.DB.prepare("UPDATE partners SET password_hash = ? WHERE id = ?").bind(await hashPassword(pw, resolvePbkdf2Iterations(env)), owner.id));
    } else {
      stmts.push(env.DB.prepare("UPDATE partner_staff SET password_hash = ? WHERE email = ?").bind(await hashPassword(pw, resolvePbkdf2Iterations(env)), rec.email));
    }
    const done = await env.DB.batch(stmts);
    // Same single-use guard as the user flow: a raced twin finds used = 1 and fails here.
    if (!done[0].meta.changes) throw new HttpError(400, "INVALID_RESET_TOKEN", "만료되었거나 이미 사용된 링크입니다.");
    await resetSubjectSessions(env, rec.partner_id);
    return json({ success: true, message: "비밀번호를 변경했어요. 새 비밀번호로 로그인해주세요." });
  }

  // -------------------------------------------------------------------------
  // Authenticated Partner Area
  // -------------------------------------------------------------------------
  // C1: profile completion stays open during PENDING_APPROVAL; everything else
  // needs an ACTIVE profile.
  const onboarding = path === "/api/v1/partner/profile" && (method === "GET" || method === "PATCH");
  const partner = onboarding ? await requirePartnerOnboarding(request, env) : await requirePartner(request, env);
  const pId = partner.partnerId;
  // Role split (2026-11-09 audit [M]): the owner has no staff row; MANAGER and
  // STAFF come from partner_staff. Money infrastructure (bank details, staff
  // management) is OWNER-only; order decisions need MANAGER or above.
  const staffRole = partner.staffId ? String(partner.staffRole || "STAFF").toUpperCase() : "OWNER";
  const isOwner = staffRole === "OWNER";
  const canDecideOrders = isOwner || staffRole === "MANAGER";
  const needOwner = () => { if (!isOwner) throw new HttpError(403, "OWNER_ONLY", "대표 계정만 수행할 수 있습니다."); };

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
      `SELECT id, booking_number, domain_type, title, status, total_minor, currency, customer_name, service_start, service_end, created_at
       FROM bookings
       WHERE partner_id = ?
       ORDER BY created_at DESC LIMIT 10`
    ).bind(pId).all<any>();

    const profile = await db.prepare("SELECT * FROM partner_profiles WHERE partner_id = ?").bind(pId).first<any>();

    // Real month-to-date gross from this partner's own bookings (dead bookings excluded).
    const monthStart = new Date().toISOString().slice(0, 7) + "-01";
    const gross = await db.prepare(
      `SELECT COALESCE(SUM(total_minor), 0) AS g FROM bookings
       WHERE partner_id = ? AND created_at >= ? AND status NOT IN ('EXPIRED', 'CANCELLED', 'REFUNDED', 'FAILED')`,
    ).bind(pId, monthStart).first<{ g: number }>();
    const grossKrw = Number(gross?.g || 0);
    const rateBps = profile?.settlement_rate_bps ?? 1000;
    const statsObj = {
      activeProductsCount: totalProducts,
      monthlyGrossKrw: grossKrw,
      monthlyNetKrw: Math.round((grossKrw * (10000 - rateBps)) / 10000),
      pendingBookingsCount: orders.results?.filter((o: any) => o.status === 'SUPPLIER_BOOKING_PENDING' || o.status === 'AWAITING_PAYMENT').length || 0,
      commissionRatePercent: rateBps / 100,
    };

    const recent = (orders.results || []).map((r: any) => {
      const name = r.customer_name || "고객";
      const maskedName = name.length > 2 ? `${name[0]}*${name.slice(2)}` : `${name[0]}*`;
      const { customer_name: _drop, ...rest } = r;
      return { ...rest, customerNameMasked: maskedName };
    });

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
      recentOrders: recent,
    });
  }

  // 4. Partner Profile Management
  if (path === "/api/v1/partner/profile" && method === "GET") {
    // Explicit allowlist: password_hash and legacy api_key must never reach the client (2026-11-09 audit [M]).
    const p = await db.prepare("SELECT id, email, company_name, partner_type, business_number, contact_phone, settlement_rate, webhook_url, is_active, created_at FROM partners WHERE id = ?").bind(pId).first<any>();
    const pr = await db.prepare("SELECT partner_id, status, representative_name, bank_name, bank_account_number, bank_account_holder, tax_invoice_email, business_cert_url, bank_cert_url, business_verified_at, business_verify_method, settlement_rate_bps, approved_by, approved_at, rejection_reason, created_at, updated_at FROM partner_profiles WHERE partner_id = ?").bind(pId).first<any>();
    return json({ success: true, partner: { ...p, profile: pr } });
  }

  if (path === "/api/v1/partner/profile" && method === "PATCH") {
    const b = await readJson(request);
    if (b.bankName !== undefined || b.bankAccountNumber !== undefined || b.bankAccountHolder !== undefined || b.taxInvoiceEmail !== undefined) needOwner();
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
    const hotels = await db.prepare("SELECT id, name_ko AS title, 'HOTEL' AS domain_type, city, base_price_krw, is_active FROM hotels WHERE partner_id = ? LIMIT 100").bind(pId).all();
    const cars = await db.prepare("SELECT id, vehicle_model AS title, 'CAR' AS domain_type, pickup_location AS city, daily_price_krw AS base_price_krw, is_active FROM cars WHERE partner_id = ? LIMIT 100").bind(pId).all();
    const activities = await db.prepare("SELECT id, title, 'ACTIVITY' AS domain_type, city, price_krw AS base_price_krw, is_active FROM activities WHERE partner_id = ? LIMIT 100").bind(pId).all();
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
      // Rooms are required for bookability (loadProduct throws ROOM_REQUIRED
      // without them), so creation accepts them and PATCH can add them later.
      const rooms = parseRooms(b.rooms);
      await db.prepare(
        "INSERT INTO hotels (id, partner_id, name_ko, name_en, city, country, address, base_price_krw, rooms_json) VALUES (?, ?, ?, ?, ?, '대한민국', '상세 주소', ?, ?)"
      ).bind(id, pId, title, title, city, price, JSON.stringify(rooms)).run();
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

  // 5b. Update own product (title/price/city/sale status). No hard delete:
  // bookings reference item_id, so withdrawal is is_active = 0.
  const prodMatch = path.match(/^\/api\/v1\/partner\/products\/([A-Za-z0-9_-]+)$/);
  if (prodMatch && method === "PATCH") {
    const b = await readJson(request);
    const title = b.title !== undefined ? str(b.title, 200) : null;
    const city = b.city !== undefined ? str(b.city, 100) : null;
    const price = b.price !== undefined ? Number(b.price) : null;
    const isActive = b.isActive !== undefined ? (b.isActive ? 1 : 0) : null;
    const rooms = b.rooms !== undefined ? parseRooms(b.rooms) : null;
    if (title !== null && !title) throw new HttpError(400, "TITLE_REQUIRED", "상품명을 입력해주세요.");
    if (price !== null && (!Number.isInteger(price) || price < 0)) throw new HttpError(400, "INVALID_PRICE", "요금은 0 이상의 정수(원)여야 합니다.");
    if (title === null && city === null && price === null && isActive === null && rooms === null && b.imageIds === undefined) {
      throw new HttpError(400, "NOTHING_TO_UPDATE", "수정할 항목이 없습니다.");
    }
    const pid = prodMatch[1];
    const tables = [
      { t: "hotels", titleCol: "name_ko", priceCol: "base_price_krw", cityCol: "city" },
      { t: "cars", titleCol: "vehicle_model", priceCol: "daily_price_krw", cityCol: "pickup_location" },
      { t: "activities", titleCol: "title", priceCol: "price_krw", cityCol: "city" },
    ] as const;
    for (const cfg of tables) {
      const own = await db.prepare(`SELECT id FROM ${cfg.t} WHERE id = ? AND partner_id = ?`).bind(pid, pId).first();
      if (!own) continue;
      if (rooms !== null && cfg.t !== "hotels") throw new HttpError(400, "ROOMS_HOTEL_ONLY", "객실 정보는 호텔 상품에만 설정할 수 있습니다.");
      await db.prepare(
        `UPDATE ${cfg.t} SET ${cfg.titleCol} = COALESCE(?, ${cfg.titleCol}), ${cfg.cityCol} = COALESCE(?, ${cfg.cityCol}), ${cfg.priceCol} = COALESCE(?, ${cfg.priceCol}), is_active = COALESCE(?, is_active) WHERE id = ?`
      ).bind(title, city, price, isActive, pid).run();
      if (rooms !== null && cfg.t === "hotels") {
        await db.prepare("UPDATE hotels SET rooms_json = ? WHERE id = ?").bind(JSON.stringify(rooms), pid).run();
      }
      // C1: attach uploaded product images (ownership-verified) to the catalog row.
      if (b.imageIds !== undefined) {
        const ids = Array.isArray(b.imageIds) ? b.imageIds : [];
        if (ids.length > 10) throw new HttpError(400, "TOO_MANY_IMAGES", "상품 이미지는 최대 10장까지 등록할 수 있습니다.");
        const urls: string[] = [];
        for (const raw of ids) {
          const u = await db.prepare("SELECT id, owner_type, owner_id, purpose FROM uploads WHERE id = ?").bind(str(raw, 64)).first<any>();
          if (!u || u.purpose !== "PRODUCT_IMAGE" || u.owner_type !== "PARTNER" || u.owner_id !== pId) {
            throw new HttpError(400, "INVALID_IMAGE", "본인이 업로드한 상품 이미지만 연결할 수 있습니다.");
          }
          urls.push(`/api/v1/uploads/${u.id}/file`);
        }
        if (cfg.t === "hotels") {
          await db.prepare("UPDATE hotels SET images_json = ?, thumbnail_url = ? WHERE id = ?").bind(JSON.stringify(urls), urls[0] || null, pid).run();
        } else if (cfg.t === "cars") {
          await db.prepare("UPDATE cars SET image_url = ? WHERE id = ?").bind(urls[0] || null, pid).run();
        } else {
          await db.prepare("UPDATE activities SET thumbnail_url = ? WHERE id = ?").bind(urls[0] || null, pid).run();
        }
      }
      return json({ success: true, id: pid });
    }
    throw new HttpError(404, "PRODUCT_NOT_FOUND", "본인의 상품에 대해서만 수정할 수 있습니다.");
  }

  // 6. Partner Inventory & Pricing Calendar
  if (path === "/api/v1/partner/inventory" && method === "GET") {
    const itemId = str(url.searchParams.get("itemId"), 100);
    const month = str(url.searchParams.get("month") || new Date().toISOString().slice(0, 7), 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "INVALID_MONTH", "월 형식이 올바르지 않습니다 (YYYY-MM).");
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || Number.isNaN(new Date(`${serviceDate}T00:00:00Z`).getTime())) {
      throw new HttpError(400, "INVALID_DATE", "날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).");
    }
    if (!Number.isInteger(allocatedUnits) || allocatedUnits < 0 || allocatedUnits > 100000) {
      throw new HttpError(400, "INVALID_ALLOCATED_UNITS", "배정 수량은 0~100000 사이의 정수여야 합니다.");
    }
    if (priceOverride !== null && (!Number.isInteger(priceOverride) || priceOverride < 0)) {
      throw new HttpError(400, "INVALID_PRICE", "요금은 0 이상의 정수(원)여야 합니다.");
    }
    if (!["HOTEL", "CAR", "ACTIVITY", "TRANSFER", "FLIGHT", "TRAIN"].includes(domain)) {
      throw new HttpError(400, "INVALID_DOMAIN", "지원하지 않는 상품 도메인입니다.");
    }
    const owned = await db.prepare("SELECT id FROM hotels WHERE id = ? AND partner_id = ?").bind(itemId, pId).first()
      || await db.prepare("SELECT id FROM cars WHERE id = ? AND partner_id = ?").bind(itemId, pId).first()
      || await db.prepare("SELECT id FROM activities WHERE id = ? AND partner_id = ?").bind(itemId, pId).first();
    if (!owned) throw new HttpError(404, "PRODUCT_NOT_FOUND", "본인의 상품에 대해서만 재고를 관리할 수 있습니다.");

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
    const pg = pageParams(url);
    const q = str(url.searchParams.get("q"), 80);
    const statuses = str(url.searchParams.get("status"), 400).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      .filter((s) => (BOOKING_STATUSES as readonly string[]).includes(s)).slice(0, 12);
    let where = "partner_id = ?";
    const args: unknown[] = [pId];
    if (statuses.length) {
      where += ` AND status IN (${statuses.map(() => "?").join(",")})`;
      args.push(...statuses);
    }
    if (q) {
      const like = `%${likeEscape(q)}%`;
      where += " AND (booking_number LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\')";
      args.push(like, like);
    }
    const total = ((await db.prepare(`SELECT COUNT(*) AS total FROM bookings WHERE ${where}`).bind(...args).first<{ total: number }>())?.total || 0) as number;
    const rows = await db.prepare(
      `SELECT id, booking_number, domain_type, title, status, total_minor, currency, customer_name, service_start, service_end, created_at
       FROM bookings
       WHERE ${where}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...args, pg.pageSize, pg.offset).all<any>();

    // Mask customer name for privacy compliance (김** 등); never expose the raw name.
    const masked = (rows.results || []).map((r: any) => {
      const name = r.customer_name || "고객";
      const maskedName = name.length > 2 ? `${name[0]}*${name.slice(2)}` : `${name[0]}*`;
      const { customer_name: _drop, ...rest } = r;
      return { ...rest, customerNameMasked: maskedName };
    });

    return json({ success: true, orders: masked, ...pageMeta(total, pg.page, pg.pageSize) });
  }

  // 7b. Own order detail: booking + payments + refunds + status history.
  // Customer PII stays masked (name) or excluded (email/phone/travelers).
  const orderMatch = path.match(/^\/api\/v1\/partner\/orders\/([A-Za-z0-9_-]+)$/);
  if (orderMatch && method === "GET") {
    const b = await db.prepare(
      `SELECT id, booking_number, domain_type, item_id, title, status, status_reason, total_minor, paid_minor, refunded_minor,
              currency, payment_status, supplier_status, supplier_reference, customer_name, service_start, service_end, created_at
       FROM bookings WHERE id = ? AND partner_id = ?`
    ).bind(orderMatch[1], pId).first<any>();
    if (!b) throw new HttpError(404, "ORDER_NOT_FOUND", "주문을 찾을 수 없습니다.");
    const name = b.customer_name || "고객";
    const { customer_name: _drop, ...rest } = b;
    const booking = { ...rest, customerNameMasked: name.length > 2 ? `${name[0]}*${name.slice(2)}` : `${name[0]}*` };
    const payments = await db.prepare(
      "SELECT id, provider, mode, amount_minor, currency, status, refunded_minor, method, approved_at, created_at FROM payments WHERE booking_id = ? ORDER BY created_at"
    ).bind(b.id).all();
    const refunds = await db.prepare(
      "SELECT id, amount_minor, currency, reason, status, attempts, last_error, created_at FROM refunds WHERE booking_id = ? ORDER BY created_at"
    ).bind(b.id).all();
    const history = await db.prepare(
      "SELECT from_status, to_status, actor_type, reason, created_at FROM booking_status_history WHERE booking_id = ? ORDER BY created_at"
    ).bind(b.id).all();
    return json({ success: true, booking, payments: payments.results || [], refunds: refunds.results || [], history: history.results || [] });
  }

  let m = path.match(/^\/api\/v1\/partner\/orders\/([A-Za-z0-9_-]+)\/(confirm|reject)$/);
  if (m && method === "POST") {
    if (!canDecideOrders) throw new HttpError(403, "MANAGER_ONLY", "주문 확정·거절은 매니저 이상만 수행할 수 있습니다.");
    const orderId = m[1];
    const action = m[2];
    // Scope to the caller's own bookings: another partner's order is indistinguishable from a missing one.
    const owned = await db.prepare("SELECT id FROM bookings WHERE id = ? AND partner_id = ?").bind(orderId, pId).first<{ id: string }>();
    if (!owned) throw new HttpError(404, "ORDER_NOT_FOUND", "주문 정보를 찾을 수 없습니다.");
    // Same state-machine path as the operator console (transitions, ledger, refunds, vouchers) —
    // never a raw status write, which would corrupt money state.
    const body = await readJson(request).catch(() => ({}));
    const after = await S.adminSupplierDecision(env, { id: pId, email: partner.email, role: "PARTNER" }, orderId, {
      decision: action === "confirm" ? "CONFIRM" : "REJECT",
      supplierReference: str(body.supplierReference, 80),
      note: str(body.note, 300) || null,
    });
    return json({ success: true, bookingId: orderId, status: (after as any).status });
  }

  // 8. Partner Settlements
  if (path === "/api/v1/partner/settlements" && method === "GET") {
    const batches = await db.prepare(
      "SELECT * FROM partner_settlement_batches WHERE partner_id = ? ORDER BY period_start DESC LIMIT 24"
    ).bind(pId).all();

    // Real lifetime totals from this partner's own bookings (dead bookings excluded).
    const profile = await db.prepare("SELECT settlement_rate_bps, bank_name, bank_account_number FROM partner_profiles WHERE partner_id = ?").bind(pId).first<any>();
    const rateBps = profile?.settlement_rate_bps ?? 1000;
    const totals = await db.prepare(
      `SELECT COALESCE(SUM(total_minor), 0) AS g FROM bookings
       WHERE partner_id = ? AND status NOT IN ('EXPIRED', 'CANCELLED', 'REFUNDED', 'FAILED')`,
    ).bind(pId).first<{ g: number }>();
    const grossKrw = Number(totals?.g || 0);
    const commissionKrw = Math.round((grossKrw * rateBps) / 10000);
    // Payouts run on the 20th of each month for the prior month's sales.
    const now = new Date();
    const payout = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 20));
    const acct = String(profile?.bank_account_number || "");
    const maskedAcct = acct.length > 4 ? `${"*".repeat(Math.max(0, acct.length - 4))}${acct.slice(-4)}` : (acct ? "****" : "");
    const bank = [profile?.bank_name, maskedAcct].filter(Boolean).join(" ") || null;

    return json({
      success: true,
      batches: batches.results || [],
      summary: {
        totalGrossKrw: grossKrw,
        totalCommissionKrw: commissionKrw,
        totalNetPayoutKrw: grossKrw - commissionKrw,
        nextPayoutDate: payout.toISOString().slice(0, 10),
        payoutBank: bank,
      },
    });
  }

  // 9. Partner Staff Accounts
  if (path === "/api/v1/partner/staff" && method === "GET") {
    const rows = await db.prepare("SELECT id, email, full_name, role, is_active, created_at FROM partner_staff WHERE partner_id = ?").bind(pId).all();
    return json({ success: true, staff: rows.results || [] });
  }

  if (path === "/api/v1/partner/staff" && method === "POST") {
    needOwner();
    const b = await readJson(request);
    const email = str(b.email, 254).toLowerCase();
    const name = str(b.fullName, 100);
    const role = str(b.role || "STAFF", 20).toUpperCase();
    const pass = String(b.password || "");

    if (!email || !name) throw new HttpError(400, "FIELDS_REQUIRED", "이메일과 이름을 입력해주세요.");
    if (!["MANAGER", "STAFF"].includes(role)) throw new HttpError(400, "INVALID_ROLE", "직원 역할은 MANAGER 또는 STAFF여야 합니다.");
    validatePasswordPolicy(pass);
    const dup = await db.prepare("SELECT id FROM partner_staff WHERE partner_id = ? AND email = ?").bind(pId, email).first();
    if (dup) throw new HttpError(409, "STAFF_EXISTS", "이미 등록된 직원 이메일입니다.");
    const passHash = await hashPassword(pass, resolvePbkdf2Iterations(env));

    const id = newId("stf");
    await db.prepare(
      "INSERT INTO partner_staff (id, partner_id, email, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)"
    ).bind(id, pId, email, passHash, name, role).run();

    return json({ success: true, id }, 201);
  }

  // 9b. Update staff role / active flag. OWNER rows are immutable (lockout guard).
  const staffMatch = path.match(/^\/api\/v1\/partner\/staff\/([A-Za-z0-9_-]+)$/);
  if (staffMatch && method === "PATCH") {
    needOwner();
    const b = await readJson(request);
    const row = await db.prepare("SELECT id, role FROM partner_staff WHERE id = ? AND partner_id = ?").bind(staffMatch[1], pId).first<any>();
    if (!row) throw new HttpError(404, "STAFF_NOT_FOUND", "직원을 찾을 수 없습니다.");
    if (row.role === "OWNER") throw new HttpError(403, "OWNER_PROTECTED", "대표 계정은 변경할 수 없습니다.");
    const role = b.role !== undefined ? str(b.role, 20).toUpperCase() : null;
    const isActive = b.isActive !== undefined ? (b.isActive ? 1 : 0) : null;
    if (role !== null && !["MANAGER", "STAFF"].includes(role)) throw new HttpError(400, "INVALID_ROLE", "직원 역할은 MANAGER 또는 STAFF여야 합니다.");
    if (role === null && isActive === null) throw new HttpError(400, "NOTHING_TO_UPDATE", "수정할 항목이 없습니다.");
    await db.prepare("UPDATE partner_staff SET role = COALESCE(?, role), is_active = COALESCE(?, is_active) WHERE id = ?").bind(role, isActive, staffMatch[1]).run();
    return json({ success: true, id: staffMatch[1] });
  }

  // 10. Partner API Keys (server-to-server auth for PMS/ERP integrations)
  if (path === "/api/v1/partner/api-keys" && method === "GET") {
    const rows = await db.prepare(
      "SELECT id, name, key_prefix, is_active, last_used_at, created_at, revoked_at FROM partner_api_keys WHERE partner_id = ? ORDER BY created_at DESC LIMIT 50",
    ).bind(pId).all<any>();
    return json({
      success: true,
      keys: (rows.results || []).map((k: any) => ({
        id: k.id, name: k.name, keyPrefix: k.key_prefix, isActive: k.is_active === 1,
        lastUsedAt: k.last_used_at, createdAt: k.created_at, revokedAt: k.revoked_at,
      })),
    });
  }

  if (path === "/api/v1/partner/api-keys" && method === "POST") {
    const b = await readJson(request);
    const name = str(b.name, 80) || "Default";
    const count = await db.prepare("SELECT COUNT(*) AS c FROM partner_api_keys WHERE partner_id = ? AND is_active = 1").bind(pId).first<{ c: number }>();
    if (Number(count?.c || 0) >= 10) throw new HttpError(400, "TOO_MANY_KEYS", "활성 API 키는 최대 10개까지 발급할 수 있습니다. 사용하지 않는 키를 폐기해주세요.");
    const apiKey = `gft_live_${randomToken(16)}`;
    const id = newId("pak");
    await db.prepare(
      "INSERT INTO partner_api_keys (id, partner_id, name, key_prefix, key_hash) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, pId, name, `${apiKey.slice(0, 12)}...${apiKey.slice(-4)}`, await sha256Hex(apiKey)).run();
    // The plaintext key is returned exactly once; it can never be read back.
    return json({ success: true, id, name, apiKey, keyPrefix: `${apiKey.slice(0, 12)}...${apiKey.slice(-4)}` }, 201);
  }

  m = path.match(/^\/api\/v1\/partner\/api-keys\/([A-Za-z0-9_-]{4,64})$/);
  if (m && method === "DELETE") {
    const r = await db.prepare("UPDATE partner_api_keys SET is_active = 0, revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND partner_id = ? AND is_active = 1")
      .bind(m[1], pId).run();
    if (!r.meta.changes) throw new HttpError(404, "KEY_NOT_FOUND", "API 키를 찾을 수 없습니다.");
    return json({ success: true, id: m[1], revoked: true });
  }

  // 11. Partner order-event webhook URL (booking.created / booking.cancelled POST here as JSON)
  if (path === "/api/v1/partner/webhook" && method === "GET") {
    const pr = await db.prepare("SELECT webhook_url, webhook_secret FROM partner_profiles WHERE partner_id = ?").bind(pId).first<{ webhook_url: string | null; webhook_secret: string | null }>();
    return json({ success: true, webhookUrl: pr?.webhook_url || null, secret: pr?.webhook_secret || null });
  }

  if (path === "/api/v1/partner/webhook" && (method === "PUT" || method === "PATCH")) {
    const b = await readJson(request);
    const webhookUrl = str(b.webhookUrl, 500);
    if (webhookUrl) {
      let u: URL;
      try {
        u = new URL(webhookUrl);
      } catch {
        throw new HttpError(400, "INVALID_WEBHOOK_URL", "웹훅 URL 형식이 올바르지 않습니다.");
      }
      if (u.protocol !== "https:") throw new HttpError(400, "WEBHOOK_HTTPS_REQUIRED", "웹훅 URL은 https:// 로 시작해야 합니다.");
    }
    await db.prepare("UPDATE partner_profiles SET webhook_url = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE partner_id = ?")
      .bind(webhookUrl || null, pId).run();
    return json({ success: true, webhookUrl: webhookUrl || null });
  }

  if (path === "/api/v1/partner/webhook/rotate" && method === "POST") {
    await rateLimit(request, env, "webhook_rotate", 10, 3600);
    const secret = `whsec_${randomToken(24)}`;
    await db.prepare("UPDATE partner_profiles SET webhook_secret = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE partner_id = ?").bind(secret, pId).run();
    return json({ success: true, secret });
  }

  if (path === "/api/v1/partner/webhook/deliveries" && method === "GET") {
    const rows = await db.prepare(
      "SELECT id, event_type, booking_id, status, attempts, last_status_code, last_error, created_at FROM partner_webhook_deliveries WHERE partner_id = ? ORDER BY created_at DESC LIMIT 50"
    ).bind(pId).all();
    return json({ success: true, deliveries: rows.results || [] });
  }

  if (path === "/api/v1/partner/webhook/test" && method === "POST") {
    await rateLimit(request, env, "webhook_test", 10, 3600);
    const pr = await db.prepare("SELECT webhook_url FROM partner_profiles WHERE partner_id = ?").bind(pId).first<{ webhook_url: string | null }>();
    if (!pr?.webhook_url) throw new HttpError(400, "WEBHOOK_URL_REQUIRED", "먼저 웹훅 URL을 저장해주세요.");
    const id = newId("whd");
    await db.prepare(
      "INSERT INTO partner_webhook_deliveries (id, partner_id, webhook_url, event_type, booking_id, payload_json) VALUES (?, ?, ?, 'test', NULL, ?)"
    ).bind(id, pId, pr.webhook_url, JSON.stringify({ message: "연결 테스트 이벤트입니다.", occurred_at: new Date().toISOString() })).run();
    return json({ success: true, id }, 201);
  }

  // 12. Partner OpenAPI document (what the extranet's "API docs" link points to)
  if (path === "/api/v1/partner/openapi.json" && method === "GET") {
    return json(PARTNER_OPENAPI, 200, { "Cache-Control": "public, max-age=3600" });
  }

  throw new HttpError(404, "NOT_FOUND", "요청하신 파트너 API를 찾을 수 없습니다.");
}

const PARTNER_OPENAPI = {
  openapi: "3.0.3",
  info: { title: "getfortrip Partner Extranet API", version: "1.0.0", description: "Server-to-server API for partner PMS/ERP integrations. Authenticate with `Authorization: Bearer gft_live_...` (issue keys in the extranet under API 연동) or a partner JWT." },
  servers: [{ url: "/api/v1", description: "Same origin as the extranet (or https://ota-hub.dnjstjqppk.workers.dev/api/v1)" }],
  paths: {
    "/partner/dashboard": { get: { summary: "Sales metrics and recent orders", tags: ["Partner"] } },
    "/partner/profile": { get: { summary: "Read company/bank profile", tags: ["Partner"] }, patch: { summary: "Update contact and bank details", tags: ["Partner"] } },
    "/partner/products": {
      get: { summary: "List own products (hotel/car/activity)", tags: ["Catalog"] },
      post: { summary: "Register a product", tags: ["Catalog"] },
    },
    "/partner/inventory": {
      get: { summary: "Read inventory calendar (?itemId=&month=YYYY-MM)", tags: ["Inventory"] },
      put: { summary: "Upsert a date cell (allocatedUnits, priceOverrideMinor, isClosed)", tags: ["Inventory"] },
    },
    "/partner/orders": { get: { summary: "List own orders (customer names masked)", tags: ["Orders"] } },
    "/partner/orders/{id}/confirm": { post: { summary: "Confirm an order", tags: ["Orders"] } },
    "/partner/orders/{id}/reject": { post: { summary: "Reject an order", tags: ["Orders"] } },
    "/partner/settlements": { get: { summary: "Settlement batches and lifetime totals", tags: ["Settlements"] } },
    "/partner/marketplace/settlements": { get: { summary: "Marketplace (3P) settlements", tags: ["Settlements"] } },
    "/partner/marketplace/products": { post: { summary: "Register a 3P marketplace product", tags: ["Catalog"] } },
    "/partner/staff": {
      get: { summary: "List staff accounts", tags: ["Staff"] },
      post: { summary: "Invite a staff account", tags: ["Staff"] },
    },
    "/partner/api-keys": {
      get: { summary: "List API keys (prefixes only)", tags: ["Integration"] },
      post: { summary: "Issue an API key (plaintext returned once)", tags: ["Integration"] },
    },
    "/partner/api-keys/{id}": { delete: { summary: "Revoke an API key", tags: ["Integration"] } },
    "/partner/webhook": {
      get: { summary: "Read order-event webhook URL", tags: ["Integration"] },
      put: { summary: "Save order-event webhook URL (https only)", tags: ["Integration"] },
    },
    "/partner/ingest/url": { post: { summary: "Ingest a product from a supplier URL", tags: ["Catalog"] } },
  },
};

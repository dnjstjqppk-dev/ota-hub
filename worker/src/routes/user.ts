import type { Env } from "../env.ts";
import { HttpError, json, readJson, str } from "../lib/http.ts";
import { rateLimit, requireUser } from "../lib/auth.ts";
import { decryptField, encryptField, maskName, maskPassport, newId } from "../lib/crypto.ts";

const NAME_EN = /^[A-Z][A-Z' -]{0,48}$/;

export async function handleUser(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  const db = env.DB;

  // ---------------- Wishlist ----------------
  if (path === "/api/v1/wishlist" && method === "GET") {
    const u = await requireUser(request, env);
    const rows = await db.prepare("SELECT id, domain_type, item_id, item_title, price_krw, thumbnail_url, created_at FROM wishlist WHERE user_id = ? ORDER BY created_at DESC").bind(u.id).all();
    return json({ success: true, wishlist: rows.results, count: rows.results.length });
  }
  if (path === "/api/v1/wishlist" && method === "POST") {
    const u = await requireUser(request, env);
    const b = await readJson(request);
    const itemId = str(b.itemId || b.item_id, 100);
    if (!itemId) throw new HttpError(400, "ITEM_REQUIRED", "상품 식별자가 필요합니다.");
    const id = newId("wsh");
    await db.prepare(
      `INSERT INTO wishlist (id, user_id, domain_type, item_id, item_title, price_krw, thumbnail_url) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, domain_type, item_id) DO UPDATE SET item_title = excluded.item_title, price_krw = excluded.price_krw, thumbnail_url = excluded.thumbnail_url`,
    ).bind(id, u.id, str(b.domainType || b.domain_type || "HOTEL", 20).toUpperCase(), itemId, str(b.itemTitle || b.title || "여행 상품", 200), Number(b.priceKrw || b.price_krw || 0) || 0, str(b.thumbnailUrl || b.thumbnail_url, 500)).run();
    return json({ success: true, id, itemId }, 201);
  }
  if (path.startsWith("/api/v1/wishlist/") && method === "DELETE") {
    const u = await requireUser(request, env);
    const t = decodeURIComponent(path.slice("/api/v1/wishlist/".length));
    await db.prepare("DELETE FROM wishlist WHERE user_id = ? AND (id = ? OR item_id = ?)").bind(u.id, t, t).run();
    return json({ success: true });
  }

  // ---------------- Price alerts (owner-scoped) ----------------
  if (path === "/api/v1/price-alerts" && method === "GET") {
    const u = await requireUser(request, env);
    const rows = await db.prepare("SELECT * FROM price_alerts WHERE user_id = ? ORDER BY created_at DESC").bind(u.id).all();
    return json({ success: true, alerts: rows.results });
  }
  if (path === "/api/v1/price-alerts" && method === "POST") {
    const u = await requireUser(request, env);
    await rateLimit(request, env, "price_alert", 30, 3600);
    const b = await readJson(request);
    const routeOrHotel = str(b.routeOrHotel || b.route_or_hotel, 200);
    const target = Number(b.targetPrice || b.target_price);
    if (!routeOrHotel || !Number.isFinite(target) || target <= 0) throw new HttpError(400, "INVALID_ALERT", "상품/구간명과 목표가를 입력해주세요.");
    const id = newId("pal");
    await db.prepare(
      "INSERT INTO price_alerts (id, user_id, email, domain_type, item_id, route_or_hotel, current_price_krw, target_price, currency, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'KRW', 1)",
    ).bind(id, u.id, u.email, str(b.domainType || "HOTEL", 20).toUpperCase(), str(b.itemId || "general", 100), routeOrHotel, Number(b.currentPriceKrw || 0) || 0, target).run();
    return json({ success: true, id, notice: "가격 알림 발송 기능(이메일)은 아직 연동되지 않았습니다." }, 201);
  }
  if (path.startsWith("/api/v1/price-alerts/") && method === "DELETE") {
    const u = await requireUser(request, env);
    await db.prepare("DELETE FROM price_alerts WHERE id = ? AND user_id = ?").bind(path.slice("/api/v1/price-alerts/".length), u.id).run();
    return json({ success: true });
  }

  // ---------------- Saved travelers (passport encrypted) ----------------
  if (path === "/api/v1/user/passengers" && method === "GET") {
    const u = await requireUser(request, env);
    const rows = await db.prepare("SELECT * FROM saved_travelers WHERE user_id = ? ORDER BY is_primary DESC, created_at ASC").bind(u.id).all<any>();
    const out = [];
    for (const r of rows.results || []) {
      let passport = "";
      if (r.passport_number) {
        if (String(r.passport_number).startsWith("v1:") && env.PII_ENC_KEY) {
          try {
            passport = maskPassport(await decryptField(r.passport_number, env.PII_ENC_KEY));
          } catch {
            passport = "***";
          }
        } else passport = maskPassport(String(r.passport_number));
      }
      out.push({ ...r, passport_number: passport, passport_masked: true });
    }
    return json({ success: true, passengers: out });
  }
  if (path === "/api/v1/user/passengers" && method === "POST") {
    const u = await requireUser(request, env);
    const b = await readJson(request);
    const nameKo = str(b.nameKo || b.name_ko, 40);
    const last = str(b.lastNameEn || b.last_name_en, 50).toUpperCase();
    const first = str(b.firstNameEn || b.first_name_en, 50).toUpperCase();
    if (!nameKo || !NAME_EN.test(last) || !NAME_EN.test(first)) throw new HttpError(400, "INVALID_TRAVELER", "한글 성명과 여권 영문 성/이름을 입력해주세요.");
    const passport = str(b.passportNumber || b.passport_number, 20).toUpperCase();
    if (passport && !/^[A-Z0-9]{6,12}$/.test(passport)) throw new HttpError(400, "INVALID_PASSPORT", "여권번호 형식이 올바르지 않습니다.");
    if (passport && !env.PII_ENC_KEY) throw new HttpError(503, "PII_KEY_MISSING", "여권 정보 암호화 키가 설정되지 않아 저장할 수 없습니다.");
    const enc = passport ? await encryptField(passport, env.PII_ENC_KEY!) : "";
    const id = newId("psg");
    await db.prepare(
      "INSERT INTO saved_travelers (id, user_id, name_ko, last_name_en, first_name_en, birth_date, gender, passport_number, passport_expiry, nationality, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
    ).bind(id, u.id, nameKo, last, first, str(b.birthDate || b.birth, 10), str(b.gender || "MALE", 10).toUpperCase(), enc, str(b.passportExpiry || b.passport_expiry, 10), str(b.nationality || "KOR", 3).toUpperCase()).run();
    return json({ success: true, id }, 201);
  }
  if (path.startsWith("/api/v1/user/passengers/") && method === "DELETE") {
    const u = await requireUser(request, env);
    await db.prepare("DELETE FROM saved_travelers WHERE id = ? AND user_id = ?").bind(path.slice("/api/v1/user/passengers/".length), u.id).run();
    return json({ success: true });
  }

  // ---------------- Coupons (one claim per user per code) ----------------
  if (path === "/api/v1/user/coupons" && method === "GET") {
    const u = await requireUser(request, env);
    const mine = await db.prepare("SELECT * FROM user_coupons WHERE user_id = ? AND is_used = 0").bind(u.id).all();
    const promos = await db.prepare("SELECT id, code, title, discount_type, discount_value, min_order_amount_krw, max_discount_krw, valid_until FROM promotions WHERE is_active = 1").all();
    return json({ success: true, coupons: mine.results, availablePromotions: promos.results });
  }
  if (path === "/api/v1/user/coupons/claim" && method === "POST") {
    const u = await requireUser(request, env);
    const b = await readJson(request);
    const code = str(b.code || b.couponCode, 40).toUpperCase();
    const p = await db.prepare("SELECT * FROM promotions WHERE code = ? AND is_active = 1").bind(code).first<any>();
    if (!p) throw new HttpError(404, "PROMO_NOT_FOUND", "존재하지 않거나 종료된 쿠폰입니다.");
    if (p.valid_until && p.valid_until < new Date().toISOString()) throw new HttpError(409, "PROMO_EXPIRED", "사용 기간이 만료된 쿠폰입니다.");
    const r = await db.prepare(
      `INSERT OR IGNORE INTO user_coupons (id, user_id, coupon_code, title, discount_type, discount_value, min_order_amount_krw, max_discount_krw, valid_until, is_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    ).bind(newId("ucp"), u.id, p.code, p.title, p.discount_type, p.discount_value, p.min_order_amount_krw, p.max_discount_krw, p.valid_until || "").run();
    if (!r.meta.changes) throw new HttpError(409, "ALREADY_CLAIMED", "이미 받은 쿠폰입니다.");
    return json({ success: true, coupon: { code: p.code, title: p.title } });
  }

  // ---------------- Reviews (verified only with a real fulfilled booking) ----------------
  if (path === "/api/v1/reviews" && method === "GET") {
    const targetId = str(url.searchParams.get("targetId") || url.searchParams.get("target_id"), 100);
    const domain = str(url.searchParams.get("domain") || "HOTEL", 20).toUpperCase();
    const rows = targetId
      ? await db.prepare("SELECT id, user_name, domain_type, target_id, rating, comment, verified_stay, created_at FROM reviews WHERE target_id = ? AND domain_type = ? ORDER BY verified_stay DESC, created_at DESC LIMIT 50").bind(targetId, domain).all<any>()
      : await db.prepare("SELECT id, user_name, domain_type, target_id, rating, comment, verified_stay, created_at FROM reviews ORDER BY created_at DESC LIMIT 50").all<any>();
    const summary = targetId
      ? await db.prepare("SELECT COUNT(*) AS count, ROUND(AVG(rating), 1) AS average, SUM(CASE WHEN verified_stay = 1 THEN 1 ELSE 0 END) AS verified FROM reviews WHERE target_id = ? AND domain_type = ?").bind(targetId, domain).first<any>()
      : null;
    // Reviewer names are public: show a masked name only.
    const reviews = (rows.results || []).map((r: any) => ({ ...r, user_name: maskName(r.user_name), verified_stay: r.verified_stay === 1 }));
    return json({
      success: true, reviews, count: reviews.length,
      summary: summary ? { count: Number(summary.count || 0), average: summary.average === null ? null : Number(summary.average), verifiedCount: Number(summary.verified || 0) } : null,
    });
  }
  if (path === "/api/v1/reviews" && method === "POST") {
    const u = await requireUser(request, env);
    await rateLimit(request, env, "review", 20, 3600);
    const b = await readJson(request);
    const targetId = str(b.targetId || b.target_id, 100);
    const domain = str(b.domainType || b.domain_type || "HOTEL", 20).toUpperCase();
    const rating = Number(b.rating);
    const comment = str(b.comment, 2000);
    if (!targetId || !comment || !Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, "INVALID_REVIEW", "상품, 1~5점 평점, 후기 내용을 입력해주세요.");
    const bookingId = str(b.bookingId || b.booking_id, 64);
    let verified = 0;
    if (bookingId) {
      // A booking may back exactly one review, and only the customer's own fulfilled booking of this product.
      const bk = await db.prepare("SELECT user_id, item_id, domain_type, status FROM bookings WHERE id = ?").bind(bookingId).first<any>();
      const eligible = bk && bk.user_id === u.id && bk.item_id === targetId && bk.domain_type === domain && ["VOUCHER_ISSUED", "TICKETED", "COMPLETED"].includes(bk.status);
      if (!eligible) throw new HttpError(400, "REVIEW_BOOKING_NOT_ELIGIBLE", "이용 완료된 본인 예약에 대해서만 인증 후기를 작성할 수 있습니다.");
      if (await db.prepare("SELECT id FROM reviews WHERE booking_id = ?").bind(bookingId).first()) {
        throw new HttpError(409, "ALREADY_REVIEWED", "이 예약에 대한 후기를 이미 작성했습니다.");
      }
      verified = 1;
    }
    const id = newId("rev");
    await db.prepare("INSERT INTO reviews (id, user_id, user_name, domain_type, target_id, booking_id, rating, comment, verified_stay) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, u.id, u.fullName || "여행자", domain, targetId, bookingId || null, rating, comment, verified).run();
    return json({ success: true, reviewId: id, verifiedStay: verified === 1 }, 201);
  }

  // ---------------- Moments ----------------
  if (path === "/api/v1/moments" && method === "GET") {
    const res = await db.prepare("SELECT id, user_name, user_avatar, city, title, content, photos_json, likes_count, is_featured, created_at FROM trip_moments WHERE is_blinded = 0 ORDER BY is_featured DESC, created_at DESC LIMIT 30").all();
    return json({ success: true, moments: res.results });
  }
  if (path === "/api/v1/moments" && method === "POST") {
    const u = await requireUser(request, env);
    await rateLimit(request, env, "moment", 10, 3600);
    const b = await readJson(request);
    const title = str(b.title, 120);
    const content = str(b.content, 5000);
    if (!title || !content) throw new HttpError(400, "INVALID_MOMENT", "제목과 내용을 입력해주세요.");
    const photos = Array.isArray(b.photos) ? b.photos.filter((p: unknown) => typeof p === "string" && /^https:\/\//.test(p)).slice(0, 10) : [];
    const id = newId("mmt");
    await db.prepare("INSERT INTO trip_moments (id, user_id, user_name, city, title, content, photos_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, u.id, u.fullName || "여행자", str(b.city || "서울", 40), title, content, JSON.stringify(photos)).run();
    return json({ success: true, id }, 201);
  }

  return null;
}

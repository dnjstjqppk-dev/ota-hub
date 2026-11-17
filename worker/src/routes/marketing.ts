/**
 * CR-05 marketing slots (hero/strip banners, popups, curated home picks) and
 * CR-04 operator insights (GMV, net revenue, DAU/MAU, funnel conversion).
 * Insight figures come only from recorded rows — payments, refunds, ledger,
 * analytics_events. Nothing is extrapolated or estimated.
 */
import type { Env } from "../env.ts";
import { HttpError, json, readJson, str } from "../lib/http.ts";
import { audit, rateLimit, requireAdmin } from "../lib/auth.ts";
import { newId } from "../lib/crypto.ts";

export const PLACEMENTS = ["HERO", "STRIP", "POPUP", "HOME_PICK"] as const;

/** Curated picks resolve against the live catalog; flights/trains are dated schedules, not pickable. */
const PICK_SOURCES: Record<string, { sql: string; path: string }> = {
  HOTEL: { sql: "SELECT id, name_ko AS title, city AS eyebrow, thumbnail_url AS image, base_price_krw AS price, is_active FROM hotels WHERE id = ?", path: "/hotels/detail/" },
  ACTIVITY: { sql: "SELECT id, title, city AS eyebrow, thumbnail_url AS image, price_krw AS price, is_active FROM activities WHERE id = ?", path: "/things-to-do/detail/" },
  CAR: { sql: "SELECT id, vehicle_model AS title, company_name AS eyebrow, image_url AS image, daily_price_krw AS price, is_active FROM cars WHERE id = ?", path: "/cars/detail/" },
  TRANSFER: { sql: "SELECT id, service_title AS title, airport_code AS eyebrow, image_url AS image, price_krw AS price, is_active FROM transfers WHERE id = ?", path: "/transfers/detail/" },
  PACKAGE: { sql: "SELECT id, title, destination_city AS eyebrow, thumbnail_url AS image, total_package_krw AS price, is_active FROM packages WHERE id = ?", path: "/packages/detail/" },
};

/** Internal paths or https only: a banner must never become a javascript:/data: vector. */
export function safeLink(v: unknown): string | null {
  const s = str(v, 500);
  if (!s) return null;
  if (/^\/(?!\/)[A-Za-z0-9\-._~/?#[\]@!$&'()*+,;=%]*$/.test(s)) return s;
  if (/^https:\/\/[^\s"'<>]+$/.test(s)) return s;
  throw new HttpError(400, "INVALID_LINK", "링크는 사이트 내부 경로(/로 시작) 또는 https 주소여야 합니다.");
}

/** Images: our own uploads or https. */
export function safeImage(v: unknown): string | null {
  const s = str(v, 500);
  if (!s) return null;
  if (/^\/api\/v1\/uploads\/[A-Za-z0-9_-]+\/file$/.test(s) || /^https:\/\/[^\s"'<>]+$/.test(s)) return s;
  throw new HttpError(400, "INVALID_IMAGE", "이미지는 업로드한 파일 또는 https 주소여야 합니다.");
}

function isoOrNull(v: unknown, code: string): string | null {
  const s = str(v, 40);
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new HttpError(400, code, "날짜·시간 형식이 올바르지 않습니다.");
  return new Date(t).toISOString();
}

async function validateSlot(env: Env, b: any, partial: boolean) {
  const out: Record<string, unknown> = {};
  if (!partial || b.placement !== undefined) {
    const p = str(b.placement, 20).toUpperCase();
    if (!(PLACEMENTS as readonly string[]).includes(p)) throw new HttpError(400, "INVALID_PLACEMENT", `노출 위치는 ${PLACEMENTS.join(" | ")} 중 하나여야 합니다.`);
    out.placement = p;
  }
  if (!partial || b.title !== undefined) {
    const t = str(b.title, 120);
    if (!t) throw new HttpError(400, "TITLE_REQUIRED", "제목을 입력해주세요.");
    out.title = t;
  }
  if (b.subtitle !== undefined) out.subtitle = str(b.subtitle, 200) || null;
  if (b.imageUrl !== undefined) out.image_url = safeImage(b.imageUrl);
  if (b.linkUrl !== undefined) out.link_url = safeLink(b.linkUrl);
  if (b.sortOrder !== undefined) {
    const n = Number(b.sortOrder);
    if (!Number.isInteger(n) || n < 0 || n > 10000) throw new HttpError(400, "INVALID_SORT", "노출 순서는 0–10000 정수여야 합니다.");
    out.sort_order = n;
  }
  if (b.startsAt !== undefined) out.starts_at = isoOrNull(b.startsAt, "INVALID_STARTS_AT");
  if (b.endsAt !== undefined) out.ends_at = isoOrNull(b.endsAt, "INVALID_ENDS_AT");
  if (b.isActive !== undefined) out.is_active = b.isActive === true || b.isActive === 1 ? 1 : 0;
  if (b.domainType !== undefined || b.itemId !== undefined) {
    const d = str(b.domainType, 20).toUpperCase();
    const id = str(b.itemId, 100);
    if (d || id) {
      const src = PICK_SOURCES[d];
      if (!src) throw new HttpError(400, "INVALID_DOMAIN", `기획전 상품 유형은 ${Object.keys(PICK_SOURCES).join(" | ")} 중 하나여야 합니다.`);
      if (!id || !(await env.DB.prepare(src.sql).bind(id).first())) throw new HttpError(400, "PRODUCT_NOT_FOUND", "연결할 상품을 찾을 수 없습니다.");
      out.domain_type = d;
      out.item_id = id;
    } else {
      out.domain_type = null;
      out.item_id = null;
    }
  }
  return out;
}

function assertSlotShape(row: { placement: string; domain_type?: unknown; image_url?: unknown; starts_at?: unknown; ends_at?: unknown }) {
  if (row.placement === "HOME_PICK" && !row.domain_type) throw new HttpError(400, "PRODUCT_REQUIRED", "기획전(HOME_PICK)은 연결할 상품이 필요합니다.");
  if (row.placement === "HERO" && !row.image_url) throw new HttpError(400, "IMAGE_REQUIRED", "메인 배너(HERO)는 이미지가 필요합니다.");
  if (row.starts_at && row.ends_at && String(row.starts_at) >= String(row.ends_at)) throw new HttpError(400, "INVALID_WINDOW", "종료 시각은 시작 시각보다 뒤여야 합니다.");
}

const DAY_MS = 86_400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export async function handleMarketing(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  const db = env.DB;

  // ---------------- public: live slots ----------------
  if (path === "/api/v1/marketing/slots" && method === "GET") {
    await rateLimit(request, env, "catalog_read", 600, 60);
    const placement = str(url.searchParams.get("placement"), 20).toUpperCase();
    if (placement && !(PLACEMENTS as readonly string[]).includes(placement)) throw new HttpError(400, "INVALID_PLACEMENT", "노출 위치가 올바르지 않습니다.");
    const nowIso = new Date().toISOString();
    const rows = await db.prepare(
      `SELECT id, placement, title, subtitle, image_url, link_url, domain_type, item_id, sort_order, ends_at FROM marketing_slots
       WHERE is_active = 1 AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at > ?) ${placement ? "AND placement = ?" : ""}
       ORDER BY placement, sort_order ASC, created_at DESC LIMIT 60`,
    ).bind(nowIso, nowIso, ...(placement ? [placement] : [])).all<any>();
    const slots = [];
    for (const r of rows.results || []) {
      if (r.placement === "HOME_PICK") {
        const src = PICK_SOURCES[r.domain_type];
        const p = src ? await db.prepare(src.sql).bind(r.item_id).first<any>() : null;
        // A pick whose product was removed or stopped selling silently drops out.
        if (!p || Number(p.is_active) !== 1) continue;
        slots.push({ id: r.id, placement: r.placement, title: r.title, subtitle: r.subtitle, imageUrl: r.image_url || p.image || null,
          linkUrl: `${src.path}${p.id}`, endsAt: r.ends_at, product: { domainType: r.domain_type, id: p.id, title: p.title, eyebrow: p.eyebrow, priceKrw: Number(p.price) || null } });
      } else {
        slots.push({ id: r.id, placement: r.placement, title: r.title, subtitle: r.subtitle, imageUrl: r.image_url, linkUrl: r.link_url, endsAt: r.ends_at, product: null });
      }
    }
    return json({ success: true, slots }, 200, { "Cache-Control": "public, max-age=60" });
  }

  if (!path.startsWith("/api/v1/admin/marketing/") && path !== "/api/v1/admin/insights") return null;
  const admin = await requireAdmin(request, env);

  // ---------------- admin: slot CRUD ----------------
  if (path === "/api/v1/admin/marketing/slots" && method === "GET") {
    const rows = await db.prepare("SELECT * FROM marketing_slots ORDER BY placement, sort_order ASC, created_at DESC LIMIT 500").all();
    return json({ success: true, slots: rows.results || [], placements: PLACEMENTS, pickDomains: Object.keys(PICK_SOURCES) });
  }
  if (path === "/api/v1/admin/marketing/slots" && method === "POST") {
    const v = await validateSlot(env, await readJson(request), false);
    assertSlotShape(v as any);
    const id = newId("mkt");
    await db.prepare(
      `INSERT INTO marketing_slots (id, placement, title, subtitle, image_url, link_url, domain_type, item_id, sort_order, starts_at, ends_at, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, v.placement, v.title, v.subtitle ?? null, v.image_url ?? null, v.link_url ?? null, v.domain_type ?? null, v.item_id ?? null,
      v.sort_order ?? 100, v.starts_at ?? null, v.ends_at ?? null, v.is_active ?? 1, admin.id).run();
    await audit(env, admin.id, "MARKETING_SLOT_CREATE", "MARKETING_SLOT", id, { placement: v.placement });
    return json({ success: true, id }, 201);
  }
  const sm = path.match(/^\/api\/v1\/admin\/marketing\/slots\/([A-Za-z0-9_-]+)$/);
  if (sm && method === "PATCH") {
    const cur = await db.prepare("SELECT * FROM marketing_slots WHERE id = ?").bind(sm[1]).first<any>();
    if (!cur) throw new HttpError(404, "SLOT_NOT_FOUND", "배너를 찾을 수 없습니다.");
    const v = await validateSlot(env, await readJson(request), true);
    assertSlotShape({ ...cur, ...v });
    const cols = Object.keys(v);
    if (!cols.length) return json({ success: true, id: cur.id, changed: [] });
    await db.prepare(`UPDATE marketing_slots SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
      .bind(...cols.map((c) => v[c]), cur.id).run();
    await audit(env, admin.id, "MARKETING_SLOT_UPDATE", "MARKETING_SLOT", cur.id, { changed: cols });
    return json({ success: true, id: cur.id, changed: cols });
  }
  if (sm && method === "DELETE") {
    const r = await db.prepare("DELETE FROM marketing_slots WHERE id = ?").bind(sm[1]).run();
    if (!r.meta.changes) throw new HttpError(404, "SLOT_NOT_FOUND", "배너를 찾을 수 없습니다.");
    await audit(env, admin.id, "MARKETING_SLOT_DELETE", "MARKETING_SLOT", sm[1], {});
    return json({ success: true, id: sm[1] });
  }
  if (path === "/api/v1/admin/marketing/slots/reorder" && method === "POST") {
    const ids = (await readJson(request)).ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some((i) => typeof i !== "string")) throw new HttpError(400, "INVALID_ORDER", "정렬할 배너 id 목록이 필요합니다.");
    await db.batch(ids.map((id: string, i: number) => db.prepare("UPDATE marketing_slots SET sort_order = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind((i + 1) * 10, id)));
    await audit(env, admin.id, "MARKETING_SLOT_REORDER", "MARKETING_SLOT", "*", { count: ids.length });
    return json({ success: true });
  }

  // ---------------- admin: insights (CR-04) ----------------
  if (path === "/api/v1/admin/insights" && method === "GET") {
    const days = [7, 30, 90].includes(Number(url.searchParams.get("days"))) ? Number(url.searchParams.get("days")) : 30;
    const end = Date.now();
    const startDay = dayKey(end - (days - 1) * DAY_MS);
    const mauStart = dayKey(end - 29 * DAY_MS);
    const today = dayKey(end);
    const one = async (sql: string, ...args: unknown[]) => Number((await db.prepare(sql).bind(...args).first<{ v: number }>())?.v || 0);

    const gmv = await one("SELECT COALESCE(SUM(amount_minor), 0) AS v FROM payments WHERE status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') AND substr(COALESCE(approved_at, created_at), 1, 10) >= ?", startDay);
    const refunded = await one("SELECT COALESCE(SUM(amount_minor), 0) AS v FROM refunds WHERE status = 'SUCCEEDED' AND substr(updated_at, 1, 10) >= ?", startDay);
    // Net revenue = commission + retained cancellation fees, credits minus reversing debits.
    const netRevenue = await one(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END), 0) AS v FROM ledger_entries
       WHERE account IN ('COMMISSION_REVENUE', 'CANCELLATION_FEE_REVENUE') AND substr(created_at, 1, 10) >= ?`, startDay);
    const bookingsCreated = await one("SELECT COUNT(*) AS v FROM bookings WHERE substr(created_at, 1, 10) >= ?", startDay);
    const bookingsPaid = await one("SELECT COUNT(DISTINCT booking_id) AS v FROM payments WHERE status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') AND substr(COALESCE(approved_at, created_at), 1, 10) >= ?", startDay);
    // Cancel rate is over paid bookings: abandoned unpaid carts (EXPIRED) are not cancellations.
    const paidCreated = await one("SELECT COUNT(*) AS v FROM bookings WHERE paid_minor > 0 AND substr(created_at, 1, 10) >= ?", startDay);
    const cancelled = await one("SELECT COUNT(*) AS v FROM bookings WHERE paid_minor > 0 AND status IN ('CANCELLATION_REQUESTED','REFUND_PENDING','REFUNDED','CANCELLED') AND substr(created_at, 1, 10) >= ?", startDay);
    const signups = await one("SELECT COUNT(*) AS v FROM users WHERE substr(created_at, 1, 10) >= ?", startDay);
    // Active users are signed-in users seen in funnel events or bookings (anonymous traffic has no identity to count).
    const activeSql = `SELECT COUNT(DISTINCT uid) AS v FROM (
      SELECT user_id AS uid FROM analytics_events WHERE user_id IS NOT NULL AND substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) <= ?
      UNION SELECT user_id AS uid FROM bookings WHERE user_id IS NOT NULL AND substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) <= ?)`;
    const dau = await one(activeSql, today, today, today, today);
    const mau = await one(activeSql, mauStart, today, mauStart, today);

    const funnelRows = await db.prepare(
      "SELECT COALESCE(domain, 'ALL') AS domain, event_type, COUNT(*) AS c FROM analytics_events WHERE substr(created_at, 1, 10) >= ? GROUP BY domain, event_type",
    ).bind(startDay).all<any>();
    const funnelMap: Record<string, { domain: string; search: number; view: number; book: number }> = {};
    for (const r of funnelRows.results || []) {
      const f = (funnelMap[r.domain] ||= { domain: r.domain, search: 0, view: 0, book: 0 });
      if (r.event_type === "search" || r.event_type === "view" || r.event_type === "book") f[r.event_type as "search" | "view" | "book"] += Number(r.c || 0);
    }
    const funnel = Object.values(funnelMap)
      .map((f) => ({ ...f, viewToBookPct: f.view ? Math.round((f.book / f.view) * 1000) / 10 : null, searchToViewPct: f.search ? Math.round((f.view / f.search) * 1000) / 10 : null }))
      .sort((a, b) => b.book - a.book || b.view - a.view);

    const byDomain = await db.prepare(
      `SELECT b.domain_type AS domain, COUNT(DISTINCT b.id) AS bookings, COALESCE(SUM(p.amount_minor), 0) AS gmv
       FROM bookings b LEFT JOIN payments p ON p.booking_id = b.id AND p.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')
       WHERE substr(b.created_at, 1, 10) >= ? GROUP BY b.domain_type ORDER BY gmv DESC`,
    ).bind(startDay).all<any>();

    const dailyGmv = await db.prepare(
      "SELECT substr(COALESCE(approved_at, created_at), 1, 10) AS d, SUM(amount_minor) AS v FROM payments WHERE status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') AND substr(COALESCE(approved_at, created_at), 1, 10) >= ? GROUP BY d",
    ).bind(startDay).all<any>();
    const dailyBookings = await db.prepare("SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS v FROM bookings WHERE substr(created_at, 1, 10) >= ? GROUP BY d").bind(startDay).all<any>();
    const dailyActive = await db.prepare(
      `SELECT d, COUNT(DISTINCT uid) AS v FROM (
         SELECT substr(created_at, 1, 10) AS d, user_id AS uid FROM analytics_events WHERE user_id IS NOT NULL AND substr(created_at, 1, 10) >= ?
         UNION SELECT substr(created_at, 1, 10) AS d, user_id AS uid FROM bookings WHERE user_id IS NOT NULL AND substr(created_at, 1, 10) >= ?) GROUP BY d`,
    ).bind(startDay, startDay).all<any>();
    const idx = (rows: any[]) => Object.fromEntries((rows || []).map((r) => [r.d, Number(r.v || 0)]));
    const g = idx(dailyGmv.results || []), bk = idx(dailyBookings.results || []), ac = idx(dailyActive.results || []);
    const daily = Array.from({ length: days }, (_, i) => {
      const d = dayKey(end - (days - 1 - i) * DAY_MS);
      return { date: d, gmvMinor: g[d] || 0, bookings: bk[d] || 0, activeUsers: ac[d] || 0 };
    });

    const topProducts = await db.prepare(
      `SELECT domain_type AS domain, item_id AS itemId, MAX(title) AS title, COUNT(*) AS bookings, COALESCE(SUM(paid_minor), 0) AS paidMinor
       FROM bookings WHERE substr(created_at, 1, 10) >= ? AND paid_minor > 0 GROUP BY domain_type, item_id ORDER BY paidMinor DESC LIMIT 10`,
    ).bind(startDay).all<any>();

    return json({
      success: true, days, from: startDay, to: today, currency: "KRW",
      kpis: {
        gmvMinor: gmv, refundedMinor: refunded, netRevenueMinor: netRevenue, bookingsCreated, bookingsPaid,
        cancelRatePct: paidCreated ? Math.round((cancelled / paidCreated) * 1000) / 10 : null,
        averageOrderMinor: bookingsPaid ? Math.round(gmv / bookingsPaid) : null,
        signups, dau, mau,
      },
      funnel, byDomain: byDomain.results || [], daily, topProducts: topProducts.results || [],
      definitions: {
        gmv: "기간 내 승인된 결제 금액 합계(환불 전)",
        netRevenue: "원장 COMMISSION_REVENUE + CANCELLATION_FEE_REVENUE 순증",
        activeUsers: "로그인 상태로 검색·조회·예약 이벤트를 남긴 회원 수(비로그인 방문 제외)",
        cancelRate: "기간 내 생성·결제된 예약 중 취소 요청·환불·취소 상태 비율",
      },
    });
  }

  return null;
}

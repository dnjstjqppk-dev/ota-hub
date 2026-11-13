/**
 * Catalog search & detail endpoints (read-only). Moved from the legacy
 * monolithic worker. Every product returned is annotated with `bookable`
 * (whether it can actually be booked & paid on GetForTrip right now) and a
 * `price_notice` because catalog prices are not supplier-verified.
 */
import type { Env } from "../env.ts";
import { json, str } from "../lib/http.ts";
import { rateLimit } from "../lib/auth.ts";
import { hotelRatePlans, supplierBookabilityMap, type Bookability } from "../services/catalog.ts";
import { airportsForCityCode, airportsForPlaceName, likeEscape, parseDomain, suggest } from "../services/suggest-service.ts";
import { catalogSnapshot } from "./seo.ts";

/** User text for a LIKE '%...%' pattern: `%`/`_`/`\` become literals, never wildcards. */
const contains = (s: string): string => `%${likeEscape(s)}%`;

/**
 * #130: list limits clamp to 1..100 (default 50). A bare parseInt turned
 * `limit=abc` into LIMIT NaN (a 500 from SQLite) and `limit=-5` into an
 * unbounded scan (SQLite reads a negative LIMIT as no limit).
 */
function clampLimit(raw: string | null, fallback = 50, max = 100): number {
  const n = parseInt(raw || "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, n));
}

const PRICE_NOTICE = "참고 가격 (공급사 실시간 검증 전)";

function annotate(rows: any[], map: Map<string, Bookability>, fallbackSupplier: string, domain: string | null = null) {
  return rows.map((r) => {
    const b = map.get(r.partner_id || fallbackSupplier) || { bookable: false, reason: "SUPPLIER_NOT_REGISTERED", mode: null, adapter: null, outlinkPartner: null };
    // Mirror the quote-time ticketing rule so lists/details never advertise an unquotable flight.
    const bb = domain === "FLIGHT" && b.adapter === "direct_contract"
      ? { ...b, bookable: false, reason: "FLIGHT_TICKETING_UNSUPPORTED", mode: null }
      : b;
    // #27: affiliate outlink (path under the API base). Gated on the PRE-override
    // reason: an AFFILIATE flight still links out (the partner tickets it; we
    // take no money), even though FLIGHT_TICKETING_UNSUPPORTED blocks direct sale.
    const outlink = b.reason === "EXTERNAL_LINK_ONLY" && b.outlinkPartner && r.id
      ? `/out/${b.outlinkPartner}/${encodeURIComponent(String(r.id))}${domain ? `?domain=${domain}` : ""}`
      : null;
    // #42: "instant confirmation" is a fulfilment-mode claim, not a catalog
    // flag: direct_contract bookings always PENDING for operator confirmation,
    // so only the auto-confirming simulator (dev/test) earns the badge. When a
    // real instant adapter ships, extend the adapter check here (and the
    // instantOnly filter below) — never the row flag alone.
    const instantConfirmed = Number(r.instant_confirmation) === 1 && b.adapter === "simulator" && bb.bookable === true;
    return { ...r, bookable: bb.bookable, bookable_reason: bb.reason, fulfilment_mode: bb.mode, instant_confirmed: instantConfirmed, price_notice: PRICE_NOTICE, ...(outlink ? { outlink_path: outlink } : {}) };
  });
}

export async function handleCatalog(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (request.method !== "GET") return null;
  // #141: the whole public read surface (suggest, 7 lists + details, slots,
  // esim/insurance, policies/legal/seo/promotions/notices/fx) shared one
  // unbounded tap — floods now 429 instead of melting D1.
  await rateLimit(request, env, "catalog_read", 600, 60);
    // Search autocomplete: places reference data + live catalog products (see services/suggest-service.ts)
    if (path === "/api/v1/search/suggest") {
      const started = Date.now();
      const domain = parseDomain(url.searchParams.get("domain"));
      const limit = Math.max(1, Math.min(20, parseInt(url.searchParams.get("limit") || "10", 10) || 10));
      const q = url.searchParams.get("q") || "";
      const { items, degraded } = await suggest(env, q, domain, limit);
      return json(
        { success: true, count: items.length, data: items, meta: { q: q.trim().slice(0, 60), domain, degraded, took_ms: Date.now() - started } },
        200,
        { "Cache-Control": "public, max-age=60, s-maxage=300" },
      );
    }

  // Structured cancellation policy for one product (null = domain defaults apply).
  if (path === "/api/v1/policies") {
    const domain = str(url.searchParams.get("domain"), 20).toUpperCase();
    const itemId = str(url.searchParams.get("itemId") || url.searchParams.get("item_id"), 100);
    if (!domain || !itemId) return json({ success: true, policy: null });
    const row = await env.DB.prepare("SELECT domain_type, item_id, free_cancel_hours, change_allowed, no_show_fee_bps, tiers_json, floor_price_minor, note, updated_at FROM product_policies WHERE domain_type = ? AND item_id = ?").bind(domain, itemId).first<any>();
    return json({ success: true, policy: row ? { ...row, tiers: JSON.parse(row.tiers_json || "[]") } : null });
  }

  // C7: build-time SEO snapshot (public; powers prerender routes + first paint).
  if (path === "/api/v1/seo/snapshot") {
    const snap = await catalogSnapshot(env);
    return json({ success: true, generatedAt: new Date().toISOString(), ...snap }, 200, { "Cache-Control": "public, max-age=3600" });
  }

  // Legal document version registry (bodies live in the versioned frontend pages).
  if (path === "/api/v1/legal") {
    const rows = await env.DB.prepare("SELECT slug, version, title, effective_from, updated_at FROM legal_documents ORDER BY slug").all();
    return json({ success: true, documents: rows.results || [] });
  }
  {
    const lm = path.match(/^\/api\/v1\/legal\/([a-z-]+)$/);
    if (lm) {
      const row = await env.DB.prepare("SELECT slug, version, title, effective_from, updated_at FROM legal_documents WHERE slug = ?").bind(lm[1]).first();
      if (!row) return json({ error: "약관 문서를 찾을 수 없습니다.", code: "LEGAL_NOT_FOUND" }, 404);
      return json({ success: true, document: row });
    }
  }

  const bmap = await supplierBookabilityMap(env);

    // Helper to format hotel json columns
    const formatHotel = (row: any) => {
      if (!row) return null;
      let images = [];
      let amenities = [];
      let rooms = [];
      try { images = JSON.parse(row.images_json || '[]'); } catch (e) {}
      try { amenities = JSON.parse(row.amenities_json || '[]'); } catch (e) {}
      try { rooms = JSON.parse(row.rooms_json || '[]'); } catch (e) {}
      return {
        ...row,
        images,
        amenities,
        rooms: (Array.isArray(rooms) ? rooms : []).map((r: any) => ({ ...r, rate_plans: hotelRatePlans(row, r) })),
        free_cancellation: Boolean(row.free_cancellation),
        free_breakfast: Boolean(row.free_breakfast),
      };
    };

    if (path === "/api/v1/hotels") {
      const city = url.searchParams.get("city") || "";
      const star = parseInt(url.searchParams.get("star") || "0", 10);
      const minScore = parseFloat(url.searchParams.get("minScore") || url.searchParams.get("min_score") || "0");
      const propertyType = url.searchParams.get("propertyType") || url.searchParams.get("property_type") || "";
      const minPrice = parseFloat(url.searchParams.get("minPrice") || "0");
      const maxPrice = parseFloat(url.searchParams.get("maxPrice") || "999999999");
      const freeCancel = url.searchParams.get("freeCancel") === "true" || url.searchParams.get("free_cancellation") === "1";
      const breakfast = url.searchParams.get("breakfast") === "true" || url.searchParams.get("free_breakfast") === "1";
      const sortBy = url.searchParams.get("sortBy") || "recommended";
      const limit = clampLimit(url.searchParams.get("limit"));

      let q = "SELECT * FROM hotels WHERE is_active = 1";
      const p: any[] = [];
      if (city) {
        q += " AND (city LIKE ? ESCAPE '\\' OR name_ko LIKE ? ESCAPE '\\' OR name_en LIKE ? ESCAPE '\\' OR neighborhood LIKE ? ESCAPE '\\')";
        p.push(contains(city), contains(city), contains(city), contains(city));
      }
      if (star > 0) {
        q += " AND star_rating >= ?";
        p.push(star);
      }
      if (minScore > 0) {
        q += " AND review_score >= ?";
        p.push(minScore);
      }
      if (propertyType && propertyType !== "ALL") {
        q += " AND property_type = ?";
        p.push(propertyType);
      }
      if (minPrice > 0) {
        q += " AND base_price_krw >= ?";
        p.push(minPrice);
      }
      if (maxPrice < 999999999) {
        q += " AND base_price_krw <= ?";
        p.push(maxPrice);
      }
      if (freeCancel) {
        q += " AND free_cancellation = 1";
      }
      if (breakfast) {
        q += " AND free_breakfast = 1";
      }

      if (sortBy === "price_asc") {
        q += " ORDER BY base_price_krw ASC";
      } else if (sortBy === "price_desc") {
        q += " ORDER BY base_price_krw DESC";
      } else if (sortBy === "score_desc") {
        q += " ORDER BY review_score DESC NULLS LAST, review_count DESC";
      } else if (sortBy === "star_desc") {
        q += " ORDER BY star_rating DESC, review_score DESC NULLS LAST";
      } else {
        q += " ORDER BY review_score DESC NULLS LAST, star_rating DESC";
      }
      q += ` LIMIT ${Math.min(limit, 100)}`;

      const res = await env.DB.prepare(q).bind(...p).all();
      const formatted = (res.results || []).map(formatHotel);
      const annotated = annotate(formatted, bmap, "ptn_htl_01");
      return json({ success: true, count: annotated.length, data: annotated });
    }
    if (path.startsWith("/api/v1/hotels/")) {
      const id = path.replace("/api/v1/hotels/", "");
      const row = await env.DB.prepare("SELECT * FROM hotels WHERE id = ?").bind(id).first<any>();
      if (!row || row.is_active === 0) return json({ success: false, error: "Hotel not found", code: "NOT_FOUND" }, 404);
      return json({ success: true, data: annotate([formatHotel(row)], bmap, "ptn_htl_01")[0] });
    }

    if (path === "/api/v1/flights") {
      const rawOrigin = url.searchParams.get("origin") || url.searchParams.get("dcity") || "";
      const rawDest = url.searchParams.get("dest") || url.searchParams.get("acity") || "";
      const originMatch = rawOrigin.match(/\b([A-Z]{3})\b/);
      const originCode = originMatch ? originMatch[1] : "";
      const cleanOrigin = rawOrigin.replace(/\s*\([^)]*\)/g, "").trim();

      const destMatch = rawDest.match(/\b([A-Z]{3})\b/);
      const destCode = destMatch ? destMatch[1] : "";
      const cleanDest = rawDest.replace(/\s*\([^)]*\)/g, "").trim();

      const stops = url.searchParams.get("stops");
      const airline = url.searchParams.get("airline") || "";
      const timeSlot = url.searchParams.get("timeSlot") || "";
      const cabinClass = url.searchParams.get("cabinClass") || url.searchParams.get("class") || "";
      const sortBy = url.searchParams.get("sortBy") || "cheapest";
      const limit = clampLimit(url.searchParams.get("limit"));

      let q = "SELECT * FROM flights WHERE is_active = 1";
      const p: any[] = [];
      // A metropolitan city code (TYO, SEL, LON...) searches every airport of that city.
      // A place name picked from autocomplete ("서울", "인천국제공항") resolves to its airports as well.
      const originAirports = originCode ? await airportsForCityCode(env, originCode) : cleanOrigin ? await airportsForPlaceName(env, cleanOrigin) : [];
      const destAirports = destCode ? await airportsForCityCode(env, destCode) : cleanDest ? await airportsForPlaceName(env, cleanDest) : [];
      if (originAirports.length) {
        q += ` AND departure_airport IN (${originAirports.map(() => "?").join(",")})`;
        p.push(...originAirports);
      } else if (originCode || cleanOrigin) {
        q += " AND (departure_airport = ? OR departure_airport LIKE ? ESCAPE '\\' OR departure_city LIKE ? ESCAPE '\\' OR ? LIKE '%' || departure_city || '%')";
        p.push(originCode || cleanOrigin, contains(originCode || cleanOrigin), contains(cleanOrigin), cleanOrigin);
      }
      if (destAirports.length) {
        q += ` AND arrival_airport IN (${destAirports.map(() => "?").join(",")})`;
        p.push(...destAirports);
      } else if (destCode || cleanDest) {
        q += " AND (arrival_airport = ? OR arrival_airport LIKE ? ESCAPE '\\' OR arrival_city LIKE ? ESCAPE '\\' OR ? LIKE '%' || arrival_city || '%')";
        p.push(destCode || cleanDest, contains(destCode || cleanDest), contains(cleanDest), cleanDest);
      }
      if (stops !== null && stops !== undefined && stops !== "") {
        q += " AND stops = ?";
        p.push(parseInt(stops, 10));
      }
      if (airline) {
        q += " AND (airline_name LIKE ? ESCAPE '\\' OR airline_code LIKE ? ESCAPE '\\')";
        p.push(contains(airline), contains(airline));
      }
      if (timeSlot && timeSlot !== "ALL") {
        q += " AND departure_time_slot = ?";
        p.push(timeSlot.toUpperCase());
      }
      if (cabinClass && cabinClass !== "ALL") {
        q += " AND cabin_class LIKE ? ESCAPE '\\'";
        p.push(contains(cabinClass));
      }

      if (sortBy === "cheapest" || sortBy === "price_asc") {
        q += " ORDER BY base_price_krw ASC";
      } else if (sortBy === "fastest") {
        q += " ORDER BY duration_minutes ASC";
      } else if (sortBy === "earliest") {
        q += " ORDER BY departure_time ASC";
      } else {
        q += " ORDER BY base_price_krw ASC";
      }
      q += ` LIMIT ${Math.min(limit, 100)}`;

      const res = await env.DB.prepare(q).bind(...p).all();
      { const rows = annotate(res.results || [], bmap, "ptn_flt_01", "FLIGHT"); return json({ success: true, count: rows.length, data: rows }); }
    }
    if (path.startsWith("/api/v1/flights/")) {
      const id = path.replace("/api/v1/flights/", "");
      const row = await env.DB.prepare("SELECT * FROM flights WHERE id = ?").bind(id).first();
      if (!row || (row as any).is_active === 0) return json({ success: false, error: "not found", code: "NOT_FOUND" }, 404);
      return json({ success: true, data: annotate([row], bmap, "ptn_flt_01", "FLIGHT")[0] });
    }

    if (path === "/api/v1/trains") {
      const rawDep = url.searchParams.get("dep") || url.searchParams.get("departure_station") || "";
      const rawArr = url.searchParams.get("arr") || url.searchParams.get("arrival_station") || "";
      const trainType = url.searchParams.get("trainType") || "";
      const sortBy = url.searchParams.get("sortBy") || "departure_asc";

      const cleanStation = (val: string) => val.replace(/\s*\([^)]*\)/g, "").trim();
      const dep = cleanStation(rawDep);
      const arr = cleanStation(rawArr);

      let q = "SELECT * FROM trains WHERE is_active = 1";
      const p: any[] = [];
      if (dep) {
        q += " AND (departure_station LIKE ? ESCAPE '\\' OR ? LIKE '%' || departure_station || '%')";
        p.push(contains(dep), dep);
      }
      if (arr) {
        q += " AND (arrival_station LIKE ? ESCAPE '\\' OR ? LIKE '%' || arrival_station || '%')";
        p.push(contains(arr), arr);
      }
      if (trainType && trainType !== "ALL") {
        q += " AND train_type LIKE ? ESCAPE '\\'";
        p.push(contains(trainType));
      }
      if (sortBy === "price_asc") {
        q += " ORDER BY price_krw ASC";
      } else if (sortBy === "duration_asc") {
        q += " ORDER BY duration_minutes ASC";
      } else {
        q += " ORDER BY departure_time ASC";
      }
      q += " LIMIT 50";
      const res = await env.DB.prepare(q).bind(...p).all();
      { const rows = annotate(res.results || [], bmap, "unassigned_train"); return json({ success: true, count: rows.length, data: rows }); }
    }
    if (path.startsWith("/api/v1/trains/")) {
      const id = path.replace("/api/v1/trains/", "");
      const row = await env.DB.prepare("SELECT * FROM trains WHERE id = ?").bind(id).first();
      if (!row || (row as any).is_active === 0) return json({ success: false, error: "not found", code: "NOT_FOUND" }, 404);
      return json({ success: true, data: annotate([row], bmap, "unassigned_train")[0] });
    }

    if (path === "/api/v1/cars") {
      const city = url.searchParams.get("city") || "";
      const loc = url.searchParams.get("loc") || url.searchParams.get("location") || city;
      const vehicleType = url.searchParams.get("vehicleType") || "";
      const transmission = url.searchParams.get("transmission") || "";
      const sortBy = url.searchParams.get("sortBy") || "price_asc";

      let q = "SELECT * FROM cars WHERE is_active = 1";
      const p: any[] = [];
      if (loc) {
        q += " AND (pickup_location LIKE ? ESCAPE '\\' OR company_name LIKE ? ESCAPE '\\' OR vehicle_model LIKE ? ESCAPE '\\')";
        p.push(contains(loc), contains(loc), contains(loc));
      }
      if (vehicleType && vehicleType !== "ALL") {
        q += " AND vehicle_type = ?";
        p.push(vehicleType);
      }
      if (transmission && transmission !== "ALL") {
        q += " AND transmission = ?";
        p.push(transmission.toUpperCase());
      }
      if (sortBy === "price_desc") {
        q += " ORDER BY daily_price_krw DESC";
      } else if (sortBy === "seats_desc") {
        q += " ORDER BY seats DESC";
      } else {
        q += " ORDER BY daily_price_krw ASC";
      }
      q += " LIMIT 50";
      const res = await env.DB.prepare(q).bind(...p).all();
      { const rows = annotate(res.results || [], bmap, "ptn_car_01"); return json({ success: true, count: rows.length, data: rows }); }
    }
    if (path.startsWith("/api/v1/cars/")) {
      const id = path.replace("/api/v1/cars/", "");
      const row = await env.DB.prepare("SELECT * FROM cars WHERE id = ?").bind(id).first<any>();
      if (!row || row.is_active === 0) return json({ success: false, error: "not found", code: "NOT_FOUND" }, 404);
      return json({ success: true, data: annotate([row], bmap, "ptn_car_01")[0] });
    }

    if (path === "/api/v1/transfers") {
      const rawAirport = url.searchParams.get("airport") || "";
      const rawDest = url.searchParams.get("destination") || url.searchParams.get("dest") || "";
      const airportMatch = rawAirport.match(/\b([A-Z]{3})\b/);
      const airportCode = airportMatch ? airportMatch[1] : "";
      const cleanAirport = rawAirport.replace(/\s*\([^)]*\)/g, "").trim();
      const cleanDest = rawDest.replace(/\s*\([^)]*\)/g, "").trim();

      let q = "SELECT * FROM transfers WHERE is_active = 1";
      const p: any[] = [];
      // "인천국제공항" / "서울" picked from autocomplete carries no code: resolve it to IATA airport codes.
      const named = !airportCode && cleanAirport ? await airportsForPlaceName(env, cleanAirport) : [];
      if (named.length) {
        q += ` AND airport_code IN (${named.map(() => "?").join(",")})`;
        p.push(...named);
      } else if (airportCode || cleanAirport) {
        q += " AND (airport_code = ? OR airport_code LIKE ? ESCAPE '\\' OR service_title LIKE ? ESCAPE '\\')";
        p.push(airportCode || cleanAirport, contains(airportCode || cleanAirport), contains(cleanAirport));
      }
      if (cleanDest) {
        q += " AND (destination_area LIKE ? ESCAPE '\\' OR service_title LIKE ? ESCAPE '\\')";
        p.push(contains(cleanDest), contains(cleanDest));
      }
      q += " LIMIT 50";
      const res = await env.DB.prepare(q).bind(...p).all();
      { const rows = annotate(res.results || [], bmap, "unassigned_transfer"); return json({ success: true, count: rows.length, data: rows }); }
    }
    if (path.startsWith("/api/v1/transfers/")) {
      const id = path.replace("/api/v1/transfers/", "");
      const row = await env.DB.prepare("SELECT * FROM transfers WHERE id = ?").bind(id).first();
      if (!row || (row as any).is_active === 0) return json({ success: false, error: "not found", code: "NOT_FOUND" }, 404);
      return json({ success: true, data: annotate([row], bmap, "unassigned_transfer")[0] });
    }

    if (path === "/api/v1/activities") {
      const qKeyword = url.searchParams.get("q") || url.searchParams.get("query") || "";
      const city = url.searchParams.get("city") || "";
      const category = url.searchParams.get("category") || "";
      const instantOnly = url.searchParams.get("instantOnly") === "true" || url.searchParams.get("instant") === "true";
      const freeCancelOnly = url.searchParams.get("freeCancelOnly") === "true" || url.searchParams.get("freeCancel") === "true";
      const maxPrice = parseFloat(url.searchParams.get("maxPrice") || "999999999");
      const sortBy = url.searchParams.get("sortBy") || "recommended";

      let q = "SELECT * FROM activities WHERE is_active = 1";
      const p: any[] = [];
      if (qKeyword) {
        q += " AND (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\')";
        p.push(contains(qKeyword), contains(qKeyword), contains(qKeyword));
      }
      if (city) {
        q += " AND (city LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')";
        p.push(contains(city), contains(city), contains(city));
      }
      if (category && category !== "ALL") {
        q += " AND category = ?";
        p.push(category);
      }
      if (instantOnly) {
        // #42: mirror the annotate() rule — the row flag alone is not enough.
        q += " AND instant_confirmation = 1 AND COALESCE((SELECT s.adapter FROM suppliers s WHERE s.id = COALESCE(NULLIF(activities.partner_id, ''), 'ptn_tour_01')), '') = 'simulator'";
      }
      if (freeCancelOnly) {
        q += " AND free_cancellation = 1";
      }
      if (maxPrice < 999999999) {
        q += " AND price_krw <= ?";
        p.push(maxPrice);
      }
      if (sortBy === "price_asc") {
        q += " ORDER BY price_krw ASC";
      } else if (sortBy === "rating_desc") {
        q += " ORDER BY review_score DESC NULLS LAST, review_count DESC";
      } else {
        q += " ORDER BY review_score DESC NULLS LAST, review_count DESC";
      }
      q += " LIMIT 50";
      const res = await env.DB.prepare(q).bind(...p).all();
      const list = (res.results || []).map((row: any) => {
        let included: any[] = [];
        try { included = JSON.parse(row.packages_json || '[]'); } catch (e) {}
        return {
          ...row,
          included,
          image_url: row.thumbnail_url || row.image_url
        };
      });
      return json({ success: true, count: list.length, data: annotate(list, bmap, "ptn_tour_01") });
    }
    // 13. Activity Time Slots & Availability: GET /api/v1/activities/:id/slots.
    // Must precede the detail prefix-match below, which would otherwise swallow it.
    // #131: activity ids may carry hyphens — the old class dropped them into
    // the detail prefix-match (404) instead of serving their slots.
    const slotMatch = path.match(/^\/api\/v1\/activities\/([A-Za-z0-9_-]+)\/slots$/);
    if (slotMatch) {
      const activityId = slotMatch[1];
      const targetDate = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
      const rows = await env.DB.prepare(
        "SELECT * FROM activity_time_slots WHERE activity_id = ? AND slot_date = ? AND is_closed = 0 ORDER BY start_time ASC"
      ).bind(activityId, targetDate).all();

      // No fabrication: an activity without registered slots reports none.
      // (Previously this endpoint invented 3 slots with fake bookings.)
      const slots = rows.results || [];
      return json({ success: true, activity_id: activityId, date: targetDate, slots });
    }
    if (path.startsWith("/api/v1/activities/")) {
      const id = path.replace("/api/v1/activities/", "");
      const row = await env.DB.prepare("SELECT * FROM activities WHERE id = ?").bind(id).first<any>();
      if (!row || row.is_active === 0) return json({ success: false, error: "Activity not found", code: "NOT_FOUND" }, 404);
      let included: any[] = [];
      try { included = JSON.parse((row as any).packages_json || '[]'); } catch (e) {}
      return json({
        success: true,
        data: annotate([{
          ...row,
          included,
          image_url: (row as any).thumbnail_url || (row as any).image_url
        }], bmap, "ptn_tour_01")[0]
      });
    }

    if (path === "/api/v1/packages") {
      const dest = url.searchParams.get("dest") || url.searchParams.get("city") || "";
      let q = "SELECT * FROM packages WHERE is_active = 1";
      const p: any[] = [];
      if (dest) {
        q += " AND (destination_city LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\')";
        p.push(contains(dest), contains(dest));
      }
      q += " ORDER BY package_discount_rate DESC LIMIT 50";
      const res = await env.DB.prepare(q).bind(...p).all();
      const list = (res.results || []).map((row: any) => {
        let details: any = {};
        try { details = JSON.parse(row.details_json || '{}'); } catch (e) {}
        return {
          ...row,
          hero_image_url: row.thumbnail_url || details.hero_image_url,
          savings_percentage: row.package_discount_rate ?? null,
          bundle_price_krw: row.total_package_krw,
          original_price_krw: row.total_original_krw,
          badge: details.badge || '특가 번들',
          duration_nights: details.duration_nights ?? null,
          duration_days: details.duration_days ?? null,
          flight: details.flight || null,
          hotel: details.hotel || null
        };
      });
      return json({ success: true, count: list.length, data: annotate(list, bmap, "unassigned_package") });
    }
    if (path.startsWith("/api/v1/packages/")) {
      const id = path.replace("/api/v1/packages/", "");
      const row = await env.DB.prepare("SELECT * FROM packages WHERE id = ?").bind(id).first();
      if (!row || (row as any).is_active === 0) return json({ success: false, error: "Package not found", code: "NOT_FOUND" }, 404);
      let details: any = {};
      try { details = JSON.parse((row as any).details_json || '{}'); } catch (e) {}
      return json({
        success: true,
        data: annotate([{
          ...row,
          hero_image_url: (row as any).thumbnail_url || details.hero_image_url,
          savings_percentage: (row as any).package_discount_rate ?? null,
          bundle_price_krw: (row as any).total_package_krw,
          original_price_krw: (row as any).total_original_krw,
          badge: details.badge || '특가 번들',
          duration_nights: details.duration_nights ?? null,
          duration_days: details.duration_days ?? null,
          flight: details.flight || null,
          hotel: details.hotel || null
        }], bmap, "unassigned_package")[0]
      });
    }

    if (path === "/api/v1/promotions") {
      const res = await env.DB.prepare("SELECT * FROM promotions WHERE is_active = 1").all();
      return json({ success: true, promotions: res.results });
    }

    if (path === "/api/v1/notices") {
      const res = await env.DB.prepare("SELECT * FROM notices WHERE banner_active = 1 ORDER BY is_emergency DESC, created_at DESC").all();
      return json({ success: true, notices: res.results });
    }

    if (path === "/api/v1/fx-rates") {
      const res = await env.DB.prepare("SELECT * FROM fx_rates").all();
      return json({ success: true, rates: res.results });
    }
    // 10. eSIM Plans Catalog: GET /api/v1/esim/plans
    if (path === "/api/v1/esim/plans") {
      const countryCode = url.searchParams.get("country");
      let sql = "SELECT * FROM esim_plans WHERE is_active = 1";
      const params: unknown[] = [];
      if (countryCode) {
        sql += " AND country_code = ?";
        params.push(countryCode.toUpperCase());
      }
      sql += " ORDER BY country_name, price_minor ASC";
      const rows = await env.DB.prepare(sql).bind(...params).all();
      // #145: quotes 409 these plans (ESIM_INSURANCE_QUOTE_UNSUPPORTED), so
      // the catalog must not present them as purchasable either.
      const plans = (rows.results || []).map((p: any) => ({
        ...p,
        purchasable: false,
        purchase_notice: "판매 준비 중입니다. 통신사 제휴가 끝나면 구매할 수 있어요.",
      }));
      return json({ success: true, plans, notice: "eSIM 판매를 준비하고 있어요. 지금은 요금제와 참고가만 볼 수 있어요." });
    }

    // 11. Travel Insurance Plans: GET /api/v1/insurance/plans
    if (path === "/api/v1/insurance/plans") {
      // #172: days=abc used to compute NaN and answer 200 with null totals.
      const durationDays = clampLimit(url.searchParams.get("days"), 5, 90);
      const rows = await env.DB.prepare("SELECT * FROM travel_insurance_plans WHERE is_active = 1 ORDER BY daily_rate_minor ASC").all();
      // #145: same unpurchasable annotation as eSIM (quotes 409).
      const calculated = (rows.results || []).map((p: any) => ({
        ...p,
        total_price_minor: p.daily_rate_minor * durationDays,
        duration_days: durationDays,
        purchasable: false,
        purchase_notice: "판매 준비 중입니다. 보험사 제휴가 끝나면 구매할 수 있어요.",
      }));
      return json({ success: true, plans: calculated, duration_days: durationDays, notice: "여행자보험 판매를 준비하고 있어요. 지금은 요금제와 참고가만 볼 수 있어요." });
    }

    // 14. External supplier registry moved behind admin auth (#41):
    // GET /api/v1/admin/suppliers/registry. The public surface must not
    // advertise vendor integrations the platform has not contracted.
  return null;
}

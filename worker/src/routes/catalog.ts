/**
 * Catalog search & detail endpoints (read-only). Moved from the legacy
 * monolithic worker. Every product returned is annotated with `bookable`
 * (whether it can actually be booked & paid on GetForTrip right now) and a
 * `price_notice` because catalog prices are not supplier-verified.
 */
import type { Env } from "../env.ts";
import { json } from "../lib/http.ts";
import { hotelRatePlans, supplierBookabilityMap, type Bookability } from "../services/catalog.ts";

const PRICE_NOTICE = "참고 가격 (공급사 실시간 검증 전)";

function annotate(rows: any[], map: Map<string, Bookability>, fallbackSupplier: string) {
  return rows.map((r) => {
    const b = map.get(r.partner_id || fallbackSupplier) || { bookable: false, reason: "SUPPLIER_NOT_REGISTERED", mode: null };
    return { ...r, bookable: b.bookable, bookable_reason: b.reason, fulfilment_mode: b.mode, price_notice: PRICE_NOTICE };
  });
}

export async function handleCatalog(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (request.method !== "GET") return null;
  const bmap = await supplierBookabilityMap(env);
    // Global Search Autocomplete / Suggest API (Trip-style)
    if (path === "/api/v1/search/suggest") {
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const domain = (url.searchParams.get("domain") || "").trim().toLowerCase();

      // Top-tier predefined destinations (Airports, Major Metros, Landmarks, Stations)
      const GLOBAL_INDEX: Array<{
        id: string;
        title: string;
        subtitle: string;
        code?: string;
        type: string;
        badge: string;
        count_info: string;
        target_url: string;
        domain: string;
      }> = [
        // Metros & Cities
        { id: 'sel', title: '서울 (Seoul)', subtitle: '대한민국 서울특별시 (Seoul, Korea)', code: 'SEL', type: 'city', badge: '', count_info: '', target_url: '/hotels/list?city=서울', domain: 'hotels' },
        { id: 'cju', title: '제주 (Jeju)', subtitle: '대한민국 제주특별자치도 (Jeju Island)', code: 'CJU', type: 'city', badge: '', count_info: '', target_url: '/hotels/list?city=제주', domain: 'hotels' },
        { id: 'pus', title: '부산 (Busan)', subtitle: '대한민국 부산광역시 (Busan, Korea)', code: 'PUS', type: 'city', badge: '', count_info: '', target_url: '/hotels/list?city=부산', domain: 'hotels' },
        { id: 'tyo', title: '도쿄 (Tokyo)', subtitle: '일본 간토 지방, 도쿄도 (Tokyo, Japan)', code: 'TYO', type: 'city', badge: '', count_info: '', target_url: '/hotels/list?city=도쿄', domain: 'hotels' },
        { id: 'osa', title: '오사카 (Osaka)', subtitle: '일본 간사이 지방, 오사카부 (Osaka, Japan)', code: 'OSA', type: 'city', badge: '', count_info: '', target_url: '/hotels/list?city=오사카', domain: 'hotels' },
        { id: 'fuk', title: '후쿠오카 (Fukuoka)', subtitle: '일본 규슈 후쿠오카현 (Fukuoka, Japan)', code: 'FUK', type: 'city', badge: '', count_info: '', target_url: '/hotels/list?city=후쿠오카', domain: 'hotels' },
        { id: 'spk', title: '삿포로 (Sapporo)', subtitle: '일본 홋카이도 (Sapporo, Hokkaido)', code: 'CTS', type: 'city', badge: '', count_info: '', target_url: '/hotels/list?city=삿포로', domain: 'hotels' },
        { id: 'oka', title: '오키나와 (Okinawa)', subtitle: '일본 규슈 남부 아열대 휴양지', code: 'OKA', type: 'city', badge: '', count_info: '', target_url: '/hotels/list?city=오키나와', domain: 'hotels' },
        { id: 'bkk', title: '방콕 (Bangkok)', subtitle: '태국 방콕 특별시 (Bangkok, Thailand)', code: 'BKK', type: 'city', badge: '', count_info: '', target_url: '/hotels/list?city=방콕', domain: 'hotels' },
        { id: 'dad', title: '다낭 (Da Nang)', subtitle: '베트남 다낭 미케비치 (Da Nang, Vietnam)', code: 'DAD', type: 'city', badge: '', count_info: '', target_url: '/hotels/list?city=다낭', domain: 'hotels' },
        { id: 'sin', title: '싱가포르 (Singapore)', subtitle: '싱가포르 공화국 (Singapore)', code: 'SIN', type: 'city', badge: '', count_info: '', target_url: '/hotels/list?city=싱가포르', domain: 'hotels' },
        { id: 'tpe', title: '타이베이 (Taipei)', subtitle: '대만 타이베이시 (Taipei, Taiwan)', code: 'TPE', type: 'city', badge: '', count_info: '', target_url: '/hotels/list?city=타이베이', domain: 'hotels' },
        { id: 'par', title: '파리 (Paris)', subtitle: '프랑스 일드프랑스 (Paris, France)', code: 'PAR', type: 'city', badge: '', count_info: '', target_url: '/hotels/list?city=파리', domain: 'hotels' },
        { id: 'lon', title: '런던 (London)', subtitle: '영국 잉글랜드 (London, United Kingdom)', code: 'LON', type: 'city', badge: '', count_info: '', target_url: '/hotels/list?city=런던', domain: 'hotels' },
        { id: 'nyc', title: '뉴욕 (New York)', subtitle: '미국 뉴욕주 (New York, USA)', code: 'NYC', type: 'city', badge: '', count_info: '', target_url: '/hotels/list?city=뉴욕', domain: 'hotels' },

        // Airports
        { id: 'air-icn', title: '인천국제공항 (ICN)', subtitle: '대한민국 서울/인천 Incheon Int Airport', code: 'ICN', type: 'airport', badge: '', count_info: '', target_url: '/flights/search?dest=ICN', domain: 'flights' },
        { id: 'air-gmp', title: '김포국제공항 (GMP)', subtitle: '대한민국 서울 Gimpo Airport', code: 'GMP', type: 'airport', badge: '', count_info: '', target_url: '/flights/search?dest=GMP', domain: 'flights' },
        { id: 'air-cju', title: '제주국제공항 (CJU)', subtitle: '대한민국 제주특별자치도 Jeju Airport', code: 'CJU', type: 'airport', badge: '', count_info: '', target_url: '/flights/search?dest=CJU', domain: 'flights' },
        { id: 'air-nrt', title: '도쿄 나리타공항 (NRT)', subtitle: '일본 도쿄/지바 Tokyo Narita Airport', code: 'NRT', type: 'airport', badge: '', count_info: '', target_url: '/flights/search?dest=NRT', domain: 'flights' },
        { id: 'air-hnd', title: '도쿄 하네다공항 (HND)', subtitle: '일본 도쿄도 Tokyo Haneda Airport', code: 'HND', type: 'airport', badge: '', count_info: '', target_url: '/flights/search?dest=HND', domain: 'flights' },
        { id: 'air-kix', title: '오사카 간사이공항 (KIX)', subtitle: '일본 오사카/간사이 Kansai Airport', code: 'KIX', type: 'airport', badge: '', count_info: '', target_url: '/flights/search?dest=KIX', domain: 'flights' },
        { id: 'air-fuk', title: '후쿠오카공항 (FUK)', subtitle: '일본 규슈 Fukuoka Airport', code: 'FUK', type: 'airport', badge: '', count_info: '', target_url: '/flights/search?dest=FUK', domain: 'flights' },
        { id: 'air-bkk', title: '방콕 수완나품공항 (BKK)', subtitle: '태국 방콕 Suvarnabhumi Airport', code: 'BKK', type: 'airport', badge: '', count_info: '', target_url: '/flights/search?dest=BKK', domain: 'flights' },
        { id: 'air-dad', title: '다낭국제공항 (DAD)', subtitle: '베트남 다낭 Da Nang Airport', code: 'DAD', type: 'airport', badge: '', count_info: '', target_url: '/flights/search?dest=DAD', domain: 'flights' },
        { id: 'air-sin', title: '싱가포르 창이공항 (SIN)', subtitle: '싱가포르 Singapore Changi Airport', code: 'SIN', type: 'airport', badge: '', count_info: '', target_url: '/flights/search?dest=SIN', domain: 'flights' },
        { id: 'air-cdg', title: '파리 샤를드골공항 (CDG)', subtitle: '프랑스 파리 Charles de Gaulle Airport', code: 'CDG', type: 'airport', badge: '', count_info: '', target_url: '/flights/search?dest=CDG', domain: 'flights' },
        { id: 'air-lhr', title: '런던 히드로공항 (LHR)', subtitle: '영국 런던 London Heathrow Airport', code: 'LHR', type: 'airport', badge: '', count_info: '', target_url: '/flights/search?dest=LHR', domain: 'flights' },
        { id: 'air-jfk', title: '뉴욕 JFK공항 (JFK)', subtitle: '미국 뉴욕 John F. Kennedy Airport', code: 'JFK', type: 'airport', badge: '', count_info: '', target_url: '/flights/search?dest=JFK', domain: 'flights' },

        // Trains
        { id: 'trn-seoul', title: '서울역 (Seoul Station)', subtitle: '대한민국 KTX/경부선 출발역', code: 'KTX', type: 'station', badge: '', count_info: '', target_url: '/trains/search?dep=서울역', domain: 'trains' },
        { id: 'trn-busan', title: '부산역 (Busan Station)', subtitle: '대한민국 KTX/경부선 종착역', code: 'KTX', type: 'station', badge: '', count_info: '', target_url: '/trains/search?arr=부산역', domain: 'trains' },
        { id: 'trn-tokyo', title: '도쿄역 (Tokyo Station)', subtitle: '일본 도카이도 신칸센 출발역', code: 'JR', type: 'station', badge: '', count_info: '', target_url: '/trains/search?dep=도쿄역', domain: 'trains' },
        { id: 'trn-osa', title: '신오사카역 (Shin-Osaka Station)', subtitle: '일본 간사이 산요/도카이도 신칸센', code: 'JR', type: 'station', badge: '', count_info: '', target_url: '/trains/search?arr=신오사카역', domain: 'trains' },

        // Cars & Rentals
        { id: 'car-cju', title: '제주공항 렌터카 셔틀 스테이션', subtitle: '대한민국 제주특별자치도 렌터카하우스', type: 'car', badge: '', count_info: '', target_url: '/cars?loc=제주공항', domain: 'cars' },
        { id: 'car-icn', title: '인천국제공항 T1/T2 렌터카', subtitle: '대한민국 인천공항 터미널 지점', type: 'car', badge: '', count_info: '', target_url: '/cars?loc=인천공항', domain: 'cars' },
        { id: 'car-nrt', title: '나리타공항 렌터카 카운터', subtitle: '일본 도쿄 나리타공항 터미널 지점', type: 'car', badge: '', count_info: '', target_url: '/cars?loc=나리타공항', domain: 'cars' },

        // Activities & Landmarks
        { id: 'act-usj', title: '유니버설 스튜디오 재팬 (USJ)', subtitle: '일본 오사카 익스프레스 패스 테마파크', type: 'activity', badge: '', count_info: '', target_url: '/things-to-do?q=유니버설', domain: 'activities' },
        { id: 'act-disney', title: '도쿄 디즈니랜드 / 디즈니씨 1일권', subtitle: '일본 지바현 우라야스시 테마파크 모바일 e-티켓', type: 'activity', badge: '', count_info: '', target_url: '/things-to-do?q=디즈니랜드', domain: 'activities' },
        { id: 'act-shibuya', title: '시부야 스카이 전망대 입장권', subtitle: '일본 도쿄 시부야 스크램블 최상층', type: 'activity', badge: '', count_info: '', target_url: '/things-to-do?q=시부야스카이', domain: 'activities' },
        { id: 'act-esim', title: '일본 매일 2GB+ 무제한 고속 eSIM', subtitle: 'Softbank/Docomo 로컬망 즉시 발송', type: 'activity', badge: '', count_info: '', target_url: '/esim', domain: 'activities' },
        { id: 'act-louvre', title: '루브르 박물관 모바일 패스트트랙', subtitle: '프랑스 파리 1구 세계 최대 미술관', type: 'activity', badge: '', count_info: '', target_url: '/things-to-do?q=루브르', domain: 'activities' },
        { id: 'act-eiffel', title: '에펠탑 2층 및 정상 전망대 입장권', subtitle: '프랑스 파리 7구 상드마르스 랜드마크', type: 'activity', badge: '', count_info: '', target_url: '/things-to-do?q=에펠탑', domain: 'activities' },

        // Packages
      ];

      const results: any[] = [];
      const seen = new Set<string>();

      // Filter from static global index
      for (const item of GLOBAL_INDEX) {
        if (domain && domain !== 'all') {
          const isActivityMatch = (domain === 'things-to-do' || domain === 'activities') && (item.domain === 'activities' || item.domain === 'things-to-do');
          const isCityShared = item.type === 'city';
          if (item.domain !== domain && !isActivityMatch && !isCityShared) {
            continue;
          }
        }
        if (!q) {
          results.push(item);
          seen.add(item.title);
          if (results.length >= 8) break;
          continue;
        }
        const matches =
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          (item.code && item.code.toLowerCase().includes(q));
        if (matches && !seen.has(item.title)) {
          let itemCopy = { ...item };
          if (domain === 'cars' && item.type === 'city') {
            const cityName = item.title.split(' ')[0];
            itemCopy.target_url = `/cars/list?city=${encodeURIComponent(cityName)}`;
            itemCopy.count_info = '렌터카 비교';
            itemCopy.domain = 'cars';
          } else if (domain === 'packages' && item.type === 'city') {
            const cityName = item.title.split(' ')[0];
            itemCopy.target_url = `/packages/list?city=${encodeURIComponent(cityName)}`;
            itemCopy.count_info = '패키지 특가';
            itemCopy.domain = 'packages';
          }
          results.push(itemCopy);
          seen.add(item.title);
          if (results.length >= 8) break;
        }
      }

      // Query D1 database dynamically for hotels matching keyword
      if (q && (domain === 'hotels' || domain === 'all' || !domain)) {
        try {
          const hotelHits = await env.DB.prepare(
            "SELECT id, name_ko, name_en, city, star_rating, review_score, base_price_krw FROM hotels WHERE name_ko LIKE ? OR name_en LIKE ? OR city LIKE ? LIMIT 6"
          ).bind(`%${q}%`, `%${q}%`, `%${q}%`).all();

          for (const h of (hotelHits.results || []) as any[]) {
            if (!seen.has(h.name_ko)) {
              results.push({
                id: h.id,
                title: h.name_ko,
                subtitle: `${h.city} · ${h.star_rating}성급 호텔 (평점 ${h.review_score})`,
                type: 'hotel',
                badge: `${h.star_rating}성급`,
                count_info: `₩${Number(h.base_price_krw).toLocaleString()}`,
                target_url: `/hotels/detail/${h.id}`,
                domain: 'hotels'
              });
              seen.add(h.name_ko);
            }
          }
        } catch (e) {}
      }

      // Query D1 database dynamically for activities matching keyword
      if (q && (domain === 'activities' || domain === 'things-to-do' || domain === 'all' || !domain)) {
        try {
          const actHits = await env.DB.prepare(
            "SELECT id, title, category, city, price_krw FROM activities WHERE title LIKE ? OR city LIKE ? LIMIT 4"
          ).bind(`%${q}%`, `%${q}%`).all();

          for (const a of (actHits.results || []) as any[]) {
            if (!seen.has(a.title)) {
              results.push({
                id: a.id,
                title: a.title,
                subtitle: `${a.city} · ${a.category}`,
                type: 'activity',
                badge: '투어/티켓',
                count_info: `₩${Number(a.price_krw).toLocaleString()}`,
                target_url: `/things-to-do/detail/${a.id}`,
                domain: 'activities'
              });
              seen.add(a.title);
            }
          }
        } catch (e) {}
      }

      // Query D1 database dynamically for flights matching keyword
      if (q && (domain === 'flights' || domain === 'all' || !domain)) {
        try {
          const flightHits = await env.DB.prepare(
            "SELECT id, flight_number, airline_name, departure_airport, arrival_airport, departure_city, arrival_city, base_price_krw FROM flights WHERE flight_number LIKE ? OR airline_name LIKE ? OR departure_city LIKE ? OR arrival_city LIKE ? OR departure_airport LIKE ? OR arrival_airport LIKE ? LIMIT 4"
          ).bind(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`).all();

          for (const f of (flightHits.results || []) as any[]) {
            const label = `${f.airline_name} ${f.flight_number} (${f.departure_airport}→${f.arrival_airport})`;
            if (!seen.has(label)) {
              results.push({
                id: f.id,
                title: label,
                subtitle: `${f.departure_city} → ${f.arrival_city}`,
                code: f.arrival_airport,
                type: 'airport',
                badge: '운항편',
                count_info: `₩${Number(f.base_price_krw).toLocaleString()}`,
                target_url: `/flights/search?origin=${f.departure_airport}&dest=${f.arrival_airport}`,
                domain: 'flights'
              });
              seen.add(label);
            }
          }
        } catch (e) {}
      }

      // Query D1 database dynamically for trains matching keyword
      if (q && (domain === 'trains' || domain === 'all' || !domain)) {
        try {
          const trainHits = await env.DB.prepare(
            "SELECT id, train_number, train_type, departure_station, arrival_station, price_krw FROM trains WHERE train_number LIKE ? OR train_type LIKE ? OR departure_station LIKE ? OR arrival_station LIKE ? LIMIT 4"
          ).bind(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`).all();

          for (const t of (trainHits.results || []) as any[]) {
            const label = `${t.train_type} ${t.train_number} (${t.departure_station}→${t.arrival_station})`;
            if (!seen.has(label)) {
              results.push({
                id: t.id,
                title: label,
                subtitle: `${t.departure_station} → ${t.arrival_station}`,
                code: t.train_type,
                type: 'station',
                badge: '고속열차',
                count_info: `₩${Number(t.price_krw).toLocaleString()}`,
                target_url: `/trains/search?dep=${encodeURIComponent(t.departure_station)}&arr=${encodeURIComponent(t.arrival_station)}`,
                domain: 'trains'
              });
              seen.add(label);
            }
          }
        } catch (e) {}
      }

      // Query D1 database dynamically for cars matching keyword
      if (q && (domain === 'cars' || domain === 'all' || !domain)) {
        try {
          const carHits = await env.DB.prepare(
            "SELECT id, company_name, vehicle_model, vehicle_type, daily_price_krw, pickup_location FROM cars WHERE company_name LIKE ? OR vehicle_model LIKE ? OR pickup_location LIKE ? LIMIT 4"
          ).bind(`%${q}%`, `%${q}%`, `%${q}%`).all();

          for (const c of (carHits.results || []) as any[]) {
            const label = `${c.company_name} - ${c.vehicle_model}`;
            if (!seen.has(label)) {
              results.push({
                id: c.id,
                title: label,
                subtitle: `${c.pickup_location} · ${c.vehicle_type}`,
                type: 'car',
                badge: '렌터카',
                count_info: `₩${Number(c.daily_price_krw).toLocaleString()}/일`,
                target_url: `/cars/detail/${c.id}`,
                domain: 'cars'
              });
              seen.add(label);
            }
          }
        } catch (e) {}
      }

      // Query D1 database dynamically for packages matching keyword
      if (q && (domain === 'packages' || domain === 'all' || !domain)) {
        try {
          const pkgHits = await env.DB.prepare(
            "SELECT id, title, destination_city, total_package_krw FROM packages WHERE title LIKE ? OR destination_city LIKE ? LIMIT 4"
          ).bind(`%${q}%`, `%${q}%`).all();

          for (const p of (pkgHits.results || []) as any[]) {
            if (!seen.has(p.title)) {
              results.push({
                id: p.id,
                title: p.title,
                subtitle: `${p.destination_city} 항공+호텔 패키지`,
                type: 'package',
                badge: '패키지',
                count_info: `₩${Number(p.total_package_krw).toLocaleString()}`,
                target_url: `/packages/detail/${p.id}`,
                domain: 'packages'
              });
              seen.add(p.title);
            }
          }
        } catch (e) {}
      }

      return json({ success: true, count: results.length, data: results.slice(0, 10) });
    }

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
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);

      let q = "SELECT * FROM hotels WHERE 1=1";
      const p: any[] = [];
      if (city) {
        q += " AND (city LIKE ? OR name_ko LIKE ? OR name_en LIKE ? OR neighborhood LIKE ?)";
        p.push(`%${city}%`, `%${city}%`, `%${city}%`, `%${city}%`);
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
        q += " ORDER BY review_score DESC, review_count DESC";
      } else if (sortBy === "star_desc") {
        q += " ORDER BY star_rating DESC, review_score DESC";
      } else {
        q += " ORDER BY review_score DESC, star_rating DESC";
      }
      q += ` LIMIT ${Math.min(limit, 100)}`;

      const res = await env.DB.prepare(q).bind(...p).all();
      const formatted = (res.results || []).map(formatHotel);
      const annotated = annotate(formatted, bmap, "ptn_htl_01");
      return json({ success: true, count: annotated.length, data: annotated });
    }
    if (path.startsWith("/api/v1/hotels/")) {
      const id = path.replace("/api/v1/hotels/", "");
      const row = await env.DB.prepare("SELECT * FROM hotels WHERE id = ?").bind(id).first();
      if (!row) return json({ success: false, error: "Hotel not found", code: "NOT_FOUND" }, 404);
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
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);

      let q = "SELECT * FROM flights WHERE 1=1";
      const p: any[] = [];
      if (originCode || cleanOrigin) {
        q += " AND (departure_airport = ? OR departure_airport LIKE ? OR departure_city LIKE ? OR ? LIKE '%' || departure_city || '%')";
        p.push(originCode || cleanOrigin, `%${originCode || cleanOrigin}%`, `%${cleanOrigin}%`, cleanOrigin);
      }
      if (destCode || cleanDest) {
        q += " AND (arrival_airport = ? OR arrival_airport LIKE ? OR arrival_city LIKE ? OR ? LIKE '%' || arrival_city || '%')";
        p.push(destCode || cleanDest, `%${destCode || cleanDest}%`, `%${cleanDest}%`, cleanDest);
      }
      if (stops !== null && stops !== undefined && stops !== "") {
        q += " AND stops = ?";
        p.push(parseInt(stops, 10));
      }
      if (airline) {
        q += " AND (airline_name LIKE ? OR airline_code LIKE ?)";
        p.push(`%${airline}%`, `%${airline}%`);
      }
      if (timeSlot && timeSlot !== "ALL") {
        q += " AND departure_time_slot = ?";
        p.push(timeSlot.toUpperCase());
      }
      if (cabinClass && cabinClass !== "ALL") {
        q += " AND cabin_class LIKE ?";
        p.push(`%${cabinClass}%`);
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
      { const rows = annotate(res.results || [], bmap, "ptn_flt_01"); return json({ success: true, count: rows.length, data: rows }); }
    }
    if (path.startsWith("/api/v1/flights/")) {
      const id = path.replace("/api/v1/flights/", "");
      const row = await env.DB.prepare("SELECT * FROM flights WHERE id = ?").bind(id).first();
      if (!row) return json({ success: false, error: "not found", code: "NOT_FOUND" }, 404);
      return json({ success: true, data: annotate([row], bmap, "ptn_flt_01")[0] });
    }

    if (path === "/api/v1/trains") {
      const rawDep = url.searchParams.get("dep") || url.searchParams.get("departure_station") || "";
      const rawArr = url.searchParams.get("arr") || url.searchParams.get("arrival_station") || "";
      const trainType = url.searchParams.get("trainType") || "";
      const sortBy = url.searchParams.get("sortBy") || "departure_asc";

      const cleanStation = (val: string) => val.replace(/\s*\([^)]*\)/g, "").trim();
      const dep = cleanStation(rawDep);
      const arr = cleanStation(rawArr);

      let q = "SELECT * FROM trains WHERE 1=1";
      const p: any[] = [];
      if (dep) {
        q += " AND (departure_station LIKE ? OR ? LIKE '%' || departure_station || '%')";
        p.push(`%${dep}%`, dep);
      }
      if (arr) {
        q += " AND (arrival_station LIKE ? OR ? LIKE '%' || arrival_station || '%')";
        p.push(`%${arr}%`, arr);
      }
      if (trainType && trainType !== "ALL") {
        q += " AND train_type LIKE ?";
        p.push(`%${trainType}%`);
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
      if (!row) return json({ success: false, error: "not found", code: "NOT_FOUND" }, 404);
      return json({ success: true, data: annotate([row], bmap, "unassigned_train")[0] });
    }

    if (path === "/api/v1/cars") {
      const city = url.searchParams.get("city") || "";
      const loc = url.searchParams.get("loc") || url.searchParams.get("location") || city;
      const vehicleType = url.searchParams.get("vehicleType") || "";
      const transmission = url.searchParams.get("transmission") || "";
      const sortBy = url.searchParams.get("sortBy") || "price_asc";

      let q = "SELECT * FROM cars WHERE 1=1";
      const p: any[] = [];
      if (loc) {
        q += " AND (pickup_location LIKE ? OR company_name LIKE ? OR vehicle_model LIKE ?)";
        p.push(`%${loc}%`, `%${loc}%`, `%${loc}%`);
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
      const row = await env.DB.prepare("SELECT * FROM cars WHERE id = ?").bind(id).first();
      if (!row) return json({ success: false, error: "not found", code: "NOT_FOUND" }, 404);
      return json({ success: true, data: annotate([row], bmap, "ptn_car_01")[0] });
    }

    if (path === "/api/v1/transfers") {
      const rawAirport = url.searchParams.get("airport") || "";
      const rawDest = url.searchParams.get("destination") || url.searchParams.get("dest") || "";
      const airportMatch = rawAirport.match(/\b([A-Z]{3})\b/);
      const airportCode = airportMatch ? airportMatch[1] : "";
      const cleanAirport = rawAirport.replace(/\s*\([^)]*\)/g, "").trim();
      const cleanDest = rawDest.replace(/\s*\([^)]*\)/g, "").trim();

      let q = "SELECT * FROM transfers WHERE 1=1";
      const p: any[] = [];
      if (airportCode || cleanAirport) {
        q += " AND (airport_code = ? OR airport_code LIKE ? OR service_title LIKE ?)";
        p.push(airportCode || cleanAirport, `%${airportCode || cleanAirport}%`, `%${cleanAirport}%`);
      }
      if (cleanDest) {
        q += " AND (destination_area LIKE ? OR service_title LIKE ?)";
        p.push(`%${cleanDest}%`, `%${cleanDest}%`);
      }
      q += " LIMIT 50";
      const res = await env.DB.prepare(q).bind(...p).all();
      { const rows = annotate(res.results || [], bmap, "unassigned_transfer"); return json({ success: true, count: rows.length, data: rows }); }
    }
    if (path.startsWith("/api/v1/transfers/")) {
      const id = path.replace("/api/v1/transfers/", "");
      const row = await env.DB.prepare("SELECT * FROM transfers WHERE id = ?").bind(id).first();
      if (!row) return json({ success: false, error: "not found", code: "NOT_FOUND" }, 404);
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

      let q = "SELECT * FROM activities WHERE 1=1";
      const p: any[] = [];
      if (qKeyword) {
        q += " AND (title LIKE ? OR description LIKE ? OR city LIKE ?)";
        p.push(`%${qKeyword}%`, `%${qKeyword}%`, `%${qKeyword}%`);
      }
      if (city) {
        q += " AND (city LIKE ? OR title LIKE ? OR description LIKE ?)";
        p.push(`%${city}%`, `%${city}%`, `%${city}%`);
      }
      if (category && category !== "ALL") {
        q += " AND category = ?";
        p.push(category);
      }
      if (instantOnly) {
        q += " AND instant_confirmation = 1";
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
        q += " ORDER BY review_score DESC, review_count DESC";
      } else {
        q += " ORDER BY review_score DESC, review_count DESC";
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
    if (path.startsWith("/api/v1/activities/")) {
      const id = path.replace("/api/v1/activities/", "");
      const row = await env.DB.prepare("SELECT * FROM activities WHERE id = ?").bind(id).first();
      if (!row) return json({ success: false, error: "Activity not found", code: "NOT_FOUND" }, 404);
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
      let q = "SELECT * FROM packages WHERE 1=1";
      const p: any[] = [];
      if (dest) {
        q += " AND (destination_city LIKE ? OR title LIKE ?)";
        p.push(`%${dest}%`, `%${dest}%`);
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
      if (!row) return json({ success: false, error: "Package not found", code: "NOT_FOUND" }, 404);
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
  return null;
}

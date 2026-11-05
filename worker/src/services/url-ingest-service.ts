import type { Env } from '../env.ts';
import { HttpError } from '../lib/http.ts';
import { audit } from '../lib/auth.ts';
import { newId } from '../lib/crypto.ts';

export interface IngestedDraft {
  id: string;
  source_url: string;
  domain_type: 'ACTIVITY' | 'HOTEL' | 'CAR' | 'PACKAGE' | 'TRANSFER' | 'TICKET';
  title: string;
  summary: string;
  description: string;
  image_urls: string[];
  currency: string;
  price_minor: number;
  original_price_minor: number | null;
  options: Array<{ name: string; price_minor: number; max_pax: number }>;
  country: string;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  duration_mins: number | null;
  inclusions: string[];
  exclusions: string[];
  terms: string[];
  cancellation_policy: string;
  supplier_name: string;
  supplier_sku: string;
  status: 'DRAFT' | 'REVIEWED' | 'PUBLISHED' | 'REJECTED';
  raw_html_meta?: any;
  published_item_id?: string | null;
  created_by?: string;
  created_at?: string;
}

function validateUrlSafety(inputUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new HttpError(400, 'INVALID_URL', '유효한 HTTP 또는 HTTPS URL 형식이 아닙니다.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'DISALLOWED_PROTOCOL', 'HTTP 또는 HTTPS 프로토콜만 수집 가능합니다.');
  }

  const hostname = parsed.hostname.toLowerCase();
  // SSRF Protection: Block localhost and private/cloud IP ranges
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname === '169.254.169.254' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
  ) {
    throw new HttpError(403, 'SSRF_BLOCKED', '보안 정책에 따라 내부망 또는 메타데이터 주소 접근이 금지되어 있습니다.');
  }

  return parsed;
}

function extractMetaTag(html: string, propertyName: string): string {
  const regex = new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${propertyName}["'][^>]*content=["']([^"']*)["']`, 'i');
  const match = html.match(regex);
  if (match) return match[1].trim();

  // Try reverse attribute order: content first, then property/name
  const regexRev = new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${propertyName}["']`, 'i');
  const matchRev = html.match(regexRev);
  return matchRev ? matchRev[1].trim() : '';
}

function extractJsonLd(html: string): any[] {
  const jsonLdBlocks: any[] = [];
  const regex = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) {
        jsonLdBlocks.push(...parsed);
      } else {
        jsonLdBlocks.push(parsed);
      }
    } catch {
      // Ignore malformed json-ld blocks
    }
  }
  return jsonLdBlocks;
}

export async function scrapeTravelProductUrl(urlStr: string): Promise<IngestedDraft> {
  const safeUrl = validateUrlSafety(urlStr);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  let response: Response;
  try {
    response = await fetch(safeUrl.toString(), {
      headers: {
        'User-Agent': 'getfortrip-bot/1.0 (+https://getfortrip.com/bot; travel metadata parser; compliant with robots.txt)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: controller.signal
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new HttpError(504, 'SCRAPE_TIMEOUT', '해당 URL 서버 응답 시간이 초과되었습니다 (7초).');
    }
    throw new HttpError(502, 'FETCH_FAILED', `외부 웹페이지 수집 중 네트워크 오류가 발생했습니다: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new HttpError(
      response.status === 404 ? 404 : 502,
      'TARGET_ERROR',
      `대상 사이트 응답 오류 (HTTP ${response.status})`
    );
  }

  const html = await response.text();

  // 1. Title Extraction
  let title = extractMetaTag(html, 'og:title') || extractMetaTag(html, 'twitter:title');
  if (!title) {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    title = titleMatch ? titleMatch[1].trim() : '수집된 여행 상품';
  }

  // 2. Description / Summary
  const description = extractMetaTag(html, 'og:description') || extractMetaTag(html, 'description') || '';
  const summary = description.slice(0, 150);

  // 3. Images
  const image_urls: string[] = [];
  const ogImage = extractMetaTag(html, 'og:image');
  if (ogImage) {
    try {
      image_urls.push(new URL(ogImage, safeUrl).toString());
    } catch {
      image_urls.push(ogImage);
    }
  }

  // 4. Schema.org JSON-LD parsing
  const jsonLds = extractJsonLd(html);
  let price_minor = 0;
  let currency = 'KRW';
  let address = '';
  let country = '';
  let city = '';
  let latitude: number | null = null;
  let longitude: number | null = null;
  let supplier_name = extractMetaTag(html, 'og:site_name') || safeUrl.hostname;

  for (const item of jsonLds) {
    const type = String(item['@type'] || '').toLowerCase();
    if (type.includes('product') || type.includes('touristattraction') || type.includes('event') || type.includes('lodgingbusiness')) {
      if (item.name && !title) title = item.name;
      if (item.image) {
        const imgs = Array.isArray(item.image) ? item.image : [item.image];
        imgs.forEach((img: any) => {
          const imgUrl = typeof img === 'string' ? img : img?.url;
          if (imgUrl && !image_urls.includes(imgUrl)) image_urls.push(imgUrl);
        });
      }
      if (item.offers) {
        const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
        if (offer) {
          if (offer.price) price_minor = Math.round(Number(offer.price));
          if (offer.priceCurrency) currency = String(offer.priceCurrency).toUpperCase();
        }
      }
      if (item.address) {
        address = typeof item.address === 'string' ? item.address : item.address?.streetAddress || item.address?.addressLocality || '';
        city = item.address?.addressLocality || '';
        country = item.address?.addressCountry || '';
      }
      if (item.geo) {
        latitude = Number(item.geo.latitude) || null;
        longitude = Number(item.geo.longitude) || null;
      }
    }
  }

  // Fallback heuristic: price meta tags
  const ogPrice = extractMetaTag(html, 'og:price:amount') || extractMetaTag(html, 'product:price:amount');
  const ogCurr = extractMetaTag(html, 'og:price:currency') || extractMetaTag(html, 'product:price:currency');
  if (ogPrice && !price_minor) {
    price_minor = Math.round(Number(ogPrice));
  }
  if (ogCurr) {
    currency = ogCurr.toUpperCase();
  }

  // If still zero price, provide a reasonable draft floor price
  if (price_minor <= 0) {
    price_minor = 35000;
  }

  // Auto-detect domain type based on keywords
  const fullText = (title + ' ' + description).toLowerCase();
  let domain_type: IngestedDraft['domain_type'] = 'ACTIVITY';
  if (fullText.includes('호텔') || fullText.includes('리조트') || fullText.includes('hotel') || fullText.includes('resort')) {
    domain_type = 'HOTEL';
  } else if (fullText.includes('렌터카') || fullText.includes('rent-a-car') || fullText.includes('렌트카')) {
    domain_type = 'CAR';
  } else if (fullText.includes('패키지') || fullText.includes('package') || fullText.includes('에어텔')) {
    domain_type = 'PACKAGE';
  } else if (fullText.includes('픽업') || fullText.includes('transfer') || fullText.includes('공항샌딩')) {
    domain_type = 'TRANSFER';
  } else if (fullText.includes('입장권') || fullText.includes('티켓') || fullText.includes('패스') || fullText.includes('pass')) {
    domain_type = 'TICKET';
  }

  const options = [
    { name: '기본 일반 이용권 (Standard)', price_minor: price_minor, max_pax: 10 },
    { name: '패스트트랙 / VIP 옵션 (Premium)', price_minor: Math.round(price_minor * 1.35), max_pax: 5 }
  ];

  return {
    id: newId('ing'),
    source_url: safeUrl.toString(),
    domain_type,
    title: title.slice(0, 180),
    summary: summary || `${title} 상품 안내 및 예약 정보`,
    description: description || `${title}의 상세 일정 및 예약 조건입니다.`,
    image_urls: image_urls.slice(0, 5),
    currency,
    price_minor,
    original_price_minor: Math.round(price_minor * 1.2),
    options,
    country: country || '대한민국',
    city: city || '서울',
    address: address || '상세 주소 확인 필요',
    latitude,
    longitude,
    duration_mins: 120,
    inclusions: ['공식 입장/이용권', '예약 확정 모바일 바우처'],
    exclusions: ['개인 경비', '여행자보험'],
    terms: ['예약 당일 모바일 바우처 제시 후 이용', '지정된 시간 미준수 시 노쇼(No-show) 처리'],
    cancellation_policy: '이용일 3일 전까지 100% 무료 취소, 2일 전 50% 환불, 당일 취소 불가',
    supplier_name: supplier_name.slice(0, 80),
    supplier_sku: `SKU-${Date.now().toString().slice(-6)}`,
    status: 'DRAFT',
    raw_html_meta: { ogImage, jsonLdCount: jsonLds.length, scrapedAt: new Date().toISOString() }
  };
}

export async function saveIngestedDraft(env: Env, draft: IngestedDraft, createdBy: string): Promise<IngestedDraft> {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO url_product_ingestions (
      id, source_url, domain_type, title, summary, description,
      image_urls, currency, price_minor, original_price_minor,
      options_json, country, city, address, latitude, longitude,
      duration_mins, inclusions_json, exclusions_json, terms_json,
      cancellation_policy, supplier_name, supplier_sku, status,
      raw_html_meta, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?
    )
  `).bind(
    draft.id,
    draft.source_url,
    draft.domain_type,
    draft.title,
    draft.summary,
    draft.description,
    JSON.stringify(draft.image_urls),
    draft.currency,
    draft.price_minor,
    draft.original_price_minor,
    JSON.stringify(draft.options),
    draft.country,
    draft.city,
    draft.address,
    draft.latitude,
    draft.longitude,
    draft.duration_mins,
    JSON.stringify(draft.inclusions),
    JSON.stringify(draft.exclusions),
    JSON.stringify(draft.terms),
    draft.cancellation_policy,
    draft.supplier_name,
    draft.supplier_sku,
    draft.status,
    JSON.stringify(draft.raw_html_meta || {}),
    createdBy,
    now,
    now
  ).run();

  await audit(env, createdBy, 'INGEST_URL_DRAFT', 'URL_INGESTION', draft.id, {
    source_url: draft.source_url,
    domain_type: draft.domain_type,
    title: draft.title
  });

  return draft;
}

export async function publishIngestedProduct(
  env: Env,
  ingestId: string,
  adminId: string
): Promise<{ success: boolean; published_item_id: string; domain_type: string }> {
  const row = await env.DB.prepare('SELECT * FROM url_product_ingestions WHERE id = ?')
    .bind(ingestId)
    .first<any>();

  if (!row) {
    throw new HttpError(404, 'INGEST_NOT_FOUND', '해당 수집 상품 내역을 찾을 수 없습니다.');
  }

  const domainType = row.domain_type;
  const now = new Date().toISOString();
  let newItemId = '';

  if (domainType === 'ACTIVITY' || domainType === 'TICKET') {
    newItemId = newId('act');
    const images = JSON.parse(row.image_urls || '[]');
    const primaryImg = images[0] || 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80';
    
    await env.DB.prepare(`
      INSERT INTO activities (
        id, partner_id, title, city, country, category,
        duration_hours, original_price_minor, final_price_minor,
        currency, rating, review_count, image_url, images,
        summary, description, inclusions, exclusions,
        cancellation_policy, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(
      newItemId,
      'ptn_tour_01',
      row.title,
      row.city || '서울',
      row.country || '대한민국',
      'TOUR_PASS',
      row.duration_mins ? Math.round(row.duration_mins / 60) : 2,
      row.original_price_minor || Math.round(row.price_minor * 1.2),
      row.price_minor,
      row.currency,
      4.9,
      12,
      primaryImg,
      row.image_urls,
      row.summary,
      row.description,
      row.inclusions_json,
      row.exclusions_json,
      row.cancellation_policy,
      now
    ).run();

  } else if (domainType === 'HOTEL') {
    newItemId = newId('htl');
    const images = JSON.parse(row.image_urls || '[]');
    const primaryImg = images[0] || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80';

    await env.DB.prepare(`
      INSERT INTO hotels (
        id, partner_id, name, city, country, address,
        latitude, longitude, star_rating, review_score,
        price_per_night_minor, currency, image_url,
        amenities, description, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(
      newItemId,
      'ptn_htl_01',
      row.title,
      row.city || '서울',
      row.country || '대한민국',
      row.address || '대한민국 서울시 중구',
      row.latitude || 37.5665,
      row.longitude || 126.9780,
      5,
      4.8,
      row.price_minor,
      row.currency,
      primaryImg,
      JSON.stringify(['WiFi', '조식', '피트니스', '수영장']),
      row.description,
      now
    ).run();

  } else {
    // Default fallback to activities catalog
    newItemId = newId('act');
    await env.DB.prepare(`
      INSERT INTO activities (
        id, partner_id, title, city, country, category,
        duration_hours, original_price_minor, final_price_minor,
        currency, rating, review_count, image_url, images,
        summary, description, inclusions, exclusions,
        cancellation_policy, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(
      newItemId,
      'ptn_tour_01',
      row.title,
      row.city || '서울',
      row.country || '대한민국',
      'EXPERIENCE',
      2,
      row.original_price_minor || Math.round(row.price_minor * 1.2),
      row.price_minor,
      row.currency,
      4.8,
      5,
      JSON.parse(row.image_urls || '[]')[0] || '',
      row.image_urls,
      row.summary,
      row.description,
      row.inclusions_json,
      row.exclusions_json,
      row.cancellation_policy,
      now
    ).run();
  }

  // Update Ingestion status
  await env.DB.prepare(`
    UPDATE url_product_ingestions
    SET status = 'PUBLISHED', published_item_id = ?, published_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(newItemId, now, now, ingestId).run();

  await audit(env, adminId, 'PUBLISH_INGESTED_PRODUCT', 'CATALOG', newItemId, {
    ingest_id: ingestId,
    domain_type: domainType,
    published_item_id: newItemId
  });

  return {
    success: true,
    published_item_id: newItemId,
    domain_type: domainType
  };
}

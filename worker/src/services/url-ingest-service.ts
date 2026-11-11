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

export function validateUrlSafety(inputUrl: string, allowHosts: readonly string[] = []): URL {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new HttpError(400, 'INVALID_URL', '유효한 HTTP 또는 HTTPS URL 형식이 아닙니다.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'DISALLOWED_PROTOCOL', 'HTTP 또는 HTTPS 프로토콜만 수집 가능합니다.');
  }

  // WHATWG URL keeps IPv6 brackets in .hostname and callers may add a trailing dot: normalize both.
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  // SSRF Protection: Block localhost and private/cloud IP ranges.
  // Note: IPv4 written as decimal/octal/hex is normalized to dotted form by the URL parser,
  // so `10.`-style prefix checks below already cover those spellings.
  // WHATWG URL may serialize the mapped tail as hex (::ffff:7f00:1) instead of
  // dotted (::ffff:127.0.0.1): normalize both to a dotted quad for the checks.
  const unmapV4 = (host: string): string => {
    const m = host.match(/^::ffff:(.+)$/);
    if (!m) return host;
    const tail = m[1];
    if (tail.includes('.')) return tail;
    const parts = tail.split(':');
    if (parts.length !== 2) return host;
    const nums = parts.map((p) => parseInt(p, 16));
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff)) return host;
    return [(nums[0] >> 8) & 255, nums[0] & 255, (nums[1] >> 8) & 255, nums[1] & 255].join('.');
  };
  const v4mapped = unmapV4(hostname);
  // IPv6-only checks (hostnames like "fcbayern.com" must not trip the fc00::/7 rule).
  const isV6 = hostname.includes(':');
  // #57: 127/8 is all loopback — blocking only 127.0.0.1 left 127.0.0.2 etc.
  // open. Quad-gated so "127.example.com" never trips the rule.
  const isQuad = (h: string): boolean => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
  const isLoopbackV4 = (h: string): boolean => isQuad(h) && h.startsWith('127.');
  const blocked =
    hostname === 'localhost' ||
    isLoopbackV4(hostname) ||
    hostname === '0.0.0.0' ||
    hostname === '169.254.169.254' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
    // IPv6 loopback / unspecified / link-local / unique-local / documentation.
    (isV6 && (
      hostname === '::1' ||
      hostname === '::' ||
      hostname.startsWith('fe80:') ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('2001:db8:')
    )) ||
    // IPv4-mapped IPv6 forms of the blocked ranges above.
    v4mapped !== hostname && (
      isLoopbackV4(v4mapped) ||
      v4mapped === '0.0.0.0' ||
      v4mapped === '169.254.169.254' ||
      v4mapped.startsWith('10.') ||
      v4mapped.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(v4mapped)
    );
  // #57: explicit test-only bypass for the E2E fixture origin. The route only
  // passes entries in development/test (see ingestAllowHosts), so production
  // always evaluates with an empty list. Entry format is a bare lowercase
  // hostname; ports and IPv6 brackets never match.
  const allowed = allowHosts.some((h) => h === hostname || h === v4mapped);
  if (blocked && !allowed) {
    throw new HttpError(403, 'SSRF_BLOCKED', '보안 정책에 따라 내부망 또는 메타데이터 주소 접근이 금지되어 있습니다.');
  }

  return parsed;
}

/**
 * Hostnames the ingestion fetcher may scrape despite looking private.
 * Non-production only: production ignores INGEST_ALLOW_HOSTS entirely, so a
 * stray var can never open the SSRF guard where it matters.
 */
export function ingestAllowHosts(env: { APP_ENV?: string; INGEST_ALLOW_HOSTS?: string }): string[] {
  if (env.APP_ENV !== 'development' && env.APP_ENV !== 'test') return [];
  return String(env.INGEST_ALLOW_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9.-]+$/.test(h));
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
  // Cap blocks and payload: a hostile page must not blow up parse time or memory.
  let scanned = 0;
  while ((match = regex.exec(html)) !== null && scanned < 50 && jsonLdBlocks.length < 100) {
    scanned++;
    try {
      const raw = match[1].trim().slice(0, 200_000);
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        jsonLdBlocks.push(...parsed.slice(0, 100));
      } else {
        jsonLdBlocks.push(parsed);
      }
    } catch {
      // Ignore malformed json-ld blocks
    }
  }
  return jsonLdBlocks;
}

/** Keep only web-fetchable image URLs; drop data: blobs and absurd lengths. */
function cleanImageUrl(raw: string, base: URL): string | null {
  const s = String(raw || '').trim();
  if (!s || s.length > 2000 || s.startsWith('data:')) return null;
  try {
    const u = new URL(s, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

const MAX_SCRAPE_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export async function scrapeTravelProductUrl(urlStr: string, allowHosts: readonly string[] = []): Promise<IngestedDraft> {
  // Redirects are followed manually so every hop is re-validated: an external page
  // must never bounce the fetcher onto an internal address.
  let safeUrl = validateUrlSafety(urlStr, allowHosts);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  let response: Response;
  try {
    for (let hop = 0; ; hop++) {
      response = await fetch(safeUrl.toString(), {
        headers: {
          'User-Agent': 'getfortrip-bot/1.0 (+https://getfortrip.com/bot; travel metadata parser; compliant with robots.txt)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        signal: controller.signal,
        redirect: 'manual'
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      if (hop >= MAX_REDIRECTS) {
        throw new HttpError(502, 'TOO_MANY_REDIRECTS', '리다이렉트가 너무 많습니다 (최대 3회).');
      }
      const next = response.headers.get('location');
      if (!next) break;
      safeUrl = validateUrlSafety(new URL(next, safeUrl.toString()).toString(), allowHosts);
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err instanceof HttpError) throw err;
    if (err.name === 'AbortError') {
      throw new HttpError(504, 'SCRAPE_TIMEOUT', '해당 URL 서버 응답 시간이 초과되었습니다 (7초).');
    }
    throw new HttpError(502, 'FETCH_FAILED', `외부 웹페이지 수집 중 네트워크 오류가 발생했습니다: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response!.ok) {
    throw new HttpError(
      response!.status === 404 ? 404 : 502,
      'TARGET_ERROR',
      `대상 사이트 응답 오류 (HTTP ${response!.status})`
    );
  }

  const contentType = response!.headers.get('content-type') || '';
  if (contentType && !/(text\/html|application\/(xhtml\+xml|xml|ld\+json|json))/.test(contentType)) {
    throw new HttpError(415, 'NOT_HTML', 'HTML 문서가 아닌 URL은 수집할 수 없습니다.');
  }
  const declared = Number(response!.headers.get('content-length') || 0);
  if (declared > MAX_SCRAPE_BYTES) {
    throw new HttpError(502, 'PAGE_TOO_LARGE', '대상 페이지가 너무 큽니다 (최대 3MB).');
  }

  const html = (await response!.text()).slice(0, MAX_SCRAPE_BYTES);

  // 1. Title Extraction
  let title = extractMetaTag(html, 'og:title') || extractMetaTag(html, 'twitter:title');
  if (!title) {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    title = titleMatch ? titleMatch[1].trim() : '';
  }

  // 2. Description / Summary
  const description = (extractMetaTag(html, 'og:description') || extractMetaTag(html, 'description') || '').slice(0, 2000);
  const summary = description.slice(0, 150);

  // 3. Images
  const image_urls: string[] = [];
  const ogImage = extractMetaTag(html, 'og:image');
  if (ogImage) {
    const cleaned = cleanImageUrl(ogImage, safeUrl);
    if (cleaned) image_urls.push(cleaned);
  }

  // 4. Schema.org JSON-LD parsing
  const jsonLds = extractJsonLd(html);
  let sourcePrice = 0;
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
          const cleaned = cleanImageUrl(typeof img === 'string' ? img : img?.url, safeUrl);
          if (cleaned && !image_urls.includes(cleaned)) image_urls.push(cleaned);
        });
      }
      if (item.offers) {
        const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
        if (offer) {
          if (offer.price) sourcePrice = Number(offer.price);
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

  // Fallback: price meta tags
  const ogPrice = extractMetaTag(html, 'og:price:amount') || extractMetaTag(html, 'product:price:amount');
  const ogCurr = extractMetaTag(html, 'og:price:currency') || extractMetaTag(html, 'product:price:currency');
  if (ogPrice && !sourcePrice) sourcePrice = Number(ogPrice);
  if (ogCurr) currency = ogCurr.toUpperCase();

  // Only a KRW price can go straight into the catalogue (whole won). A foreign-currency price is kept in
  // raw_html_meta for the reviewer and the draft price stays 0 until a KRW price is entered by hand.
  const price_minor = currency === 'KRW' && Number.isFinite(sourcePrice) && sourcePrice > 0 ? Math.round(sourcePrice) : 0;

  // Domain is only a suggestion from keywords; the reviewer confirms it before publishing.
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

  // Everything below is what the page actually states. Unknown facts stay empty — never invented —
  // and publishIngestedProduct() refuses a draft until a reviewer fills the required ones.
  return {
    id: newId('ing'),
    source_url: safeUrl.toString(),
    domain_type,
    title: title.slice(0, 180),
    summary,
    description,
    image_urls: image_urls.slice(0, 5),
    currency: 'KRW',
    price_minor,
    original_price_minor: null,
    options: [],
    country,
    city,
    address,
    latitude,
    longitude,
    duration_mins: null,
    inclusions: [],
    exclusions: [],
    terms: [],
    cancellation_policy: '',
    supplier_name: supplier_name.slice(0, 80),
    supplier_sku: '',
    status: 'DRAFT',
    raw_html_meta: {
      ogImage,
      jsonLdCount: jsonLds.length,
      sourcePrice: Number.isFinite(sourcePrice) && sourcePrice > 0 ? sourcePrice : null,
      sourceCurrency: currency,
      scrapedAt: new Date().toISOString()
    }
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

/** Fields a reviewer must confirm before a scraped draft can become a sellable catalogue row. */
export function missingForPublish(row: any): string[] {
  const missing: string[] = [];
  if (!String(row.title || '').trim()) missing.push('title');
  if (!(Number(row.price_minor) > 0) || String(row.currency || 'KRW') !== 'KRW') missing.push('price_minor');
  if (!String(row.city || '').trim()) missing.push('city');
  if (!String(row.country || '').trim()) missing.push('country');
  if (!String(row.cancellation_policy || '').trim()) missing.push('cancellation_policy');
  if (row.domain_type === 'HOTEL' && !String(row.address || '').trim()) missing.push('address');
  return missing;
}

export const PUBLISHABLE_DOMAINS = ['ACTIVITY', 'TICKET', 'HOTEL'] as const;

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
  if (row.status === 'PUBLISHED' || row.published_item_id) {
    throw new HttpError(409, 'ALREADY_PUBLISHED', `이미 카탈로그에 등록된 상품입니다 (${row.published_item_id}).`);
  }
  if (row.status === 'REJECTED') {
    throw new HttpError(409, 'DRAFT_REJECTED', '반려된 수집 상품은 등록할 수 없습니다.');
  }
  const domainType = row.domain_type;
  if (!(PUBLISHABLE_DOMAINS as readonly string[]).includes(domainType)) {
    throw new HttpError(422, 'UNSUPPORTED_DOMAIN', '자동 등록은 투어·티켓·호텔만 지원합니다. 다른 상품군은 파트너 콘솔에서 등록해 주세요.');
  }
  const missing = missingForPublish(row);
  if (missing.length) {
    throw new HttpError(422, 'INCOMPLETE_DRAFT', '등록 전에 필수 정보를 확인해 주세요.', { missing });
  }

  const now = new Date().toISOString();
  const images: string[] = JSON.parse(row.image_urls || '[]');
  const thumbnail = images[0] || null;
  const description = row.description || row.summary || null;
  let newItemId = '';

  // Ratings, reviews, amenities, cancellation flags and coordinates are never invented: unknown values
  // stay NULL/empty and the product starts with no reviews. Free cancellation / instant confirmation stay
  // off until a supplier contract says otherwise; the reviewed policy text is kept on the ingestion row.
  if (domainType === 'HOTEL') {
    newItemId = newId('htl');
    await env.DB.prepare(`
      INSERT INTO hotels (
        id, partner_id, name_ko, name_en, city, country, address,
        latitude, longitude, star_rating, property_type, review_score, review_count,
        free_cancellation, free_breakfast, base_price_krw, thumbnail_url, images_json, amenities_json, rooms_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'HOTEL', NULL, 0, 0, 0, ?, ?, ?, '[]', '[]', ?)
    `).bind(
      newItemId, 'ptn_htl_01', row.title, row.title, row.city, row.country, row.address,
      row.latitude ?? null, row.longitude ?? null, Number(row.price_minor), thumbnail, row.image_urls || '[]', now
    ).run();
  } else {
    newItemId = newId('act');
    await env.DB.prepare(`
      INSERT INTO activities (
        id, partner_id, title, category, city, country, price_krw, review_score, review_count,
        instant_confirmation, free_cancellation, thumbnail_url, description, packages_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, 0, ?, ?, '[]', ?)
    `).bind(
      newItemId, 'ptn_tour_01', row.title, domainType === 'TICKET' ? 'TOUR_PASS' : 'EXPERIENCE',
      row.city, row.country, Number(row.price_minor), thumbnail, description, now
    ).run();
  }

  // Conditional on still being unpublished, so two concurrent publishes cannot both claim the draft.
  const claimed = await env.DB.prepare(`
    UPDATE url_product_ingestions
    SET status = 'PUBLISHED', published_item_id = ?, published_at = ?, updated_at = ?
    WHERE id = ? AND published_item_id IS NULL
  `).bind(newItemId, now, now, ingestId).run();
  if (!claimed.meta.changes) {
    await env.DB.prepare(domainType === 'HOTEL' ? 'DELETE FROM hotels WHERE id = ?' : 'DELETE FROM activities WHERE id = ?').bind(newItemId).run();
    throw new HttpError(409, 'ALREADY_PUBLISHED', '다른 요청이 먼저 이 상품을 등록했습니다.');
  }

  await audit(env, adminId, 'PUBLISH_INGESTED_PRODUCT', 'CATALOG', newItemId, {
    ingest_id: ingestId,
    domain_type: domainType,
    published_item_id: newItemId
  });

  return { success: true, published_item_id: newItemId, domain_type: domainType };
}

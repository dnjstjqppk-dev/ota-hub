import type { Env } from '../env.ts';
import { HttpError, json, readJson, str } from '../lib/http.ts';
import { rateLimit, requireAdmin, requirePartner } from '../lib/auth.ts';
import {
  scrapeTravelProductUrl,
  saveIngestedDraft,
  publishIngestedProduct,
  missingForPublish,
  ingestAllowHosts,
  PUBLISHABLE_DOMAINS
} from '../services/url-ingest-service.ts';
import { isFeatureEnabled } from '../services/feature-flag-service.ts';

export async function handleUrlIngest(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  // Verify feature flag: URL_PRODUCT_INGESTION
  if (path.startsWith('/api/v1/admin/ingest') || path.startsWith('/api/v1/partner/ingest')) {
    const isIngestEnabled = await isFeatureEnabled(env, 'URL_PRODUCT_INGESTION');
    if (!isIngestEnabled) {
      throw new HttpError(503, 'FEATURE_DISABLED', 'URL 상품 자동 수집 기능이 관리자에 의해 비활성화되어 있습니다.');
    }
  }

  // 1. Admin Scrape & Create Draft: POST /api/v1/admin/ingest/url
  if (path === '/api/v1/admin/ingest/url' && method === 'POST') {
    const admin = await requireAdmin(request, env);
    await rateLimit(request, env, 'ingest_scrape', 30, 60);
    const body = await readJson(request);
    const inputUrl = str(body.url, 2000);
    if (!inputUrl) {
      throw new HttpError(400, 'URL_REQUIRED', '수집할 여행 상품 URL을 입력해주세요.');
    }

    const draft = await scrapeTravelProductUrl(inputUrl, ingestAllowHosts(env));
    const saved = await saveIngestedDraft(env, draft, admin.id);

    // AUTO_PRODUCT_PUBLISH only publishes a draft that already carries every required fact.
    // Anything missing is reported so the reviewer fills it in; nothing is guessed.
    const isAutoPublish = await isFeatureEnabled(env, 'AUTO_PRODUCT_PUBLISH');
    const missing = missingForPublish(saved);
    const publishable = (PUBLISHABLE_DOMAINS as readonly string[]).includes(saved.domain_type);
    let publishResult = null;
    if (isAutoPublish && publishable && !missing.length) {
      publishResult = await publishIngestedProduct(env, saved.id, admin.id);
    }

    return json({
      success: true,
      draft: saved,
      missing,
      publishable,
      auto_published: !!publishResult,
      publish_result: publishResult
    }, 201);
  }

  // 2. Admin Ingestion History: GET /api/v1/admin/ingest/history
  if (path === '/api/v1/admin/ingest/history' && method === 'GET') {
    await requireAdmin(request, env);
    const status = url.searchParams.get('status');
    const domain = url.searchParams.get('domain');

    let sql = 'SELECT * FROM url_product_ingestions WHERE 1=1';
    const params: unknown[] = [];
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (domain) {
      sql += ' AND domain_type = ?';
      params.push(domain);
    }
    sql += ' ORDER BY created_at DESC LIMIT 50';

    const rows = await env.DB.prepare(sql).bind(...params).all();
    const items = (rows.results || []).map((r: any) => ({
      ...r,
      image_urls: JSON.parse(r.image_urls || '[]'),
      options: JSON.parse(r.options_json || '[]'),
      inclusions: JSON.parse(r.inclusions_json || '[]'),
      exclusions: JSON.parse(r.exclusions_json || '[]'),
      terms: JSON.parse(r.terms_json || '[]')
    }));

    return json({
      success: true,
      items
    });
  }

  // 3. Admin Get Single Ingestion Draft: GET /api/v1/admin/ingest/:id
  const getDraftMatch = path.match(/^\/api\/v1\/admin\/ingest\/([A-Za-z0-9_]+)$/);
  if (getDraftMatch && method === 'GET') {
    await requireAdmin(request, env);
    const id = getDraftMatch[1];
    const r = await env.DB.prepare('SELECT * FROM url_product_ingestions WHERE id = ?')
      .bind(id)
      .first<any>();

    if (!r) throw new HttpError(404, 'DRAFT_NOT_FOUND', '수집 내역을 찾을 수 없습니다.');

    return json({
      success: true,
      draft: {
        ...r,
        image_urls: JSON.parse(r.image_urls || '[]'),
        options: JSON.parse(r.options_json || '[]'),
        inclusions: JSON.parse(r.inclusions_json || '[]'),
        exclusions: JSON.parse(r.exclusions_json || '[]'),
        terms: JSON.parse(r.terms_json || '[]')
      }
    });
  }

  // 4. Admin Update Draft: PATCH /api/v1/admin/ingest/:id
  const updateDraftMatch = path.match(/^\/api\/v1\/admin\/ingest\/([A-Za-z0-9_]+)$/);
  if (updateDraftMatch && method === 'PATCH') {
    await requireAdmin(request, env);
    const id = updateDraftMatch[1];
    const b = await readJson(request);
    const cur = await env.DB.prepare('SELECT status FROM url_product_ingestions WHERE id = ?').bind(id).first<{ status: string }>();
    if (!cur) throw new HttpError(404, 'DRAFT_NOT_FOUND', '수집 내역을 찾을 수 없습니다.');
    if (cur.status === 'PUBLISHED') throw new HttpError(409, 'ALREADY_PUBLISHED', '이미 등록된 상품은 수정할 수 없습니다. 카탈로그에서 관리해 주세요.');
    const DOMAINS = ['ACTIVITY', 'HOTEL', 'CAR', 'PACKAGE', 'TRANSFER', 'TICKET'];
    if (b.domain_type !== undefined && !DOMAINS.includes(String(b.domain_type))) throw new HttpError(400, 'INVALID_DOMAIN', '지원하지 않는 상품군입니다.');
    if (b.status !== undefined && !['DRAFT', 'REVIEWED', 'REJECTED'].includes(String(b.status))) throw new HttpError(400, 'INVALID_STATUS', 'status는 DRAFT | REVIEWED | REJECTED 중 하나여야 합니다.');
    if (b.price_minor !== undefined && (!Number.isInteger(b.price_minor) || b.price_minor < 0 || b.price_minor > 100_000_000)) throw new HttpError(400, 'INVALID_PRICE', '가격은 0–1억 원 사이 정수여야 합니다.');

    const now = new Date().toISOString();
    await env.DB.prepare(`
      UPDATE url_product_ingestions SET
        title = COALESCE(?, title),
        summary = COALESCE(?, summary),
        description = COALESCE(?, description),
        price_minor = COALESCE(?, price_minor),
        domain_type = COALESCE(?, domain_type),
        city = COALESCE(?, city),
        country = COALESCE(?, country),
        address = COALESCE(?, address),
        currency = CASE WHEN CAST(? AS TEXT) IS NOT NULL THEN 'KRW' ELSE currency END,
        cancellation_policy = COALESCE(?, cancellation_policy),
        status = COALESCE(?, status),
        updated_at = ?
      WHERE id = ?
    `).bind(
      b.title ? str(b.title, 180) : null,
      b.summary ? str(b.summary, 300) : null,
      b.description ? str(b.description, 4000) : null,
      typeof b.price_minor === 'number' ? b.price_minor : null,
      b.domain_type || null,
      b.city ? str(b.city, 80) : null,
      b.country ? str(b.country, 80) : null,
      b.address ? str(b.address, 300) : null,
      typeof b.price_minor === 'number' ? b.price_minor : null,
      b.cancellation_policy ? str(b.cancellation_policy, 1000) : null,
      b.status || null,
      now,
      id
    ).run();

    return json({ success: true, message: '수집 상품 정보가 수정되었습니다.' });
  }

  // 5. Admin Publish Ingested Product: POST /api/v1/admin/ingest/:id/publish
  const publishMatch = path.match(/^\/api\/v1\/admin\/ingest\/([A-Za-z0-9_]+)\/publish$/);
  if (publishMatch && method === 'POST') {
    const admin = await requireAdmin(request, env);
    const id = publishMatch[1];
    const res = await publishIngestedProduct(env, id, admin.id);
    return json({
      success: true,
      message: '수집된 상품이 공식 카탈로그에 정상 등록되었습니다.',
      published_item_id: res.published_item_id,
      domain_type: res.domain_type
    });
  }

  // 5b. Partner drafts: partners read their OWN drafts only (#108). Admins
  // keep the full history/publish surface; cross-partner reads 404 (no oracle).
  if (path === '/api/v1/partner/ingest/drafts' && method === 'GET') {
    const partner = await requirePartner(request, env);
    const rows = await env.DB.prepare('SELECT * FROM url_product_ingestions WHERE created_by = ? ORDER BY created_at DESC LIMIT 50')
      .bind(`partner:${partner.id}`).all();
    return json({
      success: true,
      drafts: (rows.results || []).map((r: any) => ({
        ...r,
        image_urls: JSON.parse(r.image_urls || '[]'),
        options: JSON.parse(r.options_json || '[]'),
        inclusions: JSON.parse(r.inclusions_json || '[]'),
        exclusions: JSON.parse(r.exclusions_json || '[]'),
        terms: JSON.parse(r.terms_json || '[]')
      }))
    });
  }
  const partnerDraftMatch = path.match(/^\/api\/v1\/partner\/ingest\/([A-Za-z0-9_]+)$/);
  if (partnerDraftMatch && method === 'GET') {
    const partner = await requirePartner(request, env);
    const r = await env.DB.prepare('SELECT * FROM url_product_ingestions WHERE id = ? AND created_by = ?')
      .bind(partnerDraftMatch[1], `partner:${partner.id}`).first<any>();
    if (!r) throw new HttpError(404, 'DRAFT_NOT_FOUND', '수집 내역을 찾을 수 없습니다.');
    return json({
      success: true,
      draft: {
        ...r,
        image_urls: JSON.parse(r.image_urls || '[]'),
        options: JSON.parse(r.options_json || '[]'),
        inclusions: JSON.parse(r.inclusions_json || '[]'),
        exclusions: JSON.parse(r.exclusions_json || '[]'),
        terms: JSON.parse(r.terms_json || '[]')
      }
    });
  }

  // 6. Partner Ingest URL: POST /api/v1/partner/ingest/url
  if (path === '/api/v1/partner/ingest/url' && method === 'POST') {
    const partner = await requirePartner(request, env);
    // #50: the partner-facing switch was seeded but never consulted — the
    // admin switch alone gated both surfaces. Operators can now kill partner
    // ingestion without touching the admin pipeline.
    if (!(await isFeatureEnabled(env, 'PARTNER_URL_INGESTION'))) {
      throw new HttpError(503, 'FEATURE_DISABLED', '파트너 URL 상품 수집 기능이 관리자 설정에 의해 일시 중단되었습니다.');
    }
    await rateLimit(request, env, 'ingest_scrape', 30, 60);
    const body = await readJson(request);
    const inputUrl = str(body.url, 2000);
    if (!inputUrl) {
      throw new HttpError(400, 'URL_REQUIRED', '수집할 외부 상품 URL을 입력해주세요.');
    }

    const draft = await scrapeTravelProductUrl(inputUrl, ingestAllowHosts(env));
    draft.supplier_name = partner.companyName;
    const saved = await saveIngestedDraft(env, draft, `partner:${partner.id}`);

    return json({
      success: true,
      draft: saved,
      message: '외부 상품 정보가 성공적으로 수집되어 파트너 임시 등록 목록에 저장되었습니다.'
    }, 201);
  }

  return null;
}


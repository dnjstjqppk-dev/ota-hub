import type { Env } from '../env.ts';
import { HttpError, json, readJson, str } from '../lib/http.ts';
import { requireAdmin, requirePartner } from '../lib/auth.ts';
import {
  getMarketplaceFinancialSummary,
  getMarketplaceAttribution,
  type MerchantModel
} from '../services/marketplace-service.ts';
import { isFeatureEnabled } from '../services/feature-flag-service.ts';
import { newId } from '../lib/crypto.ts';

export async function handleMarketplace(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  // 1. Public / Client Catalog Model Query: GET /api/v1/marketplace/catalog
  if (path === '/api/v1/marketplace/catalog' && method === 'GET') {
    const model = url.searchParams.get('model'); // '1P', '3P', 'CONSIGNMENT'
    const domain = url.searchParams.get('domain');

    let sql = 'SELECT * FROM marketplace_catalog_items WHERE status = "ACTIVE"';
    const params: unknown[] = [];
    if (model) {
      sql += ' AND merchant_model = ?';
      params.push(model.toUpperCase());
    }
    if (domain) {
      sql += ' AND domain_type = ?';
      params.push(domain.toUpperCase());
    }
    sql += ' ORDER BY created_at DESC LIMIT 100';

    const rows = await env.DB.prepare(sql).bind(...params).all();
    return json({
      success: true,
      items: rows.results || []
    });
  }

  // 2. Admin Marketplace Financial Summary: GET /api/v1/admin/marketplace/summary
  if (path === '/api/v1/admin/marketplace/summary' && method === 'GET') {
    await requireAdmin(request, env);
    const summary = await getMarketplaceFinancialSummary(env);
    return json({
      success: true,
      summary
    });
  }

  // 3. Admin Vendor Settlements List: GET /api/v1/admin/marketplace/settlements
  if (path === '/api/v1/admin/marketplace/settlements' && method === 'GET') {
    await requireAdmin(request, env);
    const status = url.searchParams.get('status');
    const model = url.searchParams.get('model');

    let sql = 'SELECT * FROM marketplace_order_settlements WHERE 1=1';
    const params: unknown[] = [];
    if (status) {
      sql += ' AND settlement_status = ?';
      params.push(status.toUpperCase());
    }
    if (model) {
      sql += ' AND merchant_model = ?';
      params.push(model.toUpperCase());
    }
    sql += ' ORDER BY created_at DESC LIMIT 100';

    const rows = await env.DB.prepare(sql).bind(...params).all();
    return json({
      success: true,
      settlements: rows.results || []
    });
  }

  // 4. Admin Mark Settlement Payout: PATCH /api/v1/admin/marketplace/settlements/:id/settle
  const settleMatch = path.match(/^\/api\/v1\/admin\/marketplace\/settlements\/([A-Za-z0-9_]+)\/settle$/);
  if (settleMatch && method === 'PATCH') {
    const admin = await requireAdmin(request, env);
    const id = settleMatch[1];
    const now = new Date().toISOString();

    await env.DB.prepare(`
      UPDATE marketplace_order_settlements
      SET settlement_status = 'SETTLED', settled_at = ?
      WHERE id = ?
    `).bind(now, id).run();

    return json({
      success: true,
      message: '정산이 정상 지급 완료 처리되었습니다.',
      settled_at: now
    });
  }

  // 5. Partner Extranet Settlements: GET /api/v1/partner/marketplace/settlements
  if (path === '/api/v1/partner/marketplace/settlements' && method === 'GET') {
    const partner = await requirePartner(request, env);
    const rows = await env.DB.prepare(`
      SELECT * FROM marketplace_order_settlements
      WHERE seller_id = ?
      ORDER BY created_at DESC LIMIT 100
    `).bind(partner.id).all();

    return json({
      success: true,
      partner_id: partner.id,
      company_name: partner.company_name,
      settlements: rows.results || []
    });
  }

  // 6. Partner 3P Product Registration with Marketplace Attribution: POST /api/v1/partner/marketplace/products
  if (path === '/api/v1/partner/marketplace/products' && method === 'POST') {
    const partner = await requirePartner(request, env);

    // Feature Flag Guard: check PARTNER_SELF_PRODUCT_REGISTRATION
    const isSelfRegEnabled = await isFeatureEnabled(env, 'PARTNER_SELF_PRODUCT_REGISTRATION');
    if (!isSelfRegEnabled) {
      throw new HttpError(503, 'FEATURE_DISABLED', '파트너 자체 상품 등록 기능이 관리자 설정에 의해 일시 중단되었습니다.');
    }

    const b = await readJson(request);
    const title = str(b.title, 200);
    const domain = str(b.domain || 'ACTIVITY', 20).toUpperCase();
    const city = str(b.city || '서울', 100);
    const retailPrice = Math.max(1000, Number(b.price || 50000));
    const commissionBps = 1000; // 10% standard platform take-rate
    const sellerPayout = Math.round(retailPrice * 0.90);
    const platformMargin = retailPrice - sellerPayout;
    const now = new Date().toISOString();

    if (!title) throw new HttpError(400, 'TITLE_REQUIRED', '상품명을 입력해주세요.');

    // 1. Insert into domain specific table
    let newDomainItemId = '';
    if (domain === 'HOTEL') {
      newDomainItemId = newId('htl');
      await env.DB.prepare(`
        INSERT INTO hotels (id, partner_id, name_ko, name_en, city, country, address, base_price_krw, created_at)
        VALUES (?, ?, ?, ?, ?, '대한민국', '파트너 지정 주소', ?, ?)
      `).bind(newDomainItemId, partner.id, title, title, city, retailPrice, now).run();
    } else {
      newDomainItemId = newId('act');
      await env.DB.prepare(`
        INSERT INTO activities (id, partner_id, title, category, city, country, price_krw, description, created_at)
        VALUES (?, ?, ?, 'EXPERIENCE', ?, '대한민국', ?, ?, ?)
      `).bind(newDomainItemId, partner.id, title, city, retailPrice, `${title} - 파트너 직등록 상품`, now).run();
    }

    // 2. Insert into unified marketplace_catalog_items with 3P Partner Attribution
    const mktId = newId('mkt');
    await env.DB.prepare(`
      INSERT INTO marketplace_catalog_items (
        id, domain_type, item_id, merchant_model, supplier_id,
        registered_by, seller_id, seller_name, fulfillment_provider,
        supply_cost_minor, retail_price_minor, commission_rate_bps,
        seller_payout_minor, platform_margin_minor, refund_responsible_party, status, created_at
      ) VALUES (?, ?, ?, '3P', ?, ?, ?, ?, 'PARTNER', 0, ?, ?, ?, ?, 'PARTNER', 'ACTIVE', ?)
    `).bind(
      mktId,
      domain,
      newDomainItemId,
      `sup_${partner.id}`,
      `PARTNER:${partner.id}`,
      partner.id,
      partner.company_name,
      retailPrice,
      commissionBps,
      sellerPayout,
      platformMargin,
      now
    ).run();

    return json({
      success: true,
      message: '3P 마켓플레이스 공급 상품이 성공적으로 등록되었습니다.',
      product: {
        marketplace_id: mktId,
        item_id: newDomainItemId,
        domain_type: domain,
        merchant_model: '3P',
        seller_id: partner.id,
        seller_name: partner.company_name,
        retail_price_krw: retailPrice,
        commission_rate_bps: commissionBps,
        seller_payout_krw: sellerPayout
      }
    }, 201);
  }

  return null;
}


import type { Env } from '../env.ts';
import { HttpError, json, readJson, str } from '../lib/http.ts';
import { audit, requireAdmin, requirePartner } from '../lib/auth.ts';
import { getMarketplaceFinancialSummary } from '../services/marketplace-service.ts';
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

    const before = await env.DB.prepare('SELECT * FROM marketplace_order_settlements WHERE id = ?').bind(id).first<any>();
    if (!before) throw new HttpError(404, 'SETTLEMENT_NOT_FOUND', '정산 내역을 찾을 수 없습니다.');
    // Conditional update: a settlement is paid out at most once, and never after a refund.
    const r = await env.DB.prepare(`
      UPDATE marketplace_order_settlements
      SET settlement_status = 'SETTLED', settled_at = ?
      WHERE id = ? AND settlement_status IN ('PENDING', 'HELD')
    `).bind(now, id).run();
    if (!r.meta.changes) {
      throw new HttpError(409, 'SETTLEMENT_NOT_PAYABLE', `지급할 수 없는 정산 상태입니다. (${before.settlement_status})`);
    }
    // Roll partner-seller payouts into their open monthly batch so the partner
    // settlements endpoint (partner_settlement_batches) reflects reality (audit [M]).
    const seller = await env.DB.prepare('SELECT id FROM partners WHERE id = ?').bind(before.seller_id).first<any>();
    if (seller) {
      const ym = now.slice(0, 7);
      const y = Number(ym.slice(0, 4));
      const m = Number(ym.slice(5, 7));
      const batchId = `psb_${seller.id}_${ym}`;
      const periodEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO partner_settlement_batches (id, partner_id, period_start, period_end, status) VALUES (?, ?, ?, ?, 'CONFIRMED')`)
          .bind(batchId, seller.id, `${ym}-01`, periodEnd),
        env.DB.prepare(`UPDATE partner_settlement_batches SET gross_minor = gross_minor + ?, commission_minor = commission_minor + ?, payout_minor = payout_minor + ? WHERE id = ?`)
          .bind(Number(before.gross_amount_minor) || 0, Number(before.commission_amount_minor) || 0, Number(before.seller_payout_minor) || 0, batchId),
        env.DB.prepare(`UPDATE marketplace_order_settlements SET payout_batch_id = ? WHERE id = ?`).bind(batchId, id),
      ]);
    }
    await audit(env, admin.id, 'MARKETPLACE_SETTLEMENT_PAYOUT', 'SETTLEMENT', id, { from: before.settlement_status, to: 'SETTLED', settled_at: now });

    return json({
      success: true,
      message: '정산이 정상 지급 완료 처리되었습니다.',
      settled_at: now
    });
  }

  // 5. Partner Extranet Settlements: GET /api/v1/partner/marketplace/settlements
  if (path === '/api/v1/partner/marketplace/settlements' && method === 'GET') {
    const partner = await requirePartner(request, env);
    const pId = partner.partnerId || partner.id;
    const companyName = partner.companyName || 'GetForTrip 공인 파트너';
    const rows = await env.DB.prepare(`
      SELECT * FROM marketplace_order_settlements
      WHERE seller_id = ?
      ORDER BY created_at DESC LIMIT 100
    `).bind(pId).all();

    return json({
      success: true,
      partner_id: pId,
      company_name: companyName,
      settlements: rows.results || []
    });
  }

  // 6. Partner 3P Product Registration with Marketplace Attribution: POST /api/v1/partner/marketplace/products
  if (path === '/api/v1/partner/marketplace/products' && method === 'POST') {
    const partner = await requirePartner(request, env);
    const pId = partner.partnerId || partner.id;
    const companyName = partner.companyName || 'GetForTrip 공인 파트너';

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
    // Daily sellable capacity. Unset (null) means the product cannot be quoted
    // until an operator configures it (P0 2026-11-10: capacity-less products
    // used to sell unlimited inventory).
    const capacity = b.capacity === undefined || b.capacity === null ? null : Number(b.capacity);
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0)) {
      throw new HttpError(400, 'INVALID_CAPACITY', 'capacity는 0 이상의 정수여야 합니다.');
    }
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
      `).bind(newDomainItemId, pId, title, title, city, retailPrice, now).run();
    } else {
      newDomainItemId = newId('act');
      await env.DB.prepare(`
        INSERT INTO activities (id, partner_id, title, category, city, country, price_krw, description, daily_capacity, created_at)
        VALUES (?, ?, ?, 'EXPERIENCE', ?, '대한민국', ?, ?, ?, ?)
      `).bind(newDomainItemId, pId, title, city, retailPrice, `${title} - 파트너 직등록 상품`, capacity, now).run();
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
      `sup_${pId}`,
      `PARTNER:${pId}`,
      pId,
      companyName,
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
        seller_id: pId,
        seller_name: companyName,
        retail_price_krw: retailPrice,
        commission_rate_bps: commissionBps,
        seller_payout_krw: sellerPayout
      }
    }, 201);
  }

  return null;
}


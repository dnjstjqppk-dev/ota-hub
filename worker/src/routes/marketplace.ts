import type { Env } from '../env.ts';
import { HttpError, json, readJson, str } from '../lib/http.ts';
import { audit, requireAdmin, requirePartner } from '../lib/auth.ts';
import { getMarketplaceFinancialSummary } from '../services/marketplace-service.ts';
import { isFeatureEnabled } from '../services/feature-flag-service.ts';
import { moneyLog, settlementPayoutStmts } from '../services/booking-service.ts';
import { parseRooms } from './partner.ts';
import { decryptPiiField, newId } from '../lib/crypto.ts';

interface RecoveryTake { claimId: string; take: number; left: number }

/**
 * #72: FIFO recovery takes over OPEN claims, capped at `budget`. Claims
 * already consumed (fully or partially) by this settlement are excluded, so
 * a repair re-plan never double-takes its own earlier bite.
 */
async function planRecoveryTakes(db: D1Database, sellerId: string, settlementId: string, budget: number): Promise<RecoveryTake[]> {
  const open = await db.prepare(
    "SELECT id, amount_minor FROM settlement_recoveries WHERE seller_id = ? AND status = 'OPEN' AND (applied_settlement_id IS NULL OR applied_settlement_id != ?) ORDER BY created_at",
  ).bind(sellerId, settlementId).all<any>();
  const takes: RecoveryTake[] = [];
  let remaining = budget;
  for (const c of open.results || []) {
    if (remaining <= 0) break;
    const take = Math.min(Number(c.amount_minor) || 0, remaining);
    if (take <= 0) continue;
    remaining -= take;
    takes.push({ claimId: c.id, take, left: (Number(c.amount_minor) || 0) - take });
  }
  return takes;
}

/**
 * #72: idempotent payout completion — journals, recovery takes, batch link
 * and rollup. Every step is safe to re-run: journals pre-check, recovery
 * updates are conditional (and partial takes now also trace
 * applied_settlement_id), the link is a plain SET, and the rollup recomputes
 * from linked rows instead of incrementing.
 *
 * Repair mode re-derives takes only when the recovery batch provably never
 * landed (no claim traces to this settlement — the batch is atomic, so a
 * trace means it completed). Money math always reuses the recorded deducted
 * total, never a recomputation. Corner accepted: takes re-planned after an
 * interleaved foreign settlement capped at the recorded total may attribute
 * to a different claim than the lost original plan; totals stay exact.
 */
async function completeSettlement(
  env: Env,
  row: any,
  o: { deducted: number; remaining: number; takes?: RecoveryTake[]; repair: boolean },
): Promise<void> {
  const db = env.DB;
  const id = row.id as string;
  const settledAt = String(row.settled_at || new Date().toISOString());

  let takes = o.takes;
  if (o.repair) {
    const traced = await db.prepare('SELECT 1 AS x FROM settlement_recoveries WHERE applied_settlement_id = ? LIMIT 1').bind(id).first();
    takes = traced ? [] : await planRecoveryTakes(db, row.seller_id, id, o.deducted);
  }
  // #17: journal the payout (Dr SUPPLIER_PAYABLE / Cr OPERATING_CASH +
  // recovery offset) exactly once — the pre-check makes re-runs no-ops.
  const gross = Number(row.seller_payout_minor) || 0;
  if (gross > 0) {
    const journaled = await db.prepare("SELECT 1 AS x FROM ledger_entries WHERE reference_id = ? AND event_type = 'SETTLEMENT_PAID_OUT' LIMIT 1").bind(id).first();
    if (!journaled) {
      const bctx = await db.prepare('SELECT id, entity_id, supplier_id, currency FROM bookings WHERE id = ?').bind(row.booking_id).first<any>();
      if (bctx) await db.batch(settlementPayoutStmts(db, bctx, id, gross, o.remaining));
    }
  }
  const recoveryStmts = (takes || []).map((t) => t.left <= 0
    ? db.prepare("UPDATE settlement_recoveries SET status = 'APPLIED', amount_minor = 0, applied_at = ?, applied_settlement_id = ? WHERE id = ? AND status = 'OPEN'").bind(settledAt, id, t.claimId)
    : db.prepare("UPDATE settlement_recoveries SET amount_minor = amount_minor - ?, applied_settlement_id = ? WHERE id = ? AND status = 'OPEN' AND (applied_settlement_id IS NULL OR applied_settlement_id != ?) AND amount_minor >= ?").bind(t.take, id, t.claimId, id, t.take));
  if (recoveryStmts.length) await db.batch(recoveryStmts);
  // Roll partner-seller payouts into their monthly batch so the partner
  // settlements endpoint (partner_settlement_batches) reflects reality. The
  // batch follows the SETTLED month (deterministic across repairs), and the
  // rollup recomputes from linked rows so re-runs converge instead of
  // double-counting.
  const seller = await db.prepare('SELECT id FROM partners WHERE id = ?').bind(row.seller_id).first<any>();
  if (seller) {
    const ymMatch = settledAt.slice(0, 7).match(/^\d{4}-\d{2}$/);
    const ym = ymMatch ? ymMatch[0] : new Date().toISOString().slice(0, 7);
    const y = Number(ym.slice(0, 4));
    const m = Number(ym.slice(5, 7));
    const batchId = `psb_${seller.id}_${ym}`;
    const periodEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO partner_settlement_batches (id, partner_id, period_start, period_end, status) VALUES (?, ?, ?, ?, \'CONFIRMED\')')
        .bind(batchId, seller.id, `${ym}-01`, periodEnd),
      db.prepare('UPDATE marketplace_order_settlements SET payout_batch_id = ? WHERE id = ?').bind(batchId, id),
      db.prepare(`UPDATE partner_settlement_batches SET
        gross_minor = (SELECT COALESCE(SUM(gross_amount_minor), 0) FROM marketplace_order_settlements WHERE payout_batch_id = ?),
        commission_minor = (SELECT COALESCE(SUM(commission_amount_minor), 0) FROM marketplace_order_settlements WHERE payout_batch_id = ?),
        payout_minor = (SELECT COALESCE(SUM(seller_payout_minor - COALESCE(recovery_deducted_minor, 0)), 0) FROM marketplace_order_settlements WHERE payout_batch_id = ?)
        WHERE id = ?`).bind(batchId, batchId, batchId, batchId),
    ]);
  }
}

/**
 * #72: repair a crash-orphaned SETTLED row (gate UPDATE landed, completion
 * batches did not). Returns the recorded payout on repair, null when the row
 * is already complete. Skips the tour/refund gates on purpose: the money
 * already moved, repair only completes the books and never pays again.
 */
async function repairSettlementIfIncomplete(env: Env, before: any): Promise<{ payout: Record<string, unknown> } | null> {
  const db = env.DB;
  const gross = Number(before.seller_payout_minor) || 0;
  const deducted = Math.min(gross, Math.max(0, Number(before.recovery_deducted_minor) || 0));
  const remaining = gross - deducted;
  const journaled = gross <= 0 || await db.prepare("SELECT 1 AS x FROM ledger_entries WHERE reference_id = ? AND event_type = 'SETTLEMENT_PAID_OUT' LIMIT 1").bind(before.id).first();
  const seller = await db.prepare('SELECT id FROM partners WHERE id = ?').bind(before.seller_id).first<any>();
  const batchOk = !seller || !!before.payout_batch_id;
  let recoveryOk = true;
  if (deducted > 0) {
    recoveryOk = !!(await db.prepare('SELECT 1 AS x FROM settlement_recoveries WHERE applied_settlement_id = ? LIMIT 1').bind(before.id).first());
  }
  if (journaled && batchOk && recoveryOk) return null;
  await completeSettlement(env, before, { deducted, remaining, repair: true });
  return { payout: { grossMinor: gross, recoveryDeductedMinor: deducted, netMinor: remaining, method: before.payout_method || 'MANUAL_TRANSFER', reference: before.payout_reference || null } };
}

export async function handleMarketplace(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  // 1. Public / Client Catalog Model Query: GET /api/v1/marketplace/catalog
  if (path === '/api/v1/marketplace/catalog' && method === 'GET') {
    const model = url.searchParams.get('model'); // '1P', '3P', 'CONSIGNMENT'
    const domain = url.searchParams.get('domain');

    // #36: public allowlist — supply cost, commission, payout, margin, and
    // sourcing internals (external_sku, source_url, registered_by) never leave
    // the server on the unauthenticated surface. Operator financials stay on
    // the authenticated admin summary/settlement endpoints.
    // #50: the three channel switches were seeded but never consulted. A
    // disabled channel is fail-closed on the public surface only — the admin
    // summary/settlement endpoints below keep full books regardless.
    const channelFlag: Record<string, string> = {
      '1P': 'MARKETPLACE_1P_DIRECT',
      '3P': 'MARKETPLACE_3P_PARTNER',
      'CONSIGNMENT': 'CONSIGNMENT_SALES',
    };
    const modelUp = model ? model.toUpperCase() : null;
    if (modelUp && channelFlag[modelUp] && !(await isFeatureEnabled(env, channelFlag[modelUp]))) {
      throw new HttpError(503, 'FEATURE_DISABLED', `${modelUp} 판매 채널이 운영 정책에 따라 일시 중단되었습니다.`);
    }
    let sql = 'SELECT id, domain_type, item_id, merchant_model, seller_id, seller_name, fulfillment_provider, retail_price_minor, refund_responsible_party, status, created_at, updated_at FROM marketplace_catalog_items WHERE status = "ACTIVE"';
    const params: unknown[] = [];
    if (!modelUp) {
      for (const [m, flag] of Object.entries(channelFlag)) {
        if (!(await isFeatureEnabled(env, flag))) {
          sql += ' AND merchant_model != ?';
          params.push(m);
        }
      }
    } else {
      sql += ' AND merchant_model = ?';
      params.push(modelUp);
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
    // #72: a SETTLED row with incomplete books (crash between the payout
    // batches) is repaired here instead of 409ing forever; a complete one
    // keeps the 409 exactly as before.
    if (before.settlement_status === 'SETTLED') {
      const repaired = await repairSettlementIfIncomplete(env, before);
      if (!repaired) {
        throw new HttpError(409, 'SETTLEMENT_NOT_PAYABLE', `지급할 수 없는 정산 상태입니다. (${before.settlement_status})`);
      }
      await audit(env, admin.id, 'MARKETPLACE_SETTLEMENT_REPAIR', 'SETTLEMENT', id, { settled_at: before.settled_at, payout: repaired.payout });
      moneyLog('settlement.repaired', { settlementId: id, bookingId: before.booking_id, ...repaired.payout });
      return json({
        success: true,
        repaired: true,
        message: '누락된 정산 기록(장부·배치·환수 차감)을 보정했습니다.',
        settled_at: before.settled_at,
        payout: repaired.payout,
      });
    }
    if (!['PENDING', 'HELD'].includes(before.settlement_status)) {
      throw new HttpError(409, 'SETTLEMENT_NOT_PAYABLE', `지급할 수 없는 정산 상태입니다. (${before.settlement_status})`);
    }
    // #79 finding: this endpoint records a bank transfer TO A SELLER. A 1P
    // row has no seller payout (the platform already holds the cash as the
    // merchant of record), so settling it would fabricate a transfer that can
    // never happen — and strand the never-relieved payable. Refuse honestly.
    if ((Number(before.seller_payout_minor) || 0) <= 0) {
      throw new HttpError(409, 'SETTLEMENT_NOTHING_TO_PAY', '판매자 지급액이 없는 정산(1P 자사 매출)은 지급 기록 대상이 아닙니다.');
    }
    // B2: no payout before the tour is over. The booking must be COMPLETED
    // with its service window fully past, and no refund may be in flight.
    const bk = await env.DB.prepare('SELECT status, service_end FROM bookings WHERE id = ?').bind(before.booking_id).first<any>();
    if (!bk || bk.status !== 'COMPLETED') {
      throw new HttpError(409, 'SETTLEMENT_TOUR_INCOMPLETE', `이용 완료되지 않은 예약의 정산금은 지급할 수 없습니다. (예약 상태: ${bk?.status || '없음'})`);
    }
    if (String(bk.service_end || '') >= now.slice(0, 10)) {
      throw new HttpError(409, 'SETTLEMENT_TOUR_INCOMPLETE', '서비스 종료일이 지나지 않은 예약의 정산금은 지급할 수 없습니다.');
    }
    const pendingRefund = await env.DB.prepare("SELECT id FROM refunds WHERE booking_id = ? AND status = 'PENDING' LIMIT 1").bind(before.booking_id).first<any>();
    if (pendingRefund) {
      throw new HttpError(409, 'SETTLEMENT_REFUND_PENDING', '환불 처리 중인 예약의 정산금은 지급할 수 없습니다.');
    }
    // B3: auto-deduct OPEN recovery claims (FIFO) from this payout. Takes are
    // planned up front because the gate UPDATE records the deducted total.
    const payout = Number(before.seller_payout_minor) || 0;
    const takes = await planRecoveryTakes(env.DB, before.seller_id, id, payout);
    const deducted = takes.reduce((n, t) => n + t.take, 0);
    const remaining = payout - deducted;
    // B4: payout evidence. SETTLED is a RECORDED bank transfer performed by
    // ops — there is no automatic transfer rail, and the response says so.
    const sbody = await readJson(request).catch(() => ({}));
    const payoutMethod = str((sbody as any).payoutMethod, 30) || 'MANUAL_TRANSFER';
    const payoutReference = str((sbody as any).payoutReference, 100) || null;
    // Conditional update: a settlement is paid out at most once, and never after a refund.
    const r = await env.DB.prepare(`
      UPDATE marketplace_order_settlements
      SET settlement_status = 'SETTLED', settled_at = ?, payout_method = ?, payout_reference = ?, recovery_deducted_minor = ?
      WHERE id = ? AND settlement_status IN ('PENDING', 'HELD')
    `).bind(now, payoutMethod, payoutReference, deducted, id).run();
    if (!r.meta.changes) {
      throw new HttpError(409, 'SETTLEMENT_NOT_PAYABLE', `지급할 수 없는 정산 상태입니다. (${before.settlement_status})`);
    }
    await completeSettlement(env, { ...before, settled_at: now, payout_method: payoutMethod, payout_reference: payoutReference, recovery_deducted_minor: deducted }, { deducted, remaining, takes, repair: false });
    moneyLog('settlement.paid', { settlementId: id, bookingId: before.booking_id, grossMinor: Number(before.seller_payout_minor) || 0, recoveryDeductedMinor: deducted, netMinor: remaining, method: payoutMethod });
    await audit(env, admin.id, 'MARKETPLACE_SETTLEMENT_PAYOUT', 'SETTLEMENT', id, { from: before.settlement_status, to: 'SETTLED', settled_at: now, payoutMethod, payoutReference, grossMinor: before.seller_payout_minor, recoveryDeductedMinor: deducted, netMinor: remaining });

    return json({
      success: true,
      repaired: false,
      message: deducted > 0
        ? `정산 지급이 확정 기록되었습니다. 미환수금 ${deducted.toLocaleString('ko-KR')}원이 차감되어 실지급액은 ${remaining.toLocaleString('ko-KR')}원입니다. 실제 이체는 은행에서 별도로 진행해 주세요.`
        : '정산 지급이 확정 기록되었습니다. 실제 이체는 은행에서 별도로 진행해 주세요.',
      settled_at: now,
      payout: { grossMinor: Number(before.seller_payout_minor) || 0, recoveryDeductedMinor: deducted, netMinor: remaining, method: payoutMethod, reference: payoutReference }
    });
  }

  // 4b. Admin recovery claims: GET /api/v1/admin/marketplace/recoveries (B3)
  if (path === '/api/v1/admin/marketplace/recoveries' && method === 'GET') {
    await requireAdmin(request, env);
    const status = (url.searchParams.get('status') || '').toUpperCase();
    const rows = await env.DB.prepare(
      `SELECT * FROM settlement_recoveries ${status ? 'WHERE status = ?' : ''} ORDER BY created_at DESC LIMIT 200`,
    ).bind(...(status ? [status] : [])).all();
    return json({ success: true, recoveries: rows.results || [] });
  }

  // 4c. Batch payout statement for the bank transfer run (B4). JSON by default,
  // ?format=csv for the transfer file. Every figure comes from settled rows.
  const stmtMatch = path.match(/^\/api\/v1\/admin\/marketplace\/batches\/([A-Za-z0-9_.-]+)\/statement$/);
  if (stmtMatch && method === 'GET') {
    await requireAdmin(request, env);
    const batch = await env.DB.prepare('SELECT * FROM partner_settlement_batches WHERE id = ?').bind(stmtMatch[1]).first<any>();
    if (!batch) throw new HttpError(404, 'BATCH_NOT_FOUND', '정산 배치를 찾을 수 없습니다.');
    const lines = await env.DB.prepare(
      `SELECT id, booking_id, seller_id, seller_name, gross_amount_minor, commission_amount_minor, seller_payout_minor,
              recovery_deducted_minor, payout_method, payout_reference, settlement_status, settled_at
       FROM marketplace_order_settlements WHERE payout_batch_id = ? ORDER BY settled_at`,
    ).bind(batch.id).all<any>();
    const rows = (lines.results || []).map((l: any) => {
      const gross = Number(l.seller_payout_minor) || 0;
      const ded = Number(l.recovery_deducted_minor) || 0;
      return { ...l, net_payout_minor: gross - ded };
    });
    // B5: e-tax invoices are issued manually by ops (no issuance provider is
    // contracted); the statement carries the recipient address for that run.
    const prof = await env.DB.prepare('SELECT tax_invoice_email, bank_name, bank_account_number, bank_account_holder FROM partner_profiles WHERE partner_id = ?').bind(batch.partner_id).first<any>();
    const taxInvoiceEmail = prof?.tax_invoice_email || null;
    // #98: the transfer file needs the true account — decrypt, and fail loudly
    // when the key is gone rather than printing ciphertext as a destination.
    const payoutAccount = prof ? { bank: prof.bank_name, account: await decryptPiiField(prof.bank_account_number, env), holder: await decryptPiiField(prof.bank_account_holder, env) } : null;
    if ((url.searchParams.get('format') || '').toLowerCase() === 'csv') {
      const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [`# batch ${batch.id} period ${batch.period_start}..${batch.period_end} tax_invoice_email ${taxInvoiceEmail || '-'} payout ${payoutAccount?.bank || '-'} ${payoutAccount?.account || ''}`,
        'settlement_id,booking_id,seller_id,seller_name,gross_minor,commission_minor,payout_gross_minor,recovery_deducted_minor,net_payout_minor,payout_method,payout_reference,settlement_status,settled_at',
        ...rows.map((l: any) => [l.id, l.booking_id, l.seller_id, q(l.seller_name), l.gross_amount_minor, l.commission_amount_minor, l.seller_payout_minor, l.recovery_deducted_minor, l.net_payout_minor, l.payout_method, q(l.payout_reference), l.settlement_status, l.settled_at].join(',')),
      ].join('\r\n');
      return new Response('\uFEFF' + csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="statement_${batch.id}.csv"` } });
    }
    return json({ success: true, batch, taxInvoiceEmail, payoutAccount, issuance: 'MANUAL', lines: rows });
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
      // #26: same rule as /partner/products — a roomless hotel can never be
      // quoted, so rooms are part of the registration payload.
      const rooms = parseRooms(b.rooms);
      if (!rooms.length) throw new HttpError(400, 'ROOMS_REQUIRED', '호텔 등록에는 객실 정보(rooms)가 1개 이상 필요합니다.');
      newDomainItemId = newId('htl');
      await env.DB.prepare(`
        INSERT INTO hotels (id, partner_id, name_ko, name_en, city, country, address, base_price_krw, rooms_json, created_at)
        VALUES (?, ?, ?, ?, ?, '대한민국', '파트너 지정 주소', ?, ?, ?)
      `).bind(newDomainItemId, pId, title, title, city, retailPrice, JSON.stringify(rooms), now).run();
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
      pId,
      `PARTNER:${pId}`,
      pId,
      companyName,
      retailPrice,
      commissionBps,
      sellerPayout,
      platformMargin,
      now
    ).run();

    // #15: a registered product must resolve a supplier at quote time — create
    // the partner's supplier row (idempotent across repeat registrations).
    // It starts NOT_INTEGRATED: the product is registered but honestly NOT
    // sellable until an operator contracts the supplier and marks it LIVE.
    const prof = await env.DB.prepare('SELECT settlement_rate_bps FROM partner_profiles WHERE partner_id = ?').bind(pId).first<any>();
    const commission = Number(prof?.settlement_rate_bps);
    const sellerShareBps = Number.isSafeInteger(commission) ? Math.min(10000, Math.max(0, 10000 - commission)) : 9000;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps)
       VALUES (?, ?, 'ALL', 'direct_contract', 'NOT_INTEGRATED', 'AGENCY', ?)`
    ).bind(pId, companyName, sellerShareBps).run();

    return json({
      success: true,
      message: '3P 마켓플레이스 공급 상품 등록이 접수되었습니다. 운영자의 계약 심사 후 판매가 개시됩니다.',
      product: {
        marketplace_id: mktId,
        item_id: newDomainItemId,
        domain_type: domain,
        merchant_model: '3P',
        seller_id: pId,
        seller_name: companyName,
        retail_price_krw: retailPrice,
        commission_rate_bps: commissionBps,
        seller_payout_krw: sellerPayout,
        sellable: false,
        sellable_reason: 'SUPPLIER_NOT_INTEGRATED',
        next_step: '운영자가 공급사 계약을 심사하고 LIVE로 전환하면 견적·예약이 가능합니다.'
      }
    }, 201);
  }

  return null;
}


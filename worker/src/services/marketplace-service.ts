import type { Env } from '../env.ts';
import { newId } from '../lib/crypto.ts';

export type MerchantModel = '1P' | '3P' | 'CONSIGNMENT';

export interface MarketplaceItem {
  id: string;
  domain_type: string;
  item_id: string;
  merchant_model: MerchantModel;
  supplier_id: string;
  registered_by: string;
  seller_id: string;
  seller_name: string;
  fulfillment_provider: 'GETFORTRIP' | 'PARTNER' | 'SUPPLIER';
  supply_cost_minor: number;
  retail_price_minor: number;
  commission_rate_bps: number;
  seller_payout_minor: number;
  platform_margin_minor: number;
  refund_responsible_party: 'GETFORTRIP' | 'PARTNER' | 'SUPPLIER';
  external_sku: string | null;
  source_url: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'PENDING_APPROVAL' | 'SUSPENDED';
  created_at: string;
  updated_at: string;
}

export interface OrderSettlementRecord {
  id: string;
  booking_id: string;
  booking_item_id: string | null;
  domain_type: string;
  merchant_model: MerchantModel;
  attribution_source: 'CATALOG' | 'SUPPLIER_FALLBACK' | 'LEGACY';
  seller_id: string;
  seller_name: string;
  supplier_id: string;
  gross_amount_minor: number;
  supply_cost_minor: number;
  commission_amount_minor: number;
  seller_payout_minor: number;
  net_platform_profit_minor: number;
  fulfillment_status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'FAILED';
  settlement_status: 'PENDING' | 'HELD' | 'SETTLED' | 'REFUNDED';
  payout_batch_id: string | null;
  created_at: string;
  settled_at: string | null;
}

export async function getMarketplaceAttribution(
  env: Env,
  domainType: string,
  itemId: string
): Promise<MarketplaceItem | null> {
  const row = await env.DB.prepare(
    'SELECT * FROM marketplace_catalog_items WHERE domain_type = ? AND item_id = ?'
  )
    .bind(domainType, itemId)
    .first<any>();

  if (!row) return null;
  return {
    ...row,
    supply_cost_minor: Number(row.supply_cost_minor),
    retail_price_minor: Number(row.retail_price_minor),
    commission_rate_bps: Number(row.commission_rate_bps),
    seller_payout_minor: Number(row.seller_payout_minor),
    platform_margin_minor: Number(row.platform_margin_minor)
  };
}

export interface PlannedSettlement {
  record: OrderSettlementRecord;
  /** INSERT prepared statement, so callers can include it in their own batch (atomic). */
  stmt(db: D1Database): Parameters<D1Database['batch']>[0][number];
}

function splitForModel(
  model: MerchantModel,
  grossAmountMinor: number,
  supplyCostMinor: number,
  commissionRateBps: number
): { supply: number; commission: number; payout: number; profit: number } {
  if (model === '1P') {
    // 1P: platform holds the entire margin over wholesale COGS.
    const supply = supplyCostMinor || Math.round(grossAmountMinor * 0.85);
    return { supply, commission: 0, payout: 0, profit: grossAmountMinor - supply };
  }
  if (model === 'CONSIGNMENT') {
    // Consignment: supplier gets wholesale supply cost, platform keeps the spread.
    const supply = supplyCostMinor || Math.round(grossAmountMinor * 0.75);
    return { supply, commission: 0, payout: supply, profit: grossAmountMinor - supply };
  }
  // 3P: platform charges a take-rate commission, seller gets the net payout.
  const bps = commissionRateBps || 1000;
  const commission = Math.round((grossAmountMinor * bps) / 10000);
  return { supply: 0, commission, payout: grossAmountMinor - commission, profit: commission };
}

/**
 * Plan (but do not yet write) the settlement row for a fulfilled booking.
 *
 * Terms come from the marketplace catalog row when one exists. Otherwise they
 * are derived from the booking's supplier of record — a real commercial
 * relationship with a real rate (MERCHANT_OF_RECORD -> 1P, anything else ->
 * 3P at the supplier's settlement_rate_bps). Sellers are never invented
 * (2026-11-09 audit [M]); the source is recorded on the row.
 */
export async function planOrderSettlement(
  env: Env,
  bookingId: string,
  domainType: string,
  itemId: string,
  grossAmountMinor: number
): Promise<PlannedSettlement> {
  const attr = await getMarketplaceAttribution(env, domainType, itemId);
  const now = new Date().toISOString();
  const settlementId = newId('stl');

  let model: MerchantModel;
  let source: OrderSettlementRecord['attribution_source'];
  let sellerId: string;
  let sellerName: string;
  let supplierId: string;
  let supplyCostMinor: number;
  let commissionRateBps: number;
  if (attr) {
    model = attr.merchant_model;
    source = 'CATALOG';
    sellerId = attr.seller_id;
    sellerName = attr.seller_name;
    supplierId = attr.supplier_id;
    supplyCostMinor = attr.supply_cost_minor;
    commissionRateBps = attr.commission_rate_bps;
  } else {
    const b = await env.DB.prepare('SELECT supplier_id FROM bookings WHERE id = ?').bind(bookingId).first<{ supplier_id: string }>();
    const sup = b ? await env.DB.prepare('SELECT id, name, transaction_model, settlement_rate_bps FROM suppliers WHERE id = ?').bind(b.supplier_id).first<any>() : null;
    model = sup?.transaction_model === 'MERCHANT_OF_RECORD' ? '1P' : '3P';
    source = 'SUPPLIER_FALLBACK';
    sellerId = sup?.id || b?.supplier_id || 'UNKNOWN_SUPPLIER';
    sellerName = sup?.name || sellerId;
    supplierId = sup?.id || b?.supplier_id || 'UNKNOWN_SUPPLIER';
    supplyCostMinor = 0;
    commissionRateBps = Number(sup?.settlement_rate_bps) || 1000;
  }
  const split = splitForModel(model, grossAmountMinor, supplyCostMinor, commissionRateBps);

  // Link the real booking item when one exists; never fabricate an id.
  const item = await env.DB.prepare('SELECT id FROM booking_items WHERE booking_id = ? AND item_id = ? LIMIT 1')
    .bind(bookingId, itemId).first<{ id: string }>();

  const record: OrderSettlementRecord = {
    id: settlementId,
    booking_id: bookingId,
    booking_item_id: item?.id ?? null,
    domain_type: domainType,
    merchant_model: model,
    attribution_source: source,
    seller_id: sellerId,
    seller_name: sellerName,
    supplier_id: supplierId,
    gross_amount_minor: grossAmountMinor,
    supply_cost_minor: split.supply,
    commission_amount_minor: split.commission,
    seller_payout_minor: split.payout,
    net_platform_profit_minor: split.profit,
    fulfillment_status: 'CONFIRMED',
    settlement_status: 'PENDING',
    payout_batch_id: null,
    created_at: now,
    settled_at: null
  };
  const values: unknown[] = [
    record.id, record.booking_id, record.booking_item_id, record.domain_type,
    record.merchant_model, record.attribution_source, record.seller_id, record.seller_name,
    record.supplier_id, record.gross_amount_minor, record.supply_cost_minor,
    record.commission_amount_minor, record.seller_payout_minor, record.net_platform_profit_minor,
    record.fulfillment_status, record.settlement_status, record.created_at,
  ];
  return {
    record,
    stmt: (db: D1Database) => db.prepare(`INSERT INTO marketplace_order_settlements (
      id, booking_id, booking_item_id, domain_type, merchant_model, attribution_source,
      seller_id, seller_name, supplier_id, gross_amount_minor, supply_cost_minor,
      commission_amount_minor, seller_payout_minor, net_platform_profit_minor,
      fulfillment_status, settlement_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values),
  };
}

export async function createOrderSettlement(
  env: Env,
  bookingId: string,
  domainType: string,
  itemId: string,
  grossAmountMinor: number
): Promise<OrderSettlementRecord> {
  const planned = await planOrderSettlement(env, bookingId, domainType, itemId, grossAmountMinor);
  await planned.stmt(env.DB).run();
  return planned.record;
}

export async function getMarketplaceFinancialSummary(env: Env) {
  const rows = await env.DB.prepare(`
    SELECT
      merchant_model,
      COUNT(*) AS order_count,
      COALESCE(SUM(gross_amount_minor), 0) AS total_gmv_minor,
      COALESCE(SUM(supply_cost_minor), 0) AS total_cogs_minor,
      COALESCE(SUM(commission_amount_minor), 0) AS total_commission_minor,
      COALESCE(SUM(seller_payout_minor), 0) AS total_payout_minor,
      COALESCE(SUM(net_platform_profit_minor), 0) AS total_net_profit_minor
    FROM marketplace_order_settlements
    GROUP BY merchant_model
  `).all<any>();

  const breakdown: Record<string, any> = {
    '1P': { order_count: 0, gmv_minor: 0, cogs_minor: 0, profit_minor: 0 },
    '3P': { order_count: 0, gmv_minor: 0, commission_minor: 0, payout_minor: 0, profit_minor: 0 },
    'CONSIGNMENT': { order_count: 0, gmv_minor: 0, supplier_cogs_minor: 0, profit_minor: 0 }
  };

  let totalGmv = 0;
  let totalNetProfit = 0;

  for (const r of rows.results || []) {
    const m = r.merchant_model;
    const gmv = Number(r.total_gmv_minor);
    const profit = Number(r.total_net_profit_minor);
    totalGmv += gmv;
    totalNetProfit += profit;

    if (m === '1P') {
      breakdown['1P'] = {
        order_count: Number(r.order_count),
        gmv_minor: gmv,
        cogs_minor: Number(r.total_cogs_minor),
        profit_minor: profit
      };
    } else if (m === '3P') {
      breakdown['3P'] = {
        order_count: Number(r.order_count),
        gmv_minor: gmv,
        commission_minor: Number(r.total_commission_minor),
        payout_minor: Number(r.total_payout_minor),
        profit_minor: profit
      };
    } else if (m === 'CONSIGNMENT') {
      breakdown['CONSIGNMENT'] = {
        order_count: Number(r.order_count),
        gmv_minor: gmv,
        supplier_cogs_minor: Number(r.total_cogs_minor),
        profit_minor: profit
      };
    }
  }

  // Count active items in catalog per model
  const catalogCounts = await env.DB.prepare(`
    SELECT merchant_model, COUNT(*) as c FROM marketplace_catalog_items GROUP BY merchant_model
  `).all<any>();

  const catalogStats: Record<string, number> = { '1P': 0, '3P': 0, 'CONSIGNMENT': 0 };
  for (const c of catalogCounts.results || []) {
    catalogStats[c.merchant_model] = Number(c.c);
  }

  return {
    total_gmv_minor: totalGmv,
    total_net_profit_minor: totalNetProfit,
    catalog_item_counts: catalogStats,
    model_breakdown: breakdown,
    timestamp: new Date().toISOString()
  };
}


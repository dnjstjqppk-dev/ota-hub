import type { Env } from '../env.ts';
import { HttpError } from '../lib/http.ts';
import { audit } from '../lib/auth.ts';
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
): Promise<MarketplaceItem> {
  const row = await env.DB.prepare(
    'SELECT * FROM marketplace_catalog_items WHERE domain_type = ? AND item_id = ?'
  )
    .bind(domainType, itemId)
    .first<any>();

  if (row) {
    return {
      ...row,
      supply_cost_minor: Number(row.supply_cost_minor),
      retail_price_minor: Number(row.retail_price_minor),
      commission_rate_bps: Number(row.commission_rate_bps),
      seller_payout_minor: Number(row.seller_payout_minor),
      platform_margin_minor: Number(row.platform_margin_minor)
    };
  }

  // Graceful synthesis if item attribution not explicitly seeded
  const isDirect = domainType === 'TRAIN' || domainType === 'FLIGHT' || domainType === 'ESIM' || domainType === 'INSURANCE';
  const model: MerchantModel = isDirect ? '1P' : '3P';
  const sellerId = isDirect ? 'getfortrip' : 'ptn_tour_01';
  const sellerName = isDirect ? 'GetForTrip Direct' : 'GetForTrip 공인 입점 파트너';
  const commissionBps = isDirect ? 0 : 1000;

  return {
    id: `mkt_syn_${itemId}`,
    domain_type: domainType,
    item_id: itemId,
    merchant_model: model,
    supplier_id: `sup_${domainType.toLowerCase()}_default`,
    registered_by: isDirect ? 'SYSTEM' : `PARTNER:${sellerId}`,
    seller_id: sellerId,
    seller_name: sellerName,
    fulfillment_provider: isDirect ? 'SUPPLIER' : 'PARTNER',
    supply_cost_minor: 0,
    retail_price_minor: 50000,
    commission_rate_bps: commissionBps,
    seller_payout_minor: isDirect ? 0 : 45000,
    platform_margin_minor: isDirect ? 50000 : 5000,
    refund_responsible_party: isDirect ? 'GETFORTRIP' : 'PARTNER',
    external_sku: null,
    source_url: null,
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

export async function createOrderSettlement(
  env: Env,
  bookingId: string,
  domainType: string,
  itemId: string,
  grossAmountMinor: number
): Promise<OrderSettlementRecord> {
  const attr = await getMarketplaceAttribution(env, domainType, itemId);
  const now = new Date().toISOString();
  const settlementId = newId('stl');

  let supplyCostMinor = 0;
  let commissionAmountMinor = 0;
  let sellerPayoutMinor = 0;
  let netPlatformProfitMinor = 0;

  if (attr.merchant_model === '1P') {
    // 1P: Gross Revenue, wholesale COGS, platform holds entire margin
    supplyCostMinor = attr.supply_cost_minor || Math.round(grossAmountMinor * 0.85);
    netPlatformProfitMinor = grossAmountMinor - supplyCostMinor;
    commissionAmountMinor = 0;
    sellerPayoutMinor = 0;
  } else if (attr.merchant_model === '3P') {
    // 3P: Merchant Sale, platform charges take-rate commission, seller gets net payout
    const bps = attr.commission_rate_bps || 1000;
    commissionAmountMinor = Math.round((grossAmountMinor * bps) / 10000);
    sellerPayoutMinor = grossAmountMinor - commissionAmountMinor;
    netPlatformProfitMinor = commissionAmountMinor;
    supplyCostMinor = 0;
  } else if (attr.merchant_model === 'CONSIGNMENT') {
    // Consignment / Dropship: Customer pays retail, supplier gets wholesale supply cost, platform keeps spread
    supplyCostMinor = attr.supply_cost_minor || Math.round(grossAmountMinor * 0.75);
    sellerPayoutMinor = supplyCostMinor; // Payout due to upstream supplier
    netPlatformProfitMinor = grossAmountMinor - supplyCostMinor;
    commissionAmountMinor = 0;
  }

  await env.DB.prepare(`
    INSERT INTO marketplace_order_settlements (
      id, booking_id, booking_item_id, domain_type,
      merchant_model, seller_id, seller_name, supplier_id,
      gross_amount_minor, supply_cost_minor, commission_amount_minor,
      seller_payout_minor, net_platform_profit_minor,
      fulfillment_status, settlement_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', 'PENDING', ?)
  `).bind(
    settlementId,
    bookingId,
    `item_${itemId}`,
    domainType,
    attr.merchant_model,
    attr.seller_id,
    attr.seller_name,
    attr.supplier_id,
    grossAmountMinor,
    supplyCostMinor,
    commissionAmountMinor,
    sellerPayoutMinor,
    netPlatformProfitMinor,
    now
  ).run();

  return {
    id: settlementId,
    booking_id: bookingId,
    booking_item_id: `item_${itemId}`,
    domain_type: domainType,
    merchant_model: attr.merchant_model,
    seller_id: attr.seller_id,
    seller_name: attr.seller_name,
    supplier_id: attr.supplier_id,
    gross_amount_minor: grossAmountMinor,
    supply_cost_minor: supplyCostMinor,
    commission_amount_minor: commissionAmountMinor,
    seller_payout_minor: sellerPayoutMinor,
    net_platform_profit_minor: netPlatformProfitMinor,
    fulfillment_status: 'CONFIRMED',
    settlement_status: 'PENDING',
    payout_batch_id: null,
    created_at: now,
    settled_at: null
  };
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
        supplier_cogs_minor: Number(r.total_supply_cost_minor || r.total_payout_minor),
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


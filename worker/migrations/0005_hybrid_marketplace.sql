-- 0005 Hybrid Marketplace: 1P Direct, 3P Partner, and Consignment (Dropship) Architecture
-- =========================================================================================

-- 1. Unified Marketplace Catalog Attribution Registry
CREATE TABLE IF NOT EXISTS marketplace_catalog_items (
    id TEXT PRIMARY KEY,
    domain_type TEXT NOT NULL, -- 'HOTEL', 'FLIGHT', 'ACTIVITY', 'CAR', 'PACKAGE', 'TRANSFER', 'TRAIN', 'ESIM', 'INSURANCE'
    item_id TEXT NOT NULL, -- Underlying product ID in specific domain table
    merchant_model TEXT NOT NULL DEFAULT '1P', -- '1P' (Direct), '3P' (Partner Marketplace), 'CONSIGNMENT' (Supplier Dropship)
    supplier_id TEXT NOT NULL, -- Original inventory supplier (e.g., 'sup_hyatt', 'sup_tokyo_tower', 'sup_amadeus')
    registered_by TEXT NOT NULL, -- 'SYSTEM', 'ADMIN', 'PARTNER:ptn_...'
    seller_id TEXT NOT NULL, -- Legal seller / contracting party for customer: 'getfortrip' or 'ptn_...'
    seller_name TEXT NOT NULL, -- Display seller name
    fulfillment_provider TEXT NOT NULL, -- Who executes the service: 'GETFORTRIP', 'PARTNER', 'SUPPLIER'
    supply_cost_minor INTEGER NOT NULL DEFAULT 0, -- Base wholesale supply cost
    retail_price_minor INTEGER NOT NULL DEFAULT 0, -- Customer retail listing price
    commission_rate_bps INTEGER NOT NULL DEFAULT 1000, -- Platform take-rate in bps (1000 bps = 10.00%)
    seller_payout_minor INTEGER NOT NULL DEFAULT 0, -- Amount owed to seller after commission
    platform_margin_minor INTEGER NOT NULL DEFAULT 0, -- Net platform profit
    refund_responsible_party TEXT NOT NULL DEFAULT 'GETFORTRIP', -- 'GETFORTRIP', 'PARTNER', 'SUPPLIER'
    external_sku TEXT, -- Supplier SKU / external reference
    source_url TEXT, -- Ingestion source URL if consignment
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'PAUSED', 'PENDING_APPROVAL', 'SUSPENDED'
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(domain_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_mkt_model ON marketplace_catalog_items(merchant_model, status);
CREATE INDEX IF NOT EXISTS idx_mkt_seller ON marketplace_catalog_items(seller_id, status);
CREATE INDEX IF NOT EXISTS idx_mkt_supplier ON marketplace_catalog_items(supplier_id);

-- 2. Multi-Vendor Order Item Settlements Table
CREATE TABLE IF NOT EXISTS marketplace_order_settlements (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    booking_item_id TEXT,
    domain_type TEXT NOT NULL,
    merchant_model TEXT NOT NULL, -- '1P', '3P', 'CONSIGNMENT'
    seller_id TEXT NOT NULL,
    seller_name TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    gross_amount_minor INTEGER NOT NULL, -- Customer paid amount
    supply_cost_minor INTEGER NOT NULL DEFAULT 0, -- Supplier COGS
    commission_amount_minor INTEGER NOT NULL DEFAULT 0, -- GetForTrip Platform commission
    seller_payout_minor INTEGER NOT NULL DEFAULT 0, -- Payout due to 3P partner
    net_platform_profit_minor INTEGER NOT NULL DEFAULT 0, -- Net margin to GetForTrip
    fulfillment_status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'CONFIRMED', 'COMPLETED', 'FAILED'
    settlement_status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'HELD', 'SETTLED', 'REFUNDED'
    payout_batch_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    settled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mkt_settle_bkg ON marketplace_order_settlements(booking_id);
CREATE INDEX IF NOT EXISTS idx_mkt_settle_seller ON marketplace_order_settlements(seller_id, settlement_status);

-- 3. Register New Marketplace Feature Flags
INSERT OR REPLACE INTO feature_flags (key, category, display_name, description, is_enabled, default_enabled, requires_flags, is_external_dependent, external_contract_status, updated_by) VALUES
('MARKETPLACE_1P_DIRECT', 'SYSTEM', 'GetForTrip 1P 직접판매', 'GetForTrip이 직접 사입·계약하여 판매하는 1P 상품 판매 활성화', 1, 1, '[]', 0, 'NOT_REQUIRED', 'system_init'),
('MARKETPLACE_3P_PARTNER', 'SYSTEM', '3P 파트너 마켓플레이스', '외부 입점 여행사/공급업체가 자체 상품을 등록·판매하는 3P 마켓플레이스 활성화', 1, 1, '[]', 0, 'NOT_REQUIRED', 'system_init'),
('CONSIGNMENT_SALES', 'SYSTEM', '공급업체 위탁판매 (Dropship)', '외부 URL 및 API로 수집된 여행상품의 위탁판매 및 공급원가 차익 관리 활성화', 1, 1, '[]', 0, 'NOT_REQUIRED', 'system_init'),
('PARTNER_SELF_PRODUCT_REGISTRATION', 'PRODUCT_INGESTION', '파트너 자체 상품 등록', '입점 파트너가 익스트라넷에서 신규 상품을 직접 등록하고 요금/재고를 설정하는 기능', 1, 1, '["MARKETPLACE_3P_PARTNER"]', 0, 'NOT_REQUIRED', 'system_init'),
('PARTNER_URL_INGESTION', 'PRODUCT_INGESTION', '파트너 URL 상품 수집', '파트너가 허용된 공급처 URL을 입력하여 상품 정보를 자동 수집·등록하는 기능', 1, 1, '["URL_PRODUCT_INGESTION","MARKETPLACE_3P_PARTNER"]', 0, 'NOT_REQUIRED', 'system_init'),
('SUPPLIER_API_INTEGRATION', 'AUTOMATION', '공급업체 API 실시간 연동', 'GDS/호텔/투어 공식 API를 통한 실시간 가격 및 가용성 조회 연동', 1, 1, '[]', 1, 'PENDING_CONTRACT', 'system_init'),
('AUTO_BOOKING_DISPATCH', 'AUTOMATION', '공급업체/파트너 자동 발주', '결제 완료 시 판매 유형별(1P 사입처, 3P 파트너, 위탁 공급사)로 자동 발주 전문 전송', 1, 1, '[]', 0, 'ACTIVE', 'system_init'),
('AUTO_PARTNER_SETTLEMENT', 'FINANCIAL', '3P 파트너 자동 정산 배치', '정산 기준일 도래 시 수수료 차감 후 3P 입점사 정산 대금을 자동 계산·지급 배치 실행', 0, 0, '["MARKETPLACE_3P_PARTNER"]', 0, 'NOT_REQUIRED', 'system_init'),
('AUTO_SUPPLIER_SETTLEMENT', 'FINANCIAL', '위탁 공급업체 원가 정산', '위탁판매 주문 확정 후 공급사 정산원가 자동 대사 및 정산 계수 산출', 0, 0, '["CONSIGNMENT_SALES"]', 0, 'NOT_REQUIRED', 'system_init');

-- 4. Seed Marketplace Catalog Attribution for Existing Inventory
-- [A. 1P Direct Products]
INSERT OR REPLACE INTO marketplace_catalog_items (id, domain_type, item_id, merchant_model, supplier_id, registered_by, seller_id, seller_name, fulfillment_provider, supply_cost_minor, retail_price_minor, commission_rate_bps, seller_payout_minor, platform_margin_minor, refund_responsible_party) VALUES
('mkt_esim_jp_01', 'ESIM', 'esim_jp_01', '1P', 'sup_airalo_01', 'SYSTEM', 'getfortrip', 'GetForTrip Direct', 'SUPPLIER', 4500, 6900, 0, 0, 2400, 'GETFORTRIP'),
('mkt_ins_standard', 'INSURANCE', 'ins_standard', '1P', 'sup_chubb_01', 'SYSTEM', 'getfortrip', 'GetForTrip Direct', 'SUPPLIER', 3200, 4800, 0, 0, 1600, 'GETFORTRIP'),
('mkt_trn_ktx_025', 'TRAIN', 'trn_ktx_025', '1P', 'sup_korail_01', 'SYSTEM', 'getfortrip', 'GetForTrip Direct', 'SUPPLIER', 55000, 59800, 0, 0, 4800, 'GETFORTRIP'),
('mkt_flt_ke723', 'FLIGHT', 'flt_ke723', '1P', 'sup_koreanair_01', 'SYSTEM', 'getfortrip', 'GetForTrip Direct', 'SUPPLIER', 295000, 320000, 0, 0, 25000, 'GETFORTRIP');

-- [B. 3P Partner Products]
INSERT OR REPLACE INTO marketplace_catalog_items (id, domain_type, item_id, merchant_model, supplier_id, registered_by, seller_id, seller_name, fulfillment_provider, supply_cost_minor, retail_price_minor, commission_rate_bps, seller_payout_minor, platform_margin_minor, refund_responsible_party) VALUES
('mkt_htl_shilla_01', 'HOTEL', 'htl_shilla_01', '3P', 'sup_shilla_01', 'PARTNER:ptn_htl_01', 'ptn_htl_01', '(주)하얏트 코리아 호스피탈리티', 'PARTNER', 0, 380000, 1000, 342000, 38000, 'PARTNER'),
('mkt_act_lotte_world', 'ACTIVITY', 'act_lotte_world', '3P', 'sup_lotte_01', 'PARTNER:ptn_tour_01', 'ptn_tour_01', '(주)도쿄 익스플로러 투어스', 'PARTNER', 0, 44000, 1500, 37400, 6600, 'PARTNER'),
('mkt_car_avante_01', 'CAR', 'car_avante_01', '3P', 'sup_mobility_01', 'PARTNER:ptn_car_01', 'ptn_car_01', '글로벌 모빌리티 & 렌터카 파트너스', 'PARTNER', 0, 65000, 1200, 57200, 7800, 'PARTNER');

-- [C. Consignment / Dropship Products]
INSERT OR REPLACE INTO marketplace_catalog_items (id, domain_type, item_id, merchant_model, supplier_id, registered_by, seller_id, seller_name, fulfillment_provider, supply_cost_minor, retail_price_minor, commission_rate_bps, seller_payout_minor, platform_margin_minor, refund_responsible_party, external_sku, source_url) VALUES
('mkt_ing_sample_01', 'ACTIVITY', 'ing_sample_01', 'CONSIGNMENT', 'sup_tokyo_tower', 'ADMIN', 'getfortrip', '도쿄 타워 스카이 익스플로러 (위탁판매)', 'SUPPLIER', 18500, 24800, 0, 18500, 6300, 'GETFORTRIP', 'SKU-SKYTREE-01', 'https://travel.example.com/tokyo-skytree-admission'),
('mkt_ing_sample_02', 'ACTIVITY', 'ing_sample_02', 'CONSIGNMENT', 'sup_bateaux_mouches', 'ADMIN', 'getfortrip', 'Bateaux-Mouches Paris S.A. (위탁판매)', 'SUPPLIER', 98000, 129000, 0, 98000, 31000, 'GETFORTRIP', 'SKU-SEINE-01', 'https://travel.example.com/paris-seine-river-dinner-cruise');


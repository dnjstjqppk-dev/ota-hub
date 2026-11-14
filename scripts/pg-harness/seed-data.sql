-- TG-09 migration DML seed (generated — do not hand-edit).
-- Regenerate: node scripts/pg-harness/extract-dml.mjs

BEGIN;

-- 0001_baseline.sql
-- Display-only FX reference rates (NOT used for charging; charge currency is KRW). Must be refreshed from an FX source.
INSERT INTO fx_rates (currency, symbol, rate_to_krw) VALUES
('KRW', '₩', 1.0),
('USD', '$', 1350.0),
('JPY', '¥', 9.10),
('EUR', '€', 1470.0),
('CNY', '¥', 188.0),
('GBP', '£', 1720.0);

-- 0002_ota_core.sql
-- Placeholder operator: DRAFT until real registration numbers are entered by an admin.
-- While no entity is ACTIVE, the platform refuses to take payments in production.
INSERT INTO business_entities (id, entity_type, legal_name, country, status)
VALUES ('ent_primary', 'INDIVIDUAL', 'GetForTrip (사업자 등록 정보 미입력)', 'KR', 'DRAFT');

-- 0002_ota_core.sql
-- Catalog rows reference these ids through their partner_id column. None of the
-- legacy catalog content is backed by a signed supplier contract.
INSERT INTO suppliers (id, name, product_domain, adapter, integration_status, notes) VALUES
('ptn_htl_01', '호텔 공급사 (미계약)', 'HOTEL', 'none', 'NOT_INTEGRATED', 'Legacy seed catalog; prices/inventory are not supplier-verified.'),
('ptn_flt_01', '항공 공급사 (미계약)', 'FLIGHT', 'none', 'NOT_INTEGRATED', 'No GDS/NDC/consolidator contract.'),
('ptn_car_01', '렌터카/이동 공급사 (미계약)', 'CAR', 'none', 'NOT_INTEGRATED', 'Legacy seed catalog.'),
('ptn_tour_01', '투어/액티비티 공급사 (미계약)', 'ACTIVITY', 'none', 'NOT_INTEGRATED', 'Legacy seed catalog.'),
('unassigned_train', '철도 공급사 (미계약)', 'TRAIN', 'none', 'NOT_INTEGRATED', 'No rail supplier contract.'),
('unassigned_transfer', '공항이동 공급사 (미계약)', 'TRANSFER', 'none', 'NOT_INTEGRATED', NULL),
('unassigned_package', '패키지 (미계약)', 'PACKAGE', 'none', 'NOT_INTEGRATED', 'Package = multi-supplier bundle; requires each component supplier.');

-- 0002_ota_core.sql
-- Legacy rows: the old /pay endpoint always returned 403, so legacy
-- PENDING_PAYMENT rows can never be paid. Legacy CONFIRMED rows could only be
-- produced by the (now removed) affiliate postback side effect, so they are
-- routed to manual review instead of being trusted.
UPDATE bookings SET status = 'EXPIRED', status_reason = 'LEGACY_UNPAYABLE_PENDING' WHERE status = 'PENDING_PAYMENT';

-- 0002_ota_core.sql
UPDATE bookings SET status = 'MANUAL_REVIEW_REQUIRED', status_reason = 'LEGACY_CONFIRMED_WITHOUT_PAYMENT_RECORD' WHERE status = 'CONFIRMED';

-- 0002_ota_core.sql
-- Invalidate any legacy plaintext tokens (they were returned in API responses).
UPDATE password_reset_tokens SET used = 1 WHERE token_hash IS NULL;

-- 0002_ota_core.sql
-- Coupons may be claimed once per user. Remove unused duplicate claims first
-- (the legacy endpoint allowed unlimited re-claims of the same code).
DELETE FROM user_coupons WHERE is_used = 0 AND ctid NOT IN (SELECT MIN(ctid) FROM user_coupons GROUP BY user_id, coupon_code);

-- 0002_ota_core.sql
-- Affiliate outlinks: deactivate partners whose affiliate ids / secrets were placeholders.
UPDATE affiliate_partners_config SET is_active = 0, secret_key = '' WHERE secret_key ILIKE 'SET_VIA_%' OR secret_key = 'gft_sec_trip_partner_2026';

-- 0003_partner_extranet.sql
-- 6. Ensure seed partners exist before referencing them
INSERT INTO partners (id, email, password_hash, company_name, partner_type, business_number, contact_phone, settlement_rate, is_active) VALUES
('ptn_htl_01', 'hotel_partner@getfortrip.com', 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4', '(주)하얏트 코리아 호스피탈리티', 'HOTEL', '101-81-99281', '02-1234-5678', 0.90, 1),
('ptn_car_01', 'car_partner@getfortrip.com', 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4', '글로벌 모빌리티 & 렌터카 파트너스', 'CAR', '616-82-44102', '064-777-8899', 0.88, 1),
('ptn_tour_01', 'tour_partner@getfortrip.com', 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4', '(주)도쿄 익스플로러 투어스', 'ACTIVITY', '221-86-33910', '033-555-1122', 0.85, 1);

-- 0003_partner_extranet.sql
-- 7. Update seed partner password hash
UPDATE partners SET password_hash = 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4' WHERE id IN ('ptn_htl_01', 'ptn_car_01', 'ptn_tour_01');

-- 0003_partner_extranet.sql
-- 8. Seed partner profiles
INSERT INTO partner_profiles (partner_id, status, representative_name, bank_name, bank_account_number, bank_account_holder, tax_invoice_email, settlement_rate_bps) VALUES
('ptn_htl_01', 'ACTIVE', '김하얏트', '신한은행', '110-123-456789', '(주)하얏트코리아', 'tax@hyatt.test', 1000),
('ptn_car_01', 'ACTIVE', '이제주', '국민은행', '441020-01-99812', '글로벌모빌리티(주)', 'tax@mobility.test', 1200),
('ptn_tour_01', 'ACTIVE', '박도쿄', '하나은행', '330-9102-11820', '(주)도쿄익스플로러', 'tax@tokyotour.test', 1500);

-- 0003_partner_extranet.sql
-- 9. Seed partner staff accounts
INSERT INTO partner_staff (id, partner_id, email, password_hash, full_name, role, is_active) VALUES
('stf_hotel_01', 'ptn_htl_01', 'hotel_partner@getfortrip.com', 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4', '김하얏트 대표', 'OWNER', 1),
('stf_car_01', 'ptn_car_01', 'car_partner@getfortrip.com', 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4', '이제주 실장', 'OWNER', 1),
('stf_tour_01', 'ptn_tour_01', 'tour_partner@getfortrip.com', 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4', '박도쿄 팀장', 'OWNER', 1);

-- 0004_feature_flags_and_ingestion.sql
-- 6. Seed Feature Flags (16 Core Managed Flags)
INSERT INTO feature_flags (key, category, display_name, description, is_enabled, default_enabled, requires_flags, is_external_dependent, external_contract_status, updated_by) VALUES
('FLIGHT_BOOKING', 'BOOKING_DOMAIN', '항공권 실시간 예약', '글로벌 항공편 실시간 요금 조회, PNR 발권 및 예약 취소/환불 기능', 1, 1, '["REALTIME_INVENTORY_SYNC"]', 1, 'PENDING_CONTRACT', 'system_init'),
('HOTEL_BOOKING', 'BOOKING_DOMAIN', '호텔/숙박 예약', '국내외 호텔, 리조트 객실 실시간 재고 확인 및 예약/바우처 발행', 1, 1, '[]', 1, 'ACTIVE', 'system_init'),
('ACTIVITY_BOOKING', 'BOOKING_DOMAIN', '투어/액티비티 예약', '입장권, 데이투어, 익스피리언스 옵션별 예약 및 모바일 QR 바우처', 1, 1, '[]', 0, 'ACTIVE', 'system_init'),
('CAR_RENTAL', 'BOOKING_DOMAIN', '렌터카 실시간 예약', '국내/해외 렌터카 차량 등급, 자차보험 옵션 선택 및 실시간 예약', 1, 1, '[]', 1, 'ACTIVE', 'system_init'),
('PACKAGE_TOUR', 'BOOKING_DOMAIN', '여행 패키지 상품', '항공+호텔 결합 여행 패키지 예약 및 커스텀 빌더 기능', 1, 1, '["HOTEL_BOOKING"]', 0, 'ACTIVE', 'system_init'),
('TRANSIT_TICKETS', 'BOOKING_DOMAIN', '교통 패스 & 티켓', '고속열차(KTX, 신칸센, 유로스타) 및 공항 철도 승차권 예약', 1, 1, '[]', 0, 'ACTIVE', 'system_init'),
('TRAVEL_INSURANCE', 'BOOKING_DOMAIN', '해외여행자보험', '해외 의료비, 휴대품 손해, 항공기 결항 보장 보험 간편 가입', 1, 1, '[]', 1, 'PENDING_CONTRACT', 'system_init'),
('ESIM', 'BOOKING_DOMAIN', '글로벌 eSIM 데이터', '전 세계 140개국 로밍 없는 즉시 개통 eSIM 데이터팩 구매', 1, 1, '[]', 1, 'ACTIVE', 'system_init'),
('URL_PRODUCT_INGESTION', 'PRODUCT_INGESTION', 'URL 상품 자동 수집', '외부 여행상품 URL 입력 시 OpenGraph 및 JSON-LD 기반 자동 메타데이터 추출', 1, 1, '[]', 0, 'NOT_REQUIRED', 'system_init'),
('AI_TRANSLATION', 'PRODUCT_INGESTION', 'AI 상품 다국어 번역', '수집 및 등록된 여행 상품 상세설명 한/영/일/중 실시간 자동 번역', 1, 1, '[]', 0, 'NOT_REQUIRED', 'system_init'),
('AUTO_PRODUCT_PUBLISH', 'PRODUCT_INGESTION', '수집 상품 자동 승인·등록', 'URL 수집된 상품을 검수 단계 없이 카탈로그에 즉시 자동 공개 (기본 비활성 권장)', 0, 0, '["URL_PRODUCT_INGESTION"]', 0, 'NOT_REQUIRED', 'system_init'),
('REALTIME_INVENTORY_SYNC', 'AUTOMATION', '실시간 재고 동기화', '공급사 API 및 익스트라넷 캘린더와 실시간 잔여 좌석/객실 수량 동기화', 1, 1, '[]', 1, 'ACTIVE', 'system_init'),
('AUTO_BOOKING_CONFIRMATION', 'AUTOMATION', '공급사 즉시 확정 연동', '결제 완료 시 공급사 API를 통한 실시간 바우처 발급 및 PNR 자동 채번', 1, 1, '["REALTIME_INVENTORY_SYNC"]', 1, 'ACTIVE', 'system_init'),
('PARTNER_AUTO_DISPATCH', 'AUTOMATION', '파트너 주문 자동 발주', '파트너 공급 상품 결제 발생 시 익스트라넷 자동 주문 접수 및 알림 발송', 1, 1, '[]', 0, 'ACTIVE', 'system_init'),
('AUTO_CANCEL_REFUND', 'FINANCIAL', '정책 기반 자동 취소·환불', '규정된 취소 수수료율 자동 계산 및 PG 결제 취소/환불 즉시 처리', 1, 1, '[]', 0, 'ACTIVE', 'system_init'),
('AUTO_SETTLEMENT', 'FINANCIAL', '파트너 주기적 자동 정산', '정산 기준일 도래 시 수수료 차감 후 공급사 계좌로 자동 지급 배치 실행 (기본 수동 승인 권장)', 0, 0, '[]', 0, 'NOT_REQUIRED', 'system_init');

-- 0004_feature_flags_and_ingestion.sql
-- 7. Seed eSIM Plans
INSERT INTO esim_plans (id, country_code, country_name, data_quota_mb, validity_days, network_carrier, price_minor, speed_spec) VALUES
('esim_jp_01', 'JP', '일본', 3072, 3, 'SoftBank / NTT Docomo', 6900, '5G High-Speed'),
('esim_jp_02', 'JP', '일본', 5120, 5, 'SoftBank / NTT Docomo', 9900, '5G High-Speed'),
('esim_jp_03', 'JP', '일본', -1, 5, 'SoftBank (매일 2GB 후 속도제어)', 14900, '5G Unlimited'),
('esim_us_01', 'US', '미국/캐나다', 5120, 7, 'AT&T / T-Mobile', 18900, '5G LTE High-Speed'),
('esim_vn_01', 'VN', '베트남', 10240, 7, 'Viettel / Vinaphone', 7900, '4G LTE'),
('esim_eu_01', 'EU', '유럽 33개국 통합', 10240, 15, 'Vodafone / Orange / O2', 24900, '5G/4G Multi-Carrier');

-- 0004_feature_flags_and_ingestion.sql
-- 8. Seed Travel Insurance Plans
INSERT INTO travel_insurance_plans (id, plan_name, tier, target_region, medical_coverage_minor, baggage_loss_coverage_minor, cancellation_coverage_minor, daily_rate_minor, underwriter) VALUES
('ins_basic', '실속 알뜰 플랜', 'BASIC', 'WORLDWIDE', 10000000, 500000, 500000, 2400, 'Chubb 에이스손해보험'),
('ins_standard', '표준 안심 플랜', 'STANDARD', 'WORLDWIDE', 30000000, 1000000, 1000000, 4800, 'Chubb 에이스손해보험'),
('ins_premium', '프리미엄 VIP 케어 플랜', 'PREMIUM', 'WORLDWIDE', 70000000, 2000000, 2000000, 8900, 'Chubb 에이스손해보험');

-- 0004_feature_flags_and_ingestion.sql
-- 9. Seed Sample Ingested Travel Products
INSERT INTO url_product_ingestions (id, source_url, domain_type, title, summary, description, image_urls, currency, price_minor, original_price_minor, options_json, country, city, address, latitude, longitude, duration_mins, inclusions_json, exclusions_json, terms_json, cancellation_policy, supplier_name, status) VALUES
('ing_sample_01', 'https://travel.example.com/tokyo-skytree-admission', 'ACTIVITY', '도쿄 스카이트리 전망대 (350m & 450m) 모바일 패스트 패스', '세계 최고 높이의 전파탑에서 즐기는 도쿄 360도 파노라마 뷰 및 덴보회랑 입장권', '도쿄 스카이트리 덴보데크(350m)와 덴보회랑(450m)을 줄 서지 않고 바로 입장할 수 있는 모바일 QR 패스입니다.', '["https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80"]', 'KRW', 24800, 31000, '[{"name":"덴보데크(350m) 주간 입장권","price_minor":24800,"max_pax":10},{"name":"덴보데크 + 덴보회랑(450m) 콤보 세트","price_minor":35000,"max_pax":10}]', '일본', '도쿄', '1 Chome-1-2 Oshiage, Sumida City, Tokyo', 35.710063, 139.8107, 120, '["도쿄 스카이트리 덴보데크 입장권","소비세"]', '["개인 경비","VR 체험 시설 이용료"]', '["바우처 유효기간: 예약일 당일에 한함","모바일 화면의 QR코드를 전용 게이트에 스캔"]', '예약일 24시간 전까지 100% 무료 취소 가능', '도쿄 타워 스카이 익스플로러', 'REVIEWED'),
('ing_sample_02', 'https://travel.example.com/paris-seine-river-dinner-cruise', 'ACTIVITY', '파리 세느강 바토무슈 디너 크루즈 & 3코스 프렌치 다이닝', '에펠탑과 루브르의 야경을 감상하며 즐기는 낭만적인 세느강 유람선 샴페인 디너', '파리 중심부를 가로지르는 2시간 15분의 럭셔리 크루즈. 신선한 현지 식재료로 조리된 정통 3코스 프랑스식 디찬과 라이브 재즈 음악이 함께합니다.', '["https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80"]', 'KRW', 129000, 150000, '[{"name":"스탠다드 디너 (창가석 제외)","price_minor":129000,"max_pax":6},{"name":"프레스티지 샴페인 디너 (창가 전용석)","price_minor":189000,"max_pax":4}]', '프랑스', '파리', 'Port de la Conference, 75008 Paris, France', 48.8638, 2.3126, 135, '["2시간 15분 세느강 크루즈","셰프 추천 3코스 디너","프랑스산 샴페인 1잔"]', '["선착장 왕복 픽업 서비스","추가 음료"]', '["드레스 코드: 스마트 캐주얼 (운동복/슬리퍼 입장 불가)","출발 30분 전 탑승구 도착 필수"]', '이용 3일 전 100% 환불, 이후 취소 불가', 'Bateaux-Mouches Paris S.A.', 'PUBLISHED');

-- 0005_hybrid_marketplace.sql
-- 3. Register New Marketplace Feature Flags
INSERT INTO feature_flags (key, category, display_name, description, is_enabled, default_enabled, requires_flags, is_external_dependent, external_contract_status, updated_by) VALUES
('MARKETPLACE_1P_DIRECT', 'SYSTEM', 'GetForTrip 1P 직접판매', 'GetForTrip이 직접 사입·계약하여 판매하는 1P 상품 판매 활성화', 1, 1, '[]', 0, 'NOT_REQUIRED', 'system_init'),
('MARKETPLACE_3P_PARTNER', 'SYSTEM', '3P 파트너 마켓플레이스', '외부 입점 여행사/공급업체가 자체 상품을 등록·판매하는 3P 마켓플레이스 활성화', 1, 1, '[]', 0, 'NOT_REQUIRED', 'system_init'),
('CONSIGNMENT_SALES', 'SYSTEM', '공급업체 위탁판매 (Dropship)', '외부 URL 및 API로 수집된 여행상품의 위탁판매 및 공급원가 차익 관리 활성화', 1, 1, '[]', 0, 'NOT_REQUIRED', 'system_init'),
('PARTNER_SELF_PRODUCT_REGISTRATION', 'PRODUCT_INGESTION', '파트너 자체 상품 등록', '입점 파트너가 익스트라넷에서 신규 상품을 직접 등록하고 요금/재고를 설정하는 기능', 1, 1, '["MARKETPLACE_3P_PARTNER"]', 0, 'NOT_REQUIRED', 'system_init'),
('PARTNER_URL_INGESTION', 'PRODUCT_INGESTION', '파트너 URL 상품 수집', '파트너가 허용된 공급처 URL을 입력하여 상품 정보를 자동 수집·등록하는 기능', 1, 1, '["URL_PRODUCT_INGESTION","MARKETPLACE_3P_PARTNER"]', 0, 'NOT_REQUIRED', 'system_init'),
('SUPPLIER_API_INTEGRATION', 'AUTOMATION', '공급업체 API 실시간 연동', 'GDS/호텔/투어 공식 API를 통한 실시간 가격 및 가용성 조회 연동', 1, 1, '[]', 1, 'PENDING_CONTRACT', 'system_init'),
('AUTO_BOOKING_DISPATCH', 'AUTOMATION', '공급업체/파트너 자동 발주', '결제 완료 시 판매 유형별(1P 사입처, 3P 파트너, 위탁 공급사)로 자동 발주 전문 전송', 1, 1, '[]', 0, 'ACTIVE', 'system_init'),
('AUTO_PARTNER_SETTLEMENT', 'FINANCIAL', '3P 파트너 자동 정산 배치', '정산 기준일 도래 시 수수료 차감 후 3P 입점사 정산 대금을 자동 계산·지급 배치 실행', 0, 0, '["MARKETPLACE_3P_PARTNER"]', 0, 'NOT_REQUIRED', 'system_init'),
('AUTO_SUPPLIER_SETTLEMENT', 'FINANCIAL', '위탁 공급업체 원가 정산', '위탁판매 주문 확정 후 공급사 정산원가 자동 대사 및 정산 계수 산출', 0, 0, '["CONSIGNMENT_SALES"]', 0, 'NOT_REQUIRED', 'system_init');

-- 0005_hybrid_marketplace.sql
-- 4. Seed Marketplace Catalog Attribution for Existing Inventory
-- [A. 1P Direct Products]
INSERT INTO marketplace_catalog_items (id, domain_type, item_id, merchant_model, supplier_id, registered_by, seller_id, seller_name, fulfillment_provider, supply_cost_minor, retail_price_minor, commission_rate_bps, seller_payout_minor, platform_margin_minor, refund_responsible_party) VALUES
('mkt_esim_jp_01', 'ESIM', 'esim_jp_01', '1P', 'sup_airalo_01', 'SYSTEM', 'getfortrip', 'GetForTrip Direct', 'SUPPLIER', 4500, 6900, 0, 0, 2400, 'GETFORTRIP'),
('mkt_ins_standard', 'INSURANCE', 'ins_standard', '1P', 'sup_chubb_01', 'SYSTEM', 'getfortrip', 'GetForTrip Direct', 'SUPPLIER', 3200, 4800, 0, 0, 1600, 'GETFORTRIP'),
('mkt_trn_ktx_025', 'TRAIN', 'trn_ktx_025', '1P', 'sup_korail_01', 'SYSTEM', 'getfortrip', 'GetForTrip Direct', 'SUPPLIER', 55000, 59800, 0, 0, 4800, 'GETFORTRIP'),
('mkt_flt_ke723', 'FLIGHT', 'flt_ke723', '1P', 'sup_koreanair_01', 'SYSTEM', 'getfortrip', 'GetForTrip Direct', 'SUPPLIER', 295000, 320000, 0, 0, 25000, 'GETFORTRIP');

-- 0005_hybrid_marketplace.sql
-- [B. 3P Partner Products]
INSERT INTO marketplace_catalog_items (id, domain_type, item_id, merchant_model, supplier_id, registered_by, seller_id, seller_name, fulfillment_provider, supply_cost_minor, retail_price_minor, commission_rate_bps, seller_payout_minor, platform_margin_minor, refund_responsible_party) VALUES
('mkt_htl_shilla_01', 'HOTEL', 'htl_shilla_01', '3P', 'sup_shilla_01', 'PARTNER:ptn_htl_01', 'ptn_htl_01', '(주)하얏트 코리아 호스피탈리티', 'PARTNER', 0, 380000, 1000, 342000, 38000, 'PARTNER'),
('mkt_act_lotte_world', 'ACTIVITY', 'act_lotte_world', '3P', 'sup_lotte_01', 'PARTNER:ptn_tour_01', 'ptn_tour_01', '(주)도쿄 익스플로러 투어스', 'PARTNER', 0, 44000, 1500, 37400, 6600, 'PARTNER'),
('mkt_car_avante_01', 'CAR', 'car_avante_01', '3P', 'sup_mobility_01', 'PARTNER:ptn_car_01', 'ptn_car_01', '글로벌 모빌리티 & 렌터카 파트너스', 'PARTNER', 0, 65000, 1200, 57200, 7800, 'PARTNER');

-- 0005_hybrid_marketplace.sql
-- [C. Consignment / Dropship Products]
INSERT INTO marketplace_catalog_items (id, domain_type, item_id, merchant_model, supplier_id, registered_by, seller_id, seller_name, fulfillment_provider, supply_cost_minor, retail_price_minor, commission_rate_bps, seller_payout_minor, platform_margin_minor, refund_responsible_party, external_sku, source_url) VALUES
('mkt_ing_sample_01', 'ACTIVITY', 'ing_sample_01', 'CONSIGNMENT', 'sup_tokyo_tower', 'ADMIN', 'getfortrip', '도쿄 타워 스카이 익스플로러 (위탁판매)', 'SUPPLIER', 18500, 24800, 0, 18500, 6300, 'GETFORTRIP', 'SKU-SKYTREE-01', 'https://travel.example.com/tokyo-skytree-admission'),
('mkt_ing_sample_02', 'ACTIVITY', 'ing_sample_02', 'CONSIGNMENT', 'sup_bateaux_mouches', 'ADMIN', 'getfortrip', 'Bateaux-Mouches Paris S.A. (위탁판매)', 'SUPPLIER', 98000, 129000, 0, 98000, 31000, 'GETFORTRIP', 'SKU-SEINE-01', 'https://travel.example.com/paris-seine-river-dinner-cruise');

-- 0006_places.sql
-- ---------------------------------------------------------------- Countries
INSERT INTO places (id, place_type, code, country_code, parent_id, name_ko, name_en, aliases, popularity) VALUES
('ctr_KR','COUNTRY','KR','KR',NULL,'대한민국','South Korea','한국|korea|republic of korea',90),
('ctr_JP','COUNTRY','JP','JP',NULL,'일본','Japan','日本|nippon',95),
('ctr_CN','COUNTRY','CN','CN',NULL,'중국','China','中国',60),
('ctr_TW','COUNTRY','TW','TW',NULL,'대만','Taiwan','台灣|타이완',70),
('ctr_HK','COUNTRY','HK','HK',NULL,'홍콩','Hong Kong','香港',65),
('ctr_MO','COUNTRY','MO','MO',NULL,'마카오','Macau','澳門|macao',45),
('ctr_TH','COUNTRY','TH','TH',NULL,'태국','Thailand','ประเทศไทย|타이',80),
('ctr_VN','COUNTRY','VN','VN',NULL,'베트남','Vietnam','Việt Nam|viet nam|월남',85),
('ctr_PH','COUNTRY','PH','PH',NULL,'필리핀','Philippines','pilipinas',65),
('ctr_SG','COUNTRY','SG','SG',NULL,'싱가포르','Singapore','싱가폴',65),
('ctr_MY','COUNTRY','MY','MY',NULL,'말레이시아','Malaysia','',50),
('ctr_ID','COUNTRY','ID','ID',NULL,'인도네시아','Indonesia','',55),
('ctr_KH','COUNTRY','KH','KH',NULL,'캄보디아','Cambodia','',30),
('ctr_LA','COUNTRY','LA','LA',NULL,'라오스','Laos','',30),
('ctr_MN','COUNTRY','MN','MN',NULL,'몽골','Mongolia','',30),
('ctr_IN','COUNTRY','IN','IN',NULL,'인도','India','',30),
('ctr_AE','COUNTRY','AE','AE',NULL,'아랍에미리트','United Arab Emirates','uae|에미리트',45),
('ctr_TR','COUNTRY','TR','TR',NULL,'튀르키예','Türkiye','터키|turkey|turkiye',45),
('ctr_EG','COUNTRY','EG','EG',NULL,'이집트','Egypt','',25),
('ctr_FR','COUNTRY','FR','FR',NULL,'프랑스','France','',70),
('ctr_GB','COUNTRY','GB','GB',NULL,'영국','United Kingdom','uk|england|britain|잉글랜드',65),
('ctr_DE','COUNTRY','DE','DE',NULL,'독일','Germany','deutschland',50),
('ctr_IT','COUNTRY','IT','IT',NULL,'이탈리아','Italy','italia|이태리',60),
('ctr_ES','COUNTRY','ES','ES',NULL,'스페인','Spain','españa|espana',60),
('ctr_CH','COUNTRY','CH','CH',NULL,'스위스','Switzerland','schweiz|suisse',55),
('ctr_NL','COUNTRY','NL','NL',NULL,'네덜란드','Netherlands','holland|홀란드',40),
('ctr_BE','COUNTRY','BE','BE',NULL,'벨기에','Belgium','',30),
('ctr_AT','COUNTRY','AT','AT',NULL,'오스트리아','Austria','österreich',40),
('ctr_CZ','COUNTRY','CZ','CZ',NULL,'체코','Czechia','czech republic|체코공화국',40),
('ctr_PT','COUNTRY','PT','PT',NULL,'포르투갈','Portugal','',40),
('ctr_GR','COUNTRY','GR','GR',NULL,'그리스','Greece','',35),
('ctr_US','COUNTRY','US','US',NULL,'미국','United States','usa|america|아메리카',75),
('ctr_CA','COUNTRY','CA','CA',NULL,'캐나다','Canada','',50),
('ctr_MX','COUNTRY','MX','MX',NULL,'멕시코','Mexico','méxico',30),
('ctr_AU','COUNTRY','AU','AU',NULL,'호주','Australia','오스트레일리아',60),
('ctr_NZ','COUNTRY','NZ','NZ',NULL,'뉴질랜드','New Zealand','',45),
('ctr_GU','COUNTRY','GU','GU',NULL,'괌','Guam','',60),
('ctr_MP','COUNTRY','MP','MP',NULL,'북마리아나 제도','Northern Mariana Islands','사이판|saipan',40);

-- 0006_places.sql
-- ---------------------------------------------------------------- Cities (code = IATA city / metropolitan area code when one exists)
INSERT INTO places (id, place_type, code, country_code, parent_id, name_ko, name_en, aliases, popularity) VALUES
('cty_SEL','CITY','SEL','KR','ctr_KR','서울','Seoul','서울특별시|首尔',95),
('cty_PUS','CITY','PUS','KR','ctr_KR','부산','Busan','부산광역시|pusan|釜山',85),
('cty_CJU','CITY','CJU','KR','ctr_KR','제주','Jeju','제주도|제주특별자치도|jeju island|cheju',90),
('cty_INC','CITY',NULL,'KR','ctr_KR','인천','Incheon','인천광역시',50),
('cty_TAE','CITY','TAE','KR','ctr_KR','대구','Daegu','대구광역시|taegu',40),
('cty_GYJ','CITY',NULL,'KR','ctr_KR','경주','Gyeongju','慶州',45),
('cty_GNG','CITY',NULL,'KR','ctr_KR','강릉','Gangneung','',45),
('cty_RSU','CITY','RSU','KR','ctr_KR','여수','Yeosu','',40),
('cty_TYO','CITY','TYO','JP','ctr_JP','도쿄','Tokyo','동경|東京|とうきょう',100),
('cty_OSA','CITY','OSA','JP','ctr_JP','오사카','Osaka','大阪|おおさか',98),
('cty_KYO','CITY',NULL,'JP','ctr_JP','교토','Kyoto','京都|きょうと',80),
('cty_FUK','CITY','FUK','JP','ctr_JP','후쿠오카','Fukuoka','福岡|하카타|hakata',88),
('cty_SPK','CITY','SPK','JP','ctr_JP','삿포로','Sapporo','札幌|홋카이도|hokkaido',80),
('cty_OKA','CITY','OKA','JP','ctr_JP','오키나와','Okinawa','沖縄|나하|naha|那覇',78),
('cty_NGO','CITY','NGO','JP','ctr_JP','나고야','Nagoya','名古屋',55),
('cty_UKB','CITY','UKB','JP','ctr_JP','고베','Kobe','神戸',45),
('cty_NRA','CITY',NULL,'JP','ctr_JP','나라','Nara','奈良',40),
('cty_YOK','CITY',NULL,'JP','ctr_JP','요코하마','Yokohama','横浜',45),
('cty_HIJ','CITY','HIJ','JP','ctr_JP','히로시마','Hiroshima','広島',40),
('cty_BJS','CITY','BJS','CN','ctr_CN','베이징','Beijing','북경|北京|peking',50),
('cty_SHA','CITY','SHA','CN','ctr_CN','상하이','Shanghai','상해|上海',55),
('cty_TAO','CITY','TAO','CN','ctr_CN','칭다오','Qingdao','청도|青岛',45),
('cty_CAN','CITY','CAN','CN','ctr_CN','광저우','Guangzhou','광주(중국)|广州|canton',35),
('cty_TPE','CITY','TPE','TW','ctr_TW','타이베이','Taipei','타이페이|台北',80),
('cty_KHH','CITY','KHH','TW','ctr_TW','가오슝','Kaohsiung','高雄',45),
('cty_HKG','CITY','HKG','HK','ctr_HK','홍콩','Hong Kong','香港',70),
('cty_MFM','CITY','MFM','MO','ctr_MO','마카오','Macau','澳門|macao',45),
('cty_BKK','CITY','BKK','TH','ctr_TH','방콕','Bangkok','กรุงเทพ|krung thep',90),
('cty_HKT','CITY','HKT','TH','ctr_TH','푸껫','Phuket','푸켓',70),
('cty_CNX','CITY','CNX','TH','ctr_TH','치앙마이','Chiang Mai','',55),
('cty_DAD','CITY','DAD','VN','ctr_VN','다낭','Da Nang','danang|Đà Nẵng',92),
('cty_SGN','CITY','SGN','VN','ctr_VN','호찌민','Ho Chi Minh City','호치민|사이공|saigon|hcmc',60),
('cty_HAN','CITY','HAN','VN','ctr_VN','하노이','Hanoi','hà nội|ha noi',60),
('cty_NHA','CITY',NULL,'VN','ctr_VN','나트랑','Nha Trang','냐짱|nhatrang',75),
('cty_PQC','CITY','PQC','VN','ctr_VN','푸꾸옥','Phu Quoc','phú quốc',60),
('cty_MNL','CITY','MNL','PH','ctr_PH','마닐라','Manila','',45),
('cty_CEB','CITY','CEB','PH','ctr_PH','세부','Cebu','',75),
('cty_SIN','CITY','SIN','SG','ctr_SG','싱가포르','Singapore','싱가폴',75),
('cty_KUL','CITY','KUL','MY','ctr_MY','쿠알라룸푸르','Kuala Lumpur','kl',45),
('cty_BKI','CITY','BKI','MY','ctr_MY','코타키나발루','Kota Kinabalu','코타',55),
('cty_DPS','CITY','DPS','ID','ctr_ID','발리','Bali','덴파사르|denpasar',70),
('cty_JKT','CITY','JKT','ID','ctr_ID','자카르타','Jakarta','',30),
('cty_DXB','CITY','DXB','AE','ctr_AE','두바이','Dubai','دبي',50),
('cty_IST','CITY','IST','TR','ctr_TR','이스탄불','Istanbul','istanbul',45),
('cty_PAR','CITY','PAR','FR','ctr_FR','파리','Paris','',85),
('cty_NCE','CITY','NCE','FR','ctr_FR','니스','Nice','',35),
('cty_LON','CITY','LON','GB','ctr_GB','런던','London','',75),
('cty_FRA','CITY','FRA','DE','ctr_DE','프랑크푸르트','Frankfurt','',35),
('cty_MUC','CITY','MUC','DE','ctr_DE','뮌헨','Munich','münchen|munchen',35),
('cty_BER','CITY','BER','DE','ctr_DE','베를린','Berlin','',35),
('cty_ROM','CITY','ROM','IT','ctr_IT','로마','Rome','roma',65),
('cty_MIL','CITY','MIL','IT','ctr_IT','밀라노','Milan','milano',40),
('cty_VCE','CITY','VCE','IT','ctr_IT','베네치아','Venice','베니스|venezia',45),
('cty_BCN','CITY','BCN','ES','ctr_ES','바르셀로나','Barcelona','',60),
('cty_MAD','CITY','MAD','ES','ctr_ES','마드리드','Madrid','',35),
('cty_ZRH','CITY','ZRH','CH','ctr_CH','취리히','Zurich','zürich',40),
('cty_ITK','CITY',NULL,'CH','ctr_CH','인터라켄','Interlaken','융프라우|jungfrau',45),
('cty_AMS','CITY','AMS','NL','ctr_NL','암스테르담','Amsterdam','',40),
('cty_BRU','CITY','BRU','BE','ctr_BE','브뤼셀','Brussels','bruxelles|브뤼셀',25),
('cty_VIE','CITY','VIE','AT','ctr_AT','빈','Vienna','비엔나|wien',40),
('cty_PRG','CITY','PRG','CZ','ctr_CZ','프라하','Prague','praha',50),
('cty_LIS','CITY','LIS','PT','ctr_PT','리스본','Lisbon','lisboa',35),
('cty_ATH','CITY','ATH','GR','ctr_GR','아테네','Athens','',25),
('cty_NYC','CITY','NYC','US','ctr_US','뉴욕','New York','new york city|맨해튼|manhattan',75),
('cty_LAX','CITY','LAX','US','ctr_US','로스앤젤레스','Los Angeles','LA|엘에이',60),
('cty_SFO','CITY','SFO','US','ctr_US','샌프란시스코','San Francisco','',45),
('cty_LAS','CITY','LAS','US','ctr_US','라스베이거스','Las Vegas','라스베가스|vegas',45),
('cty_HNL','CITY','HNL','US','ctr_US','호놀룰루','Honolulu','하와이|hawaii|오아후|oahu',65),
('cty_SEA','CITY','SEA','US','ctr_US','시애틀','Seattle','',35),
('cty_CHI','CITY','CHI','US','ctr_US','시카고','Chicago','',30),
('cty_MIA','CITY','MIA','US','ctr_US','마이애미','Miami','',30),
('cty_YVR','CITY','YVR','CA','ctr_CA','밴쿠버','Vancouver','',45),
('cty_YTO','CITY','YTO','CA','ctr_CA','토론토','Toronto','',35),
('cty_SYD','CITY','SYD','AU','ctr_AU','시드니','Sydney','',60),
('cty_MEL','CITY','MEL','AU','ctr_AU','멜버른','Melbourne','멜번',40),
('cty_AKL','CITY','AKL','NZ','ctr_NZ','오클랜드','Auckland','',35),
('cty_GUM','CITY','GUM','GU','ctr_GU','괌','Guam','하갓냐|hagatna|투몬|tumon',70),
('cty_SPN','CITY','SPN','MP','ctr_MP','사이판','Saipan','',55);

-- 0006_places.sql
-- ---------------------------------------------------------------- Airports (code = IATA airport code)
INSERT INTO places (id, place_type, code, country_code, parent_id, name_ko, name_en, aliases, popularity) VALUES
('apt_ICN','AIRPORT','ICN','KR','cty_SEL','인천국제공항','Incheon International Airport','인천공항|incheon',100),
('apt_GMP','AIRPORT','GMP','KR','cty_SEL','김포국제공항','Gimpo International Airport','김포공항|gimpo|kimpo',85),
('apt_PUS','AIRPORT','PUS','KR','cty_PUS','김해국제공항','Gimhae International Airport','김해공항|부산공항|gimhae',75),
('apt_CJU','AIRPORT','CJU','KR','cty_CJU','제주국제공항','Jeju International Airport','제주공항',88),
('apt_TAE','AIRPORT','TAE','KR','cty_TAE','대구국제공항','Daegu International Airport','대구공항',45),
('apt_CJJ','AIRPORT','CJJ','KR','ctr_KR','청주국제공항','Cheongju International Airport','청주공항|cheongju',45),
('apt_RSU','AIRPORT','RSU','KR','cty_RSU','여수공항','Yeosu Airport','',20),
('apt_NRT','AIRPORT','NRT','JP','cty_TYO','나리타국제공항','Narita International Airport','나리타공항|narita|成田',92),
('apt_HND','AIRPORT','HND','JP','cty_TYO','하네다공항','Haneda Airport','도쿄국제공항|haneda|羽田',92),
('apt_KIX','AIRPORT','KIX','JP','cty_OSA','간사이국제공항','Kansai International Airport','간사이공항|kansai|関西',92),
('apt_ITM','AIRPORT','ITM','JP','cty_OSA','오사카 이타미공항','Osaka Itami Airport','이타미|itami|伊丹',40),
('apt_FUK','AIRPORT','FUK','JP','cty_FUK','후쿠오카공항','Fukuoka Airport','福岡空港',85),
('apt_CTS','AIRPORT','CTS','JP','cty_SPK','신치토세공항','New Chitose Airport','치토세|chitose|新千歳',78),
('apt_OKA','AIRPORT','OKA','JP','cty_OKA','나하공항','Naha Airport','오키나와공항|那覇空港',75),
('apt_NGO','AIRPORT','NGO','JP','cty_NGO','주부국제공항','Chubu Centrair International Airport','센트레아|centrair|나고야공항',50),
('apt_UKB','AIRPORT','UKB','JP','cty_UKB','고베공항','Kobe Airport','',20),
('apt_HIJ','AIRPORT','HIJ','JP','cty_HIJ','히로시마공항','Hiroshima Airport','',25),
('apt_PEK','AIRPORT','PEK','CN','cty_BJS','베이징 서우두국제공항','Beijing Capital International Airport','서우두|capital',45),
('apt_PKX','AIRPORT','PKX','CN','cty_BJS','베이징 다싱국제공항','Beijing Daxing International Airport','다싱|daxing',40),
('apt_PVG','AIRPORT','PVG','CN','cty_SHA','상하이 푸둥국제공항','Shanghai Pudong International Airport','푸둥|pudong|浦东',50),
('apt_SHA','AIRPORT','SHA','CN','cty_SHA','상하이 훙차오국제공항','Shanghai Hongqiao International Airport','훙차오|홍차오|hongqiao|虹桥',35),
('apt_TAO','AIRPORT','TAO','CN','cty_TAO','칭다오 자오둥국제공항','Qingdao Jiaodong International Airport','자오둥|jiaodong',40),
('apt_CAN','AIRPORT','CAN','CN','cty_CAN','광저우 바이윈국제공항','Guangzhou Baiyun International Airport','바이윈|baiyun',30),
('apt_TPE','AIRPORT','TPE','TW','cty_TPE','타오위안국제공항','Taiwan Taoyuan International Airport','타오위안|taoyuan|桃園',78),
('apt_TSA','AIRPORT','TSA','TW','cty_TPE','타이베이 쑹산공항','Taipei Songshan Airport','쑹산|송산|songshan|松山',50),
('apt_KHH','AIRPORT','KHH','TW','cty_KHH','가오슝국제공항','Kaohsiung International Airport','',35),
('apt_HKG','AIRPORT','HKG','HK','cty_HKG','홍콩국제공항','Hong Kong International Airport','첵랍콕|chek lap kok',70),
('apt_MFM','AIRPORT','MFM','MO','cty_MFM','마카오국제공항','Macau International Airport','',35),
('apt_BKK','AIRPORT','BKK','TH','cty_BKK','수완나품국제공항','Suvarnabhumi Airport','수완나품|suvarnabhumi',90),
('apt_DMK','AIRPORT','DMK','TH','cty_BKK','돈므앙국제공항','Don Mueang International Airport','돈므앙|don mueang',45),
('apt_HKT','AIRPORT','HKT','TH','cty_HKT','푸껫국제공항','Phuket International Airport','푸켓공항',65),
('apt_CNX','AIRPORT','CNX','TH','cty_CNX','치앙마이국제공항','Chiang Mai International Airport','',45),
('apt_DAD','AIRPORT','DAD','VN','cty_DAD','다낭국제공항','Da Nang International Airport','다낭공항',90),
('apt_SGN','AIRPORT','SGN','VN','cty_SGN','떤선녓국제공항','Tan Son Nhat International Airport','탄손누트|tan son nhat|호치민공항',55),
('apt_HAN','AIRPORT','HAN','VN','cty_HAN','노이바이국제공항','Noi Bai International Airport','노이바이|noi bai|하노이공항',55),
('apt_CXR','AIRPORT','CXR','VN','cty_NHA','깜라인국제공항','Cam Ranh International Airport','깜란|cam ranh|나트랑공항',70),
('apt_PQC','AIRPORT','PQC','VN','cty_PQC','푸꾸옥국제공항','Phu Quoc International Airport','',55),
('apt_MNL','AIRPORT','MNL','PH','cty_MNL','니노이 아키노 국제공항','Ninoy Aquino International Airport','마닐라공항|naia',40),
('apt_CEB','AIRPORT','CEB','PH','cty_CEB','막탄 세부 국제공항','Mactan-Cebu International Airport','막탄|mactan|세부공항',70),
('apt_SIN','AIRPORT','SIN','SG','cty_SIN','창이국제공항','Singapore Changi Airport','창이|changi',75),
('apt_KUL','AIRPORT','KUL','MY','cty_KUL','쿠알라룸푸르국제공항','Kuala Lumpur International Airport','klia',40),
('apt_BKI','AIRPORT','BKI','MY','cty_BKI','코타키나발루국제공항','Kota Kinabalu International Airport','',50),
('apt_DPS','AIRPORT','DPS','ID','cty_DPS','응우라라이국제공항','Ngurah Rai International Airport','발리공항|덴파사르공항|ngurah rai',65),
('apt_CGK','AIRPORT','CGK','ID','cty_JKT','수카르노하타국제공항','Soekarno-Hatta International Airport','soekarno hatta',25),
('apt_DXB','AIRPORT','DXB','AE','cty_DXB','두바이국제공항','Dubai International Airport','',45),
('apt_AUH','AIRPORT','AUH','AE','ctr_AE','아부다비 자이드국제공항','Zayed International Airport','아부다비|abu dhabi',25),
('apt_IST','AIRPORT','IST','TR','cty_IST','이스탄불공항','Istanbul Airport','',40),
('apt_CDG','AIRPORT','CDG','FR','cty_PAR','샤를드골공항','Paris Charles de Gaulle Airport','샤를 드골|charles de gaulle|roissy',80),
('apt_ORY','AIRPORT','ORY','FR','cty_PAR','파리 오를리공항','Paris Orly Airport','오를리|orly',30),
('apt_NCE','AIRPORT','NCE','FR','cty_NCE','니스 코트다쥐르공항','Nice Côte d''Azur Airport','',25),
('apt_LHR','AIRPORT','LHR','GB','cty_LON','히스로공항','London Heathrow Airport','히드로|heathrow',70),
('apt_LGW','AIRPORT','LGW','GB','cty_LON','개트윅공항','London Gatwick Airport','gatwick',25),
('apt_FRA','AIRPORT','FRA','DE','cty_FRA','프랑크푸르트공항','Frankfurt Airport','',40),
('apt_MUC','AIRPORT','MUC','DE','cty_MUC','뮌헨공항','Munich Airport','',30),
('apt_BER','AIRPORT','BER','DE','cty_BER','베를린 브란덴부르크공항','Berlin Brandenburg Airport','',25),
('apt_FCO','AIRPORT','FCO','IT','cty_ROM','로마 피우미치노공항','Rome Fiumicino Airport','레오나르도 다빈치공항|fiumicino|leonardo da vinci',55),
('apt_MXP','AIRPORT','MXP','IT','cty_MIL','밀라노 말펜사공항','Milan Malpensa Airport','말펜사|malpensa',30),
('apt_VCE','AIRPORT','VCE','IT','cty_VCE','베네치아 마르코폴로공항','Venice Marco Polo Airport','marco polo',25),
('apt_BCN','AIRPORT','BCN','ES','cty_BCN','바르셀로나 엘프라트공항','Barcelona–El Prat Airport','엘프라트|el prat',50),
('apt_MAD','AIRPORT','MAD','ES','cty_MAD','마드리드 바라하스공항','Adolfo Suárez Madrid–Barajas Airport','바라하스|barajas',30),
('apt_ZRH','AIRPORT','ZRH','CH','cty_ZRH','취리히공항','Zurich Airport','',35),
('apt_AMS','AIRPORT','AMS','NL','cty_AMS','암스테르담 스히폴공항','Amsterdam Airport Schiphol','스키폴|schiphol',35),
('apt_BRU','AIRPORT','BRU','BE','cty_BRU','브뤼셀공항','Brussels Airport','',20),
('apt_VIE','AIRPORT','VIE','AT','cty_VIE','빈국제공항','Vienna International Airport','비엔나공항',30),
('apt_PRG','AIRPORT','PRG','CZ','cty_PRG','프라하 바츨라프하벨공항','Václav Havel Airport Prague','바츨라프 하벨|vaclav havel',40),
('apt_LIS','AIRPORT','LIS','PT','cty_LIS','리스본 움베르투델가두공항','Lisbon Humberto Delgado Airport','',25),
('apt_ATH','AIRPORT','ATH','GR','cty_ATH','아테네국제공항','Athens International Airport','',20),
('apt_JFK','AIRPORT','JFK','US','cty_NYC','존 F. 케네디 국제공항','John F. Kennedy International Airport','jfk공항|케네디공항',70),
('apt_EWR','AIRPORT','EWR','US','cty_NYC','뉴어크 리버티 국제공항','Newark Liberty International Airport','뉴어크|newark',30),
('apt_LGA','AIRPORT','LGA','US','cty_NYC','라과디아공항','LaGuardia Airport','laguardia',20),
('apt_LAX','AIRPORT','LAX','US','cty_LAX','로스앤젤레스국제공항','Los Angeles International Airport','la공항',60),
('apt_SFO','AIRPORT','SFO','US','cty_SFO','샌프란시스코국제공항','San Francisco International Airport','',40),
('apt_LAS','AIRPORT','LAS','US','cty_LAS','해리 리드 국제공항','Harry Reid International Airport','라스베이거스공항|mccarran',35),
('apt_HNL','AIRPORT','HNL','US','cty_HNL','대니얼 K. 이노우에 국제공항','Daniel K. Inouye International Airport','호놀룰루공항|하와이공항',60),
('apt_SEA','AIRPORT','SEA','US','cty_SEA','시애틀-터코마 국제공항','Seattle–Tacoma International Airport','sea-tac|씨택',30),
('apt_ORD','AIRPORT','ORD','US','cty_CHI','시카고 오헤어 국제공항','Chicago O''Hare International Airport','오헤어|ohare|o''hare',25),
('apt_MIA','AIRPORT','MIA','US','cty_MIA','마이애미국제공항','Miami International Airport','',20),
('apt_YVR','AIRPORT','YVR','CA','cty_YVR','밴쿠버국제공항','Vancouver International Airport','',40),
('apt_YYZ','AIRPORT','YYZ','CA','cty_YTO','토론토 피어슨 국제공항','Toronto Pearson International Airport','피어슨|pearson',30),
('apt_SYD','AIRPORT','SYD','AU','cty_SYD','시드니 킹스퍼드 스미스 공항','Sydney Kingsford Smith Airport','시드니공항',50),
('apt_MEL','AIRPORT','MEL','AU','cty_MEL','멜버른공항','Melbourne Airport','툴라마린|tullamarine',30),
('apt_AKL','AIRPORT','AKL','NZ','cty_AKL','오클랜드국제공항','Auckland Airport','',30),
('apt_GUM','AIRPORT','GUM','GU','cty_GUM','괌 국제공항','Antonio B. Won Pat International Airport','괌공항|guam airport|원팻',65),
('apt_SPN','AIRPORT','SPN','MP','cty_SPN','사이판국제공항','Saipan International Airport','',45);

-- 0006_places.sql
-- ---------------------------------------------------------------- Railway stations
INSERT INTO places (id, place_type, code, country_code, parent_id, name_ko, name_en, aliases, popularity) VALUES
('stn_kr_seoul','STATION',NULL,'KR','cty_SEL','서울역','Seoul Station','ktx 서울',95),
('stn_kr_yongsan','STATION',NULL,'KR','cty_SEL','용산역','Yongsan Station','',60),
('stn_kr_suseo','STATION',NULL,'KR','cty_SEL','수서역','Suseo Station','srt 수서',60),
('stn_kr_gwangmyeong','STATION',NULL,'KR','ctr_KR','광명역','Gwangmyeong Station','',40),
('stn_kr_daejeon','STATION',NULL,'KR','ctr_KR','대전역','Daejeon Station','',55),
('stn_kr_dongdaegu','STATION',NULL,'KR','cty_TAE','동대구역','Dongdaegu Station','',60),
('stn_kr_gyeongju','STATION',NULL,'KR','cty_GYJ','경주역','Gyeongju Station','신경주역|singyeongju',45),
('stn_kr_ulsan','STATION',NULL,'KR','ctr_KR','울산역','Ulsan Station','통도사',35),
('stn_kr_busan','STATION',NULL,'KR','cty_PUS','부산역','Busan Station','ktx 부산',90),
('stn_kr_gwangju_songjeong','STATION',NULL,'KR','ctr_KR','광주송정역','Gwangju Songjeong Station','',40),
('stn_kr_gangneung','STATION',NULL,'KR','cty_GNG','강릉역','Gangneung Station','',50),
('stn_kr_yeosu_expo','STATION',NULL,'KR','cty_RSU','여수엑스포역','Yeosu EXPO Station','',35),
('stn_jp_tokyo','STATION',NULL,'JP','cty_TYO','도쿄역','Tokyo Station','東京駅',90),
('stn_jp_shinagawa','STATION',NULL,'JP','cty_TYO','시나가와역','Shinagawa Station','品川駅',50),
('stn_jp_shinyokohama','STATION',NULL,'JP','cty_YOK','신요코하마역','Shin-Yokohama Station','新横浜駅',35),
('stn_jp_nagoya','STATION',NULL,'JP','cty_NGO','나고야역','Nagoya Station','名古屋駅',45),
('stn_jp_kyoto','STATION',NULL,'JP','cty_KYO','교토역','Kyoto Station','京都駅',70),
('stn_jp_shinosaka','STATION',NULL,'JP','cty_OSA','신오사카역','Shin-Osaka Station','新大阪駅',80),
('stn_jp_hiroshima','STATION',NULL,'JP','cty_HIJ','히로시마역','Hiroshima Station','広島駅',30),
('stn_jp_hakata','STATION',NULL,'JP','cty_FUK','하카타역','Hakata Station','博多駅',60),
('stn_fr_paris_nord','STATION',NULL,'FR','cty_PAR','파리 북역','Paris Gare du Nord','gare du nord',55),
('stn_fr_paris_lyon','STATION',NULL,'FR','cty_PAR','파리 리옹역','Paris Gare de Lyon','gare de lyon',35),
('stn_gb_st_pancras','STATION',NULL,'GB','cty_LON','런던 세인트 판크라스','London St Pancras International','st pancras|세인트판크라스',50),
('stn_nl_amsterdam_centraal','STATION',NULL,'NL','cty_AMS','암스테르담 중앙역','Amsterdam Centraal','centraal',30),
('stn_be_brussels_midi','STATION',NULL,'BE','cty_BRU','브뤼셀 남역','Brussels-South (Bruxelles-Midi)','bruxelles midi|brussel zuid',25);

-- 0006_places.sql
-- ---------------------------------------------------------------- Cruise ports
INSERT INTO places (id, place_type, code, country_code, parent_id, name_ko, name_en, aliases, popularity) VALUES
('prt_kr_busan','PORT',NULL,'KR','cty_PUS','부산항 국제크루즈터미널','Busan Port International Cruise Terminal','부산항|영도 크루즈',60),
('prt_kr_incheon','PORT',NULL,'KR','cty_INC','인천항 크루즈터미널','Incheon Port Cruise Terminal','인천항',45),
('prt_kr_jeju','PORT',NULL,'KR','cty_CJU','제주항 국제여객터미널','Jeju Port International Passenger Terminal','제주항',40),
('prt_jp_yokohama','PORT',NULL,'JP','cty_YOK','요코하마 오산바시 국제여객터미널','Yokohama Osanbashi International Passenger Terminal','요코하마항|osanbashi',40),
('prt_jp_fukuoka','PORT',NULL,'JP','cty_FUK','하카타항 국제터미널','Hakata Port International Terminal','하카타항',40),
('prt_sg_marina_bay','PORT',NULL,'SG','cty_SIN','마리나 베이 크루즈 센터','Marina Bay Cruise Centre Singapore','싱가포르 크루즈',45),
('prt_hk_kai_tak','PORT',NULL,'HK','cty_HKG','카이탁 크루즈 터미널','Kai Tak Cruise Terminal','카이탁',35),
('prt_es_barcelona','PORT',NULL,'ES','cty_BCN','바르셀로나항','Port of Barcelona','',35),
('prt_us_miami','PORT',NULL,'US','cty_MIA','마이애미항','PortMiami','port of miami',30);

-- 0006_places.sql
-- ---------------------------------------------------------------- Districts (hotel / transfer destination areas)
INSERT INTO places (id, place_type, code, country_code, parent_id, name_ko, name_en, aliases, popularity) VALUES
('reg_sel_myeongdong','REGION',NULL,'KR','cty_SEL','명동','Myeongdong','명동역|중구',80),
('reg_sel_gangnam','REGION',NULL,'KR','cty_SEL','강남','Gangnam','강남역|서초|역삼',75),
('reg_sel_hongdae','REGION',NULL,'KR','cty_SEL','홍대','Hongdae','홍대입구|마포|연남',70),
('reg_sel_jongno','REGION',NULL,'KR','cty_SEL','종로','Jongno','광화문|인사동',55),
('reg_sel_jamsil','REGION',NULL,'KR','cty_SEL','잠실','Jamsil','송파|롯데월드',50),
('reg_pus_haeundae','REGION',NULL,'KR','cty_PUS','해운대','Haeundae','해운대해수욕장',75),
('reg_cju_seogwipo','REGION',NULL,'KR','cty_CJU','서귀포','Seogwipo','중문',60),
('reg_tyo_shinjuku','REGION',NULL,'JP','cty_TYO','신주쿠','Shinjuku','新宿',85),
('reg_tyo_shibuya','REGION',NULL,'JP','cty_TYO','시부야','Shibuya','渋谷',80),
('reg_tyo_ginza','REGION',NULL,'JP','cty_TYO','긴자','Ginza','銀座',60),
('reg_tyo_asakusa','REGION',NULL,'JP','cty_TYO','아사쿠사','Asakusa','浅草',55),
('reg_tyo_roppongi','REGION',NULL,'JP','cty_TYO','롯폰기','Roppongi','六本木',45),
('reg_osa_namba','REGION',NULL,'JP','cty_OSA','난바','Namba','なんば|도톤보리|dotonbori',85),
('reg_osa_umeda','REGION',NULL,'JP','cty_OSA','우메다','Umeda','梅田|오사카역',65),
('reg_osa_shinsaibashi','REGION',NULL,'JP','cty_OSA','신사이바시','Shinsaibashi','心斎橋',55),
('reg_fuk_tenjin','REGION',NULL,'JP','cty_FUK','텐진','Tenjin','天神',50),
('reg_bkk_sukhumvit','REGION',NULL,'TH','cty_BKK','수쿰윗','Sukhumvit','스쿰빗',55),
('reg_bkk_siam','REGION',NULL,'TH','cty_BKK','시암','Siam','씨암',45),
('reg_dad_my_khe','REGION',NULL,'VN','cty_DAD','미케비치','My Khe Beach','미케 해변',60),
('reg_par_champs','REGION',NULL,'FR','cty_PAR','샹젤리제','Champs-Élysées','champs elysees',45);

-- 0006_places.sql
-- ---------------------------------------------------------------- Landmarks
INSERT INTO places (id, place_type, code, country_code, parent_id, name_ko, name_en, aliases, popularity) VALUES
('lmk_kr_gyeongbokgung','LANDMARK',NULL,'KR','cty_SEL','경복궁','Gyeongbokgung Palace','',60),
('lmk_kr_namsan_tower','LANDMARK',NULL,'KR','cty_SEL','N서울타워','N Seoul Tower','남산타워|남산서울타워',55),
('lmk_kr_lotte_world','LANDMARK',NULL,'KR','cty_SEL','롯데월드','Lotte World','롯데월드 어드벤처',60),
('lmk_jp_usj','LANDMARK',NULL,'JP','cty_OSA','유니버설 스튜디오 재팬','Universal Studios Japan','usj|유니버설|유니버셜',85),
('lmk_jp_disney','LANDMARK',NULL,'JP','cty_TYO','도쿄 디즈니 리조트','Tokyo Disney Resort','디즈니랜드|디즈니씨|disneyland|disneysea',85),
('lmk_jp_shibuya_sky','LANDMARK',NULL,'JP','cty_TYO','시부야 스카이','Shibuya Sky','',55),
('lmk_jp_osaka_castle','LANDMARK',NULL,'JP','cty_OSA','오사카성','Osaka Castle','大阪城',50),
('lmk_jp_fushimi_inari','LANDMARK',NULL,'JP','cty_KYO','후시미 이나리 신사','Fushimi Inari Taisha','伏見稲荷',50),
('lmk_sg_mbs','LANDMARK',NULL,'SG','cty_SIN','마리나 베이 샌즈','Marina Bay Sands','mbs',55),
('lmk_fr_eiffel','LANDMARK',NULL,'FR','cty_PAR','에펠탑','Eiffel Tower','tour eiffel',75),
('lmk_fr_louvre','LANDMARK',NULL,'FR','cty_PAR','루브르 박물관','Louvre Museum','musée du louvre|루브르',70),
('lmk_it_colosseum','LANDMARK',NULL,'IT','cty_ROM','콜로세움','Colosseum','colosseo',55),
('lmk_es_sagrada','LANDMARK',NULL,'ES','cty_BCN','사그라다 파밀리아','Sagrada Família','sagrada familia|성가족성당',55),
('lmk_us_times_square','LANDMARK',NULL,'US','cty_NYC','타임스스퀘어','Times Square','',45),
('lmk_us_liberty','LANDMARK',NULL,'US','cty_NYC','자유의 여신상','Statue of Liberty','',45);

-- 0009_normalize_legacy_status.sql
-- 0009: route residual legacy partner-decision statuses to manual review.
-- Partner confirm/reject used to write raw statuses outside the booking state
-- machine (fixed: it now runs the same decision flow as the operator console).
-- A leftover 'CONFIRMED' row may or may not have a captured payment and never went
-- through fulfilment (no voucher / PNR / refund wiring), so trusting it as a
-- completed sale would invent fulfilment. Following 0002's precedent for legacy
-- CONFIRMED rows, these go to MANUAL_REVIEW_REQUIRED, where an operator (or the
-- partner, via the fixed endpoint with a supplier reference) completes them
-- through the real flow. Idempotent data fix.
UPDATE bookings SET status = 'MANUAL_REVIEW_REQUIRED', status_reason = 'LEGACY_PARTNER_CONFIRM_NEEDS_REVIEW'
WHERE status = 'CONFIRMED';

-- 0010_neutralize_seed_credentials.sql
-- 0010: neutralize the well-known seed partner credentials.
-- 0003 planted three partners (and three staff rows) with the password
-- 'Partner2026!SecureKey', which was also printed on the extranet login page.
-- Any database that ran 0003 must stop accepting that password.
--
-- The UPDATEs below only touch rows that still carry the published hash, so an
-- operator who already rotated a password keeps their value. The replacement is
-- not a valid hash format, so verifyPassword() always rejects it.
-- Rotate to a real password with: node scripts/rotate-partner-password.mjs <email> <new-password> --execute --remote
UPDATE partners
SET password_hash = 'DISABLED_BY_0010_ROTATE_BEFORE_LOGIN'
WHERE id IN ('ptn_htl_01', 'ptn_car_01', 'ptn_tour_01')
  AND password_hash = 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4';

-- 0010_neutralize_seed_credentials.sql
UPDATE partner_staff
SET password_hash = 'DISABLED_BY_0010_ROTATE_BEFORE_LOGIN'
WHERE id IN ('stf_hotel_01', 'stf_car_01', 'stf_tour_01')
  AND password_hash = 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4';

-- 0019_legal_documents.sql
INSERT INTO legal_documents (slug, version, title, effective_from) VALUES
  ('terms', '2.0', '서비스 이용약관', '2026-11-07'),
  ('privacy', '2.0', '개인정보처리방침', '2026-11-07'),
  ('cookies', '1.1', '쿠키 정책', '2026-11-07'),
  ('refund-policy', '2.0', '취소·환불 규정', '2026-11-07');

-- 0020_direct_sales_supplier.sql
-- 0020: seed the first-party (direct sales) supplier.
-- Products with partner_id = 'ptn_direct_01' are sold by getfortrip itself
-- (MERCHANT_OF_RECORD) and fulfilled by operator confirmation in the admin OMS.
-- NOT_INTEGRATED until an admin flips it LIVE via PATCH /admin/suppliers, so
-- seeding alone never makes anything bookable.
INSERT INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, settlement_rate_bps, notes) VALUES
('ptn_direct_01', 'getfortrip 직영', 'ALL', 'direct_contract', 'NOT_INTEGRATED', 'MERCHANT_OF_RECORD', 9000, 'First-party direct sales. Flip to LIVE only when the ACTIVE business entity is registered and PG is contracted.');

-- 0020_direct_sales_supplier.sql
-- Self SUPPLIER contract for first-party sales. Seeded PENDING on purpose:
-- an admin must activate it (PATCH /admin/contracts) as the deliberate
-- go-live step, which the supplier LIVE switch then requires.
INSERT INTO entity_contracts (id, entity_id, contract_type, counterparty, reference, status, notes) VALUES
('ect_direct_01', 'ent_primary', 'SUPPLIER', 'getfortrip (자사 직영)', 'SELF-1P', 'PENDING', 'First-party direct-sales self contract.');

-- 0020_direct_sales_supplier.sql
UPDATE suppliers SET contract_id = 'ect_direct_01' WHERE id = 'ptn_direct_01' AND contract_id IS NULL;

-- 0021_neutralize_migrate_script_credentials.sql
-- 0021: neutralize the shared hash planted by the retired scripts/migrate-d1.js.
-- That script seeded ptn_htl_01/ptn_tour_01/ptn_car_01 with ONE shared PBKDF2
-- hash+salt and reset it on every run (2026-11-09 audit [B]). The script is now
-- a refusal stub, and this migration closes the hole for any database where it
-- ever ran — mirroring 0010, which neutralized the older 0003-planted hash.
--
-- The UPDATEs below only touch rows that still carry the published hash, so an
-- operator who already rotated a password keeps their value. The replacement is
-- not a valid hash format, so verifyPassword() always rejects it.
-- Rotate to a real password with: node scripts/rotate-partner-password.mjs <email> <new-password> --execute --remote
UPDATE partners
SET password_hash = 'DISABLED_BY_0021_ROTATE_BEFORE_LOGIN'
WHERE id IN ('ptn_htl_01', 'ptn_car_01', 'ptn_tour_01')
  AND password_hash = 'pbkdf2:sha256:100000:4a78ff00cace8af97d13f3ecfcc6b9fd:08e886547510d833517452c8ff882b2584009810c41c83c05d67a66869b915a5';

-- 0021_neutralize_migrate_script_credentials.sql
UPDATE partner_staff
SET password_hash = 'DISABLED_BY_0021_ROTATE_BEFORE_LOGIN'
WHERE id IN ('stf_hotel_01', 'stf_car_01', 'stf_tour_01')
  AND password_hash = 'pbkdf2:sha256:100000:4a78ff00cace8af97d13f3ecfcc6b9fd:08e886547510d833517452c8ff882b2584009810c41c83c05d67a66869b915a5';

-- 0025_seed_reference_hygiene.sql
-- 0025: resolve dangling marketplace seed references (2026-11-09 audit [m]).
-- 0005's catalog attribution rows point at upstream supplier ids that were
-- never registered. Register them as unintegrated placeholders so the ids
-- resolve; nothing sells through them (NOT_INTEGRATED is never bookable).
-- Also unsticks ing_sample_02: it was seeded PUBLISHED with no published
-- item, a state the publish flow refuses to touch. REVIEWED = awaiting publish.
INSERT INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, notes) VALUES
('sup_airalo_01', 'Airalo (미계약)', 'ESIM', 'none', 'NOT_INTEGRATED', 'MERCHANT_OF_RECORD', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_chubb_01', 'Chubb (미계약)', 'INSURANCE', 'none', 'NOT_INTEGRATED', 'MERCHANT_OF_RECORD', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_korail_01', 'Korail (미계약)', 'TRAIN', 'none', 'NOT_INTEGRATED', 'MERCHANT_OF_RECORD', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_koreanair_01', 'Korean Air (미계약)', 'FLIGHT', 'none', 'NOT_INTEGRATED', 'MERCHANT_OF_RECORD', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_shilla_01', '신라호텔 (미계약)', 'HOTEL', 'none', 'NOT_INTEGRATED', 'AGENCY', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_lotte_01', '롯데월드 (미계약)', 'ACTIVITY', 'none', 'NOT_INTEGRATED', 'AGENCY', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_mobility_01', '모빌리티 (미계약)', 'CAR', 'none', 'NOT_INTEGRATED', 'AGENCY', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_tokyo_tower', '도쿄 타워 (미계약)', 'ACTIVITY', 'none', 'NOT_INTEGRATED', 'AGENCY', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_bateaux_mouches', 'Bateaux-Mouches (미계약)', 'ACTIVITY', 'none', 'NOT_INTEGRATED', 'AGENCY', 'Upstream placeholder for 0005 marketplace seeds.');

-- 0025_seed_reference_hygiene.sql
UPDATE url_product_ingestions SET status = 'REVIEWED' WHERE id = 'ing_sample_02' AND status = 'PUBLISHED' AND published_item_id IS NULL;

-- 0027_domain_daily_capacity.sql
UPDATE activities SET daily_capacity = 30 WHERE id IN (
  'act_disney_tokyo', 'act_usj_osaka', 'act_fuji_tour',
  'act_lotte_world', 'act_louvre_tour', 'act_esim_japan'
);

-- 0027_domain_daily_capacity.sql
UPDATE transfers SET daily_capacity = 10 WHERE id IN (
  'tf_icn_van_01', 'tf_icn_sedan_01', 'tf_icn_comfort_01', 'tf_icn_luxury_01',
  'tf_gmp_van_01', 'tf_hnd_van_01', 'tf_nrt_van_01', 'tf_kix_van_01'
);

-- 0027_domain_daily_capacity.sql
UPDATE packages SET daily_capacity = 16 WHERE id IN (
  'pkg_tokyo_4d3n', 'pkg_osaka_3d2n', 'pkg_bangkok_5d4n', 'pkg_paris_6d5n'
);

-- 0028_user_consents.sql
-- Privacy 2.1: processor/offshore disclosure table (A6). Terms 2.1: 1P
-- direct-sales clause alongside intermediary terms (A7).
UPDATE legal_documents SET version = '2.1' WHERE slug IN ('privacy', 'terms');

-- 0030_legal_versions_2_1.sql
-- 0030: legal version bump for Phase 3 (A6/A7). Privacy gains the
-- processor/cross-border transfer table + CPO binding; terms splits the
-- sales-type disclosure (1P direct / 3P agency / affiliate).
UPDATE legal_documents SET version = '2.1', effective_from = '2026-11-10', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slug IN ('terms', 'privacy');

-- 0033_content_cleanup.sql
-- 0033: C8 stock-photo & fabricated-score cleanup (activation flags already
-- exist on all 7 catalog tables via 0014/0017).

-- Drop fabricated seed amenities only on rows carrying stock photos (the same
-- fabricated batch). Partner-entered rows (upload URLs or NULLs) are untouched.
UPDATE hotels SET amenities_json = '[]' WHERE thumbnail_url ILIKE '%unsplash%' OR images_json ILIKE '%unsplash%';

-- 0033_content_cleanup.sql
-- Stock photos out (partner uploads replace them); scores recomputed from real
-- reviews, NULL when none exist yet.
UPDATE hotels SET thumbnail_url = NULL WHERE thumbnail_url ILIKE '%unsplash%';

-- 0033_content_cleanup.sql
UPDATE hotels SET images_json = '[]' WHERE images_json ILIKE '%unsplash%';

-- 0033_content_cleanup.sql
UPDATE hotels SET review_count = (SELECT COUNT(*) FROM reviews WHERE domain_type = 'HOTEL' AND target_id = hotels.id);

-- 0033_content_cleanup.sql
UPDATE hotels SET review_score = (SELECT AVG(rating) FROM reviews WHERE domain_type = 'HOTEL' AND target_id = hotels.id);

-- 0033_content_cleanup.sql
UPDATE cars SET image_url = NULL WHERE image_url ILIKE '%unsplash%';

-- 0033_content_cleanup.sql
UPDATE transfers SET image_url = NULL WHERE image_url ILIKE '%unsplash%';

-- 0033_content_cleanup.sql
UPDATE activities SET thumbnail_url = NULL WHERE thumbnail_url ILIKE '%unsplash%';

-- 0033_content_cleanup.sql
UPDATE activities SET review_count = (SELECT COUNT(*) FROM reviews WHERE domain_type = 'ACTIVITY' AND target_id = activities.id);

-- 0033_content_cleanup.sql
UPDATE activities SET review_score = (SELECT AVG(rating) FROM reviews WHERE domain_type = 'ACTIVITY' AND target_id = activities.id);

-- 0033_content_cleanup.sql
UPDATE packages SET thumbnail_url = NULL WHERE thumbnail_url ILIKE '%unsplash%';

-- 0033_content_cleanup.sql
UPDATE packages SET details_json = (jsonb_set(details_json::jsonb, '{gallery}', '[]'::jsonb)::text) WHERE details_json ILIKE '%unsplash%';

-- 0035_ghost_cleanup_affiliate_once.sql
-- 0035: marketplace ghost cleanup + affiliate conversion idempotency key.
--
-- #18: three ACTIVE marketplace rows point at domain items that never existed
-- (a Shilla item that is not in hotels, two ingest samples). They are removed
-- so the public catalog can no longer surface phantom products. (ESIM/INS
-- rows stay: their unquotability is handled separately by #40.)
-- #21: concurrent postbacks for one order both passed the NOT EXISTS check and
-- double-booked commission. A unique key makes double-insert impossible; any
-- pre-existing duplicates are collapsed to the earliest row first.

DELETE FROM marketplace_catalog_items
WHERE id IN ('mkt_htl_shilla_01', 'mkt_ing_sample_01', 'mkt_ing_sample_02');

-- 0035_ghost_cleanup_affiliate_once.sql
DELETE FROM affiliate_conversions
WHERE ctid NOT IN (
  SELECT MIN(ctid) FROM affiliate_conversions GROUP BY partner_name, order_id
);

-- 0037_fulfilment_truth.sql
-- #39/#40/#43: 1P rows for domains with no production sales path (quote 409s)
-- must not sit ACTIVE in the public catalog. PAUSED hides them from the
-- public ACTIVE listing; settlement attribution reads by domain+item with no
-- status filter, so fulfilled-booking accounting is unaffected.
UPDATE marketplace_catalog_items SET status = 'PAUSED', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id IN ('mkt_esim_jp_01', 'mkt_ins_standard', 'mkt_flt_ke723', 'mkt_trn_ktx_025');

-- 0037_fulfilment_truth.sql
-- #46: these flags advertised ON+ACTIVE capabilities with no implementation
-- (no eSIM purchase path, no realtime inventory sync, no auto-confirmation
-- rail, no supplier API integration). Off + PENDING_CONTRACT until built.
-- None of them is enforced anywhere (money gates check only the *_BOOKING /
-- TRANSIT_TICKETS domain flags), so this changes advertising, not behavior.
UPDATE feature_flags SET is_enabled = 0, default_enabled = 0, external_contract_status = 'PENDING_CONTRACT', updated_by = 'migration_0037'
  WHERE key IN ('ESIM', 'REALTIME_INVENTORY_SYNC', 'AUTO_BOOKING_CONFIRMATION', 'SUPPLIER_API_INTEGRATION');

-- 0038_ops_truth.sql
-- #49: PARTNER_SELF_PRODUCT_REGISTRATION gates partner product registration
-- (routes/marketplace.ts). It shipped in 0005, but any database that applied
-- 0005 without that row has a dead kill-switch (isFeatureEnabled fails open
-- and PATCH 404s). Backfill only when missing — never clobber an operator's
-- toggle the way OR REPLACE would.
INSERT INTO feature_flags (key, category, display_name, description, is_enabled, default_enabled, requires_flags, is_external_dependent, external_contract_status, updated_by)
SELECT 'PARTNER_SELF_PRODUCT_REGISTRATION', 'PRODUCT_INGESTION', '파트너 자체 상품 등록', '입점 파트너가 익스트라넷에서 신규 상품을 직접 등록하고 요금/재고를 설정하는 기능', 1, 1, '["MARKETPLACE_3P_PARTNER"]', 0, 'NOT_REQUIRED', 'migration_0038'
WHERE NOT EXISTS (SELECT 1 FROM feature_flags WHERE key = 'PARTNER_SELF_PRODUCT_REGISTRATION');

-- 0038_ops_truth.sql
-- #50: these 12 flags gate no code path — toggling them is theater. Delete
-- them so the registry contains only enforced flags. Behavior is unchanged:
-- nothing in worker/src references any of these keys.
-- (ESIM/TRAVEL_INSURANCE purchases stay 409 via assertQuotableDomain; plan
-- listings stay live per #145. Cancel/refund/settle stay code-defined.)
DELETE FROM feature_flags WHERE key IN (
  'AI_TRANSLATION',
  'REALTIME_INVENTORY_SYNC',
  'AUTO_BOOKING_CONFIRMATION',
  'PARTNER_AUTO_DISPATCH',
  'AUTO_BOOKING_DISPATCH',
  'AUTO_CANCEL_REFUND',
  'AUTO_SETTLEMENT',
  'AUTO_PARTNER_SETTLEMENT',
  'AUTO_SUPPLIER_SETTLEMENT',
  'SUPPLIER_API_INTEGRATION',
  'ESIM',
  'TRAVEL_INSURANCE'
);

-- 0038_ops_truth.sql
-- #118 (folded in early): FLIGHT_BOOKING required the now-deleted
-- REALTIME_INVENTORY_SYNC, which no code ever consulted — an undeletable
-- dead precondition. Clear it; the domain flag itself still gates quotes.
UPDATE feature_flags SET requires_flags = '[]', updated_by = 'migration_0038'
  WHERE key = 'FLIGHT_BOOKING';

-- 0040_p2b_indexes_attribution.sql
UPDATE flights SET partner_id = NULL
  WHERE partner_id IS NOT NULL AND partner_id NOT IN (SELECT id FROM partners);

-- 0040_p2b_indexes_attribution.sql
UPDATE bookings SET partner_id = NULL
  WHERE partner_id IS NOT NULL AND partner_id NOT IN (SELECT id FROM partners);

-- 0044_backfill_total_minor.sql
-- 0044: one-time backfill of integer-minor totals (P3 #151).
-- Legacy rows may carry total_minor NULL (the column postdates the table);
-- readers fall back to the REAL total_price column for those rows. After this
-- backfill the integer column is the sole source of truth and new writes stop
-- maintaining the REAL twins (base/tax/service-fee/cancel-fee/refund twins go
-- unwritten; total_price keeps its NOT NULL write until a table rebuild, and
-- discount_amount_krw stays as the single functional discount store).
UPDATE bookings SET total_minor = CAST(ROUND(total_price) AS INTEGER) WHERE total_minor IS NULL;

COMMIT;

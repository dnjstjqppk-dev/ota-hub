-- 0004 Feature Flags, URL Product Ingestion Engine, and Travel Category Extensions
-- ==============================================================================

-- 1. Feature Flags Central Registry
CREATE TABLE IF NOT EXISTS feature_flags (
    key TEXT PRIMARY KEY,
    category TEXT NOT NULL, -- 'BOOKING_DOMAIN', 'PRODUCT_INGESTION', 'AUTOMATION', 'FINANCIAL', 'SYSTEM'
    display_name TEXT NOT NULL,
    description TEXT NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    default_enabled INTEGER NOT NULL DEFAULT 1,
    requires_flags TEXT NOT NULL DEFAULT '[]', -- JSON array of required flag keys
    is_external_dependent INTEGER NOT NULL DEFAULT 0,
    external_contract_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED', -- 'NOT_REQUIRED', 'PENDING_CONTRACT', 'ACTIVE'
    updated_by TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_feature_flags_cat ON feature_flags(category, is_enabled);

-- 2. URL Product Ingestion Engine
CREATE TABLE IF NOT EXISTS url_product_ingestions (
    id TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    domain_type TEXT NOT NULL DEFAULT 'ACTIVITY', -- 'ACTIVITY', 'HOTEL', 'CAR', 'PACKAGE', 'TRANSFER', 'TICKET'
    title TEXT NOT NULL,
    summary TEXT,
    description TEXT,
    image_urls TEXT NOT NULL DEFAULT '[]', -- JSON array of URLs
    currency TEXT NOT NULL DEFAULT 'KRW',
    price_minor INTEGER NOT NULL DEFAULT 0,
    original_price_minor INTEGER,
    options_json TEXT NOT NULL DEFAULT '[]', -- JSON array of options
    country TEXT,
    city TEXT,
    address TEXT,
    latitude REAL,
    longitude REAL,
    duration_mins INTEGER,
    inclusions_json TEXT NOT NULL DEFAULT '[]', -- JSON array
    exclusions_json TEXT NOT NULL DEFAULT '[]', -- JSON array
    terms_json TEXT NOT NULL DEFAULT '[]', -- JSON array
    cancellation_policy TEXT,
    supplier_name TEXT,
    supplier_sku TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'REVIEWED', 'PUBLISHED', 'REJECTED'
    raw_html_meta TEXT, -- Extracted JSON-LD and OpenGraph metadata
    published_item_id TEXT,
    published_at TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_url_ingestions_status ON url_product_ingestions(status, domain_type);

-- 3. eSIM Plans
CREATE TABLE IF NOT EXISTS esim_plans (
    id TEXT PRIMARY KEY,
    country_code TEXT NOT NULL,
    country_name TEXT NOT NULL,
    data_quota_mb INTEGER NOT NULL, -- -1 for unlimited
    validity_days INTEGER NOT NULL,
    network_carrier TEXT NOT NULL,
    price_minor INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'KRW',
    speed_spec TEXT NOT NULL DEFAULT '5G/LTE High Speed',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_esim_country ON esim_plans(country_code, is_active);

-- 4. Travel Insurance Plans
CREATE TABLE IF NOT EXISTS travel_insurance_plans (
    id TEXT PRIMARY KEY,
    plan_name TEXT NOT NULL,
    tier TEXT NOT NULL, -- 'BASIC', 'STANDARD', 'PREMIUM'
    target_region TEXT NOT NULL DEFAULT 'WORLDWIDE',
    medical_coverage_minor INTEGER NOT NULL,
    baggage_loss_coverage_minor INTEGER NOT NULL,
    cancellation_coverage_minor INTEGER NOT NULL,
    daily_rate_minor INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'KRW',
    underwriter TEXT NOT NULL DEFAULT 'Chubb Insurance',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 5. Activity Time Slots & Capacity
CREATE TABLE IF NOT EXISTS activity_time_slots (
    id TEXT PRIMARY KEY,
    activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    slot_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    max_capacity INTEGER NOT NULL DEFAULT 30,
    booked_count INTEGER NOT NULL DEFAULT 0,
    price_adult_minor INTEGER NOT NULL,
    price_child_minor INTEGER NOT NULL,
    is_closed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(activity_id, slot_date, start_time)
);
CREATE INDEX IF NOT EXISTS idx_activity_slots ON activity_time_slots(activity_id, slot_date);

-- 6. Seed Feature Flags (16 Core Managed Flags)
INSERT OR REPLACE INTO feature_flags (key, category, display_name, description, is_enabled, default_enabled, requires_flags, is_external_dependent, external_contract_status, updated_by) VALUES
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

-- 7. Seed eSIM Plans
INSERT OR REPLACE INTO esim_plans (id, country_code, country_name, data_quota_mb, validity_days, network_carrier, price_minor, speed_spec) VALUES
('esim_jp_01', 'JP', '일본', 3072, 3, 'SoftBank / NTT Docomo', 6900, '5G High-Speed'),
('esim_jp_02', 'JP', '일본', 5120, 5, 'SoftBank / NTT Docomo', 9900, '5G High-Speed'),
('esim_jp_03', 'JP', '일본', -1, 5, 'SoftBank (매일 2GB 후 속도제어)', 14900, '5G Unlimited'),
('esim_us_01', 'US', '미국/캐나다', 5120, 7, 'AT&T / T-Mobile', 18900, '5G LTE High-Speed'),
('esim_vn_01', 'VN', '베트남', 10240, 7, 'Viettel / Vinaphone', 7900, '4G LTE'),
('esim_eu_01', 'EU', '유럽 33개국 통합', 10240, 15, 'Vodafone / Orange / O2', 24900, '5G/4G Multi-Carrier');

-- 8. Seed Travel Insurance Plans
INSERT OR REPLACE INTO travel_insurance_plans (id, plan_name, tier, target_region, medical_coverage_minor, baggage_loss_coverage_minor, cancellation_coverage_minor, daily_rate_minor, underwriter) VALUES
('ins_basic', '실속 알뜰 플랜', 'BASIC', 'WORLDWIDE', 10000000, 500000, 500000, 2400, 'Chubb 에이스손해보험'),
('ins_standard', '표준 안심 플랜', 'STANDARD', 'WORLDWIDE', 30000000, 1000000, 1000000, 4800, 'Chubb 에이스손해보험'),
('ins_premium', '프리미엄 VIP 케어 플랜', 'PREMIUM', 'WORLDWIDE', 70000000, 2000000, 2000000, 8900, 'Chubb 에이스손해보험');

-- 9. Seed Sample Ingested Travel Products
INSERT OR REPLACE INTO url_product_ingestions (id, source_url, domain_type, title, summary, description, image_urls, currency, price_minor, original_price_minor, options_json, country, city, address, latitude, longitude, duration_mins, inclusions_json, exclusions_json, terms_json, cancellation_policy, supplier_name, status) VALUES
('ing_sample_01', 'https://travel.example.com/tokyo-skytree-admission', 'ACTIVITY', '도쿄 스카이트리 전망대 (350m & 450m) 모바일 패스트 패스', '세계 최고 높이의 전파탑에서 즐기는 도쿄 360도 파노라마 뷰 및 덴보회랑 입장권', '도쿄 스카이트리 덴보데크(350m)와 덴보회랑(450m)을 줄 서지 않고 바로 입장할 수 있는 모바일 QR 패스입니다.', '["https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80"]', 'KRW', 24800, 31000, '[{"name":"덴보데크(350m) 주간 입장권","price_minor":24800,"max_pax":10},{"name":"덴보데크 + 덴보회랑(450m) 콤보 세트","price_minor":35000,"max_pax":10}]', '일본', '도쿄', '1 Chome-1-2 Oshiage, Sumida City, Tokyo', 35.710063, 139.8107, 120, '["도쿄 스카이트리 덴보데크 입장권","소비세"]', '["개인 경비","VR 체험 시설 이용료"]', '["바우처 유효기간: 예약일 당일에 한함","모바일 화면의 QR코드를 전용 게이트에 스캔"]', '예약일 24시간 전까지 100% 무료 취소 가능', '도쿄 타워 스카이 익스플로러', 'REVIEWED'),
('ing_sample_02', 'https://travel.example.com/paris-seine-river-dinner-cruise', 'ACTIVITY', '파리 세느강 바토무슈 디너 크루즈 & 3코스 프렌치 다이닝', '에펠탑과 루브르의 야경을 감상하며 즐기는 낭만적인 세느강 유람선 샴페인 디너', '파리 중심부를 가로지르는 2시간 15분의 럭셔리 크루즈. 신선한 현지 식재료로 조리된 정통 3코스 프랑스식 디찬과 라이브 재즈 음악이 함께합니다.', '["https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80"]', 'KRW', 129000, 150000, '[{"name":"스탠다드 디너 (창가석 제외)","price_minor":129000,"max_pax":6},{"name":"프레스티지 샴페인 디너 (창가 전용석)","price_minor":189000,"max_pax":4}]', '프랑스', '파리', 'Port de la Conference, 75008 Paris, France', 48.8638, 2.3126, 135, '["2시간 15분 세느강 크루즈","셰프 추천 3코스 디너","프랑스산 샴페인 1잔"]', '["선착장 왕복 픽업 서비스","추가 음료"]', '["드레스 코드: 스마트 캐주얼 (운동복/슬리퍼 입장 불가)","출발 30분 전 탑승구 도착 필수"]', '이용 3일 전 100% 환불, 이후 취소 불가', 'Bateaux-Mouches Paris S.A.', 'PUBLISHED');


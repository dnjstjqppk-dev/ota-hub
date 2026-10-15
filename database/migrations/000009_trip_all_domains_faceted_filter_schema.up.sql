-- =========================================================================
-- getfortrip Global OTA: Trip-Style All-Domains Faceted Filter Engine Schema
-- Migration 000009: Full 7-Domain Dynamic Filter Taxonomy & Index Architecture
-- Target Database: PostgreSQL 16
-- =========================================================================

-- 1. 전 도메인 필터 메타데이터 정의 마스터 테이블 (domain_filter_definitions)
CREATE TABLE IF NOT EXISTS domain_filter_definitions (
    id VARCHAR(64) PRIMARY KEY,
    domain_type VARCHAR(32) NOT NULL, -- 'HOTEL', 'FLIGHT', 'TRAIN', 'CAR', 'TRANSFER', 'ACTIVITY', 'PACKAGE'
    filter_group VARCHAR(64) NOT NULL, -- e.g., 'POPULAR', 'PRICE', 'STAR_RATING', 'AIRLINE', 'VEHICLE_TYPE', 'AMENITIES'
    filter_key VARCHAR(64) NOT NULL, -- e.g., 'star_rating', 'stops', 'transmission', 'insurance_super_cdw'
    display_name_ko VARCHAR(100) NOT NULL,
    display_name_en VARCHAR(100) NOT NULL,
    ui_control_type VARCHAR(32) NOT NULL, -- 'CHECKBOX_LIST', 'RADIO_GROUP', 'RANGE_SLIDER', 'BOOLEAN_SWITCH', 'TAG_MULTI_SELECT'
    icon VARCHAR(50),
    sort_order INT NOT NULL DEFAULT 0,
    is_collapsed_by_default BOOLEAN DEFAULT FALSE,
    is_searchable BOOLEAN DEFAULT FALSE,
    options JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{id, label_ko, label_en, value, count_hint, icon}]
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_domain_filter_key UNIQUE (domain_type, filter_key)
);

CREATE INDEX IF NOT EXISTS idx_domain_filter_lookup 
    ON domain_filter_definitions (domain_type, is_active, sort_order ASC);

-- 2. 도메인별 실시간 패싯 카운트 캐시/집계 테이블 (domain_filter_facets)
CREATE TABLE IF NOT EXISTS domain_filter_facets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_type VARCHAR(32) NOT NULL,
    target_location VARCHAR(100) NOT NULL, -- City or Airport or Station
    filter_key VARCHAR(64) NOT NULL,
    facet_value VARCHAR(100) NOT NULL,
    item_count INT NOT NULL DEFAULT 0,
    min_price_krw NUMERIC(12, 2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_facets_query
    ON domain_filter_facets (domain_type, target_location, filter_key);

-- =========================================================================
-- 3. 7개 도메인별 Trip-Style 상세 필터 컬럼 확장
-- =========================================================================

-- (1) 호텔 (HOTELS)
ALTER TABLE hotel_properties
    ADD COLUMN IF NOT EXISTS guest_rating_category VARCHAR(30) DEFAULT 'EXCEPTIONAL', -- 'EXCEPTIONAL_9_PLUS', 'SUPERB_8_PLUS', 'GOOD_7_PLUS'
    ADD COLUMN IF NOT EXISTS stay_themes JSONB DEFAULT '["CITY_CENTER", "SHOPPING", "LUXURY_STAY"]'::jsonb,
    ADD COLUMN IF NOT EXISTS brand_chain VARCHAR(100) DEFAULT 'HYATT',
    ADD COLUMN IF NOT EXISTS bed_types JSONB DEFAULT '["KING", "TWIN"]'::jsonb,
    ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '["PAY_NOW", "PAY_AT_HOTEL"]'::jsonb,
    ADD COLUMN IF NOT EXISTS facilities_checklist JSONB DEFAULT '{"swimming_pool": true, "fitness_center": true, "spa": true, "free_wifi": true, "free_parking": true, "ev_charging": true, "airport_shuttle": true, "restaurant": true, "bar": true, "front_desk_24h": true}'::jsonb,
    ADD COLUMN IF NOT EXISTS room_amenities JSONB DEFAULT '{"bathtub": true, "window": true, "balcony": true, "kitchen": false, "washer": false, "non_smoking": true}'::jsonb,
    ADD COLUMN IF NOT EXISTS accessibility_features JSONB DEFAULT '{"wheelchair_accessible": true, "elevator": true, "roll_in_shower": true}'::jsonb,
    ADD COLUMN IF NOT EXISTS sustainability_certified BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_hotel_facilities_gin ON hotel_properties USING gin (facilities_checklist);
CREATE INDEX IF NOT EXISTS idx_hotel_stay_themes_gin ON hotel_properties USING gin (stay_themes);
CREATE INDEX IF NOT EXISTS idx_hotel_bed_types_gin ON hotel_properties USING gin (bed_types);

-- (2) 항공권 (FLIGHTS)
ALTER TABLE flight_schedules
    ADD COLUMN IF NOT EXISTS airline_alliance VARCHAR(30) DEFAULT 'SKYTEAM', -- 'STAR_ALLIANCE', 'SKYTEAM', 'ONEWORLD', 'LCC'
    ADD COLUMN IF NOT EXISTS aircraft_body_type VARCHAR(20) DEFAULT 'WIDE_BODY', -- 'WIDE_BODY', 'NARROW_BODY'
    ADD COLUMN IF NOT EXISTS in_flight_amenities JSONB DEFAULT '{"wifi": true, "usb_power": true, "seatback_screen": true, "meal_included": true}'::jsonb,
    ADD COLUMN IF NOT EXISTS layover_max_duration_mins INT DEFAULT 360,
    ADD COLUMN IF NOT EXISTS baggage_included BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS seat_selection_free BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS ticket_change_flexible BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_flights_alliance ON flight_schedules (airline_alliance, cabin_class, stops);
CREATE INDEX IF NOT EXISTS idx_flights_amenities_gin ON flight_schedules USING gin (in_flight_amenities);

-- (3) 기차표 (TRAINS)
ALTER TABLE train_journeys
    ADD COLUMN IF NOT EXISTS train_speed_category VARCHAR(30) DEFAULT 'HIGH_SPEED_300KM', -- 'HIGH_SPEED_300KM', 'SEMI_HIGH_SPEED', 'CONVENTIONAL'
    ADD COLUMN IF NOT EXISTS train_amenities JSONB DEFAULT '{"power_outlets": true, "free_wifi": true, "dining_car": true, "quiet_zone": true, "oversized_luggage_area": true}'::jsonb,
    ADD COLUMN IF NOT EXISTS seat_selection_mode VARCHAR(30) DEFAULT 'WINDOW_OR_AISLE',
    ADD COLUMN IF NOT EXISTS ticket_flexibility VARCHAR(30) DEFAULT 'FREE_CHANGE_ONCE',
    ADD COLUMN IF NOT EXISTS free_cancellation_hours INT DEFAULT 24;

CREATE INDEX IF NOT EXISTS idx_trains_amenities_gin ON train_journeys USING gin (train_amenities);

-- (4) 렌터카 (CARS)
ALTER TABLE car_rental_catalog
    ADD COLUMN IF NOT EXISTS fuel_policy VARCHAR(30) DEFAULT 'FULL_TO_FULL', -- 'FULL_TO_FULL', 'SAME_TO_SAME'
    ADD COLUMN IF NOT EXISTS mileage_policy VARCHAR(30) DEFAULT 'UNLIMITED', -- 'UNLIMITED', 'LIMITED'
    ADD COLUMN IF NOT EXISTS supplier_rating NUMERIC(3, 1) DEFAULT 4.9,
    ADD COLUMN IF NOT EXISTS insurance_tier VARCHAR(30) DEFAULT 'SUPER_CDW_ZERO_DEDUCTIBLE', -- 'SUPER_CDW_ZERO_DEDUCTIBLE', 'BASIC_CDW'
    ADD COLUMN IF NOT EXISTS pickup_service_type VARCHAR(30) DEFAULT 'AIRPORT_TERMINAL_DESK', -- 'AIRPORT_TERMINAL_DESK', 'FREE_SHUTTLE', 'CITY_BRANCH'
    ADD COLUMN IF NOT EXISTS car_features JSONB DEFAULT '{"navigation_gps": true, "bluetooth": true, "rear_camera": true, "dash_cam": true, "child_seat": true, "snow_tires": false}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_cars_features_gin ON car_rental_catalog USING gin (car_features);
CREATE INDEX IF NOT EXISTS idx_cars_insurance_tier ON car_rental_catalog (pickup_city, insurance_tier, supplier_rating);

-- (5) 공항 픽업 (TRANSFERS)
ALTER TABLE airport_transfer_catalog
    ADD COLUMN IF NOT EXISTS vehicle_tier_code VARCHAR(30) DEFAULT 'BUSINESS_VAN',
    ADD COLUMN IF NOT EXISTS driver_languages VARCHAR(20)[] DEFAULT '{"KO", "EN"}',
    ADD COLUMN IF NOT EXISTS included_perks JSONB DEFAULT '{"flight_tracking": true, "free_waiting_60m": true, "meet_and_greet": true, "toll_parking_included": true, "complimentary_water": true}'::jsonb,
    ADD COLUMN IF NOT EXISTS child_booster_available BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_transfers_perks_gin ON airport_transfer_catalog USING gin (included_perks);

-- (6) 투어·티켓 (ACTIVITIES)
ALTER TABLE activity_catalog
    ADD COLUMN IF NOT EXISTS sub_category VARCHAR(50) DEFAULT 'THEME_PARK',
    ADD COLUMN IF NOT EXISTS admission_ticket_type VARCHAR(30) DEFAULT 'DIRECT_QR_TURNSTILE', -- 'DIRECT_QR_TURNSTILE', 'EXCHANGE_VOUCHER'
    ADD COLUMN IF NOT EXISTS confirmation_speed VARCHAR(30) DEFAULT 'INSTANT_SECONDS', -- 'INSTANT_SECONDS', 'WITHIN_2_HOURS'
    ADD COLUMN IF NOT EXISTS itinerary_flexibility VARCHAR(30) DEFAULT 'OPEN_DATE_30DAYS',
    ADD COLUMN IF NOT EXISTS wheelchair_accessible BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS child_friendly BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_activity_admission_ticket ON activity_catalog (city, sub_category, admission_ticket_type);

-- (7) 다이내믹 패키지 (PACKAGES)
ALTER TABLE dynamic_package_bundles
    ADD COLUMN IF NOT EXISTS bundle_theme VARCHAR(50) DEFAULT 'LUXURY_CITY_BREAK',
    ADD COLUMN IF NOT EXISTS customizable_flight BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS customizable_hotel BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS included_perks JSONB DEFAULT '{"airport_pickup": true, "hotel_breakfast": true, "travel_insurance": true}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_packages_perks_gin ON dynamic_package_bundles USING gin (included_perks);

-- =========================================================================
-- 4. getfortrip 전 도메인 필터 메타데이터 시드 데이터 주입 (Seed Filter Definitions)
-- =========================================================================

-- (1) 호텔 필터 정의 (Hotels Filter Taxonomy)
INSERT INTO domain_filter_definitions (id, domain_type, filter_group, filter_key, display_name_ko, display_name_en, ui_control_type, icon, sort_order, options)
VALUES
('flt_hotel_star', 'HOTEL', 'POPULAR', 'star_rating', '호텔 성급', 'Star Rating', 'CHECKBOX_LIST', '⭐', 1, '[
  {"id": "5", "label_ko": "5성급 럭셔리", "label_en": "5 Stars Luxury", "value": 5, "count_hint": 320},
  {"id": "4", "label_ko": "4성급 고급", "label_en": "4 Stars High-end", "value": 4, "count_hint": 580},
  {"id": "3", "label_ko": "3성급 가성비", "label_en": "3 Stars Comfort", "value": 3, "count_hint": 740},
  {"id": "2", "label_ko": "2성급 이하 실속", "label_en": "2 Stars or below", "value": 2, "count_hint": 190}
]'::jsonb),
('flt_hotel_price', 'HOTEL', 'PRICE', 'price_range', '1박 요금 범위', 'Price per Night', 'RANGE_SLIDER', '₩', 2, '[
  {"id": "under_100k", "label_ko": "10만원 미만", "label_en": "Under ₩100,000", "min": 0, "max": 100000},
  {"id": "100k_200k", "label_ko": "10만원 ~ 20만원", "label_en": "₩100,000 - ₩200,000", "min": 100000, "max": 200000},
  {"id": "200k_350k", "label_ko": "20만원 ~ 35만원", "label_en": "₩200,000 - ₩350,000", "min": 200000, "max": 350000},
  {"id": "350k_plus", "label_ko": "35만원 이상 특급", "label_en": "₩350,000+", "min": 350000, "max": 2000000}
]'::jsonb),
('flt_hotel_guest_score', 'HOTEL', 'RATING', 'review_score', '고객 평점', 'Guest Rating', 'RADIO_GROUP', '❤️', 3, '[
  {"id": "score_4_8", "label_ko": "4.8점 이상 (최고예요)", "label_en": "4.8+ Exceptional", "value": 4.8},
  {"id": "score_4_5", "label_ko": "4.5점 이상 (아주 좋아요)", "label_en": "4.5+ Wonderful", "value": 4.5},
  {"id": "score_4_0", "label_ko": "4.0점 이상 (좋아요)", "label_en": "4.0+ Very Good", "value": 4.0}
]'::jsonb),
('flt_hotel_property_type', 'HOTEL', 'PROPERTY', 'property_type', '숙소 유형', 'Property Type', 'CHECKBOX_LIST', '🏨', 4, '[
  {"id": "HOTEL", "label_ko": "호텔", "label_en": "Hotel", "value": "HOTEL", "count_hint": 1420},
  {"id": "RESORT", "label_ko": "리조트", "label_en": "Resort", "value": "RESORT", "count_hint": 310},
  {"id": "APARTMENT", "label_ko": "아파트 / 레지던스", "label_en": "Apartment / Residence", "value": "APARTMENT", "count_hint": 240},
  {"id": "RYOKAN", "label_ko": "전통 료칸", "label_en": "Ryokan", "value": "RYOKAN", "count_hint": 85},
  {"id": "VILLA", "label_ko": "풀빌라", "label_en": "Pool Villa", "value": "VILLA", "count_hint": 65}
]'::jsonb),
('flt_hotel_policies', 'HOTEL', 'POLICY', 'policies', '예약 및 취소 규정', 'Reservation Policies', 'CHECKBOX_LIST', '🛡️', 5, '[
  {"id": "free_cancel", "label_ko": "무료 취소 가능 (위약금 0원)", "label_en": "Free Cancellation", "key": "free_cancellation", "value": true},
  {"id": "free_breakfast", "label_ko": "무료 조식 포함 플랜", "label_en": "Breakfast Included", "key": "free_breakfast", "value": true},
  {"id": "pay_at_hotel", "label_ko": "현장 결제 가능 (사전결제 불필요)", "label_en": "Pay at Hotel", "key": "pay_at_hotel", "value": true},
  {"id": "instant_confirm", "label_ko": "대기 없는 즉시 확정", "label_en": "Instant Confirmation", "key": "instant_confirmation", "value": true}
]'::jsonb),
('flt_hotel_amenities', 'HOTEL', 'FACILITIES', 'amenities', '호텔 편의시설', 'Hotel Facilities', 'CHECKBOX_LIST', '🏊', 6, '[
  {"id": "swimming_pool", "label_ko": "수영장 / 인피니티풀", "label_en": "Swimming Pool", "icon": "🏊"},
  {"id": "fitness", "label_ko": "피트니스 센터", "label_en": "Fitness Gym", "icon": "🏋️"},
  {"id": "spa", "label_ko": "사우나 & 스파", "label_en": "Spa & Sauna", "icon": "🧖"},
  {"id": "free_parking", "label_ko": "무료 주차장", "label_en": "Free Parking", "icon": "🅿️"},
  {"id": "ev_charge", "label_ko": "전기차 충전소", "label_en": "EV Charging Station", "icon": "🔌"},
  {"id": "airport_shuttle", "label_ko": "공항 무료 셔틀", "label_en": "Airport Shuttle", "icon": "🚐"},
  {"id": "pet_friendly", "label_ko": "반려동물 동반 가능", "label_en": "Pet Friendly", "icon": "🐾"}
]'::jsonb),
('flt_hotel_room_features', 'HOTEL', 'ROOM_FACETS', 'room_features', '객실 내 옵션', 'Room Features', 'CHECKBOX_LIST', '🛏️', 7, '[
  {"id": "bathtub", "label_ko": "욕조 완비", "label_en": "Bathtub", "icon": "🛁"},
  {"id": "window_view", "label_ko": "전망 있는 창문 (시티/오션뷰)", "label_en": "Scenic Window View", "icon": "🪟"},
  {"id": "non_smoking", "label_ko": "금연 객실 보장", "label_en": "Non-smoking Room", "icon": "🚭"},
  {"id": "king_bed", "label_ko": "킹사이즈 더블베드", "label_en": "King Double Bed", "icon": "🛏️"},
  {"id": "balcony", "label_ko": "개별 발코니 / 테라스", "label_en": "Balcony / Terrace", "icon": "🌅"}
]'::jsonb)
ON CONFLICT (domain_type, filter_key) DO UPDATE SET
  options = EXCLUDED.options,
  display_name_ko = EXCLUDED.display_name_ko,
  ui_control_type = EXCLUDED.ui_control_type,
  updated_at = NOW();

-- (2) 항공권 필터 정의 (Flights Filter Taxonomy)
INSERT INTO domain_filter_definitions (id, domain_type, filter_group, filter_key, display_name_ko, display_name_en, ui_control_type, icon, sort_order, options)
VALUES
('flt_flight_stops', 'FLIGHT', 'POPULAR', 'stops', '경유 횟수', 'Stops', 'CHECKBOX_LIST', '✈️', 1, '[
  {"id": "0", "label_ko": "직항만 보기", "label_en": "Non-stop only", "value": 0, "count_hint": 42},
  {"id": "1", "label_ko": "1회 경유", "label_en": "1 Stop", "value": 1, "count_hint": 86},
  {"id": "2", "label_ko": "2회 이상 경유", "label_en": "2+ Stops", "value": 2, "count_hint": 18}
]'::jsonb),
('flt_flight_time', 'FLIGHT', 'TIME', 'departure_time_slot', '출발 시간대', 'Departure Time', 'CHECKBOX_LIST', '⏰', 2, '[
  {"id": "EARLY_MORNING", "label_ko": "새벽 (00:00 ~ 06:00)", "label_en": "Early Morning (00:00 - 06:00)", "value": "EARLY_MORNING"},
  {"id": "MORNING", "label_ko": "오전 (06:00 ~ 12:00)", "label_en": "Morning (06:00 - 12:00)", "value": "MORNING"},
  {"id": "AFTERNOON", "label_ko": "오후 (12:00 ~ 18:00)", "label_en": "Afternoon (12:00 - 18:00)", "value": "AFTERNOON"},
  {"id": "EVENING", "label_ko": "저녁/야간 (18:00 ~ 24:00)", "label_en": "Evening (18:00 - 24:00)", "value": "EVENING"}
]'::jsonb),
('flt_flight_airlines', 'FLIGHT', 'AIRLINE', 'airline_code', '항공사 & 항공동맹체', 'Airlines & Alliances', 'CHECKBOX_LIST', '🛫', 3, '[
  {"id": "KE", "label_ko": "대한항공 (Korean Air)", "label_en": "Korean Air", "alliance": "SKYTEAM", "count_hint": 28},
  {"id": "OZ", "label_ko": "아시아나항공 (Asiana Airlines)", "label_en": "Asiana Airlines", "alliance": "STAR_ALLIANCE", "count_hint": 22},
  {"id": "7C", "label_ko": "제주항공 (Jeju Air)", "label_en": "Jeju Air", "alliance": "LCC", "count_hint": 19},
  {"id": "TW", "label_ko": "티웨이항공 (Tway Air)", "label_en": "Tway Air", "alliance": "LCC", "count_hint": 15},
  {"id": "JL", "label_ko": "일본항공 (Japan Airlines)", "label_en": "JAL", "alliance": "ONEWORLD", "count_hint": 14},
  {"id": "NH", "label_ko": "전일본공수 (ANA)", "label_en": "ANA", "alliance": "STAR_ALLIANCE", "count_hint": 12}
]'::jsonb),
('flt_flight_cabin', 'FLIGHT', 'CABIN', 'cabin_class', '좌석 등급', 'Cabin Class', 'RADIO_GROUP', '💺', 4, '[
  {"id": "ECONOMY", "label_ko": "일반석 (이코노미)", "label_en": "Economy"},
  {"id": "PREMIUM_ECONOMY", "label_ko": "프리미엄 이코노미", "label_en": "Premium Economy"},
  {"id": "BUSINESS", "label_ko": "비즈니스석 (프레스티지)", "label_en": "Business Class"},
  {"id": "FIRST", "label_ko": "일등석 (퍼스트)", "label_en": "First Class"}
]'::jsonb),
('flt_flight_baggage', 'FLIGHT', 'POLICY', 'baggage', '무료 수하물 포함', 'Baggage Allowance', 'CHECKBOX_LIST', '🧳', 5, '[
  {"id": "free_checked_baggage", "label_ko": "무료 위탁수하물 포함 (15kg~23kg)", "label_en": "Free Checked Baggage", "value": true},
  {"id": "extra_baggage_allowed", "label_ko": "기내 10kg + 위탁 23kg 2개 보장", "label_en": "2 Pieces Checked Baggage", "value": true}
]'::jsonb),
('flt_flight_flexibility', 'FLIGHT', 'POLICY', 'ticket_rules', '변경 및 환불 정책', 'Ticket Flexibility', 'CHECKBOX_LIST', '📑', 6, '[
  {"id": "free_change", "label_ko": "출발 전 무료 스케줄 변경 가능", "label_en": "Free Date Change"},
  {"id": "refundable", "label_ko": "수수료 면제 환불 가능 운임", "label_en": "Fully Refundable Fare"}
]'::jsonb)
ON CONFLICT (domain_type, filter_key) DO UPDATE SET
  options = EXCLUDED.options,
  display_name_ko = EXCLUDED.display_name_ko,
  ui_control_type = EXCLUDED.ui_control_type,
  updated_at = NOW();

-- (3) 기차표 필터 정의 (Trains Filter Taxonomy)
INSERT INTO domain_filter_definitions (id, domain_type, filter_group, filter_key, display_name_ko, display_name_en, ui_control_type, icon, sort_order, options)
VALUES
('flt_train_network', 'TRAIN', 'POPULAR', 'rail_network', '고속철도망 / 국가별 노선', 'Rail Network', 'CHECKBOX_LIST', '🚅', 1, '[
  {"id": "KTX_SRT", "label_ko": "한국 코레일 KTX / SRT", "label_en": "Korea KTX / SRT", "value": "KTX_SRT"},
  {"id": "SHINKANSEN", "label_ko": "일본 JR 신칸센 (노조미/히카리)", "label_en": "Japan JR Shinkansen", "value": "SHINKANSEN"},
  {"id": "EUROSTAR", "label_ko": "유럽 유로스타 (런던-파리-브뤼셀)", "label_en": "Eurostar Europe", "value": "EUROSTAR"},
  {"id": "CHINA_HSR", "label_ko": "중국 고속철도 (CRH 푸싱호)", "label_en": "China High Speed Rail", "value": "CHINA_HSR"}
]'::jsonb),
('flt_train_seat_class', 'TRAIN', 'CABIN', 'seat_class', '좌석 등급', 'Seat Class', 'RADIO_GROUP', '💺', 2, '[
  {"id": "STANDARD", "label_ko": "일반실 (Standard)", "label_en": "Standard Class"},
  {"id": "FIRST", "label_ko": "특실 / 그린샤 (First / Green Class)", "label_en": "First Class"}
]'::jsonb),
('flt_train_features', 'TRAIN', 'AMENITIES', 'train_amenities', '열차 편의시설', 'Train Amenities', 'CHECKBOX_LIST', '🔌', 3, '[
  {"id": "power_outlet", "label_ko": "전 좌석 220V 콘센트 & USB", "label_en": "Power Outlets", "icon": "🔌"},
  {"id": "free_wifi", "label_ko": "초고속 무료 Wi-Fi", "label_en": "Free High-speed Wi-Fi", "icon": "📶"},
  {"id": "oversized_luggage", "label_ko": "28인치 대형 캐리어 보관대", "label_en": "Oversized Luggage Rack", "icon": "🧳"},
  {"id": "quiet_zone", "label_ko": "조용한 객차 (Quiet Zone)", "label_en": "Quiet Coach", "icon": "🤫"}
]'::jsonb)
ON CONFLICT (domain_type, filter_key) DO UPDATE SET
  options = EXCLUDED.options,
  display_name_ko = EXCLUDED.display_name_ko,
  ui_control_type = EXCLUDED.ui_control_type,
  updated_at = NOW();

-- (4) 렌터카 필터 정의 (Cars Filter Taxonomy)
INSERT INTO domain_filter_definitions (id, domain_type, filter_group, filter_key, display_name_ko, display_name_en, ui_control_type, icon, sort_order, options)
VALUES
('flt_car_category', 'CAR', 'POPULAR', 'vehicle_category', '차종 및 크기', 'Vehicle Category', 'CHECKBOX_LIST', '🚗', 1, '[
  {"id": "COMPACT", "label_ko": "경형 / 소형 (모닝, 야리스 등)", "label_en": "Compact", "value": "COMPACT"},
  {"id": "SEDAN", "label_ko": "중형 세단 (아반떼, 쏘나타 등)", "label_en": "Midsize Sedan", "value": "SEDAN"},
  {"id": "SUV", "label_ko": "SUV (투싼, 스포티지, RAV4)", "label_en": "SUV", "value": "SUV"},
  {"id": "VAN", "label_ko": "승합 / 패밀리 밴 (카니발 9인승 등)", "label_en": "Minivan / People Carrier", "value": "VAN"},
  {"id": "LUXURY", "label_ko": "수입 / 럭셔리 (벤츠, BMW, 제네시스)", "label_en": "Luxury Premium", "value": "LUXURY"},
  {"id": "ELECTRIC", "label_ko": "친환경 전기차 (아이오닉5, 테슬라)", "label_en": "Electric Vehicle", "value": "ELECTRIC"}
]'::jsonb),
('flt_car_insurance', 'CAR', 'INSURANCE', 'insurance_super_cdw', '보험 플랜', 'Insurance Plan', 'CHECKBOX_LIST', '🛡️', 2, '[
  {"id": "super_cdw", "label_ko": "완전자차 안심 플랜 (고객 면책금 0원)", "label_en": "Super CDW (Zero Deductible)", "value": true},
  {"id": "basic_cdw", "label_ko": "일반 자차 포함 플랜", "label_en": "Standard Collision Damage Waiver", "value": false}
]'::jsonb),
('flt_car_transmission', 'CAR', 'SPEC', 'transmission', '변속기', 'Transmission', 'RADIO_GROUP', '⚙️', 3, '[
  {"id": "AUTO", "label_ko": "자동 (오토)", "label_en": "Automatic"},
  {"id": "MANUAL", "label_ko": "수동 (스틱)", "label_en": "Manual"}
]'::jsonb),
('flt_car_pickup', 'CAR', 'PICKUP', 'pickup_type', '인수 방식', 'Pickup Type', 'CHECKBOX_LIST', '📍', 4, '[
  {"id": "IN_TERMINAL", "label_ko": "공항 터미널 내부 카운터 인수", "label_en": "Terminal Desk Pickup"},
  {"id": "AIRPORT_SHUTTLE", "label_ko": "공항 무료 셔틀버스 직행 인수", "label_en": "Free Airport Shuttle"},
  {"id": "CITY_BRANCH", "label_ko": "도심 지점 인수", "label_en": "City Downtown Branch"}
]'::jsonb),
('flt_car_policies', 'CAR', 'POLICY', 'free_cancellation_hours', '취소 및 주행 규정', 'Cancellation & Mileage', 'CHECKBOX_LIST', '✨', 5, '[
  {"id": "free_cancel_48h", "label_ko": "인수 48시간 전 100% 무료 취소", "label_en": "Free Cancellation (48h prior)"},
  {"id": "unlimited_mileage", "label_ko": "주행거리 무제한", "label_en": "Unlimited Mileage"}
]'::jsonb)
ON CONFLICT (domain_type, filter_key) DO UPDATE SET
  options = EXCLUDED.options,
  display_name_ko = EXCLUDED.display_name_ko,
  ui_control_type = EXCLUDED.ui_control_type,
  updated_at = NOW();

-- (5) 공항 픽업 필터 정의 (Transfers Filter Taxonomy)
INSERT INTO domain_filter_definitions (id, domain_type, filter_group, filter_key, display_name_ko, display_name_en, ui_control_type, icon, sort_order, options)
VALUES
('flt_transfer_tier', 'TRANSFER', 'POPULAR', 'vehicle_tier', '차량 등급', 'Vehicle Tier', 'CHECKBOX_LIST', '🚖', 1, '[
  {"id": "COMFORT_SEDAN", "label_ko": "컴포트 세단 (최대 3인, 가방 2개)", "label_en": "Comfort Sedan (3 Pax)"},
  {"id": "BUSINESS_VAN", "label_ko": "비즈니스 밴 (최대 6인, 가방 6개)", "label_en": "Business Van (6 Pax)"},
  {"id": "LUXURY_FIRST", "label_ko": "럭셔리 VIP 리무진 (벤츠 S클래스급)", "label_en": "First-Class Luxury (3 Pax)"}
]'::jsonb),
('flt_transfer_perks', 'TRANSFER', 'PERKS', 'included_perks', '포함 서비스 및 혜택', 'Included Perks', 'CHECKBOX_LIST', '⭐', 2, '[
  {"id": "flight_tracking", "label_ko": "실시간 항공편 지연 자동 추적 대기", "label_en": "Real-time Flight Tracking"},
  {"id": "meet_and_greet", "label_ko": "입국장 네임보드 피켓 영접 서비스", "label_en": "Meet & Greet with Name Sign"},
  {"id": "free_waiting_60m", "label_ko": "항공기 착륙 후 60분 무료 대기", "label_en": "Free 60-min Waiting Time"},
  {"id": "toll_included", "label_ko": "고속도로 통행료 & 주차비 전액 포함", "label_en": "All Tolls & Parking Included"}
]'::jsonb)
ON CONFLICT (domain_type, filter_key) DO UPDATE SET
  options = EXCLUDED.options,
  display_name_ko = EXCLUDED.display_name_ko,
  ui_control_type = EXCLUDED.ui_control_type,
  updated_at = NOW();

-- (6) 투어·티켓 필터 정의 (Things to Do Filter Taxonomy)
INSERT INTO domain_filter_definitions (id, domain_type, filter_group, filter_key, display_name_ko, display_name_en, ui_control_type, icon, sort_order, options)
VALUES
('flt_activity_category', 'ACTIVITY', 'POPULAR', 'category', '카테고리 분류', 'Activity Category', 'CHECKBOX_LIST', '🎟️', 1, '[
  {"id": "THEME_PARK", "label_ko": "테마파크 / 놀이공원", "label_en": "Theme Parks"},
  {"id": "TICKET", "label_ko": "전망대 & 랜드마크 입장권", "label_en": "Attraction Tickets"},
  {"id": "DAY_TOUR", "label_ko": "1일 버스 투어 / 근교 여행", "label_en": "Day Tours"},
  {"id": "ESIM", "label_ko": "해외 데이터 eSIM / 유심", "label_en": "eSIM & Connectivity"},
  {"id": "PASS", "label_ko": "도시 교통 패스 & 지하철 패스", "label_en": "Travel & Transit Passes"}
]'::jsonb),
('flt_activity_features', 'ACTIVITY', 'POLICY', 'booking_policy', '예약 및 바우처 방식', 'Booking Policies', 'CHECKBOX_LIST', '⚡', 2, '[
  {"id": "instant_confirmation", "label_ko": "예약 즉시 바우처 확정 발권", "label_en": "Instant Confirmation"},
  {"id": "free_cancellation", "label_ko": "사용 전 100% 무료 취소 가능", "label_en": "Free Cancellation"},
  {"id": "qr_voucher", "label_ko": "모바일 QR코드 즉시 게이트 입장", "label_en": "Mobile QR Direct Entry"}
]'::jsonb),
('flt_activity_duration', 'ACTIVITY', 'DURATION', 'duration_type', '소요 시간', 'Duration', 'RADIO_GROUP', '⏳', 3, '[
  {"id": "UNDER_2H", "label_ko": "2시간 이내 체험", "label_en": "Under 2 Hours"},
  {"id": "HALF_DAY", "label_ko": "반일 코스 (2~4시간)", "label_en": "Half Day (2-4h)"},
  {"id": "FULL_DAY", "label_ko": "종일 코스 (4시간 이상)", "label_en": "Full Day (4h+)"}
]'::jsonb)
ON CONFLICT (domain_type, filter_key) DO UPDATE SET
  options = EXCLUDED.options,
  display_name_ko = EXCLUDED.display_name_ko,
  ui_control_type = EXCLUDED.ui_control_type,
  updated_at = NOW();

-- (7) 다이내믹 패키지 필터 정의 (Dynamic Packages Filter Taxonomy)
INSERT INTO domain_filter_definitions (id, domain_type, filter_group, filter_key, display_name_ko, display_name_en, ui_control_type, icon, sort_order, options)
VALUES
('flt_package_savings', 'PACKAGE', 'SAVINGS', 'savings_rate', '결합 특별 할인율', 'Bundle Savings', 'CHECKBOX_LIST', '💸', 1, '[
  {"id": "save_20", "label_ko": "20% 이상 메가 결합 할인", "label_en": "20%+ Mega Savings"},
  {"id": "save_15", "label_ko": "15% 이상 결합 할인", "label_en": "15%+ Savings"},
  {"id": "save_10", "label_ko": "10% 이상 결합 할인", "label_en": "10%+ Savings"}
]'::jsonb),
('flt_package_nights', 'PACKAGE', 'DURATION', 'duration_nights', '여행 일정 박수', 'Duration Nights', 'CHECKBOX_LIST', '🌙', 2, '[
  {"id": "2", "label_ko": "2박 3일 (주말 코스)", "label_en": "2 Nights / 3 Days"},
  {"id": "3", "label_ko": "3박 4일 (인기 에어텔)", "label_en": "3 Nights / 4 Days"},
  {"id": "5", "label_ko": "5박 이상 (유럽/장거리)", "label_en": "5+ Nights (Long-haul)"}
]'::jsonb)
ON CONFLICT (domain_type, filter_key) DO UPDATE SET
  options = EXCLUDED.options,
  display_name_ko = EXCLUDED.display_name_ko,
  ui_control_type = EXCLUDED.ui_control_type,
  updated_at = NOW();

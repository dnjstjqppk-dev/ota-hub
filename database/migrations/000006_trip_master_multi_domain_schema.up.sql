-- =========================================================================
-- getforTrip Global OTA: Multi-Domain Master Schema
-- Migration 000006: 7-Domain Complete Relational Schema & Faceted Filter Engine
-- =========================================================================

-- 1. 호텔 도메인 마스터 (Hotels & Room Inventory)
CREATE TABLE IF NOT EXISTS hotel_properties (
  id VARCHAR(64) PRIMARY KEY,
  name_ko VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  property_type VARCHAR(50) DEFAULT 'HOTEL', -- HOTEL, RESORT, APARTMENT, RYOKAN, VILLA
  star_rating INT NOT NULL CHECK (star_rating BETWEEN 1 AND 5),
  city VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL,
  address_ko TEXT NOT NULL,
  address_en TEXT NOT NULL,
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  neighborhood VARCHAR(100),
  subway_station VARCHAR(100),
  subway_distance_mins INT DEFAULT 5,
  review_score NUMERIC(3, 1) DEFAULT 4.8,
  review_count INT DEFAULT 1250,
  badge VARCHAR(50) DEFAULT 'getfortrip Best',
  thumbnail_url TEXT NOT NULL,
  gallery_images JSONB DEFAULT '[]'::jsonb,
  amenities JSONB DEFAULT '[]'::jsonb, -- wifi, pool, breakfast, spa, gym, parking
  free_cancellation BOOLEAN DEFAULT TRUE,
  free_breakfast BOOLEAN DEFAULT FALSE,
  instant_confirmation BOOLEAN DEFAULT TRUE,
  base_price_krw NUMERIC(12, 2) NOT NULL,
  discount_rate INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hotel_room_options (
  id VARCHAR(64) PRIMARY KEY,
  hotel_id VARCHAR(64) REFERENCES hotel_properties(id) ON DELETE CASCADE,
  room_name_ko VARCHAR(255) NOT NULL,
  room_name_en VARCHAR(255) NOT NULL,
  bed_type VARCHAR(100) NOT NULL, -- 킹베드 1개, 싱글베드 2개
  max_occupancy INT DEFAULT 2,
  room_size_sqm INT DEFAULT 35,
  window_view VARCHAR(50) DEFAULT 'CITY_VIEW', -- CITY_VIEW, OCEAN_VIEW, GARDEN_VIEW
  price_per_night_krw NUMERIC(12, 2) NOT NULL,
  breakfast_included BOOLEAN DEFAULT FALSE,
  refundable_until TIMESTAMPTZ,
  free_cancellation BOOLEAN DEFAULT TRUE,
  available_inventory INT DEFAULT 5,
  room_photos JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 항공권 도메인 마스터 (Flights & Fare Classes)
CREATE TABLE IF NOT EXISTS flight_schedules (
  id VARCHAR(64) PRIMARY KEY,
  airline_code VARCHAR(10) NOT NULL, -- KE, OZ, JL, NH, TG, AF
  airline_name_ko VARCHAR(100) NOT NULL,
  airline_name_en VARCHAR(100) NOT NULL,
  flight_number VARCHAR(20) NOT NULL,
  aircraft_type VARCHAR(50) DEFAULT 'Boeing 787-9',
  departure_airport VARCHAR(10) NOT NULL, -- ICN, GMP, NRT, HND, KIX, BKK, CDG
  arrival_airport VARCHAR(10) NOT NULL,
  departure_terminal VARCHAR(20) DEFAULT 'T2',
  arrival_terminal VARCHAR(20) DEFAULT 'T1',
  departure_time TIMESTAMPTZ NOT NULL,
  arrival_time TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL,
  stops INT DEFAULT 0, -- 0: 직항, 1: 1회 경유
  layover_airport VARCHAR(10),
  layover_duration_mins INT DEFAULT 0,
  departure_time_slot VARCHAR(20) DEFAULT 'MORNING', -- MORNING, AFTERNOON, EVENING, NIGHT
  cabin_class VARCHAR(50) DEFAULT 'ECONOMY', -- ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST
  free_checked_baggage_kg INT DEFAULT 23,
  free_cabin_baggage_kg INT DEFAULT 10,
  seat_pitch_inch INT DEFAULT 32,
  base_fare_krw NUMERIC(12, 2) NOT NULL,
  tax_fuel_krw NUMERIC(12, 2) DEFAULT 45000,
  available_seats INT DEFAULT 9,
  refund_penalty_krw NUMERIC(12, 2) DEFAULT 50000,
  mileage_accrual_pct INT DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 기차표 도메인 마스터 (Trains & Station Schedules)
CREATE TABLE IF NOT EXISTS train_journeys (
  id VARCHAR(64) PRIMARY KEY,
  rail_network VARCHAR(50) NOT NULL, -- KTX_SRT, SHINKANSEN, EUROSTAR, CHINA_HSR, TGV
  train_type VARCHAR(50) NOT NULL, -- KTX-산천, 신칸센 노조미, 유로스타 e320
  train_number VARCHAR(50) NOT NULL,
  departure_station VARCHAR(100) NOT NULL,
  arrival_station VARCHAR(100) NOT NULL,
  departure_time TIMESTAMPTZ NOT NULL,
  arrival_time TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL,
  seat_class VARCHAR(50) DEFAULT 'STANDARD', -- STANDARD(일반실), FIRST(특실/그린샤)
  base_price_krw NUMERIC(12, 2) NOT NULL,
  first_class_price_krw NUMERIC(12, 2) NOT NULL,
  power_outlet BOOLEAN DEFAULT TRUE,
  free_wifi BOOLEAN DEFAULT TRUE,
  luggage_policy TEXT DEFAULT '28인치 수하물 2개 무료 적재 가능',
  available_seats INT DEFAULT 24,
  stops_schedule JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 렌터카 도메인 마스터 (Car Rentals & Protection Plans)
CREATE TABLE IF NOT EXISTS car_rental_catalog (
  id VARCHAR(64) PRIMARY KEY,
  company_name VARCHAR(100) NOT NULL, -- 롯데렌터카, SK렌터카, Hertz, Avis, Times
  brand_logo_url TEXT,
  vehicle_model VARCHAR(100) NOT NULL, -- 현대 더 뉴 아반떼, 토요타 야리스, 벤츠 E-Class
  vehicle_category VARCHAR(50) NOT NULL, -- COMPACT, SEDAN, SUV, VAN, LUXURY, ELECTRIC
  seats INT NOT NULL,
  luggage_large INT DEFAULT 2,
  luggage_small INT DEFAULT 2,
  transmission VARCHAR(20) DEFAULT 'AUTO', -- AUTO, MANUAL
  fuel_type VARCHAR(50) DEFAULT 'GASOLINE', -- GASOLINE, DIESEL, HYBRID, EV
  pickup_city VARCHAR(100) NOT NULL,
  pickup_location_name VARCHAR(255) NOT NULL,
  pickup_type VARCHAR(50) DEFAULT 'AIRPORT_SHUTTLE', -- IN_TERMINAL, AIRPORT_SHUTTLE, CITY_BRANCH
  daily_price_krw NUMERIC(12, 2) NOT NULL,
  insurance_super_cdw BOOLEAN DEFAULT TRUE, -- 완전자차(면책금 0원)
  unlimited_mileage BOOLEAN DEFAULT TRUE,
  free_cancellation_hours INT DEFAULT 48,
  min_driver_age INT DEFAULT 21,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 공항 픽업 도메인 마스터 (Airport Transfers)
CREATE TABLE IF NOT EXISTS airport_transfer_catalog (
  id VARCHAR(64) PRIMARY KEY,
  airport_code VARCHAR(10) NOT NULL, -- ICN, GMP, NRT, HND, KIX, BKK, CDG
  airport_name VARCHAR(100) NOT NULL,
  destination_zone VARCHAR(255) NOT NULL, -- 서울 도심 전역, 도쿄 23구 전역
  service_type VARCHAR(50) DEFAULT 'PRIVATE_TRANSFER', -- PRIVATE_TRANSFER, SHARED_SHUTTLE
  vehicle_tier VARCHAR(50) NOT NULL, -- ECONOMY_SEDAN, COMFORT_SEDAN, BUSINESS_VAN, LUXURY_FIRST
  vehicle_model_example VARCHAR(100) NOT NULL, -- 현대 쏘나타 / 도요타 알파드 / 벤츠 S-클래스
  max_passengers INT NOT NULL,
  max_luggage INT NOT NULL,
  price_krw NUMERIC(12, 2) NOT NULL,
  free_waiting_mins INT DEFAULT 60, -- 항공편 도착 후 60분 무료 대기
  flight_tracking BOOLEAN DEFAULT TRUE, -- 실시간 항공편 지연 자동 감지 및 대기
  meet_and_greet BOOLEAN DEFAULT TRUE, -- 입국장 피켓 네임보드 영접 서비스
  free_cancellation_hours INT DEFAULT 24,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 투어·티켓 도메인 마스터 (Things to Do & Attractions)
CREATE TABLE IF NOT EXISTS activity_catalog (
  id VARCHAR(64) PRIMARY KEY,
  title_ko VARCHAR(255) NOT NULL,
  title_en VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL,
  main_category VARCHAR(50) NOT NULL, -- THEME_PARK, TICKET, DAY_TOUR, DOCENT, PASS, ESIM
  duration_text VARCHAR(100) DEFAULT '약 3시간',
  guide_language VARCHAR(50) DEFAULT 'KOREAN', -- KOREAN, ENGLISH, JAPANESE, CHINESE
  instant_confirmation BOOLEAN DEFAULT TRUE,
  free_cancellation BOOLEAN DEFAULT TRUE,
  voucher_type VARCHAR(50) DEFAULT 'MOBILE_QR', -- MOBILE_QR, PRINTED, EXCHANGE_TICKET
  rating NUMERIC(3, 1) DEFAULT 4.9,
  review_count INT DEFAULT 3420,
  hero_image_url TEXT NOT NULL,
  gallery_images JSONB DEFAULT '[]'::jsonb,
  highlights JSONB DEFAULT '[]'::jsonb,
  inclusions JSONB DEFAULT '[]'::jsonb,
  exclusions JSONB DEFAULT '[]'::jsonb,
  meeting_point TEXT,
  price_krw NUMERIC(12, 2) NOT NULL,
  package_options JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 항공+호텔 동적 패키지 도메인 (Dynamic Packages)
CREATE TABLE IF NOT EXISTS dynamic_package_bundles (
  id VARCHAR(64) PRIMARY KEY,
  title_ko VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL,
  duration_nights INT NOT NULL,
  duration_days INT NOT NULL,
  flight_id VARCHAR(64) REFERENCES flight_schedules(id),
  hotel_id VARCHAR(64) REFERENCES hotel_properties(id),
  original_combined_price_krw NUMERIC(12, 2) NOT NULL,
  bundle_price_krw NUMERIC(12, 2) NOT NULL,
  savings_percentage INT NOT NULL,
  badge VARCHAR(50) DEFAULT '초특가 결합 할인',
  hero_image_url TEXT NOT NULL,
  package_features JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- 패싯 필터 인덱스 (Faceted Search Indexing)
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_hotel_properties_facets ON hotel_properties (city, star_rating, review_score, free_cancellation, property_type);
CREATE INDEX IF NOT EXISTS idx_flight_schedules_facets ON flight_schedules (departure_airport, arrival_airport, stops, departure_time_slot, cabin_class);
CREATE INDEX IF NOT EXISTS idx_train_journeys_facets ON train_journeys (departure_station, arrival_station, rail_network, seat_class);
CREATE INDEX IF NOT EXISTS idx_car_rentals_facets ON car_rental_catalog (pickup_city, vehicle_category, transmission, insurance_super_cdw);
CREATE INDEX IF NOT EXISTS idx_airport_transfers_facets ON airport_transfer_catalog (airport_code, vehicle_tier);
CREATE INDEX IF NOT EXISTS idx_activity_catalog_facets ON activity_catalog (city, main_category, instant_confirmation, free_cancellation);


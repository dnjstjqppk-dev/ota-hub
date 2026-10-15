-- =========================================================================
-- Migration 000005: '숙소' -> '호텔' 명칭 통일 및 전 도메인 패싯 필터 인덱스 스키마
-- =========================================================================

-- 1. 호텔 (Hotels) 도메인 스키마 확장 & 명칭 통일
COMMENT ON TABLE hotels IS 'getfortrip 공식 호텔(Hotels) 마스터 카탈로그 (구 숙소 명칭 폐기)';

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS property_type VARCHAR(50) DEFAULT 'HOTEL', -- HOTEL, RESORT, APARTMENT, RYOKAN
  ADD COLUMN IF NOT EXISTS star_rating INT DEFAULT 5, -- 1~5성급
  ADD COLUMN IF NOT EXISTS score_overall NUMERIC(3,1) DEFAULT 4.8,
  ADD COLUMN IF NOT EXISTS score_cleanliness NUMERIC(3,1) DEFAULT 4.9,
  ADD COLUMN IF NOT EXISTS score_location NUMERIC(3,1) DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS score_service NUMERIC(3,1) DEFAULT 4.8,
  ADD COLUMN IF NOT EXISTS score_facilities NUMERIC(3,1) DEFAULT 4.7,
  ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100) DEFAULT '도심 중심가',
  ADD COLUMN IF NOT EXISTS subway_nearby VARCHAR(100) DEFAULT '지하철역 도보 3분',
  ADD COLUMN IF NOT EXISTS free_cancellation BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS free_breakfast BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS has_swimming_pool BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_hotels_facet_filter 
  ON hotels (city, star_rating, score_overall, free_cancellation, free_breakfast);

-- 2. 항공권 (Flights) 도메인 필터 스키마
ALTER TABLE flights
  ADD COLUMN IF NOT EXISTS stops INT DEFAULT 0, -- 0: 직항, 1: 1회 경유, 2: 2회 이상
  ADD COLUMN IF NOT EXISTS departure_time_slot VARCHAR(20) DEFAULT 'MORNING', -- MORNING, AFTERNOON, EVENING, NIGHT
  ADD COLUMN IF NOT EXISTS free_baggage_kg INT DEFAULT 23,
  ADD COLUMN IF NOT EXISTS cabin_class VARCHAR(50) DEFAULT 'ECONOMY';

CREATE INDEX IF NOT EXISTS idx_flights_facet_filter
  ON flights (departure_airport, arrival_airport, stops, departure_time_slot, cabin_class);

-- 3. 기차표 (Trains) 도메인 필터 스키마
ALTER TABLE trains
  ADD COLUMN IF NOT EXISTS rail_network VARCHAR(50) DEFAULT 'KTX_SRT', -- KTX_SRT, SHINKANSEN, EUROSTAR, CHINA_HSR
  ADD COLUMN IF NOT EXISTS departure_time_slot VARCHAR(20) DEFAULT 'MORNING',
  ADD COLUMN IF NOT EXISTS seat_class VARCHAR(50) DEFAULT 'STANDARD'; -- STANDARD, FIRST

-- 4. 렌터카 (Cars) 도메인 필터 스키마
ALTER TABLE car_rentals
  ADD COLUMN IF NOT EXISTS vehicle_category VARCHAR(50) DEFAULT 'SEDAN', -- SEDAN, SUV, VAN, COMPACT, LUXURY
  ADD COLUMN IF NOT EXISTS transmission VARCHAR(20) DEFAULT 'AUTO',
  ADD COLUMN IF NOT EXISTS seats INT DEFAULT 5,
  ADD COLUMN IF NOT EXISTS insurance_super_cdw BOOLEAN DEFAULT TRUE;

-- 5. 공항 픽업 (Transfers) 도메인 필터 스키마
ALTER TABLE airport_transfers
  ADD COLUMN IF NOT EXISTS transfer_type VARCHAR(20) DEFAULT 'PICKUP', -- PICKUP, DROPOFF
  ADD COLUMN IF NOT EXISTS vehicle_class VARCHAR(50) DEFAULT 'BUSINESS_VAN', -- ECONOMY_SEDAN, BUSINESS_VAN, LUXURY_FIRST
  ADD COLUMN IF NOT EXISTS flight_tracking BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS free_waiting_mins INT DEFAULT 60;

-- 6. 투어·티켓 (Things to Do) 도메인 필터 스키마
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS main_category VARCHAR(50) DEFAULT 'ATTRACTION', -- ATTRACTION, THEME_PARK, DAY_TOUR, ESIM
  ADD COLUMN IF NOT EXISTS duration_hours NUMERIC(3,1) DEFAULT 3.0,
  ADD COLUMN IF NOT EXISTS guide_language VARCHAR(50) DEFAULT 'KOREAN',
  ADD COLUMN IF NOT EXISTS instant_confirmation BOOLEAN DEFAULT TRUE;

-- 7. 8대 도메인 Mock Data 인서트
INSERT INTO hotels (
  id, name, name_ko, name_en, city, country, address, star_rating,
  score_overall, score_cleanliness, score_location, score_service, score_facilities,
  review_count, neighborhood, subway_nearby, free_cancellation, free_breakfast,
  has_swimming_pool, thumbnail_url, price_krw, description
) VALUES (
  'c0000000-0000-0000-0000-000000000001',
  '그랜드 하얏트 도쿄', '그랜드 하얏트 도쿄 (Grand Hyatt Tokyo)', 'Grand Hyatt Tokyo',
  '도쿄', '일본', '6-10-3 Roppongi, Minato-ku, Tokyo', 5,
  4.9, 4.9, 5.0, 4.8, 4.7,
  2450, '롯폰기 힐즈', '롯폰기역 1C 출구 도보 3분', TRUE, TRUE,
  TRUE, 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800', 420000,
  '롯폰기 힐즈에 자리한 최고급 5성급 럭셔리 호텔로 실내 온수풀, 10개 레스토랑 및 최상의 시티뷰를 제공합니다.'
) ON CONFLICT (id) DO UPDATE SET name_ko = EXCLUDED.name_ko;

INSERT INTO flights (
  id, airline_name, flight_number, departure_airport, arrival_airport,
  departure_city, arrival_city, departure_time, arrival_time, duration_minutes,
  stops, departure_time_slot, free_baggage_kg, cabin_class, base_price_krw, available_seats
) VALUES (
  'fl-ke703', '대한항공 (Korean Air)', 'KE703', 'ICN', 'NRT',
  '서울/인천', '도쿄/나리타', '2026-11-01 10:10:00+09', '2026-11-01 12:40:00+09', 150,
  0, 'MORNING', 23, '일반석 (Economy)', 248000, 9
) ON CONFLICT (id) DO NOTHING;

INSERT INTO trains (
  id, train_type, train_number, departure_station, arrival_station,
  departure_time, arrival_time, duration_minutes, seat_class, price_krw, available_seats
) VALUES (
  'tr-ktx103', 'KTX', 'KTX-103', '서울역 (Seoul)', '부산역 (Busan)',
  '2026-11-01 08:00:00+09', '2026-11-01 10:15:00+09', 135, '일반실 (Standard)', 59800, 18
) ON CONFLICT (id) DO NOTHING;

INSERT INTO car_rentals (
  id, company_name, vehicle_model, seats, transmission, daily_price_krw, image_url
) VALUES (
  'car-avante', '롯데렌터카 (LOTTE Rent-a-Car)', '현대 올 뉴 아반떼 (CN7)', 5, '오토 (Auto)', 58000,
  'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=600'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO airport_transfers (
  id, vehicle_class, service_title, max_passengers, max_luggage, price_krw, image_url
) VALUES (
  'tf-van-alphard', '비즈니스 대형 밴 (7인승)', '인천공항 ↔ 서울 도심 호텔 프라이빗 VIP 픽업', 7, 5, 120000,
  'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=600'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO activities (
  id, title, city, country, category, price_krw, review_score, review_count,
  instant_confirmation, free_cancellation, thumbnail_url, description
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '오사카 유니버설 스튜디오 재팬 (USJ) 1일 모바일 즉시 입장권',
  '오사카', '일본', '테마파크', 84000, 4.9, 8920,
  TRUE, TRUE, 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800',
  '슈퍼 닌텐도 월드와 위저딩 월드 오브 해리포터를 대기 없이 모바일 QR코드로 즉시 입장하세요.'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO dynamic_packages (
  id, title, thumbnail_url, total_original_krw, total_package_krw, package_discount_rate
) VALUES (
  'pkg-tokyo-4n5d', '도쿄 4박 5일 왕복 항공 + 그랜드 하얏트 럭셔리 결합 패키지',
  'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800',
  920000, 750000, 20
) ON CONFLICT (id) DO NOTHING;

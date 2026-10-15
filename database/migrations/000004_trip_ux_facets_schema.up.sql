-- ==============================================================================
-- ✈️ getfortrip Trip-Style Full UX/UI Facets & Filter Schema - Migration 000004 (UP)
-- Target Database: PostgreSQL 16
-- ==============================================================================

-- 1. HOTELS: Detailed Scores, Neighborhood, Property Type, Policies
ALTER TABLE hotels 
ADD COLUMN IF NOT EXISTS property_type VARCHAR(50) DEFAULT 'HOTEL',
ADD COLUMN IF NOT EXISTS cleanliness_score NUMERIC(3, 1) DEFAULT 4.8,
ADD COLUMN IF NOT EXISTS location_score NUMERIC(3, 1) DEFAULT 4.9,
ADD COLUMN IF NOT EXISTS service_score NUMERIC(3, 1) DEFAULT 4.7,
ADD COLUMN IF NOT EXISTS facilities_score NUMERIC(3, 1) DEFAULT 4.6,
ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100) DEFAULT '도심 중심가',
ADD COLUMN IF NOT EXISTS subway_nearby VARCHAR(150) DEFAULT '지하철역 도보 3분',
ADD COLUMN IF NOT EXISTS distance_to_center_km NUMERIC(4, 1) DEFAULT 1.2,
ADD COLUMN IF NOT EXISTS check_in_time VARCHAR(20) DEFAULT '15:00',
ADD COLUMN IF NOT EXISTS check_out_time VARCHAR(20) DEFAULT '11:00',
ADD COLUMN IF NOT EXISTS policies JSONB DEFAULT '{"child": "만 6세 이하 기존 침구 이용 시 무료", "pet": "반려동물 동반 불가", "extra_bed": "추가 침대 1박당 50,000원"}';

-- 2. HOTEL ROOMS: View, Bathtub, Window, Smoking
ALTER TABLE hotel_rooms
ADD COLUMN IF NOT EXISTS view_type VARCHAR(50) DEFAULT 'CITY_VIEW',
ADD COLUMN IF NOT EXISTS has_bathtub BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS has_window BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS is_smoking BOOLEAN DEFAULT FALSE;

-- 3. HOTEL RATE PLANS (Trip-style Multi Rate Matrix per Room)
CREATE TABLE IF NOT EXISTS hotel_rate_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES hotel_rooms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    meal_plan VARCHAR(50) DEFAULT 'ROOM_ONLY', -- ROOM_ONLY, BREAKFAST_FOR_1, BREAKFAST_FOR_2
    cancellation_type VARCHAR(50) DEFAULT 'FREE', -- FREE, CONDITIONAL, NON_REFUNDABLE
    cancellation_deadline TIMESTAMP WITH TIME ZONE,
    payment_type VARCHAR(50) DEFAULT 'PAY_NOW', -- PAY_NOW, PAY_AT_HOTEL
    base_price_krw NUMERIC(12, 2) NOT NULL,
    tax_and_fees_krw NUMERIC(12, 2) DEFAULT 0,
    original_price_krw NUMERIC(12, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rate_plans_room 
    ON hotel_rate_plans (room_id, base_price_krw);

-- 4. FLIGHTS: Stops, Time Slot, Baggage & Refund Rules
ALTER TABLE flights
ADD COLUMN IF NOT EXISTS stops INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS departure_time_slot VARCHAR(20) DEFAULT 'MORNING', -- EARLY_MORNING, MORNING, AFTERNOON, EVENING
ADD COLUMN IF NOT EXISTS is_refundable BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS is_changeable BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS refund_fee_krw NUMERIC(10, 2) DEFAULT 50000;

-- 5. ACTIVITIES & TOURS: Trip/Klook/KKday/MRT UX/UI Detailed Fields
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS free_cancellation BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS duration_type VARCHAR(50) DEFAULT 'HALF_DAY', -- UNDER_2H, HALF_DAY, FULL_DAY, MULTI_DAY
ADD COLUMN IF NOT EXISTS guide_language VARCHAR(50) DEFAULT 'KO', -- KO, EN, JA, ZH
ADD COLUMN IF NOT EXISTS voucher_type VARCHAR(50) DEFAULT 'QR_CODE', -- QR_CODE, BARCODE, PHYSICAL_EXCHANGE
ADD COLUMN IF NOT EXISTS highlights JSONB DEFAULT '["공식 모바일 QR 즉시 발권", "대기 줄 없는 다이렉트 입장", "한국어 안내 지원"]',
ADD COLUMN IF NOT EXISTS itinerary JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS inclusions JSONB DEFAULT '["공식 입장권 / 패스", "세금 및 예약 수수료"]',
ADD COLUMN IF NOT EXISTS exclusions JSONB DEFAULT '["개인 식음료", "현장 유료 옵션", "개인 경비"]',
ADD COLUMN IF NOT EXISTS how_to_use TEXT DEFAULT '예약 완료 후 수신된 모바일 바우처(QR코드)를 스마트폰 화면으로 매표소 또는 게이트에 제시하세요.',
ADD COLUMN IF NOT EXISTS packages JSONB DEFAULT '[]';

-- 6. INDEXES for fast Trip-style faceted search
CREATE INDEX IF NOT EXISTS idx_hotels_property_type ON hotels (property_type, star_rating);
CREATE INDEX IF NOT EXISTS idx_flights_stops ON flights (stops, cabin_class, departure_time_slot);
CREATE INDEX IF NOT EXISTS idx_activities_facets ON activities (category, free_cancellation, duration_type, guide_language);


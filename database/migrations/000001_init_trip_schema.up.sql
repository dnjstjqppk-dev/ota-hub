-- ==============================================================================
-- ✈️ getfortrip Full-Scale Production Platform - Migration 000001 (UP)
-- Target Database: PostgreSQL 16
-- Extensions: uuid-ossp, pg_trgm
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ------------------------------------------------------------------------------
-- 1. ENUMS
-- ------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_tier_enum AS ENUM ('SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'DIAMOND_PLUS');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE domain_type_enum AS ENUM ('HOTEL', 'FLIGHT', 'TRAIN', 'CAR', 'TRANSFER', 'ACTIVITY', 'PACKAGE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE booking_status_enum AS ENUM (
        'DRAFT', 'PENDING_PAYMENT', 'PAID', 'ISSUING', 'CONFIRMED', 
        'COMPLETED', 'CANCEL_REQUESTED', 'CANCELLED', 'REFUNDED', 'ISSUE_FAILED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE payment_method_enum AS ENUM (
        'CREDIT_CARD', 'NAVER_PAY', 'KAKAO_PAY', 'TOSS_PAY', 'PAYPAL', 'TRIP_COIN'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE currency_enum AS ENUM ('KRW', 'USD', 'JPY', 'EUR', 'CNY', 'GBP');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ticket_status_enum AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ------------------------------------------------------------------------------
-- 2. USERS, LOYALTY & SAVED TRAVELERS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(50),
    preferred_currency currency_enum DEFAULT 'KRW',
    preferred_language VARCHAR(10) DEFAULT 'ko',
    tier user_tier_enum DEFAULT 'SILVER',
    trip_coins INT DEFAULT 0 CHECK (trip_coins >= 0),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saved_travelers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    last_name_en VARCHAR(100) NOT NULL,
    first_name_en VARCHAR(100) NOT NULL,
    birth_date DATE NOT NULL,
    gender VARCHAR(10) NOT NULL,
    passport_number VARCHAR(50),
    passport_expiry DATE,
    nationality VARCHAR(50) DEFAULT 'KOR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trip_coin_ledgers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount INT NOT NULL, -- 양수: 적립, 음수: 차감
    balance_after INT NOT NULL,
    reason VARCHAR(255) NOT NULL,
    reference_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 3. EXCHANGE RATES (FX Engine)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exchange_rates (
    currency currency_enum PRIMARY KEY,
    rate_to_krw NUMERIC(14, 4) NOT NULL, -- 1 외화당 KRW (예: USD = 1350.0000)
    symbol VARCHAR(10) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 4. DOMAIN 1: HOTELS & ROOMS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hotels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_ko VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    star_rating INT CHECK (star_rating BETWEEN 1 AND 5),
    review_score NUMERIC(3, 1) DEFAULT 0.0,
    review_count INT DEFAULT 0,
    thumbnail_url TEXT NOT NULL,
    images JSONB NOT NULL DEFAULT '[]',
    amenities JSONB NOT NULL DEFAULT '[]',
    description TEXT,
    tags JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hotel_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    bed_type VARCHAR(100) NOT NULL,
    max_guests INT NOT NULL,
    room_size_sqm NUMERIC(5, 1),
    base_price_krw NUMERIC(12, 2) NOT NULL,
    is_free_cancellation BOOLEAN DEFAULT TRUE,
    includes_breakfast BOOLEAN DEFAULT FALSE,
    available_stock INT DEFAULT 10 CHECK (available_stock >= 0),
    images JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 5. DOMAIN 2: FLIGHTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flight_number VARCHAR(20) NOT NULL,
    airline_name VARCHAR(100) NOT NULL,
    airline_code VARCHAR(10) NOT NULL,
    airline_logo TEXT,
    departure_airport VARCHAR(10) NOT NULL,
    arrival_airport VARCHAR(10) NOT NULL,
    departure_city VARCHAR(100) NOT NULL,
    arrival_city VARCHAR(100) NOT NULL,
    departure_time TIMESTAMP WITH TIME ZONE NOT NULL,
    arrival_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INT NOT NULL,
    cabin_class VARCHAR(50) DEFAULT 'ECONOMY',
    base_price_krw NUMERIC(12, 2) NOT NULL,
    free_baggage_kg INT DEFAULT 15,
    available_seats INT DEFAULT 50 CHECK (available_seats >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 6. DOMAIN 3: TRAINS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    train_number VARCHAR(50) NOT NULL,
    train_type VARCHAR(50) NOT NULL, -- KTX, SHINKANSEN, EUROSTAR
    departure_station VARCHAR(100) NOT NULL,
    arrival_station VARCHAR(100) NOT NULL,
    departure_time TIMESTAMP WITH TIME ZONE NOT NULL,
    arrival_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INT NOT NULL,
    seat_class VARCHAR(50) DEFAULT 'STANDARD',
    price_krw NUMERIC(12, 2) NOT NULL,
    available_seats INT DEFAULT 100 CHECK (available_seats >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 7. DOMAIN 4: CAR RENTALS & AIRPORT TRANSFERS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS car_rentals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name VARCHAR(100) NOT NULL,
    vehicle_model VARCHAR(100) NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL, -- SEDAN, SUV, VAN
    seats INT NOT NULL,
    transmission VARCHAR(20) DEFAULT 'AUTO',
    daily_price_krw NUMERIC(12, 2) NOT NULL,
    pickup_location VARCHAR(150) NOT NULL,
    insurance_included BOOLEAN DEFAULT TRUE,
    image_url TEXT,
    available_stock INT DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS airport_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_title VARCHAR(255) NOT NULL,
    airport_code VARCHAR(10) NOT NULL,
    destination_area VARCHAR(100) NOT NULL,
    vehicle_class VARCHAR(50) NOT NULL,
    max_passengers INT NOT NULL,
    max_luggage INT NOT NULL,
    price_krw NUMERIC(12, 2) NOT NULL,
    flight_tracking BOOLEAN DEFAULT TRUE,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 8. DOMAIN 5: ACTIVITIES, TICKETS & ESIM
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL, -- TICKET, TOUR, ESIM, PASS
    city VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    price_krw NUMERIC(12, 2) NOT NULL,
    review_score NUMERIC(3, 1) DEFAULT 4.8,
    review_count INT DEFAULT 0,
    instant_confirmation BOOLEAN DEFAULT TRUE,
    thumbnail_url TEXT NOT NULL,
    description TEXT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 9. DOMAIN 6: DYNAMIC PACKAGES (FLIGHT + HOTEL)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    destination_city VARCHAR(100) NOT NULL,
    hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
    flight_id UUID REFERENCES flights(id) ON DELETE CASCADE,
    package_discount_rate NUMERIC(5, 2) DEFAULT 15.00, -- 15% 결합할인
    total_original_krw NUMERIC(12, 2) NOT NULL,
    total_package_krw NUMERIC(12, 2) NOT NULL,
    thumbnail_url TEXT NOT NULL,
    is_featured BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 10. PROMOTIONS & COUPONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    discount_type VARCHAR(20) NOT NULL, -- PERCENTAGE, FIXED_AMOUNT
    discount_value NUMERIC(10, 2) NOT NULL,
    min_order_amount_krw NUMERIC(12, 2) DEFAULT 0,
    max_discount_krw NUMERIC(12, 2) DEFAULT 100000,
    applicable_domain domain_type_enum,
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 11. UNIFIED BOOKINGS, ITEMS, PAYMENTS & VOUCHERS (OMS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_code VARCHAR(32) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    domain_type domain_type_enum NOT NULL,
    status booking_status_enum DEFAULT 'DRAFT',
    
    -- 금액 명세 (Zero-Mock 정밀 계산)
    base_amount_krw NUMERIC(12, 2) NOT NULL,
    tax_amount_krw NUMERIC(12, 2) NOT NULL,
    service_fee_krw NUMERIC(12, 2) NOT NULL,
    discount_amount_krw NUMERIC(12, 2) DEFAULT 0,
    trip_coins_used INT DEFAULT 0,
    final_amount_krw NUMERIC(12, 2) NOT NULL,
    paid_currency currency_enum DEFAULT 'KRW',
    paid_currency_amount NUMERIC(12, 2) NOT NULL,
    
    -- 연락처 및 탑승객 정보
    primary_contact_name VARCHAR(100) NOT NULL,
    primary_contact_email VARCHAR(255) NOT NULL,
    primary_contact_phone VARCHAR(50) NOT NULL,
    traveler_details JSONB NOT NULL DEFAULT '[]',
    special_requests TEXT,
    
    -- 발권 식별값 및 바우처
    confirmation_number VARCHAR(100),
    voucher_url TEXT,
    inventory_lock_expires_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS booking_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    item_reference_id UUID NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity INT DEFAULT 1,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    raw_payload JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    payment_method payment_method_enum NOT NULL,
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    currency currency_enum NOT NULL,
    status VARCHAR(50) DEFAULT 'SUCCESS',
    paid_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    refund_amount_krw NUMERIC(12, 2) NOT NULL,
    penalty_fee_krw NUMERIC(12, 2) NOT NULL,
    reason TEXT NOT NULL,
    approved_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 12. COMMUNITY: TRIP MOMENTS & REVIEWS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trip_moments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    city VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    photos JSONB NOT NULL DEFAULT '[]',
    linked_product_type domain_type_enum,
    linked_product_id UUID,
    likes_count INT DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    domain_type domain_type_enum NOT NULL,
    target_id UUID NOT NULL,
    rating NUMERIC(2, 1) NOT NULL CHECK (rating BETWEEN 1.0 AND 5.0),
    content TEXT NOT NULL,
    photos JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 13. ADMIN, CS, SETTLEMENTS & AUDIT LOGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) DEFAULT 'SUPER_ADMIN',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cs_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    subject VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    status ticket_status_enum DEFAULT 'OPEN',
    assigned_admin_id UUID REFERENCES admin_users(id),
    messages JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_emergency BOOLEAN DEFAULT FALSE,
    banner_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settlement_ledgers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id),
    supplier_name VARCHAR(100) NOT NULL,
    gross_amount_krw NUMERIC(12, 2) NOT NULL,
    commission_rate NUMERIC(5, 2) NOT NULL, -- e.g. 10.00%
    net_payable_krw NUMERIC(12, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'SETTLED',
    settled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES admin_users(id),
    action VARCHAR(100) NOT NULL,
    target_resource VARCHAR(100) NOT NULL,
    target_id VARCHAR(100),
    before_state JSONB,
    after_state JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 14. PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hotels_city_trgm ON hotels USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hotels_name_trgm ON hotels USING gin (name_ko gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_hotel_id ON hotel_rooms (hotel_id);
CREATE INDEX IF NOT EXISTS idx_flights_search ON flights (departure_airport, arrival_airport, departure_time);
CREATE INDEX IF NOT EXISTS idx_trains_search ON trains (departure_station, arrival_station, departure_time);
CREATE INDEX IF NOT EXISTS idx_activities_city ON activities (city);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_trip_moments_city ON trip_moments (city);
CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews (target_id, domain_type);


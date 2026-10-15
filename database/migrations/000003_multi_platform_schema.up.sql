-- ==============================================================================
-- ✈️ getfortrip Multi-Platform Normalized Architecture - Migration 000003 (UP)
-- Target Database: PostgreSQL 16
-- Supported OTA Ingestion: AGODA, TRIP_COM, KLOOK, KKDAY, MYREALTRIP
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ------------------------------------------------------------------------------
-- 1. ENUMS
-- ------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE ota_platform_enum AS ENUM ('AGODA', 'TRIP_COM', 'KLOOK', 'KKDAY', 'MYREALTRIP');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE product_domain_enum AS ENUM (
        'ACCOMMODATION', 'FLIGHT', 'TRAIN', 'ACTIVITY', 'TOUR', 'TRANSPORT', 'CONNECTIVITY'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE curation_status_enum AS ENUM ('PENDING', 'AI_PROCESSED', 'FAILED', 'PUBLISHED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE sync_status_enum AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'RETRYING');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ------------------------------------------------------------------------------
-- 2. RAW SCRAPES (Raw Crawling Payload Archive)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_raw_scrapes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform ota_platform_enum NOT NULL,
    source_url TEXT NOT NULL,
    source_product_id VARCHAR(100) NOT NULL,
    raw_html TEXT,
    raw_json JSONB,
    crawler_metadata JSONB DEFAULT '{}',
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_raw_scrapes_lookup 
    ON product_raw_scrapes (platform, source_product_id, scraped_at DESC);

-- ------------------------------------------------------------------------------
-- 3. UNIVERSAL PRODUCT MASTER
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform ota_platform_enum NOT NULL,
    source_product_id VARCHAR(100) NOT NULL,
    domain_type product_domain_enum NOT NULL,
    original_title VARCHAR(500) NOT NULL,
    slug VARCHAR(300) UNIQUE NOT NULL,
    country_name VARCHAR(100) NOT NULL,
    city_name VARCHAR(100) NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    base_price_krw NUMERIC(12, 2) NOT NULL,
    original_currency VARCHAR(10) DEFAULT 'KRW',
    original_price NUMERIC(12, 2),
    rating NUMERIC(3, 2) DEFAULT 0.0,
    review_count INT DEFAULT 0,
    thumbnail_url TEXT NOT NULL,
    image_gallery JSONB DEFAULT '[]',
    curation_status curation_status_enum DEFAULT 'PENDING',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_platform_source_product UNIQUE (platform, source_product_id)
);

CREATE INDEX IF NOT EXISTS idx_products_domain_city 
    ON products (domain_type, city_name, is_active, base_price_krw);
CREATE INDEX IF NOT EXISTS idx_products_slug 
    ON products (slug);
CREATE INDEX IF NOT EXISTS idx_products_trgm_title 
    ON products USING gin (original_title gin_trgm_ops);

-- ------------------------------------------------------------------------------
-- 4. CURATED CONTENTS (Gemini AI B2C Rewritten Copy & SEO Markdown)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS curated_contents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE UNIQUE,
    b2c_title VARCHAR(300) NOT NULL,
    one_line_summary VARCHAR(500) NOT NULL,
    key_benefits JSONB NOT NULL DEFAULT '[]',
    seo_blog_content TEXT NOT NULL,
    seo_meta_keywords JSONB DEFAULT '[]',
    ai_model_version VARCHAR(50) DEFAULT 'gemini-2.5-flash',
    prompt_tokens INT DEFAULT 0,
    completion_tokens INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 5. AFFILIATE REFERRALS (Monetization & Tracking Deep Links)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliate_referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE UNIQUE,
    platform ota_platform_enum NOT NULL,
    original_url TEXT NOT NULL,
    clean_url TEXT NOT NULL,
    final_referral_url TEXT NOT NULL,
    partner_id VARCHAR(100) NOT NULL,
    sub_tracking_id VARCHAR(100),
    click_count INT DEFAULT 0,
    last_clicked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 6. TRAVEL-CHECKIN WEBHOOK AUDIT LOG
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS travel_checkin_webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    target_endpoint VARCHAR(500) NOT NULL,
    payload JSONB NOT NULL,
    http_status INT,
    response_body TEXT,
    sync_status sync_status_enum DEFAULT 'PENDING',
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 5,
    last_error TEXT,
    synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tc_webhook_dispatch 
    ON travel_checkin_webhooks (sync_status, retry_count);

-- ==============================================================================
-- 7. DOMAIN SPECIFIC: AGODA
-- ==============================================================================
CREATE TABLE IF NOT EXISTS agoda_properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE UNIQUE,
    agoda_hotel_id VARCHAR(50) NOT NULL,
    star_rating NUMERIC(2, 1),
    property_type VARCHAR(50) DEFAULT 'HOTEL',
    check_in_time VARCHAR(20),
    check_out_time VARCHAR(20),
    amenities JSONB DEFAULT '[]',
    scores_breakdown JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agoda_room_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES agoda_properties(id) ON DELETE CASCADE,
    room_type_id VARCHAR(100) NOT NULL,
    room_name VARCHAR(255) NOT NULL,
    bed_type VARCHAR(100),
    max_adults INT DEFAULT 2,
    max_children INT DEFAULT 0,
    room_size_sqm NUMERIC(6, 2),
    view_type VARCHAR(50),
    is_smoking BOOLEAN DEFAULT FALSE,
    images JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agoda_rate_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_type_id UUID REFERENCES agoda_room_types(id) ON DELETE CASCADE,
    rate_plan_id VARCHAR(100) NOT NULL,
    meal_plan VARCHAR(50) DEFAULT 'ROOM_ONLY',
    is_free_cancellation BOOLEAN DEFAULT FALSE,
    cancellation_deadline TIMESTAMP WITH TIME ZONE,
    payment_policy VARCHAR(50) DEFAULT 'PAY_NOW',
    is_secret_deal BOOLEAN DEFAULT FALSE,
    net_price_krw NUMERIC(12, 2) NOT NULL,
    tax_and_fees_krw NUMERIC(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 8. DOMAIN SPECIFIC: TRIP_COM
-- ==============================================================================
CREATE TABLE IF NOT EXISTS tripcom_flights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE UNIQUE,
    flight_type VARCHAR(20) DEFAULT 'ONE_WAY',
    departure_airport_iata VARCHAR(10) NOT NULL,
    arrival_airport_iata VARCHAR(10) NOT NULL,
    departure_time TIMESTAMP WITH TIME ZONE NOT NULL,
    arrival_time TIMESTAMP WITH TIME ZONE NOT NULL,
    cabin_class VARCHAR(50) DEFAULT 'ECONOMY',
    fare_basis_code VARCHAR(50),
    free_checked_baggage_kg INT DEFAULT 15,
    carry_on_baggage_kg INT DEFAULT 7,
    is_refundable BOOLEAN DEFAULT FALSE,
    is_changeable BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tripcom_flight_segments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flight_id UUID REFERENCES tripcom_flights(id) ON DELETE CASCADE,
    segment_index INT NOT NULL,
    airline_name VARCHAR(100) NOT NULL,
    airline_code VARCHAR(10) NOT NULL,
    flight_number VARCHAR(20) NOT NULL,
    aircraft_model VARCHAR(50),
    origin_airport VARCHAR(10) NOT NULL,
    origin_terminal VARCHAR(10),
    dest_airport VARCHAR(10) NOT NULL,
    dest_terminal VARCHAR(10),
    duration_minutes INT NOT NULL,
    layover_minutes INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tripcom_trains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE UNIQUE,
    train_number VARCHAR(50) NOT NULL,
    train_system VARCHAR(50) NOT NULL,
    departure_station VARCHAR(100) NOT NULL,
    arrival_station VARCHAR(100) NOT NULL,
    departure_time TIMESTAMP WITH TIME ZONE NOT NULL,
    arrival_time TIMESTAMP WITH TIME ZONE NOT NULL,
    seat_class VARCHAR(50) DEFAULT 'SECOND_CLASS',
    ticket_delivery_type VARCHAR(50) DEFAULT 'E_TICKET',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 9. DOMAIN SPECIFIC: KLOOK
-- ==============================================================================
CREATE TABLE IF NOT EXISTS klook_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE UNIQUE,
    klook_activity_id VARCHAR(50) NOT NULL,
    voucher_type VARCHAR(50) DEFAULT 'QR_CODE',
    confirmation_type VARCHAR(50) DEFAULT 'INSTANT',
    is_open_date BOOLEAN DEFAULT FALSE,
    validity_duration_days INT DEFAULT 1,
    redemption_location TEXT,
    included_services JSONB DEFAULT '[]',
    excluded_services JSONB DEFAULT '[]',
    how_to_use TEXT,
    booking_requirements JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS klook_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id UUID REFERENCES klook_activities(id) ON DELETE CASCADE,
    package_id VARCHAR(100) NOT NULL,
    package_name VARCHAR(255) NOT NULL,
    description TEXT,
    min_order_qty INT DEFAULT 1,
    max_order_qty INT DEFAULT 10,
    refund_policy_type VARCHAR(50) DEFAULT 'NON_REFUNDABLE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS klook_unit_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_id UUID REFERENCES klook_packages(id) ON DELETE CASCADE,
    unit_name VARCHAR(100) NOT NULL,
    age_policy_desc VARCHAR(100),
    retail_price_krw NUMERIC(12, 2) NOT NULL,
    discounted_price_krw NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS klook_time_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_id UUID REFERENCES klook_packages(id) ON DELETE CASCADE,
    slot_date DATE NOT NULL,
    slot_time TIME,
    available_stock INT DEFAULT 999,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 10. DOMAIN SPECIFIC: KKDAY
-- ==============================================================================
CREATE TABLE IF NOT EXISTS kkday_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE UNIQUE,
    kkday_product_id VARCHAR(50) NOT NULL,
    duration_hours NUMERIC(4, 1),
    booking_lead_days INT DEFAULT 1,
    is_e_voucher BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kkday_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kkday_product_id UUID REFERENCES kkday_products(id) ON DELETE CASCADE,
    package_id VARCHAR(100) NOT NULL,
    package_title VARCHAR(255) NOT NULL,
    guide_languages JSONB DEFAULT '["ko"]',
    has_hotel_pickup BOOLEAN DEFAULT FALSE,
    cancellation_rules TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kkday_pickup_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_id UUID REFERENCES kkday_packages(id) ON DELETE CASCADE,
    point_name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    meeting_time TIME NOT NULL,
    meeting_guide_instructions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kkday_charter_specs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_id UUID REFERENCES kkday_packages(id) ON DELETE CASCADE,
    vehicle_type VARCHAR(50) NOT NULL,
    max_passengers INT NOT NULL,
    max_luggage_count INT NOT NULL,
    duration_hours INT NOT NULL,
    overtime_fee_per_hour_krw NUMERIC(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 11. DOMAIN SPECIFIC: MYREALTRIP
-- ==============================================================================
CREATE TABLE IF NOT EXISTS myrealtrip_tours (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE UNIQUE,
    mrt_offer_id VARCHAR(50) NOT NULL,
    tour_type VARCHAR(50) DEFAULT 'GROUP_TOUR',
    category_type VARCHAR(50) NOT NULL,
    min_travelers INT DEFAULT 1,
    max_travelers INT DEFAULT 15,
    meeting_place VARCHAR(255) NOT NULL,
    meeting_time_desc VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS myrealtrip_guides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tour_id UUID REFERENCES myrealtrip_tours(id) ON DELETE CASCADE,
    guide_name VARCHAR(100) NOT NULL,
    guide_bio TEXT,
    residence_years INT DEFAULT 1,
    is_certified_guide BOOLEAN DEFAULT TRUE,
    guide_badges JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS myrealtrip_itineraries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tour_id UUID REFERENCES myrealtrip_tours(id) ON DELETE CASCADE,
    step_order INT NOT NULL,
    spot_name VARCHAR(255) NOT NULL,
    stay_minutes INT NOT NULL,
    transport_mode VARCHAR(50),
    description TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS myrealtrip_terms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tour_id UUID REFERENCES myrealtrip_tours(id) ON DELETE CASCADE UNIQUE,
    inclusions JSONB NOT NULL DEFAULT '[]',
    exclusions JSONB NOT NULL DEFAULT '[]',
    preparations JSONB DEFAULT '[]',
    safety_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

